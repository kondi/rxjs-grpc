import { clientFactory } from 'rxjs-grpc';

import { helloworld } from './grpc-namespaces';

async function main() {
  type ClientFactory = helloworld.ClientFactory;
  const Services = clientFactory<ClientFactory>('helloworld.proto', 'helloworld');

  const services = new Services('localhost:50051');
  const greeter = services.getGreeter();

  await greeter.sayHello({ name: 'world' }).forEach(response => {
    console.log(`Greeting: ${response.message}`);
  });

  await greeter.sayMultiHello({ name: 'world', num_greetings: 3 }).forEach(response => {
    console.log(`Multi greeting: ${response.message}`);
  });
}

main().catch(error => console.error(error));
