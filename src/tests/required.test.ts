import * as cli from '../cli';

import { compileInMemory } from './utils';

describe('required test', () => {
  let namespaces: string;

  beforeAll(async () => {
    namespaces = await cli.buildTypeScriptFromSources([
      `
        syntax = "proto3";
        package test;

        message Message {
          required string name = 1;
          uint32 number = 2;
        }
      `,
    ]);
  });

  it('should generate required field', async () => {
    const result = compileInMemory({
      'grpc-namespaces.ts': namespaces,
      'test.ts': `
        import { test } from './grpc-namespaces';

        const message: test.Message = {
          name: 'string'
        };

        console.log(message.name);
      `,
    });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('should fail when required field is missing', async () => {
    const result = compileInMemory({
      'grpc-namespaces.ts': namespaces,
      'test.ts': `
        import { test } from './grpc-namespaces';

        const message: test.Message = {
          number: 42
        };
      `,
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });
});
