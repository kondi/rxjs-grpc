import * as grpc from 'grpc';
import { Observable } from 'rxjs/Observable';

const though2 = require('through2');

import { lookupPackage } from './utils';

type DynamicMethods = { [name: string]: any; };

export interface GenericServerBuilder<T> {
  start(address: string, credentials?: any): void;
  forceShutdown(): void;
}

export interface MainOptions {
  protoPath?: string;
  packageName?: string;
  pkg?: any; // GRPC already loaded
}

export function serverBuilder<T>(options: MainOptions): T & GenericServerBuilder<T> {
  const server = new grpc.Server();
  const { protoPath, packageName } = options;

  const builder: DynamicMethods = <GenericServerBuilder<T>> {
    start(address: string, credentials?: any) {
      server.bind(address, credentials || grpc.ServerCredentials.createInsecure());
      server.start();
    },
    forceShutdown() {
      server.forceShutdown();
    }
  };

  let pkg = options.pkg;
  if(protoPath && packageName)
    pkg = lookupPackage(grpc.load(protoPath), packageName);
  for (const name of getServiceNames(pkg)) {
    builder[`add${name}`] = function(rxImpl: DynamicMethods) {
      server.addProtoService(pkg[name].service, createService(pkg[name], rxImpl));
      return this;
    };
  }

  return builder as any;
}

function createService(Service: any, rxImpl: DynamicMethods) {
  const service: DynamicMethods = {};
  for (const name in Service.prototype) {
    if (typeof rxImpl[name] === 'function') {
      service[name] = createMethod(rxImpl, name, Service.prototype);
    }
  }
  return service;
}

function createMethod(rxImpl: DynamicMethods, name: string, serviceMethods: DynamicMethods) {
  return serviceMethods[name].responseStream
    ? createStreamingMethod(rxImpl, name)
    : createUnaryMethod(rxImpl, name);
}

function createUnaryMethod(rxImpl: DynamicMethods, name: string) {
  return function(call: any, callback: any) {
    const response: Observable<any> = rxImpl[name](call.request, call.metadata);
    response.subscribe(
      data => callback(null, data),
      error => callback(error)
    );
  };
}

function createStreamingMethod(rxImpl: DynamicMethods, name: string) {
  return async function(call: any, callback: any) {
    const response: Observable<any> = rxImpl[name](call.request, call.metadata);
    await response.forEach(data => call.write(data));
    call.end();
  };
}

export type ClientFactoryConstructor<T> = new(address: string, credentials?: any, options?: any) => T;

export function clientFactory<T>(options: MainOptions) {
  const { protoPath, packageName } = options;

  class Constructor {

    readonly __args: any[];
    constructor(address: string, credentials?: any, options: any = undefined) {
      this.__args = [
        address,
        credentials || grpc.credentials.createInsecure(),
        options
      ];
    }

  }

  const prototype: DynamicMethods = Constructor.prototype;
  let pkg = options.pkg;
    if(protoPath && packageName)
      pkg = lookupPackage(grpc.load(protoPath), packageName);
  for (const name of getServiceNames(pkg)) {
    prototype[`get${name}`] = function(this: Constructor) {
      return createServiceClient(pkg[name], this.__args);
    };
  }

  return <any> Constructor as ClientFactoryConstructor<T>;
}

function getServiceNames(pkg: any) {
  return Object.keys(pkg).filter(name => pkg[name].service);
}

function createServiceClient(GrpcClient: any, args: any[]) {
  const grpcClient = new GrpcClient(...args);
  const rxClient: DynamicMethods = {};
  for (const name of Object.keys(GrpcClient.prototype)) {
    rxClient[name] = createClientMethod(grpcClient, name);
  }
  return rxClient;
}

function createClientMethod(grpcClient: DynamicMethods, name: string) {
  return grpcClient[name].responseStream
    ? createStreamingClientMethod(grpcClient, name)
    : createUnaryClientMethod(grpcClient, name);
}

function createUnaryClientMethod(grpcClient: DynamicMethods, name: string) {
  return function(...args: any[]) {
    return new Observable(observer => {
      grpcClient[name](...args, (error: any, data: any) => {
        if (error) {
          observer.error(error);
        } else {
          observer.next(data);
        }
        observer.complete();
      });
    });
  };
}

function createStreamingClientMethod(grpcClient: DynamicMethods, name: string) {
  return function(...args: any[]) {
    return new Observable(observer => {
      const call = grpcClient[name](...args);

      const onData = (data: any, _: any, cb:any) => {
        observer.next(data)
        cb();
      };
      const onError = (error: any) => observer.error(error);

      const onEnd = (cb: any) => {
        observer.complete()
        cb();
        call.removeListener('error', onError);
      }

      call.pipe(though2.obj(onData, onEnd));
      call.on('error', onError);
    });
  };
}
