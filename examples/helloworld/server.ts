import { of, timer } from 'rxjs';
import { mapTo, take } from 'rxjs/operators';
import { serverBuilder } from 'rxjs-grpc';

import { helloworld } from './grpc-namespaces';

async function main() {
  type ServerBuilder = helloworld.ServerBuilder;
  const server = serverBuilder<ServerBuilder>('helloworld.proto', 'helloworld');

  server.addGreeter({
    sayHello(request) {
      return of({
        message: 'Hello ' + request.name,
      });
    },

    sayMultiHello(request) {
      return timer(100, 500).pipe(
        mapTo({ message: `Hello ${request.name}` }),
        take(request.num_greetings),
      );
    },
  });

  server.start('0.0.0.0:50051');
}

main().catch(error => console.error(error));
