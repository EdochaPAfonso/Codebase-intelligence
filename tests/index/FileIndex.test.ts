import { describe, it, expect, beforeEach } from 'vitest';
import { FileIndex } from '../../src/index/FileIndex.js';
import type { CodebaseFile } from '../../src/core/types.js';

const makeFile = (relativePath: string, lang: 'typescript' | 'javascript' = 'typescript'): CodebaseFile => ({
  path: `/project/${relativePath}`,
  relativePath,
  language: lang,
  size: 100
});

describe('FileIndex', () => {
  let index: FileIndex;

  beforeEach(() => {
    index = new FileIndex();
    index.addAll([
      makeFile('src/auth/AuthService.ts'),
      makeFile('src/users/UserService.ts'),
      makeFile('src/utils/helpers.js', 'javascript')
    ]);
  });

  it('should retrieve file by absolute path', () => {
    const file = index.getByPath('/project/src/auth/AuthService.ts');
    expect(file).toBeDefined();
    expect(file?.relativePath).toBe('src/auth/AuthService.ts');
  });

  it('should retrieve file by relative path', () => {
    const file = index.getByRelativePath('src/users/UserService.ts');
    expect(file).toBeDefined();
    expect(file?.language).toBe('typescript');
  });

  it('should return undefined for unknown path', () => {
    expect(index.getByPath('/project/src/unknown.ts')).toBeUndefined();
    expect(index.getByRelativePath('src/unknown.ts')).toBeUndefined();
  });

  it('should list all files', () => {
    const all = index.all();
    expect(all).toHaveLength(3);
  });

  it('should report correct size', () => {
    expect(index.size()).toBe(3);
  });
});
