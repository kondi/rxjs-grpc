import * as path from 'path';
import * as ts from 'typescript';

export type Sources = {
  [name: string]: string;
};

export type CompileResult = {
  ok: boolean;
  errors: string[];
};

export function compileInMemory(sources: Sources) {
  const options: ts.CompilerOptions = {
    noEmitOnError: true,
    noImplicitAny: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES5,
    module: ts.ModuleKind.CommonJS,
    noLib: false,
    lib: ['lib.es6.d.ts'],
  };

  const compilerHost = createCompilerHost(sources, options);
  const program = ts.createProgram(Object.keys(sources), options, compilerHost);
  const emitResult = program.emit(undefined, () => {});

  return {
    ok: !emitResult.emitSkipped,
    errors: extractErrors(emitResult, program),
  };
}

function createCompilerHost(sources: Sources, options: ts.CompilerOptions): ts.CompilerHost {
  const compilerHost = ts.createCompilerHost(options);
  compilerHost.getSourceFile = function(fileName: string, version: ts.ScriptTarget) {
    let sourceText;
    if (fileName in sources) {
      sourceText = sources[fileName];
    } else {
      sourceText = ts.sys.readFile(fileName)!;
    }
    return ts.createSourceFile(fileName, sourceText, version);
  };
  compilerHost.resolveModuleNames = function(moduleNames: string[], containingFile: string) {
    return moduleNames.map(moduleName => {
      if (moduleName === 'rxjs-grpc') {
        return {
          resolvedFileName: path.join(__dirname, '..', 'index.d.ts'),
        };
      } else if (moduleName === './grpc-namespaces') {
        return {
          resolvedFileName: 'grpc-namespaces.ts',
        };
      } else {
        const result = ts.resolveModuleName(moduleName, containingFile, options, this);
        return <ts.ResolvedModule>result.resolvedModule;
      }
    });
  };
  return compilerHost;
}

function extractErrors(emitResult: ts.EmitResult, program: ts.Program) {
  const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
  return allDiagnostics.map(diagnostic => {
    let prefix = '';
    if (diagnostic.file) {
      const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!);
      prefix = `${diagnostic.file.fileName} (${line + 1},${character + 1}): `;
    }
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    return `${prefix}${message}`;
  });
}
