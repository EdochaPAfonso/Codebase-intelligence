import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { FileScanner } from '../../src/discovery/FileScanner.js';
import { IgnoreMatcher } from '../../src/discovery/IgnoreMatcher.js';

describe('IgnoreMatcher', () => {
  it('should include default ignores by default', () => {
    const matcher = new IgnoreMatcher();
    const ignores = matcher.getGlobIgnores();
    expect(ignores).toContain('**/node_modules/**');
    expect(ignores).toContain('**/.git/**');
  });

  it('should allow extra ignores', () => {
    const matcher = new IgnoreMatcher({ extraIgnores: ['**/custom-ignore/**'] });
    const ignores = matcher.getGlobIgnores();
    expect(ignores).toContain('**/custom-ignore/**');
    expect(ignores).toContain('**/node_modules/**');
  });

  it('should disable default ignores if requested', () => {
    const matcher = new IgnoreMatcher({ disableDefaultIgnores: true });
    const ignores = matcher.getGlobIgnores();
    expect(ignores).not.toContain('**/node_modules/**');
  });
});

describe('FileScanner', () => {
  const fixturesPath = path.resolve(__dirname, '../fixtures/basic-project');

  it('should scan relevant files and ignore defaults (node_modules, dist, .env)', async () => {
    const scanner = new FileScanner({ cwd: fixturesPath });
    const files = await scanner.scan();

    const relativePaths = files.map(f => f.relativePath);

    // Should include
    expect(relativePaths).toContain('src/index.ts');
    expect(relativePaths).toContain('package.json');

    // Should ignore
    expect(relativePaths).not.toContain('node_modules/some-module/index.js');
    expect(relativePaths).not.toContain('dist/index.js');
    expect(relativePaths).not.toContain('.env');
  });

  it('should correctly determine language and populate file properties', async () => {
    const scanner = new FileScanner({ cwd: fixturesPath });
    const files = await scanner.scan();

    const indexFile = files.find(f => f.relativePath === 'src/index.ts');
    expect(indexFile).toBeDefined();
    expect(indexFile?.language).toBe('typescript');
    expect(indexFile?.size).toBeGreaterThan(0);
    expect(path.isAbsolute(indexFile?.path ?? '')).toBe(true);

    const pkgFile = files.find(f => f.relativePath === 'package.json');
    expect(pkgFile).toBeDefined();
    expect(pkgFile?.language).toBe('json');
  });
});
