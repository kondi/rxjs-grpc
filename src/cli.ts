import { promisify } from 'bluebird';
import * as jscodeshift from 'jscodeshift';
import { ASTNode, ASTPath } from 'jscodeshift';
import { Collection } from 'jscodeshift/src/Collection';
import * as minimist from 'minimist';
import { fs } from 'mz';
import * as protobuf from 'protobufjs';
import { pbjs, pbts } from 'protobufjs/cli';
import * as tmp from 'tmp';

const pbjsMain = promisify(pbjs.main);
const pbtsMain = promisify(pbts.main);

const createTempDir = promisify((callback: (error: any, result: tmp.SynchrounousResult) => any) => {
  tmp.dir({ unsafeCleanup: true }, (error, name, removeCallback) => {
    callback(error, { name, removeCallback, fd: -1 });
  });
});

type NamedReference = {
  reference: string;
  name: string;
};
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
      out: 'o',
    },
    string: ['out'],
  });

  if (protoFiles.length === 0) {
    printUsage();
    return 1;
  }

  const ts = await buildTypeScript(protoFiles);
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
    const jsFile = await call(tempDir.name, pbjsMain, protoFiles, 'js', ['keep-case'], {
      target: 'static-module',
      wrap: 'commonjs',
    });

    const jsonDescriptor = await call(tempDir.name, pbjsMain, protoFiles, 'js', ['keep-case'], {
      target: 'json',
    });
    const root = protobuf.loadSync(jsonDescriptor);

    const js = transformJavaScriptSource(await fs.readFile(jsFile, 'utf8'), root);
    await fs.writeFile(jsFile, js);

    // Create TypeScript file
    const tsFile = await call(tempDir.name, pbtsMain, [jsFile], 'ts');
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
  const ast: Collection<jscodeshift.File> = jscodeshift(source);
  // Change constructors to interfaces and remove their parameters
  constructorsToInterfaces(ast);
  // Clean method signatures
  cleanMethodSignatures(ast);
  // Remove message members (we use declared interfaces)
  removeMembers(ast, root);
  // Add the ClientFactory and ServerBuilder interfaces
  getNamespaceDeclarations(ast)
    .closestScope()
    .forEach(path => addFactoryAndBuild(jscodeshift(path.node)));
  // Render AST
  return ast.toSource();
}

function transformTypeScriptSource(source: string) {
  // Remove imports
  source = source.replace(/^import.*?$\n?/gm, '');
  // Add our imports
  source = `import { Observable } from 'rxjs';\n${source}`;
  source = `import * as grpc from '@grpc/grpc-js';\n${source}`;

  if (source.includes('$protobuf')) {
    source = `import * as $protobuf from 'protobufjs';\n${source}`;
  }

  // Fix generic type syntax
  source = source.replace(/Observable\.</g, 'Observable<');
  // Remove public keyword from the field, because they are not allowed in interface
  source = source.replace(/^(\s+)public\s+/gm, '$1');
  // Export interfaces, enums and namespaces
  source = source.replace(/^(\s+)(interface|enum|namespace)(\s+)/gm, '$1export $2$3');
  return source;
}

function addFactoryAndBuild(ast: Collection<ASTNode>) {
  const services = collectServices(ast);

  const declaration = getNamespaceDeclarations(ast).filter((path, index) => index === 0);
  const namespace = getNamepaceName(declaration);

  const ownServices = services
    .filter(service => service.reference.startsWith(namespace))
    .filter(service => {
      const relative = service.reference.substring(namespace.length + 1);
      return !relative.includes('.');
    });

  declaration.insertBefore(sourceToNodes(buildClientFactorySource(namespace, ownServices)));
  declaration.insertBefore(sourceToNodes(buildServerBuilderSource(namespace, ownServices)));
}

