import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import { Codebase } from '../../src/core/Codebase.js';
import { CodeSearch } from '../../src/search/CodeSearch.js';
import type { CodebaseFile, CodeSymbol } from '../../src/core/types.js';

// ---- Unit tests for CodeSearch (no real FS required) ----------------

const mockFiles: CodebaseFile[] = [
  { path: '/project/src/auth/AuthService.ts', relativePath: 'src/auth/AuthService.ts', language: 'typescript', size: 200 },
  { path: '/project/src/users/UserService.ts', relativePath: 'src/users/UserService.ts', language: 'typescript', size: 150 },
  { path: '/project/src/utils/helpers.ts', relativePath: 'src/utils/helpers.ts', language: 'typescript', size: 80 },
];

const mockSymbols: CodeSymbol[] = [
  { id: '/project/src/auth/AuthService.ts#AuthService', name: 'AuthService', kind: 'class', file: '/project/src/auth/AuthService.ts', startLine: 1, endLine: 20 },
  { id: '/project/src/auth/AuthService.ts#login', name: 'login', kind: 'method', file: '/project/src/auth/AuthService.ts', startLine: 3, endLine: 8 },
  { id: '/project/src/users/UserService.ts#UserService', name: 'UserService', kind: 'class', file: '/project/src/users/UserService.ts', startLine: 1, endLine: 30 },
  { id: '/project/src/users/UserService.ts#getUser', name: 'getUser', kind: 'method', file: '/project/src/users/UserService.ts', startLine: 5, endLine: 10 },
  { id: '/project/src/utils/helpers.ts#formatDate', name: 'formatDate', kind: 'function', file: '/project/src/utils/helpers.ts', startLine: 1, endLine: 5 },
];

describe('CodeSearch (unit)', () => {
  const search = new CodeSearch(mockFiles, mockSymbols);

  it('should find exact symbol match with score 1.0', () => {
    const results = search.search('AuthService');
    expect(results.length).toBeGreaterThan(0);
    const top = results[0]!;
    expect(top.symbol).toBe('AuthService');
    expect(top.score).toBe(1.0);
  });

  it('should find symbols by partial name (case-insensitive by default)', () => {
    const results = search.search('service');
    const symbols = results.filter(r => r.symbol !== undefined);
    expect(symbols.length).toBeGreaterThanOrEqual(2);
    expect(symbols.map(s => s.symbol)).toContain('AuthService');
    expect(symbols.map(s => s.symbol)).toContain('UserService');
  });

  it('should find file by basename match', () => {
    const results = search.search('helpers');
    const fileResult = results.find(r => r.file.includes('helpers'));
    expect(fileResult).toBeDefined();
    expect(fileResult?.score).toBeGreaterThan(0);
  });

  it('should find file by path segment', () => {
    const results = search.search('utils');
    const pathResult = results.find(r => r.file.includes('utils'));
    expect(pathResult).toBeDefined();
  });

  it('should respect caseSensitive option', () => {
    const insensitive = search.search('authservice', { caseSensitive: false });
    const sensitive = search.search('authservice', { caseSensitive: true });
    expect(insensitive.length).toBeGreaterThan(0);
    expect(sensitive.filter(r => r.symbol === 'AuthService')).toHaveLength(0); // exact case doesn't match
  });

  it('should respect limit option', () => {
    const results = search.search('service', { limit: 1 });
    expect(results).toHaveLength(1);
  });

  it('should return results sorted by score descending', () => {
    const results = search.search('service');
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
    }
  });

  it('should return empty array for no matches', () => {
    const results = search.search('completelynonexistentxyz123');
    expect(results).toEqual([]);
  });
});

// ---- Integration: search via Codebase --------------------------------

describe('Codebase.search() integration', () => {
  let codebase: Codebase;

  beforeAll(async () => {
    const fixturePath = path.resolve(__dirname, '../fixtures/parser-project');
    codebase = await Codebase.load(fixturePath);
    await codebase.analyze();
  });

  it('should find AuthService by exact name', () => {
    const results = codebase.search('AuthService');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.symbol).toBe('AuthService');
    expect(results[0]!.score).toBe(1.0);
  });

  it('should find symbols by partial query', () => {
    const results = codebase.search('Service');
    const symbolNames = results.map(r => r.symbol).filter(Boolean);
    expect(symbolNames).toContain('AuthService');
    expect(symbolNames).toContain('UserService');
  });

  it('should find files by name', () => {
    const results = codebase.search('AuthService');
    expect(results.some(r => r.file.includes('AuthService.ts'))).toBe(true);
  });
});
