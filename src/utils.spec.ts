import { lookupPackage } from './utils';

describe('utils', () => {
  describe('lookupPackage', () => {
    it('should lookup from first level', async () => {
      const root = { name: {} };
      expect(lookupPackage(root, 'name')).toBe(root.name);
    });

    it('should lookup from deep level', async () => {
      const root = {
        name: {},
        a: {
          b: {
            c: {},
          },
        },
      };
      expect(lookupPackage(root, 'a.b.c')).toBe(root.a.b.c);
    });
  });
});