function collectServices(ast: Collection<ASTNode>) {
  const services: Services = [];
  ast
    .find(jscodeshift.FunctionDeclaration)
    .filter(path => !!path.node.comments)
    // only service constructors have more than 1 parameters
    .filter(path => path.node.params.length > 1)
    .forEach(path => {
      const reference = getReference(path);
      if (reference) {
        const name = path.node.id.name;
        services.push({ reference: reference + '.' + name, name });
      }
    });
  return services;
}

function getReference(commentedNodePath: ASTPath<jscodeshift.FunctionDeclaration>) {
  if (!commentedNodePath.node.comments) {
    return;
  }
  return commentedNodePath.node.comments
    .map(comment => /@memberof\s+([^\s]+)/.exec(comment.value))
    .map(match => (match ? match[1] : undefined))
    .filter(match => match)[0];
}

function constructorsToInterfaces(ast: Collection<ASTNode>) {
  ast.find(jscodeshift.FunctionDeclaration).forEach(path => {
    if (!path.node.comments) {
      return;
    }
    const interfaceComments = path.node.comments.filter(comment =>
      /@interface/.test(comment.value),
    );
    if (interfaceComments.length) {
      // Message type has an @interface declaration
      path.node.comments = interfaceComments;
      path.node.comments.forEach(comment => {
        comment.value = comment.value.replace(/^([\s\*]+@interface\s+)I/gm, '$1');
        comment.value = comment.value.replace(/^([\s\*]+@property\s+\{.*?\.)I([^.]+\})/gm, '$1$2');
      });
    } else {
      // Otherwise this is a service
      path.node.comments.forEach(comment => {
        comment.value = comment.value.replace(/@constructor/g, '@interface');
        comment.value = comment.value.replace(/^[\s\*]+@extends.*$/gm, '');
        comment.value = comment.value.replace(/^[\s\*]+@param.*$/gm, '');
        comment.value = comment.value.replace(/^[\s\*]+@returns.*$/gm, '');
      });
    }
    jscodeshift(path).replaceWith(path.node);
  });
}

