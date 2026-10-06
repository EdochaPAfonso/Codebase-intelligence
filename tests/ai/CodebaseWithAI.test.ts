import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as path from 'path';
import { FileIndex } from '../../src/index/FileIndex.js';
import { SymbolIndex } from '../../src/index/SymbolIndex.js';
import { DependencyGraph } from '../../src/graph/DependencyGraph.js';
import { ContextEngine } from '../../src/context/ContextEngine.js';
import { CodebaseWithAI } from '../../src/ai/CodebaseWithAI.js';
import { NoopAIProvider } from '../../src/ai/providers/NoopAIProvider.js';
import type { AIProvider } from '../../src/context/interfaces.js';
import type { CodebaseFile, CodeSymbol } from '../../src/core/types.js';
import type { Codebase } from '../../src/core/Codebase.js';

// ---------------------------------------------------------------------------
// Helpers — build a minimal stub Codebase compatible with CodebaseWithAI
// ---------------------------------------------------------------------------

const FIXTURE_DIR = path.resolve('tests/fixtures/context-project');
const USER_PATH = path.join(FIXTURE_DIR, 'UserService.ts');
const AUTH_PATH = path.join(FIXTURE_DIR, 'AuthService.ts');

function buildStubCodebase(): {
  stubCodebase: Codebase;
  engine: ContextEngine;
} {
  const fileIndex = new FileIndex();
  const symbolIndex = new SymbolIndex();
  const graph = new DependencyGraph();

  const userFile: CodebaseFile = {
    path: USER_PATH,
    relativePath: 'UserService.ts',
    language: 'typescript',
    size: 100,
  };
  const authFile: CodebaseFile = {
    path: AUTH_PATH,
    relativePath: 'AuthService.ts',
    language: 'typescript',
    size: 80,
  };

  fileIndex.addAll([userFile, authFile]);

  const userClass: CodeSymbol = {
    id: 'UserService.ts::UserService',
    name: 'UserService',
    kind: 'class',
    file: USER_PATH,
    startLine: 15,
    endLine: 35,
  };
  const authClass: CodeSymbol = {
    id: 'AuthService.ts::AuthService',
    name: 'AuthService',
    kind: 'class',
    file: AUTH_PATH,
    startLine: 1,
    endLine: 10,
  };

  symbolIndex.addAll([userClass, authClass]);
  graph.addEdge(USER_PATH, AUTH_PATH, 'import');

  const engine = new ContextEngine(graph, symbolIndex, fileIndex, FIXTURE_DIR);

  // Build a minimal Codebase stub that satisfies CodebaseWithAI's interface
  const stubCodebase = {
    context: () => engine,
    search: (query: string) => {
      // Return matching symbols as search results
      if (query.toLowerCase().includes('user')) {
        return [{ file: USER_PATH, symbol: 'UserService', score: 1.0, matches: [] }];
      }
      if (query.toLowerCase().includes('auth')) {
        return [{ file: AUTH_PATH, symbol: 'AuthService', score: 1.0, matches: [] }];
      }
      return [];
    },
    projectInfo: () => ({
      languages: ['typescript'],
      frameworks: [],
      packageManager: 'npm' as const,
    }),
  } as unknown as Codebase;

  return { stubCodebase, engine };
}

// ---------------------------------------------------------------------------
// NoopAIProvider tests
// ---------------------------------------------------------------------------

