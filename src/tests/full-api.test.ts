import * as cli from '../cli';
import { compileInMemory } from './utils';

describe('full api test', () => {

  let namespaces: string;
  let originalTimeout: number;

  beforeEach(() => {
      originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
      jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000;
  });

  afterEach(() => {
      jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
  });

  beforeAll(async () => {
    namespaces = await cli.buildTypeScriptFromSources([
      `
        syntax = "proto3";
        package test;

        service Service {
          rpc Single (Request) returns (Reply) {}
          rpc Streaming (Request) returns (stream Reply) {}
        }

        message Request {
          string request_field = 1;
        }

        message Reply {
          string reply_field = 1;
        }
      `
    ]);
  });

  it('should compile server', async () => {
    const result = compileInMemory({
      'grpc-namespaces.ts': namespaces,
      'test.ts': `
        import { Observable } from 'rxjs';
        import { serverBuilder } from 'rxjs-grpc';

        import { test } from './grpc-namespaces';

        const server = serverBuilder<test.ServerBuilder>('test.proto', 'test');

        server.addService({

          single(request) {
            return Observable.of({
              reply_field: 'Hello ' + request.request_field
            });
          },

          streaming(request) {
            return Observable.of({
              reply_field: 'Hello ' + request.request_field
            });
          }

        });

        server.start('0.0.0.0:1234');
      `
    });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('should compile client', async () => {
    const result = compileInMemory({
      'grpc-namespaces.ts': namespaces,
      'test.ts': `
        import { clientFactory } from 'rxjs-grpc';

        import { test } from './grpc-namespaces';

        const Services = clientFactory<test.ClientFactory>('test.proto', 'test');

        const services = new Services('localhost:1234');
        const Service = services.getService();

        Service.single({ request_field: 'string' }).forEach(response => {
          console.log(response.reply_field);
        });

        Service.streaming({ request_field: 'string' }).forEach(response => {
          console.log(response.reply_field);
        });
      `
    });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

});
