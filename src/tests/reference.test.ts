import * as cli from '../cli';

import { compileInMemory } from './utils';

describe('reference test', () => {
  let namespaces: string;

  beforeAll(async () => {
    namespaces = await cli.buildTypeScriptFromSources([
      `
        syntax = "proto3";
        package test;

        message Message {
          SubMessage sub = 1;
        }

        message SubMessage {
          string subName = 1;
        }
      `,
    ]);
  });

  it('should work with null', async () => {
    const result = compileInMemory({
      'grpc-namespaces.ts': namespaces,
      'test.ts': `
        import { test } from './grpc-namespaces';

        const message: test.Message = {
          sub: null
        };

        console.log(message.sub);
      `,
    });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('should work with submessage', async () => {
    const result = compileInMemory({
      'grpc-namespaces.ts': namespaces,
      'test.ts': `
        import { test } from './grpc-namespaces';

        const message: test.Message = {
          sub: {
            subName: 'subNameValue'
          }
        };

        console.log(message.sub, message.sub.subName);
      `,
    });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