describe('NoopAIProvider — CE-4', () => {
  it('has name "noop"', () => {
    const provider = new NoopAIProvider();
    expect(provider.name).toBe('noop');
  });

  it('complete() always resolves to an empty string', async () => {
    const provider = new NoopAIProvider();
    const result = await provider.complete('any prompt', 'any system');
    expect(result).toBe('');
  });

  it('complete() without systemPrompt also resolves to empty string', async () => {
    const provider = new NoopAIProvider();
    expect(await provider.complete('prompt')).toBe('');
  });

  it('implements the AIProvider interface', () => {
    const provider: AIProvider = new NoopAIProvider();
    expect(typeof provider.complete).toBe('function');
    expect(typeof provider.name).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// CodebaseWithAI tests
// ---------------------------------------------------------------------------

describe('CodebaseWithAI — CE-4', () => {
  let cbWithAI: CodebaseWithAI;
  let stubCodebase: Codebase;

  beforeAll(() => {
    ({ stubCodebase } = buildStubCodebase());
    cbWithAI = new CodebaseWithAI(stubCodebase, new NoopAIProvider());
  });

  // ---- explain() ----------------------------------------------------------

  describe('explain()', () => {
    it('returns a string (empty for NoopAIProvider)', async () => {
      const result = await cbWithAI.explain(USER_PATH, { strategy: 'shallow' });
      expect(typeof result).toBe('string');
      // NoopAIProvider always returns ''
      expect(result).toBe('');
    });

    it('calls provider.complete() with a non-empty prompt', async () => {
      const spy = vi.fn().mockResolvedValue('mocked response');
      const mockProvider: AIProvider = { name: 'mock', complete: spy };
      const cb = new CodebaseWithAI(stubCodebase, mockProvider);

      await cb.explain(USER_PATH, { strategy: 'shallow' });

      expect(spy).toHaveBeenCalledOnce();
      const [prompt, systemPrompt] = spy.mock.calls[0] as [string, string];
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain('UserService');
      expect(systemPrompt).toBeTruthy();
    });

    it('includes the target file name in the prompt', async () => {
      const spy = vi.fn().mockResolvedValue('');
      const mockProvider: AIProvider = { name: 'mock', complete: spy };
      const cb = new CodebaseWithAI(stubCodebase, mockProvider);

      await cb.explain(USER_PATH, { strategy: 'shallow' });

      const [prompt] = spy.mock.calls[0] as [string, string];
      expect(prompt).toContain('UserService.ts');
    });

    it('includes dependency context when strategy is "signature"', async () => {
      const spy = vi.fn().mockResolvedValue('');
      const mockProvider: AIProvider = { name: 'mock', complete: spy };
      const cb = new CodebaseWithAI(stubCodebase, mockProvider);

      await cb.explain(USER_PATH, { strategy: 'signature' });

      const [prompt] = spy.mock.calls[0] as [string, string];
      // The signature node for AuthService should appear in the prompt
      expect(prompt).toContain('AuthService');
    });

    it('passes extra instruction to the system prompt', async () => {
      const spy = vi.fn().mockResolvedValue('');
      const mockProvider: AIProvider = { name: 'mock', complete: spy };
      const cb = new CodebaseWithAI(stubCodebase, mockProvider);

      await cb.explain(USER_PATH, {
        strategy: 'shallow',
        instruction: 'Focus on security implications',
      });

      const [, systemPrompt] = spy.mock.calls[0] as [string, string];
      expect(systemPrompt).toContain('Focus on security implications');
    });

    it('returns the provider response verbatim', async () => {
      const mockProvider: AIProvider = {
        name: 'mock',
        complete: async () => 'This is the UserService class.',
      };
      const cb = new CodebaseWithAI(stubCodebase, mockProvider);
      const result = await cb.explain(USER_PATH, { strategy: 'shallow' });
      expect(result).toBe('This is the UserService class.');
    });
  });

  // ---- ask() --------------------------------------------------------------

  describe('ask()', () => {
    it('returns a string for NoopAIProvider', async () => {
      const result = await cbWithAI.ask('Como funciona o UserService?');
      expect(typeof result).toBe('string');
    });

    it('calls provider.complete() with the question in the prompt', async () => {
      const spy = vi.fn().mockResolvedValue('answer');
      const mockProvider: AIProvider = { name: 'mock', complete: spy };
      const cb = new CodebaseWithAI(stubCodebase, mockProvider);

      await cb.ask('Como funciona o UserService?');

      expect(spy).toHaveBeenCalledOnce();
      const [prompt] = spy.mock.calls[0] as [string, string];
      expect(prompt).toContain('Como funciona o UserService?');
    });

    it('includes codebase context files in the prompt', async () => {
      const spy = vi.fn().mockResolvedValue('answer');
      const mockProvider: AIProvider = { name: 'mock', complete: spy };
      const cb = new CodebaseWithAI(stubCodebase, mockProvider);

      await cb.ask('UserService details');

      const [prompt] = spy.mock.calls[0] as [string, string];
      // The relevant file should be in the context
      expect(prompt).toContain('UserService.ts');
    });

    it('handles a question with no search results gracefully', async () => {
      const spy = vi.fn().mockResolvedValue('no context answer');
      const mockProvider: AIProvider = { name: 'mock', complete: spy };
      const cb = new CodebaseWithAI(stubCodebase, mockProvider);

      // Query that produces 0 results from our stub search
      await cb.ask('zzznomatchzzz');

      expect(spy).toHaveBeenCalledOnce();
      const [prompt] = spy.mock.calls[0] as [string, string];
      expect(prompt).toContain('No relevant files were found');
    });

    it('includes project info in the system prompt', async () => {
      const spy = vi.fn().mockResolvedValue('');
      const mockProvider: AIProvider = { name: 'mock', complete: spy };
      const cb = new CodebaseWithAI(stubCodebase, mockProvider);

      await cb.ask('UserService details');

      const [, systemPrompt] = spy.mock.calls[0] as [string, string];
      expect(systemPrompt).toContain('typescript');
    });
  });

  // ---- buildExplainPayload() ----------------------------------------------

  describe('buildExplainPayload()', () => {
    it('returns prompt, systemPrompt and the raw LLMContextPayload', async () => {
      const result = await cbWithAI.buildExplainPayload(USER_PATH, { strategy: 'shallow' });

      expect(result.payload.target).toBe('UserService.ts');
      expect(result.prompt).toContain('UserService');
      expect(result.systemPrompt.length).toBeGreaterThan(0);
    });

    it('does NOT call the provider (dry-run)', async () => {
      const spy = vi.fn();
      const mockProvider: AIProvider = { name: 'mock', complete: spy };
      const cb = new CodebaseWithAI(stubCodebase, mockProvider);

      await cb.buildExplainPayload(USER_PATH);
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
