import * as protoLoader from '@grpc/proto-loader';
import * as grpc from 'grpc';
import { Observable } from 'rxjs';

import { lookupPackage } from './utils';

type DynamicMethods = { [name: string]: any };
type GrpcService<T> = typeof grpc.Client & {
  service: grpc.ServiceDefinition<T>;
};

export interface GenericServerBuilder<T> {
  start(address: string, credentials?: grpc.ServerCredentials): void;
  forceShutdown(): void;
}

export function serverBuilder<T>(
  protoPath: string,
  packageName: string,
  server = new grpc.Server(),
): T & GenericServerBuilder<T> {
  const builder: DynamicMethods = <GenericServerBuilder<T>>{
    start(address, credentials) {
      server.bind(address, credentials || grpc.ServerCredentials.createInsecure());
      server.start();
    },
    forceShutdown() {
      server.forceShutdown();
    },
  };

  const pkg = lookupPackage(grpcLoad(protoPath), packageName);
  for (const name of getServiceNames(pkg)) {
    builder[`add${name}`] = function(rxImpl: DynamicMethods) {
      const serviceData = (pkg[name] as any) as GrpcService<any>;
      server.addService(serviceData.service, createService(serviceData, rxImpl));
      return this;
    };
  }

  return builder as any;
}

function grpcLoad(protoPath: string) {
  const packageDefinition = protoLoader.loadSync(protoPath, {
    keepCase: true,
    defaults: true,
    oneofs: true,
  });
  return grpc.loadPackageDefinition(packageDefinition);
}

function createService(Service: GrpcService<any>, rxImpl: DynamicMethods) {
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

function createUnaryMethod(rxImpl: DynamicMethods, name: string): grpc.handleUnaryCall<any, any> {
  return function(call, callback) {
    try {
      const response: Observable<any> = rxImpl[name](call.request, call.metadata);
      response.subscribe(data => callback(null, data), error => callback(error, null));
    } catch (error) {
      callback(error, null);
    }
  };
}

function createStreamingMethod(
  rxImpl: DynamicMethods,
  name: string,
): grpc.handleServerStreamingCall<any, any> {
  return async function(call) {
    try {
      const response: Observable<any> = rxImpl[name](call.request, call.metadata);
      await response.forEach(data => call.write(data));
    } catch (error) {
      call.emit('error', error);
    }
    call.end();
  };
}

export type ClientFactoryConstructor<T> = new (
  address: string,
  credentials?: grpc.ChannelCredentials,
  options?: any,
) => T;

export function clientFactory<T>(protoPath: string, packageName: string) {
  class Constructor {
    readonly __args: [string, grpc.ChannelCredentials, any | undefined];
    constructor(address: string, credentials?: grpc.ChannelCredentials, options: any = undefined) {
      this.__args = [address, credentials || grpc.credentials.createInsecure(), options];
    }
  }

  const prototype: DynamicMethods = Constructor.prototype;
  const pkg = lookupPackage(grpcLoad(protoPath), packageName);
  for (const name of getServiceNames(pkg)) {
    prototype[`get${name}`] = function(this: Constructor) {
      return createServiceClient((pkg[name] as any) as GrpcService<any>, this.__args);
    };
  }

  return (Constructor as any) as ClientFactoryConstructor<T>;
}

function getServiceNames(pkg: grpc.GrpcObject) {
  return Object.keys(pkg).filter(name => (pkg[name] as GrpcService<any>).service);
}

function createServiceClient(
  GrpcClient: GrpcService<any>,
  args: [string, grpc.ChannelCredentials, any | undefined],
) {
  const grpcClient = new GrpcClient(args[0], args[1], args[2]);
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
      call.on('data', (data: any) => observer.next(data));
      call.on('error', (error: any) => observer.error(error));
      call.on('end', () => observer.complete());
    });
  };
}
