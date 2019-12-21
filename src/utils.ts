import * as protoLoader from '@grpc/proto-loader';
import {
  ChannelCredentials,
  Client,
  GrpcObject,
  handleServerStreamingCall,
  handleUnaryCall,
  loadPackageDefinition,
  Server,
  ServerCredentials,
  ServiceDefinition,
} from 'grpc';
import { Observable } from 'rxjs';

export type ClientFactoryConstructor<T> = new (
  address: string,
  credentials?: ChannelCredentials,
  options?: any,
) => T;

export type DynamicMethods = { [name: string]: any };

export type GrpcService<T> = typeof Client & {
  service: ServiceDefinition<T>;
};

export interface GenericServerBuilder<T> {
  start(address: string, credentials?: ServerCredentials): void;
  forceShutdown(): void;
}

export function addServerBuildMethods<T>(
  adders: T,
  server = new Server(),
): T & GenericServerBuilder<T> {
  const builder: GenericServerBuilder<T> = {
    start(address, credentials) {
      server.bind(address, credentials || ServerCredentials.createInsecure());
      server.start();
    },
    forceShutdown() {
      server.forceShutdown();
    },
  };
  return Object.assign(adders, builder);
}

export function lookupPackage(root: GrpcObject, packageName: string) {
  let pkg = root;
  for (const name of packageName.split(/\./)) {
    pkg = pkg[name] as GrpcObject;
  }
  return pkg;
}

export function protoLoad(protoPath: string) {
  return protoLoader.loadSync(protoPath, {
    keepCase: true,
    defaults: true,
    oneofs: true,
  });
}

export function grpcLoad(protoPath: string) {
  return loadPackageDefinition(protoLoad(protoPath));
}

export function createService(Service: GrpcService<any>, rxImpl: DynamicMethods) {
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

function createUnaryMethod(rxImpl: DynamicMethods, name: string): handleUnaryCall<any, any> {
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
): handleServerStreamingCall<any, any> {
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

export function getServiceNames(pkg: GrpcObject) {
  return Object.keys(pkg).filter(name => (pkg[name] as GrpcService<any>).service);
}

export function createServiceClient(
  GrpcClient: GrpcService<any>,
  args: [string, ChannelCredentials, any | undefined],
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
