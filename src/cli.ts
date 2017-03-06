import * as minimist from 'minimist';
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

type Services = { reference: string, name: string }[];

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

    const js = transformJavaScriptSource(await fs.readFile(jsFile, 'utf8'));
    await fs.writeFile(jsFile, js);

    // Create TypeScript file
    const tsFile = await call(tempDir.name, pbts, [jsFile], 'ts');
    return transformTypeScriptSource(await fs.readFile(tsFile, 'utf8'));
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

function transformJavaScriptSource(source: string) {
  const ast = jscodeshift(source);
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

function transformTypeScriptSource(source: string) {
  // Remove imports
  source = source.replace(/^import.*?$\n?/mg, '');
  // Add our imports
  source = `import { Observable } from 'rxjs';\n${source}`;
  // Fix generic type syntax
  source = source.replace(/Observable\.</g, 'Observable<');
  // Export interfaces and enums
  source = source.replace(/^(\s+)(interface|enum)(\s+)/mg, '$1 export $2$3');
  return source;
}

function addFactoryAndBuild(ast: any) {
  const services = collectServices(ast);

  const declaration = getNamepaceDeclarations(ast);
  const namespace = getNamepaceName(declaration);

  declaration.insertBefore(sourceToNodes(
    buildClientFactorySource(namespace, services)
  ));
  declaration.insertBefore(sourceToNodes(
    buildServerBuilderSource(namespace, services)
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
      p.node.comments.forEach((comment: any) => {
        comment.value.replace(/@exports\s+([^\s]+)/g, (_: string, reference: string) => {
          services.push({
            reference, name: p.node.id.name
          });
        });
      });
    });
  return services;
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
    `)}
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
    `)}
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
