import * as cli from '../cli';

import { compileInMemory } from './utils';

describe('messages test', () => {
  let namespaces: string;

  beforeAll(async () => {
    namespaces = await cli.buildTypeScriptFromSources([
      `
        syntax = "proto3";
        package test;

        message Message {
          string name = 1;
          uint32 number = 2;
          int64 number2 = 3;
        }
      `,
    ]);
  });

  it('should work with field access', async () => {
    const result = compileInMemory({
      'grpc-namespaces.ts': namespaces,
      'test.ts': `
        import { test } from './grpc-namespaces';

        const message: test.Message = {
          name: 'string',
          number: 42
        };

        console.log(message.name, message.number);
      `,
    });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('should fail on missing field set', async () => {
    const result = compileInMemory({
      'grpc-namespaces.ts': namespaces,
      'test.ts': `
        import { test } from './grpc-namespaces';

        const message: test.Message = {
          missing: 1234
        };
      `,
    });
    expect(result.ok).toBe(false);
  });

  it('should fail on missing field access', async () => {
    const result = compileInMemory({
      'grpc-namespaces.ts': namespaces,
      'test.ts': `
        import { test } from './grpc-namespaces';

        const message: test.Message = {};
        console.log(message.missing);
      `,
    });
    expect(result.ok).toBe(false);
  });

  it('should fail on mistyped field set', async () => {
    const result = compileInMemory({
      'grpc-namespaces.ts': namespaces,
      'test.ts': `
        import { test } from './grpc-namespaces';

        const message: test.Message = {
          number: 'string'
        };
      `,
    });
    expect(result.ok).toBe(false);
  });

  it('should fail on mistyped field access', async () => {
    const result = compileInMemory({
      'grpc-namespaces.ts': namespaces,
      'test.ts': `
        import { test } from './grpc-namespaces';

        const message: test.Message = {};
        const s: string = message.number;
      `,
    });
    expect(result.ok).toBe(false);
  });
});
