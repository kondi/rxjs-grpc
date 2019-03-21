<a name="0.2.4"></a>

# [0.2.4](https://github.com/kondi/rxjs-grpc/compare/v0.2.3...v0.2.4) (2019-03-21)

### Experimental

- Export experimental types (CodecsFactory, RawClientFactory, RawService) ([f536f49](https://github.com/kondi/rxjs-grpc/commit/f536f49))

<a name="0.2.3"></a>

# [0.2.3](https://github.com/kondi/rxjs-grpc/compare/v0.2.2...v0.2.3) (2019-03-19)

### Bug Fixes

- Export mistakenly removed ClientFactoryConstructor in [3c50d39](https://github.com/kondi/rxjs-grpc/commit/3c50d39) ([23ba757](https://github.com/kondi/rxjs-grpc/commit/23ba757))

<a name="0.2.2"></a>

# [0.2.2](https://github.com/kondi/rxjs-grpc/compare/v0.2.1...v0.2.2) (2019-03-19)

### Code Refactoring

- Extract generic functions from index.ts to utils.ts ([3c50d39](https://github.com/kondi/rxjs-grpc/commit/3c50d39))

### Experimental

- Add experimental rawClientFactory and service codecs ([495ebfc](https://github.com/kondi/rxjs-grpc/commit/495ebfc))
- Add notes about the experimental API ([5b05e51](https://github.com/kondi/rxjs-grpc/commit/5b05e51))

<a name="0.2.1"></a>

# [0.2.1](https://github.com/kondi/rxjs-grpc/compare/v0.2.0...v0.2.1) (2019-03-13)

### Features

- Add optional server instance parameter to serverBuilder (closes [#20](https://github.com/kondi/rxjs-grpc/issues/20)) ([2c1841a](https://github.com/kondi/rxjs-grpc/commit/2c1841a))
- Fix all current dependency audit alerts ([9347d54](https://github.com/kondi/rxjs-grpc/commit/9347d54))

<a name="0.2.0"></a>

# [0.2.0](https://github.com/kondi/rxjs-grpc/compare/v0.1.7...v0.2.0) (2019-03-05)

### Bug Fixes

- Handle server side errors ([0e0f8d1](https://github.com/kondi/rxjs-grpc/commit/0e0f8d1))
- Fix protobufjs 6.7.0 compatibility issues (fixes [#7](https://github.com/kondi/rxjs-grpc/issues/7)) ([15bd7f7](https://github.com/kondi/rxjs-grpc/commit/15bd7f7))
- Fix addProtoService deprecation warning (needs grpc >= 1.7, fixes [#12](https://github.com/kondi/rxjs-grpc/issues/12) [#23](https://github.com/kondi/rxjs-grpc/issues/23)) ([f073e76](https://github.com/kondi/rxjs-grpc/commit/f073e76))

### Code Refactoring

- Change build from prepublish to prepublishOnly script ([dca14bd](https://github.com/kondi/rxjs-grpc/commit/dca14bd))
- Use @types/jscodeshift and make cli code typesafe ([24aed05](https://github.com/kondi/rxjs-grpc/commit/24aed05))
- Install and configure prettier ([82725e8](https://github.com/kondi/rxjs-grpc/commit/82725e8))
- Upgrade tslint and update lint rules ([1e9d4dd](https://github.com/kondi/rxjs-grpc/commit/1e9d4dd))
- Use official grpc types instead of any in the index.ts ([3de00ad](https://github.com/kondi/rxjs-grpc/commit/3de00ad))
- Exclude unnecessary files from npm release ([3fb5040](https://github.com/kondi/rxjs-grpc/commit/3fb5040))

### Features

- Upgrade to latest protobufjs and adjust cli for it (fixes [#32](https://github.com/kondi/rxjs-grpc/issues/32)) ([26048d4](https://github.com/kondi/rxjs-grpc/commit/26048d4))
- Upgrade to rxjs6 (fixes [#29](https://github.com/kondi/rxjs-grpc/issues/29)) ([d629242](https://github.com/kondi/rxjs-grpc/commit/d629242))
- Upgrade grpc to latest and fix deprecation warnings ([5bae279](https://github.com/kondi/rxjs-grpc/commit/5bae279))
- Support optional metadata in service calls (fixes [#11](https://github.com/kondi/rxjs-grpc/issues/11)) ([84a9e61](https://github.com/kondi/rxjs-grpc/commit/84a9e61))
- Fix dependency audit alerts ([18c4a93](https://github.com/kondi/rxjs-grpc/commit/18c4a93))

### BREAKING CHANGES

- `rxjs` dependency is `^6.0.0` ([RxJS v5.x to v6 Update Guide](https://github.com/ReactiveX/rxjs/blob/master/docs_app/content/guide/v6/migration.md))
