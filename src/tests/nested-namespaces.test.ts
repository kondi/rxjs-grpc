import * as cli from '../cli';

import { compileInMemory } from './utils';

describe('nested namespaces test', () => {
  let namespaces: string;

  beforeAll(async () => {
    namespaces = await cli.buildTypeScriptFromSources([
      `
        syntax = "proto3";
        package a;

        service AService {
          rpc Method (Message) returns (Message) {}
        }

        message Message {
          required string name = 1;
        }
      `,
      `
        syntax = "proto3";
        package a.b;

        service ABService {
          rpc Method (Message) returns (Message) {}
        }

        message Message {
          required string name = 1;
        }
      `,
      `
        syntax = "proto3";
        package a.b.c;

        service ABCService {
          rpc Method (Message) returns (Message) {}
        }

        message Message {
          required string name = 1;
        }
      `,
    ]);
  });

  it('should create all the messages', async () => {
    const result = compileInMemory({
      'grpc-namespaces.ts': namespaces,
      'test.ts': `
        import { a } from './grpc-namespaces';

        let msgA: a.Message;
        let msgB: a.b.Message;
        let msgC: a.b.c.Message;
      `,
    });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('should create all the ClientFactories correctly', async () => {
    const result = compileInMemory({
      'grpc-namespaces.ts': namespaces,
      'test.ts': `
        import { a } from './grpc-namespaces';

        ({} as any as a.ClientFactory).getAService();
        ({} as any as a.b.ClientFactory).getABService();
        ({} as any as a.b.c.ClientFactory).getABCService();
      `,
    });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('should expose only own services', async () => {
    const result = compileInMemory({
      'grpc-namespaces.ts': namespaces,
      'test.ts': `
        import { a } from './grpc-namespaces';

        ({} as any as a.ClientFactory).getABService();
      `,
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });
});
