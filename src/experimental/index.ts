import * as grpc from '@grpc/grpc-js';
import { AnyDefinition } from '@grpc/proto-loader';
import { Observable, Subscribable } from 'rxjs';

import {
  addServerBuildMethods,
  ClientFactoryConstructor,
  createService,
  createServiceClient,
  DynamicMethods,
  GenericServerBuilder,
  getServiceNames,
  grpcLoad,
  GrpcService,
  lookupPackage,
  protoLoad,
} from '../utils';

type LooseReturnType<T> = T extends (...args: any[]) => infer R ? R : never;
type FirstArgument<T> = T extends (arg: infer A, ...args: any[]) => any ? A : never;
type RequestType<T> = FirstArgument<T>;
type ResponseType<T> = LooseReturnType<T> extends Subscribable<infer A> ? A : never;

export type SerializedMessage<T> = Buffer & {
  __deserialized_type?: T;
};

type Serializer<T> = (message: T) => SerializedMessage<T>;

type Deserializer<T> = (serialized: SerializedMessage<T>) => T;

type MethodCodecs<Method> = {
  requestSerialize: Serializer<RequestType<Method>>;
  requestDeserialize: Deserializer<RequestType<Method>>;
  responseSerialize: Serializer<ResponseType<Method>>;
  responseDeserialize: Deserializer<ResponseType<Method>>;
};

type ServiceCodecs<Service> = { [MethodName in keyof Service]: MethodCodecs<Service[MethodName]> };

export type CodecsFactory<ClientFactory> = {
  [GetterName in keyof ClientFactory]: () => ServiceCodecs<
    LooseReturnType<ClientFactory[GetterName]>
  >
};

type RawServiceMethod<Method> = (
  request: SerializedMessage<RequestType<Method>>,
  metadata?: grpc.Metadata,
) => Observable<SerializedMessage<ResponseType<Method>>>;

export type RawService<Service> = {
  [MethodName in keyof Service]: RawServiceMethod<Service[MethodName]>
};

export type RawClientFactory<ClientFactory> = {
  [GetterName in keyof ClientFactory]: () => RawService<LooseReturnType<ClientFactory[GetterName]>>
};

export type RawServerBuilder<ServerBuilder> = {
  [AdderName in keyof ServerBuilder]: (
    service: RawService<FirstArgument<ServerBuilder[AdderName]>>,
  ) => RawServerBuilder<ServerBuilder>
};

export function rawClientFactory<ClientFactory>(protoPath: string, packageName: string) {
  class Constructor {
    readonly __args: [string, grpc.ChannelCredentials, any | undefined];
    constructor(address: string, credentials?: grpc.ChannelCredentials, options: any = undefined) {
      this.__args = [address, credentials || grpc.credentials.createInsecure(), options];
    }
  }

  const prototype: DynamicMethods = Constructor.prototype;
  const pkg = lookupPackage(grpcLoad(protoPath), packageName);
  for (const name of getServiceNames(pkg)) {
    type GetterType = keyof ClientFactory;
    type ServiceType = LooseReturnType<ClientFactory[GetterType]>;
    prototype[`get${name}`] = function(this: Constructor) {
      // @ts-ignore
      const grpcService = pkg[name] as GrpcService<ServiceType>;
      const definition = grpcService.service;
      typedKeys(definition).forEach(methodKey => {
        const methodDefinition = definition[methodKey];
        methodDefinition.requestSerialize = (alreadySerialized: SerializedMessage<any>) => {
          return alreadySerialized;
        };
        methodDefinition.responseDeserialize = (serialized: SerializedMessage<any>) => {
          return serialized;
        };
      });
      return createServiceClient(grpcService, this.__args);
    };
  }

  return (Constructor as any) as ClientFactoryConstructor<RawClientFactory<ClientFactory>>;
}

export function rawServerBuilder<T>(
  protoPath: string,
  packageName: string,
  server = new grpc.Server(),
): RawServerBuilder<T> & GenericServerBuilder<RawServerBuilder<T>> {
  const adders: DynamicMethods = {};
  const pkg = lookupPackage(grpcLoad(protoPath), packageName);
  for (const name of getServiceNames(pkg)) {
    adders[`add${name}`] = function(rxImpl: DynamicMethods) {
      const serviceData = (pkg[name] as any) as GrpcService<any>;
      const definition = serviceData.service;
      typedKeys(definition).forEach(methodKey => {
        const methodDefinition = definition[methodKey];
        methodDefinition.requestDeserialize = (serialized: SerializedMessage<any>) => {
          return serialized;
        };
        methodDefinition.responseSerialize = (alreadySerialized: SerializedMessage<any>) => {
          return alreadySerialized;
        };
      });
      server.addService(serviceData.service, createService(serviceData, rxImpl));
      return this;
    };
  }
  return addServerBuildMethods(adders, server) as any;
}

export function buildCodecsFactory<ClientFactory>(
  protoPath: string,
  packageName: string,
): CodecsFactory<ClientFactory> {
  const factory = {} as CodecsFactory<ClientFactory>;
  type GetterType = keyof ClientFactory;
  type ServiceType = LooseReturnType<ClientFactory[GetterType]>;
  const services = loadServices<ServiceType>(protoPath, packageName);
  for (const name of typedKeys(services)) {
    const codecs = buildServiceCodecs(services[name]);
    const getterName = `get${name}` as GetterType;
    factory[getterName] = () => codecs;
  }
  return factory;
}

function buildServiceCodecs<Service>(
  definition: grpc.ServiceDefinition<Service>,
): ServiceCodecs<Service> {
  const codecs = {} as { [key in keyof Service]: MethodCodecs<Service[key]> };
  typedKeys(definition).forEach(methodKey => {
    getMethodNames(definition, methodKey).forEach(methodName => {
      const {
        requestSerialize,
        requestDeserialize,
        responseSerialize,
        responseDeserialize,
      } = definition[methodKey];
      codecs[methodName] = {
        requestSerialize,
        requestDeserialize,
        responseSerialize,
        responseDeserialize,
      };
    });
  });
  return codecs;
}

function getMethodNames<T>(definition: grpc.ServiceDefinition<T>, key: keyof T) {
  const methodDefinition = definition[key];
  return [key, (methodDefinition as any).originalName as keyof T];
}

function loadServices<ServiceType>(protoPath: string, packageName: string) {
  const packageDefinition = protoLoad(protoPath);
  const prefix = packageName + '.';
  const pkg: Record<string, grpc.ServiceDefinition<ServiceType>> = {};
  Object.keys(packageDefinition)
    .filter(key => key.startsWith(prefix))
    .forEach(key => {
      const entry = packageDefinition[key];
      if (isServiceDefinition<ServiceType>(entry)) {
        pkg[key.substring(prefix.length)] = entry;
      }
    });
  return pkg;
}

function isServiceDefinition<ServiceType>(
  def: AnyDefinition | grpc.ServiceDefinition<any>,
): def is grpc.ServiceDefinition<ServiceType> {
  return typeof def['format'] !== 'string';
}

function typedKeys<T>(t: T) {
  return Object.keys(t) as Array<Extract<keyof T, string>>;
}
