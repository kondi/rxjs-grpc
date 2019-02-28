import * as cli from '../cli';

import { compileInMemory } from './utils';

describe('multiple namespaces test', () => {
  let namespaces: string;

  beforeAll(async () => {
    namespaces = await cli.buildTypeScriptFromSources([
      `
        syntax = "proto3";
        package first;

        service Service {
          rpc Method (Message) returns (Message) {}
        }

        message Message {
          required string first_name = 1;
        }
      `,
      `
        syntax = "proto3";
        package second;

        service Service {
          rpc Method (Message) returns (Message) {}
          rpc MethodOnlyInSecond (Message) returns (Message) {}
        }

        message Message {
          required string second_name = 1;
        }
      `,
    ]);
  });

  it('should create all namespaces', async () => {
    const result = compileInMemory({
      'grpc-namespaces.ts': namespaces,
      'test.ts': `
        import { first, second } from './grpc-namespaces';

        let firstMessage: first.Message;
        let secondMessage: second.Message;
      `,
    });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('should not mix Message types #1', async () => {
    const result = compileInMemory({
      'grpc-namespaces.ts': namespaces,
      'test.ts': `
        import { first, second } from './grpc-namespaces';

        const firstMessage: first.Message = {
          first_name: 'string'
        };

        const secondMessage: second.Message = {
          second_name: 'string'
        };
      `,
    });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('should not mix Message types #2', async () => {
    const result = compileInMemory({
      'grpc-namespaces.ts': namespaces,
      'test.ts': `
        import { first, second } from './grpc-namespaces';

        const firstMessage: first.Message = {
          first_name: 'string',
          second_name: 'should be an error'
        };
      `,
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });

  it('should not mix Message types #3', async () => {
    const result = compileInMemory({
      'grpc-namespaces.ts': namespaces,
      'test.ts': `
        import { first, second } from './grpc-namespaces';

        const firstMessage: first.Message = {
          first_name: 'string'
        };
        const secondMessage: second.Message = firstMessage;
      `,
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });

  it('should not mix Service types #1', async () => {
    const result = compileInMemory({
      'grpc-namespaces.ts': namespaces,
      'test.ts': `
        import { first, second } from './grpc-namespaces';

        const firstFactory: first.ClientFactory = {} as any;
        const firstService: first.Service = firstFactory.getService();
        firstService.method({ first_name: 'string' });

        const secondFactory: second.ClientFactory = {} as any;
        const secondService: second.Service = secondFactory.getService();
        secondService.method({ second_name: 'string' });
        secondService.methodOnlyInSecond({ second_name: 'string' });
      `,
    });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('should not mix Service types #2', async () => {
    const result = compileInMemory({
      'grpc-namespaces.ts': namespaces,
      'test.ts': `
        import { first, second } from './grpc-namespaces';

        const firstFactory: first.ClientFactory = {} as any;
        const firstService: first.Service = firstFactory.getService();
        firstService.method({ first_name: 'string' });
        firstService.methodOnlyInSecond({} as any);
      `,
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });
});
