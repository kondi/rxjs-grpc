import * as cli from '../cli';

import { compileInMemory } from './utils';

describe('metadata test', () => {
  let namespaces: string;

  beforeAll(async () => {
    namespaces = await cli.buildTypeScriptFromSources([
      `
        syntax = "proto3";
        package test;

        service Service {
          rpc Single (Message) returns (Message) {}
        }

        message Message {
          string field = 1;
        }
      `,
    ]);
  });

  it('should accept metadata object', async () => {
    const result = compileInMemory({
      'grpc-namespaces.ts': namespaces,
      'test.ts': `
        import { Metadata } from 'grpc';
        import { clientFactory } from 'rxjs-grpc';

        import { test } from './grpc-namespaces';

        const Services = clientFactory<test.ClientFactory>('test.proto', 'test');

        const services = new Services('localhost:1234');
        const Service = services.getService();

        Service.single({ field: 'string' }, new Metadata());
      `,
    });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('should not accept invalid metadata object', async () => {
    const result = compileInMemory({
      'grpc-namespaces.ts': namespaces,
      'test.ts': `
        import { Metadata } from 'grpc';
        import { clientFactory } from 'rxjs-grpc';

        import { test } from './grpc-namespaces';

        const Services = clientFactory<test.ClientFactory>('test.proto', 'test');

        const services = new Services('localhost:1234');
        const Service = services.getService();

        Service.single({ field: 'string' }, { NOT_A_METADATA: 'yes' });
      `,
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });

  it('should pass metadata object', async () => {
    const result = compileInMemory({
      'grpc-namespaces.ts': namespaces,
      'test.ts': `
        import { of } from 'rxjs';
        import { serverBuilder } from 'rxjs-grpc';

        import { test } from './grpc-namespaces';

        const server = serverBuilder<test.ServerBuilder>('test.proto', 'test');

        server.addService({

          single(request, metadata) {
            console.log(metadata.get('test'));
            return of();
          }

        });

        server.start('0.0.0.0:1234');
      `,
    });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
