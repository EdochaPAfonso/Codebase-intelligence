import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RAGPipeline } from '../../src/ai/RAGPipeline.js';
import type { SemanticChunker, SemanticChunk } from '../../src/context/SemanticChunker.js';
import type { EmbeddingProvider, VectorStore, VectorSearchResult } from '../../src/context/interfaces.js';
import type { Codebase } from '../../src/core/Codebase.js';

describe('RAGPipeline — CE-6', () => {
  let chunker: SemanticChunker;
  let embedder: EmbeddingProvider;
  let store: VectorStore;
  let codebase: Codebase;

  beforeEach(() => {
    chunker = {
      chunk: vi.fn(),
    } as unknown as SemanticChunker;

    embedder = {
      dimensions: 3,
      embed: vi.fn(),
    };

    store = {
      upsert: vi.fn().mockResolvedValue(undefined),
      search: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    codebase = {
      chunks: vi.fn().mockResolvedValue([]),
    } as unknown as Codebase;
  });

  it('index() handles empty chunks gracefully', async () => {
    const pipeline = new RAGPipeline({ chunker, embedder, store });
    await pipeline.index(codebase);

    expect(codebase.chunks).toHaveBeenCalledOnce();
    expect(embedder.embed).not.toHaveBeenCalled();
    expect(store.upsert).not.toHaveBeenCalled();
  });

  it('index() generates chunks, embeds them, and upserts them to the store', async () => {
    const chunks: SemanticChunk[] = [
      {
        id: 'file1.ts:1-10',
        file: '/path/file1.ts',
        relativePath: 'file1.ts',
        content: 'class A {}',
        symbolKind: 'class',
        symbolName: 'A',
        startLine: 1,
        endLine: 10,
        tokenEstimate: 5,
      },
      {
        id: 'file2.ts:1-20',
        file: '/path/file2.ts',
        relativePath: 'file2.ts',
        content: 'const B = 1;',
        symbolKind: 'variable',
        startLine: 1,
        endLine: 20,
        tokenEstimate: 8,
      },
    ];

    vi.mocked(codebase.chunks).mockResolvedValue(chunks);
    vi.mocked(embedder.embed).mockResolvedValue([[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]);

    const pipeline = new RAGPipeline({ chunker, embedder, store });
    await pipeline.index(codebase);

    expect(codebase.chunks).toHaveBeenCalledOnce();
    
    expect(embedder.embed).toHaveBeenCalledWith(['class A {}', 'const B = 1;']);
    
    expect(store.upsert).toHaveBeenCalledTimes(2);
    expect(store.upsert).toHaveBeenNthCalledWith(1, 'file1.ts:1-10', [0.1, 0.2, 0.3], {
      file: '/path/file1.ts',
      relativePath: 'file1.ts',
      content: 'class A {}',
      symbolKind: 'class',
      symbolName: 'A',
      startLine: 1,
      endLine: 10,
      tokenEstimate: 5,
    });
    
    expect(store.upsert).toHaveBeenNthCalledWith(2, 'file2.ts:1-20', [0.4, 0.5, 0.6], {
      file: '/path/file2.ts',
      relativePath: 'file2.ts',
      content: 'const B = 1;',
      symbolKind: 'variable',
      startLine: 1,
      endLine: 20,
      tokenEstimate: 8,
    }); // symbolName should be omitted since it's undefined
  });

  it('index() throws if embedder returns a different number of vectors than chunks', async () => {
    const chunks: SemanticChunk[] = [
      {
        id: 'file1.ts:1-10',
        file: '/path/file1.ts',
        relativePath: 'file1.ts',
        content: 'class A {}',
        symbolKind: 'class',
        symbolName: 'A',
        startLine: 1,
        endLine: 10,
        tokenEstimate: 5,
      },
    ];

    vi.mocked(codebase.chunks).mockResolvedValue(chunks);
    // returns 2 vectors instead of 1
    vi.mocked(embedder.embed).mockResolvedValue([[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]);

    const pipeline = new RAGPipeline({ chunker, embedder, store });
    
    await expect(pipeline.index(codebase)).rejects.toThrow(/embedding provider returned 2 vectors, but expected 1/);
  });

  it('search() embeds the query and searches the store, mapping results back to SemanticChunks', async () => {
    vi.mocked(embedder.embed).mockResolvedValue([[0.9, 0.8, 0.7]]);
    
    const storeResults: VectorSearchResult[] = [
      {
        id: 'file1.ts:1-10',
        score: 0.95,
        metadata: {
          file: '/path/file1.ts',
          relativePath: 'file1.ts',
          content: 'class A {}',
          symbolKind: 'class',
          symbolName: 'A',
          startLine: 1,
          endLine: 10,
          tokenEstimate: 5,
        }
      }
    ];
    vi.mocked(store.search).mockResolvedValue(storeResults);

    const pipeline = new RAGPipeline({ chunker, embedder, store });
    const results = await pipeline.search('find class A', 3);

    expect(embedder.embed).toHaveBeenCalledWith(['find class A']);
    expect(store.search).toHaveBeenCalledWith([0.9, 0.8, 0.7], 3);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      id: 'file1.ts:1-10',
      file: '/path/file1.ts',
      relativePath: 'file1.ts',
      content: 'class A {}',
      symbolKind: 'class',
      symbolName: 'A',
      startLine: 1,
      endLine: 10,
      tokenEstimate: 5,
    });
  });
  
  it('search() handles empty query vector correctly', async () => {
    vi.mocked(embedder.embed).mockResolvedValue([]);

    const pipeline = new RAGPipeline({ chunker, embedder, store });
    const results = await pipeline.search('invalid query', 3);
    
    expect(results).toHaveLength(0);
    expect(store.search).not.toHaveBeenCalled();
  });
});