function cleanMethodSignatures(ast: Collection<ASTNode>) {
  ast.find(jscodeshift.ExpressionStatement).forEach(path => {
    if (!path.node.comments) {
      return;
    }
    if (path.node.expression.type === 'AssignmentExpression') {
      const left = jscodeshift(path.node.expression.left).toSource();
      // do not remove enums
      if (path.node.comments.some(comment => /@enum/.test(comment.value))) {
        return;
      }
      // Remove static methods and converter methods, we export simple interfaces
      if (!/\.prototype\./.test(left) || /\.(toObject|toJSON)/.test(left)) {
        path.node.comments = [];
      }
    }
    path.node.comments.forEach(comment => {
      // Remove callback typedefs, as we use Observable instead of callbacks
      if (/@typedef\s+\w+Callback/.test(comment.value)) {
        comment.value = '';
      }

      if (/@param\s+\{.*?Callback\}\s+callback/.test(comment.value)) {
        comment.value = '';
      }
    });
    // Remove empty comments
    path.node.comments = path.node.comments.filter(comment => comment.value);
    jscodeshift(path).replaceWith(path.node);
  });

  // The promise variant of service methods are after the method declerations,
  // so the last method will have its comment followed by a return statement.
  ast.find(jscodeshift.ExpressionStatement).forEach(fixPromiseMethodSignature);
  ast.find(jscodeshift.ReturnStatement).forEach(fixPromiseMethodSignature);

  function fixPromiseMethodSignature(
    path: ASTPath<jscodeshift.ExpressionStatement | jscodeshift.ReturnStatement>,
  ) {
    if (!path.node.comments) {
      return;
    }
    let changed = false;
    path.node.comments.forEach(comment => {
      const returnsPromiseRe = /(@returns\s+\{)Promise(<)/g;
      if (returnsPromiseRe.test(comment.value)) {
        changed = true;
        comment.value = comment.value.replace(returnsPromiseRe, '$1Observable$2');
        comment.value = comment.value.replace(/(@param\s+\{.*?\.)I([^.]+\})/g, '$1$2');
        // Add optional metadata parameter
        comment.value = comment.value.replace(
          /^([\s\*]+@param\s+)(\{.*)$/gm,
          '$1$2\n$1{grpc.Metadata=} metadata Optional metadata',
        );
      }
    });
    if (changed) {
      path.node.comments = path.node.comments.filter(comment => comment.value);
      jscodeshift(path).replaceWith(path.node);
    }
  }
}

function removeMembers(ast: Collection<ASTNode>, root: protobuf.Root) {
  ast.find(jscodeshift.ExpressionStatement).forEach(path => {
    if (!path.node.comments) {
      return;
    }
    path.node.comments.forEach(comment => {
      // Remove members of classes, as we use interfaces. But keep the oneofs,
      // as they are not part of the interfaces.
      if (/@member /.test(comment.value)) {
        let member;
        comment.value.replace(/@member\s+\{.*?\}\s+([^\s]+)/g, (match, _member_) => {
          member = _member_;
          return match;
        });

        let oneofNames: string[] = [];
        comment.value.replace(/@memberof\s+([^\s]+)/g, (match, memberOf) => {
          oneofNames = root.lookupType(memberOf).oneofsArray.map(oneof => oneof.name);
          return match;
        });

        if (!member || oneofNames.indexOf(member) === -1) {
          comment.value = '';
        }
      }
    });
    // Remove empty comments
    path.node.comments = path.node.comments.filter(comment => comment.value);
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

    ${services
      .map(
        service => `
      /**
       * Returns the ${service.name} service client.
       * @returns {${service.reference}}
       */
      ClientFactory.prototype.get${service.name} = function() {};
    `,
      )
      .join('\n')}
  `;
}

function getNamepaceName(declarations: Collection<jscodeshift.VariableDeclaration>) {
  let namespaceName = '';
  const node = declarations.paths()[0].node;
  if (!node.comments) {
    return '';
  }
  node.comments.forEach(comment => {
    comment.value.replace(/@exports\s+([^\s]+)/g, (match, reference) => {
      namespaceName = reference;
      return match;
    });
    if (!namespaceName) {
      comment.value.replace(/@memberof\s+([^\s]+)/g, (match, memberOf) => {
        const declaration = node.declarations[0];
        if (declaration.type === 'VariableDeclarator') {
          if (declaration.id.type === 'Identifier') {
            const name = declaration.id.name;
            namespaceName = memberOf + '.' + name;
          }
        }
        return match;
      });
    }
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

    ${services
      .map(
        service => `
      /**
       * Adds a ${service.name} service implementation.
       * @param {${service.reference}} impl ${service.name} service implementation
       * @returns {${namespace}.ServerBuilder}
       */
      ServerBuilder.prototype.add${service.name} = function() {};
    `,
      )
      .join('\n')}
  `;
}

function getNamespaceDeclarations(ast: Collection<ASTNode>) {
  return ast
    .find(jscodeshift.VariableDeclaration)
    .filter(path => !!path.node.comments)
    .filter(path =>
      path.node.comments!.some(comment => {
        return /@namespace/.test(comment.value);
      }),
    );
}

type PbMain = typeof pbjsMain | typeof pbtsMain;
type Options = { [name: string]: string };

async function call(
  tempDir: string,
  func: PbMain,
  files: string[],
  ext = 'js',
  flags: string[] = [],
  opts: Options = {},
) {
  const out = `${tempDir}/${Math.random()}.${ext}`;
  const all = { ...opts, out } as typeof opts;
  const args = Object.keys(all).map(name => [`--${name}`, all[name]]);
  await func([...flatten(args), ...flags.map(name => `--${name}`), ...files]);
  return out;
}

function flatten<T>(arr: T[][]): T[] {
  return Array.prototype.concat(...arr);
}
