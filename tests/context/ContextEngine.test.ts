import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import { FileIndex } from '../../src/index/FileIndex.js';
import { SymbolIndex } from '../../src/index/SymbolIndex.js';
import { DependencyGraph } from '../../src/graph/DependencyGraph.js';
import { ContextEngine } from '../../src/context/ContextEngine.js';
import type { CodebaseFile } from '../../src/core/types.js';
import type { CodeSymbol } from '../../src/core/types.js';

// ---------------------------------------------------------------------------
// Fixture: a minimal 2-file project
//
//   UserService.ts  →  imports →  AuthService.ts
//
// Both files exist on disk under tests/fixtures/parser-project/.
// ---------------------------------------------------------------------------

const FIXTURE_DIR = path.resolve('tests/fixtures/parser-project');
const AUTH_PATH = path.join(FIXTURE_DIR, 'AuthService.ts');
const USER_PATH = path.join(FIXTURE_DIR, 'UserService.ts');

function buildFixture(): { engine: ContextEngine } {
  const fileIndex = new FileIndex();
  const symbolIndex = new SymbolIndex();
  const graph = new DependencyGraph();

  const authFile: CodebaseFile = {
    path: AUTH_PATH,
    relativePath: 'AuthService.ts',
    language: 'typescript',
    size: 78,
  };

  const userFile: CodebaseFile = {
    path: USER_PATH,
    relativePath: 'UserService.ts',
    language: 'typescript',
    size: 317,
  };

  fileIndex.addAll([authFile, userFile]);

  // Symbols for AuthService
  const authClass: CodeSymbol = {
    id: 'AuthService.ts::AuthService',
    name: 'AuthService',
    kind: 'class',
    file: AUTH_PATH,
    startLine: 1,
    endLine: 5,
  };
  const loginMethod: CodeSymbol = {
    id: 'AuthService.ts::login',
    name: 'login',
    kind: 'method',
    file: AUTH_PATH,
    startLine: 2,
    endLine: 4,
    parentId: 'AuthService.ts::AuthService',
  };

  // Symbols for UserService
  const iUserInterface: CodeSymbol = {
    id: 'UserService.ts::IUser',
    name: 'IUser',
    kind: 'interface',
    file: USER_PATH,
    startLine: 3,
    endLine: 5,
  };
  const userClass: CodeSymbol = {
    id: 'UserService.ts::UserService',
    name: 'UserService',
    kind: 'class',
    file: USER_PATH,
    startLine: 7,
    endLine: 14,
  };

  symbolIndex.addAll([authClass, loginMethod, iUserInterface, userClass]);

  // Graph: UserService.ts imports AuthService.ts
  graph.addEdge(USER_PATH, AUTH_PATH, 'import');

  const engine = new ContextEngine(graph, symbolIndex, fileIndex, FIXTURE_DIR);
  return { engine };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContextEngine — CE-2', () => {
  let engine: ContextEngine;

  beforeAll(() => {
    ({ engine } = buildFixture());
  });

  // ---- forFile with 'shallow' strategy ------------------------------------

  describe('forFile — shallow', () => {
    it('returns a payload with exactly 1 node (the target, no deps)', async () => {
      const payload = await engine.forFile(USER_PATH, { strategy: 'shallow' });
      expect(payload.nodes).toHaveLength(1);
      expect(payload.nodes[0].kind).toBe('file');
    });

    it('target node contains the full file content', async () => {
      const payload = await engine.forFile(USER_PATH, { strategy: 'shallow' });
      expect(payload.nodes[0].content).toContain('UserService');
      expect(payload.nodes[0].content).toContain('AuthService');
    });

    it('metadata records direct dependencies', async () => {
      const payload = await engine.forFile(USER_PATH, { strategy: 'shallow' });
      expect(payload.metadata.directDependencies).toContain(AUTH_PATH);
    });

    it('metadata records direct dependents of AuthService', async () => {
      const payload = await engine.forFile(AUTH_PATH, { strategy: 'shallow' });
      expect(payload.metadata.directDependents).toContain(USER_PATH);
    });

    it('strategy field matches the requested strategy', async () => {
      const payload = await engine.forFile(USER_PATH, { strategy: 'shallow' });
      expect(payload.strategy).toBe('shallow');
    });

    it('totalTokenEstimate is a positive integer', async () => {
      const payload = await engine.forFile(USER_PATH, { strategy: 'shallow' });
      expect(payload.totalTokenEstimate).toBeGreaterThan(0);
      expect(Number.isInteger(payload.totalTokenEstimate)).toBe(true);
    });

    it('target field is the relative path of the file', async () => {
      const payload = await engine.forFile(USER_PATH, { strategy: 'shallow' });
      expect(payload.target).toBe('UserService.ts');
    });
  });

  // ---- forFile with 'signature' strategy ----------------------------------

  describe('forFile — signature', () => {
    it('includes a dependency node for the imported file', async () => {
      const payload = await engine.forFile(USER_PATH, { strategy: 'signature' });
      expect(payload.nodes.length).toBeGreaterThanOrEqual(2);
    });

    it('dependency node has kind "signature"', async () => {
      const payload = await engine.forFile(USER_PATH, { strategy: 'signature' });
      const depNode = payload.nodes.find(n => n.file === AUTH_PATH);
      expect(depNode).toBeDefined();
      expect(depNode!.kind).toBe('signature');
    });

    it('signature node includes the class declaration line', async () => {
      const payload = await engine.forFile(USER_PATH, { strategy: 'signature' });
      const depNode = payload.nodes.find(n => n.file === AUTH_PATH)!;
      expect(depNode.content).toContain('export class AuthService');
    });
  });

  // ---- forFile with 'deep' strategy ---------------------------------------

  describe('forFile — deep', () => {
    it('includes a dependency node with full file content', async () => {
      const payload = await engine.forFile(USER_PATH, { strategy: 'deep' });
      expect(payload.nodes.length).toBeGreaterThanOrEqual(2);
      const depNode = payload.nodes.find(n => n.file === AUTH_PATH)!;
      expect(depNode.kind).toBe('file');
      expect(depNode.content).toContain('return true');
    });
  });

  // ---- forSymbol ----------------------------------------------------------

  describe('forSymbol', () => {
    it('resolves the file that contains the symbol and builds the payload', async () => {
      const payload = await engine.forSymbol('AuthService', { strategy: 'shallow' });
      expect(payload.nodes[0].file).toBe(AUTH_PATH);
    });

    it('throws a descriptive error for unknown symbols', async () => {
      await expect(
        engine.forSymbol('NonExistentSymbol', { strategy: 'shallow' }),
      ).rejects.toThrow(/symbol "NonExistentSymbol" not found/);
    });
  });

  // ---- Relative path resolution -------------------------------------------

  describe('relative path input', () => {
    it('accepts a relative path and resolves it correctly', async () => {
      const payload = await engine.forFile('UserService.ts', { strategy: 'shallow' });
      expect(payload.nodes[0].relativePath).toBe('UserService.ts');
    });
  });

  // ---- Guard: file not in index -------------------------------------------

  describe('error handling', () => {
    it('throws when the file is not in the index', async () => {
      await expect(
        engine.forFile('/does/not/exist.ts', { strategy: 'shallow' }),
      ).rejects.toThrow(/not in the codebase index/);
    });
  });

  // ---- Token budget -------------------------------------------------------

  describe('maxTokens budget', () => {
    it('drops dependency nodes when budget is extremely tight', async () => {
      // 1 token budget: only the target node should survive
      const payload = await engine.forFile(USER_PATH, {
        strategy: 'deep',
        maxTokens: 1,
      });
      // The target (first node) must always be kept
      expect(payload.nodes[0].file).toBe(USER_PATH);
      // Dependency nodes should have been dropped
      const depNodes = payload.nodes.filter(n => n.file === AUTH_PATH);
      expect(depNodes).toHaveLength(0);
    });
  });
});
