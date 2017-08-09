export function lookupPackage(root: any, packageName: string) {
  let pkg = root;
  for (const name of packageName.split(/\./)) {
    pkg = pkg[name];
  }
  return pkg;
}
