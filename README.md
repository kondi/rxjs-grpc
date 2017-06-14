[![Build Status](https://travis-ci.org/kondi/rxjs-grpc.svg?branch=master)](https://travis-ci.org/kondi/rxjs-grpc)
[![npm version](https://badge.fury.io/js/rxjs-grpc.svg)](https://badge.fury.io/js/rxjs-grpc)

# rxjs-grpc

## Installation

```sh
$ npm install rxjs-grpc rxjs grpc
```

## Quickstart

Create your protobuf definition file `sample.proto`:

```protobuf
syntax = "proto3";

package sample;

service Greeter {
  rpc SayHello (HelloRequest) returns (HelloReply) {}
}

message HelloRequest {
  string name = 1;
}

message HelloReply {
  string message = 1;
}
```

Generate your TypeScript interfaces:

```sh
$ ./node_modules/.bin/rxjs-grpc -o grpc-namespaces.ts *.proto
```

Implement your typesafe server returning `Observable<sample.HelloReply>`:

```typescript
import { Observable } from 'rxjs';
import { serverBuilder } from 'rxjs-grpc';
import { sample } from './grpc-namespaces';

// Pass the path of proto file and the name of namespace
const server = serverBuilder<sample.ServerBuilder>('sample.proto', 'sample')
// Add implementation
server.addGreeter({
  sayHello(request: sample.HelloRequest) {
    return Observable.of({
      message: 'Hello ' + request.name
    });
  }
})
// Start the server to listen on port 50051
server.start('0.0.0.0:50051');
```

Call it from a client:

```typescript
import { clientFactory } from 'rxjs-grpc';
import { sample } from './grpc-namespaces';

// Pass the path of proto file and the name of namespace
const Services = clientFactory<sample.ClientFactory>('sample.proto', 'sample');
// Create a client connecting to the server
const services = new Services('localhost:50051');
// Get a client for the Greeter service
const greeter = services.getGreeter();

// Call the service by passing a sample.HelloRequest
greeter.sayHello({ name: 'world' }).forEach(response => {
  console.log(`Greeting: ${response.message}`);
});
```

## Generated interfaces

```typescript
import { Observable } from 'rxjs';

export namespace sample {

  export interface ClientFactory {
    getGreeter(): sample.Greeter;
  }

  export interface ServerBuilder {
    addGreeter(impl: sample.Greeter): sample.ServerBuilder;
  }

  export interface Greeter {
    sayHello(request: sample.HelloRequest): Observable<sample.HelloReply>;
  }

  export interface HelloRequest {
    name?: string;
  }

  export interface HelloReply {
    message?: string;
  }

}
```

## Examples

You can see a simple example project in the [examples folder](examples).
