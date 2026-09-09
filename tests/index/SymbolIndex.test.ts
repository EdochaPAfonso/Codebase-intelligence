import { describe, it, expect, beforeEach } from 'vitest';
import { SymbolIndex } from '../../src/index/SymbolIndex.js';
import type { CodeSymbol } from '../../src/core/types.js';

const makeSymbol = (name: string, kind: CodeSymbol['kind'], file: string, parentId?: string): CodeSymbol => {
  const s: CodeSymbol = { id: `${file}#${name}`, name, kind, file, startLine: 1, endLine: 10 };
  if (parentId) s.parentId = parentId;
  return s;
};

describe('SymbolIndex', () => {
  let index: SymbolIndex;

  beforeEach(() => {
    index = new SymbolIndex();
    index.addAll([
      makeSymbol('AuthService', 'class', 'src/auth/AuthService.ts'),
      makeSymbol('login', 'method', 'src/auth/AuthService.ts', 'src/auth/AuthService.ts#AuthService'),
      makeSymbol('UserService', 'class', 'src/users/UserService.ts'),
      makeSymbol('getUser', 'method', 'src/users/UserService.ts', 'src/users/UserService.ts#UserService'),
      makeSymbol('IUser', 'interface', 'src/users/UserService.ts'),
      makeSymbol('createToken', 'function', 'src/auth/utils.ts'),
    ]);
  });

  it('should find a single symbol by name', () => {
    const sym = index.findSymbol('AuthService');
    expect(sym).toBeDefined();
    expect(sym?.kind).toBe('class');
  });

  it('should return undefined for unknown name', () => {
    expect(index.findSymbol('UnknownClass')).toBeUndefined();
  });

  it('should find symbols by name query', () => {
    const results = index.findSymbols({ name: 'UserService' });
    expect(results).toHaveLength(1);
    expect(results[0]?.kind).toBe('class');
  });

  it('should find symbols by kind', () => {
    const methods = index.findSymbols({ kind: 'method' });
    expect(methods).toHaveLength(2);
    expect(methods.every(s => s.kind === 'method')).toBe(true);
  });

  it('should find symbols by file', () => {
    const authSymbols = index.findByFile('src/auth/AuthService.ts');
    expect(authSymbols).toHaveLength(2);
    expect(authSymbols.map(s => s.name)).toContain('AuthService');
    expect(authSymbols.map(s => s.name)).toContain('login');
  });

  it('should return empty array for unknown file', () => {
    expect(index.findByFile('src/unknown.ts')).toEqual([]);
  });

  it('should combine query filters', () => {
    const results = index.findSymbols({ kind: 'method', file: 'src/auth/AuthService.ts' });
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe('login');
  });

  it('should report correct size', () => {
    expect(index.size()).toBe(6);
  });
});
