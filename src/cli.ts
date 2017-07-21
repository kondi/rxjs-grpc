import * as minimist from 'minimist';
import * as protobuf from 'protobufjs';
import * as tmp from 'tmp';
import { fs } from 'mz';
import { promisify } from 'bluebird';

const jscodeshift = require('jscodeshift');

const pbjs = promisify(require('protobufjs/cli/pbjs').main) as any;
const pbts = promisify(require('protobufjs/cli/pbts').main) as any;
const createTempDir = promisify((callback: (error: any, result: tmp.SynchrounousResult) => any) => {
  tmp.dir({ unsafeCleanup: true }, (error, name, removeCallback) => {
    callback(error, { name, removeCallback, fd: -1 });
  });
});

type NamedReference = {
  reference: string;
  name: string;
};
interface ScopedMessage extends NamedReference {
  scope: any;
}
type Services = NamedReference[];

export function bootstrap() {
  main(process.argv.slice(2))
    .then(code => process.exit(code))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

export async function main(args: string[]) {
  const { _: protoFiles, out } = minimist(args, {
    alias: {
      out: 'o'
    },
    string: [ 'out' ]
  });

  if (protoFiles.length === 0) {
    printUsage();
    return 1;
  }

  let ts = await buildTypeScript(protoFiles);
  if (out) {
    await fs.writeFile(out, ts);
  } else {
    process.stdout.write(ts);
  }
  return 0;
}

export async function buildTypeScript(protoFiles: string[]) {
  const tempDir = await createTempDir();
  try {
    // Use pbjs to generate static JS code for the protobuf definitions
    const jsFile = await call(tempDir.name, pbjs, protoFiles, 'js',
      ['keep-case'],
      {
        target: 'static-module',
        wrap: 'commonjs',
      }
    );

    const jsonDescriptor = await call(tempDir.name, pbjs, protoFiles, 'js',
      ['keep-case'],
      { target: 'json' }
    );
    const root = protobuf.loadSync(jsonDescriptor);

    const js = transformJavaScriptSource(await fs.readFile(jsFile, 'utf8'), root);
    await fs.writeFile(jsFile, js);

    // Create TypeScript file
    const tsFile = await call(tempDir.name, pbts, [jsFile], 'ts');
    return transformTypeScriptSource(await fs.readFile(tsFile, 'utf8'));
  } finally {
    tempDir.removeCallback();
  }
}

export async function buildTypeScriptFromSources(protoSources: string[]) {
  const tempDir = await createTempDir();
  try {
    const protoFiles = [];
    for (const source of protoSources) {
      const file = `${tempDir.name}/${Math.random()}.proto`;
      await fs.writeFile(file, source);
      protoFiles.push(file);
    }
    return await buildTypeScript(protoFiles);
  } finally {
    tempDir.removeCallback();
  }
}

function printUsage() {
  console.log('Usage: rxjs-grpc -o [output] file.proto');
  console.log('');
  console.log('Options:');
  console.log('  -o, --out    Saves to a file instead of writing to stdout');
  console.log('');
}

function transformJavaScriptSource(source: string, root: protobuf.Root) {
  const ast = jscodeshift(source);
  // Fix fields with enum type
  fixEnums(ast, root);
  // Change constructors to interfaces and remove their parameters
  constructorsToInterfaces(ast);
  // Clean method signatures
  cleanMethodSignatures(ast);
  // Add the ClientFactory and ServerBuilder interfaces
  getNamepaceDeclarations(ast)
    .closestScope()
    .forEach((path: any) => addFactoryAndBuild(jscodeshift(path.node)));
  // Render AST
  return ast.toSource();
}

function fixEnums(ast: any, root: protobuf.Root) {
  for (const message of collectMessages(ast)) {
    const type = root.lookupType(message.reference);
    for (const field of type.fieldsArray) {
      const enumType = field.resolve().resolvedType;
      if (enumType instanceof protobuf.Enum) {
        fixEnumField(message, field);
      }
    }
  }
}

function fixEnumField(message: ScopedMessage, field: protobuf.Field) {
  // remove the initial dot
  const fullType = field.resolvedType.fullName.substring(1);
  // enumType
  message.scope
    .find(jscodeshift.AssignmentExpression, {
      left: {
        type: 'MemberExpression',
        object: {
          type: 'MemberExpression',
          property: {
            name: 'prototype'
          }
        },
        property: {
          name: field.name
        }
      }
    })
    .closest(jscodeshift.ExpressionStatement)
    .filter((p: any) => p.node.comments)
    .forEach((path: any) => {
      path.node.comments.forEach((comment: any) => {
        comment.value = (comment.value as string).replace(
          /^([\s]*\*[\s]*@type[\s]+\{)number(\}|\|)/gm,
          (_, prefix, postfix) => `${prefix}${fullType}${postfix}`
        );
      });
      jscodeshift(path).replaceWith(path.node);
    });
}

function transformTypeScriptSource(source: string) {
  // Remove imports
  source = source.replace(/^import.*?$\n?/mg, '');
  // Add our imports
  source = `import { Observable } from 'rxjs';\n${source}`;

  if(source.includes("$protobuf")) {
    source = `import * as $protobuf from 'protobufjs';\n${source}`
  }

  // Fix generic type syntax
  source = source.replace(/Observable\.</g, 'Observable<');
  // Export interfaces, enums and namespaces
  source = source.replace(/^(\s+)(interface|enum|namespace)(\s+)/mg, '$1 export $2$3');
  return source;
}

function addFactoryAndBuild(ast: any) {
  const services = collectServices(ast);

  const declaration = getNamepaceDeclarations(ast);
  const namespace = getNamepaceName(declaration);

  const ownServices = services
    .filter(service => service.reference.startsWith(namespace))
    .filter(service => {
      const relative = service.reference.substring(namespace.length + 1);
      return !relative.includes('.');
    });

  declaration.insertBefore(sourceToNodes(
    buildClientFactorySource(namespace, ownServices)
  ));
  declaration.insertBefore(sourceToNodes(
    buildServerBuilderSource(namespace, ownServices)
  ));
}

function collectServices(ast: any) {
  const services: Services = [];
  ast
    .find(jscodeshift.FunctionDeclaration)
    .filter((p: any) => p.node.comments)
    // only service constructors have more than 1 parameters
    .filter((p: any) => p.node.params.length > 1)
    .forEach((p: any) => {
      const reference = getReference(p);
      if (reference) {
        services.push({ reference, name: p.node.id.name });
      }
    });
  return services;
}

function collectMessages(ast: any): ScopedMessage[] {
  const messages: ScopedMessage[] = [];
  ast
    .find(jscodeshift.FunctionDeclaration)
    .filter((p: any) => p.node.comments)
    // only message constructors have exactly 1 parameters
    .filter((p: any) => p.node.params.length === 1)
    .forEach((p: any) => {
      const reference = getReference(p);
      if (reference) {
        messages.push({
          reference,
          name: p.node.id.name,
          scope: jscodeshift(p.parent).closestScope()
        });
      }
    });
  return messages;
}

function getReference(commentedNodePath: any): string | undefined {
  return (commentedNodePath.node.comments as any[])
    .map(comment => /@exports\s+([^\s]+)/.exec(comment.value))
    .map(match => match ? match[1] : undefined)
    .filter(match => match)
    [0];
}

function constructorsToInterfaces(ast: any) {
  ast
    .find(jscodeshift.FunctionDeclaration)
    .forEach((path: any) => {
      path.node.comments.forEach((comment: any) => {
        comment.value = comment.value.replace(/@constructor/g, '@interface');
        comment.value = comment.value.replace(/^[\s\*]+@extends.*$/gm, '');
        comment.value = comment.value.replace(/^[\s\*]+@param.*$/gm, '');
        comment.value = comment.value.replace(/^[\s\*]+@returns.*$/gm, '');
      });
      jscodeshift(path).replaceWith(path.node);
    });
}

function cleanMethodSignatures(ast: any) {
  ast
    .find(jscodeshift.ExpressionStatement)
    .filter((path: any) => path.node.comments)
    .forEach((path: any) => {
      if (path.node.expression.type === 'AssignmentExpression') {
        const left = jscodeshift(path.node.expression.left).toSource();
        // do not remove enums
        if (path.node.comments.some((comment: any) => /@enum/.test(comment.value))) {
          return;
        }
        // Remove static methods and converter methods, we export simple interfaces
        if (!/\.prototype\./.test(left) || /\.(toObject|toJSON)/.test(left)) {
          path.node.comments = [];
        }
      }
      let returnType: string;
      path.node.comments.forEach((comment: any) => {
        // Remove callback typedefs, as we use Observable instead of callbacks
        if (/@typedef\s+\w+_Callback/.test(comment.value)) {
          comment.value.replace(/@param\s+\{([^\}]+)\}[^\n]*response/g, (_: string, type: string) => {
            returnType = type;
          });
          comment.value = '';
        }
        // Change signature of service methods
        if (/@param\s+[^\n]*_Callback/.test(comment.value)) {
          comment.value = comment.value.replace(/^[\s\*]+@param\s+[^\n]*_Callback.*$\n?/gm, '');
          comment.value = comment.value.replace(/(@param\s*\{.*?)\|Object(\})/g, '$1$2');
          if (returnType) {
            comment.value = comment.value.replace(/@returns.*$/gm, `@returns {Observable<${returnType}>}`);
          }
        }
      });
      // Remove empty comments
      path.node.comments = path.node.comments.filter((x: any) => x.value);
      jscodeshift(path).replaceWith(path.node);
    });
}

