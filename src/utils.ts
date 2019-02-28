import { GrpcObject } from 'grpc';

export function lookupPackage(root: GrpcObject, packageName: string) {
  let pkg = root;
  for (const name of packageName.split(/\./)) {
    pkg = pkg[name] as GrpcObject;
  }
  return pkg;
}
