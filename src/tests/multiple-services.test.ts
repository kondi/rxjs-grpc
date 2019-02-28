import * as cli from '../cli';

import { compileInMemory } from './utils';

describe('multiple services test', () => {
  let namespaces: string;

  beforeAll(async () => {
    namespaces = await cli.buildTypeScriptFromSources([
      `
        syntax = "proto3";
        package test;

        service ServiceA {
          rpc MethodA (RequestA) returns (ReplyA) {}
        }

        service ServiceB {
          rpc MethodB (RequestB) returns (ReplyB) {}
        }

        message RequestA {
          string request_field = 1;
        }

        message RequestB {
          string request_field = 1;
        }

        message ReplyA {
          string reply_field = 1;
        }

        message ReplyB {
          string reply_field = 1;
        }
      `,
    ]);
  });

  it('should compile server', async () => {
    const result = compileInMemory({
      'grpc-namespaces.ts': namespaces,
      'test.ts': `
        import { test } from './grpc-namespaces';

        const builder: test.ServerBuilder = {} as any;
        builder.addServiceA({
          methodA: {} as any
        });
        builder.addServiceB({
          methodB: {} as any
        });
      `,
    });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('should compile client', async () => {
    const result = compileInMemory({
      'grpc-namespaces.ts': namespaces,
      'test.ts': `
        import { test } from './grpc-namespaces';

        const factory: test.ClientFactory = {} as any;
        factory.getServiceA().methodA({} as test.RequestA);
        factory.getServiceB().methodB({} as test.RequestB);
      `,
    });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
