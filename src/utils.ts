import { GrpcObject } from 'grpc';

export function lookupPackage(root: GrpcObject, packageName: string): any {
  let pkg = root;
  for (const name of packageName.split(/\./)) {
    pkg = <GrpcObject>pkg[name];
  }
  return pkg;
}
