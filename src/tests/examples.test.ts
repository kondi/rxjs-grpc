import * as glob from 'glob';
import { fs } from 'mz';
import * as path from 'path';

import * as cli from '../cli';

import { compileInMemory, Sources } from './utils';

describe('compile/examples', () => {
  const EXAMPLES_FOLDER = path.join(__dirname, '..', '..', 'examples');

  for (const folderName of fs.readdirSync(EXAMPLES_FOLDER)) {
    const EXAMPLE_FOLDER = path.join(EXAMPLES_FOLDER, folderName);

    describe(folderName, () => {
      it('should build and compile without error', async () => {
        const namespaces = await cli.buildTypeScript(
          glob
            .sync('*.proto', { cwd: EXAMPLE_FOLDER })
            .map(name => path.join(EXAMPLE_FOLDER, name)),
        );
        expect(namespaces).toBeTruthy();

        const sources: Sources = {};
        for (const name of glob.sync('*.ts', { cwd: EXAMPLE_FOLDER })) {
          sources[name] = await fs.readFile(path.join(EXAMPLE_FOLDER, name), 'utf8');
        }
        sources['grpc-namespaces.ts'] = namespaces;

        expect(compileInMemory(sources).ok).toBe(true);
      });
    });
  }
});
