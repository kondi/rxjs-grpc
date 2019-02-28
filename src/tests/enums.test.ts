import * as cli from '../cli';

import { compileInMemory } from './utils';

describe('enums test', () => {
  let namespaces: string;

  beforeAll(async () => {
    namespaces = await cli.buildTypeScriptFromSources([
      `
        syntax = "proto3";
        package test;

        message Message {
          EnumType field = 2;
        }

        enum EnumType {
          ONE = 1;
          TWO = 2;
        }
      `,
    ]);
  });

  it('should build enum type', async () => {
    const result = compileInMemory({
      'grpc-namespaces.ts': namespaces,
      'test.ts': `
        import { test } from './grpc-namespaces';

        console.log(test.EnumType);
        let value: test.EnumType = test.EnumType.ONE;
        value = test.EnumType.TWO;
      `,
    });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('should allow assign to field', async () => {
    const result = compileInMemory({
      'grpc-namespaces.ts': namespaces,
      'test.ts': `
        import { test } from './grpc-namespaces';

        const message: test.Message = {
          field: test.EnumType.ONE
        };
      `,
    });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('should allow equality check', async () => {
    const result = compileInMemory({
      'grpc-namespaces.ts': namespaces,
      'test.ts': `
        import { test } from './grpc-namespaces';

        const message: test.Message = {};
        console.log(message.field === test.EnumType.ONE);
      `,
    });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('should allow field to be assigned to enum var', async () => {
    const result = compileInMemory({
      'grpc-namespaces.ts': namespaces,
      'test.ts': `
        import { test } from './grpc-namespaces';

        const message: test.Message = {};
        const enumVar: test.EnumType = message.field;
      `,
    });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('should not allow assigning other enum type', async () => {
    const result = compileInMemory({
      'grpc-namespaces.ts': namespaces,
      'test.ts': `
        import { test } from './grpc-namespaces';

        export enum OtherEnumType {
          ONE = 1,
          TWO = 2
        }

        const message: test.Message = {};
        message.field = OtherEnumType.ONE;
      `,
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });
});