function sourceToNodes(source: string) {
  return jscodeshift(source).paths()[0].node.program.body;
}

function buildClientFactorySource(namespace: string, services: Services) {
  return `
    /**
     * Contains all the RPC service clients.
     * @exports ${namespace}.ClientFactory
     * @interface
     */
    function ClientFactory() {}

    ${services.map(service => `
      /**
       * Returns the ${service.name} service client.
       * @returns {${service.reference}}
       */
      ClientFactory.prototype.get${service.name} = function() {};
    `).join('\n')}
  `;
}

function getNamepaceName(declarations: any) {
  let namespaceName = '';
  declarations.paths()[0].node.comments.forEach((comment: any) => {
    comment.value.replace(/@exports\s+([^\s]+)/g, (_: string, reference: string) => {
      namespaceName = reference;
    });
  });
  return namespaceName;
}

function buildServerBuilderSource(namespace: string, services: Services) {
  return `
    /**
     * Builder for an RPC service server.
     * @exports ${namespace}.ServerBuilder
     * @interface
     */
    function ServerBuilder() {}

    ${services.map(service => `
      /**
       * Adds a ${service.name} service implementation.
       * @param {${service.reference}} impl ${service.name} service implementation
       * @returns {${namespace}.ServerBuilder}
       */
      ServerBuilder.prototype.add${service.name} = function() {};
    `).join('\n')}
  `;
}

function getNamepaceDeclarations(ast: any): any {
  return ast
    .find(jscodeshift.VariableDeclaration)
    .filter((path: any) => path.node.comments)
    .filter((path: any) => path.node.comments.some((comment: any) => {
      return /@namespace/.test(comment.value);
    }));
}

type Callable = (args: string[]) => Promise<any>;
type Options = { [name: string]: string };

async function call(tempDir: string, func: Callable, files: string[], ext = 'js', flags: string[] = [], opts: Options = {}) {
  const out = `${tempDir}/${Math.random()}.${ext}`;
  const all = { ...opts, out } as typeof opts;
  const args = Object.keys(all).map(name => [`--${name}`, all[name]]);
  await func([...flatten(args), ...flags.map(name => `--${name}`), ...files]);
  return out;
}

function flatten<T>(arr: T[][]): T[] {
  return Array.prototype.concat(...arr);
}
