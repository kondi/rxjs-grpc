import * as grpc from 'grpc';

import {
  ClientFactoryConstructor,
  createService,
  createServiceClient,
  DynamicMethods,
  getServiceNames,
  grpcLoad,
  GrpcService,
  lookupPackage,
} from './utils';

export { ClientFactoryConstructor } from './utils';

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
