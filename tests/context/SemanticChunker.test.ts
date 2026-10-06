import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import { SemanticChunker } from '../../src/context/SemanticChunker.js';
import type { CodebaseFile } from '../../src/core/types.js';

const FIXTURE_DIR = path.resolve('tests/fixtures/context-project');
const CHUNKER_TARGET_PATH = path.join(FIXTURE_DIR, 'ChunkerTarget.ts');
const NON_TS_TARGET_PATH = path.join(FIXTURE_DIR, 'config.json');

const tsFile: CodebaseFile = {
  path: CHUNKER_TARGET_PATH,
  relativePath: 'ChunkerTarget.ts',
  language: 'typescript',
  size: 500,
};

const jsonFile: CodebaseFile = {
  path: NON_TS_TARGET_PATH,
  relativePath: 'config.json',
  language: 'json',
  size: 10,
};

describe('SemanticChunker — CE-5', () => {
  let chunker: SemanticChunker;

  beforeAll(() => {
    chunker = new SemanticChunker();
  });

  it('chunks a file by top-level declarations', async () => {
    // Large budget so it doesn't split the class
    const chunks = await chunker.chunk([tsFile], { maxChunkTokens: 1000 });
    
    // We expect chunks for: ChunkDto, ChunkAlias, LargeService, standaloneFunction
    expect(chunks.length).toBe(4);

    const dtoChunk = chunks.find(c => c.symbolName === 'ChunkDto');
    expect(dtoChunk).toBeDefined();
    expect(dtoChunk!.symbolKind).toBe('interface');
    expect(dtoChunk!.content).toContain('export interface ChunkDto');
    // Header should be included
    expect(dtoChunk!.content).toContain("import { Injectable } from '@nestjs/common';");

    const classChunk = chunks.find(c => c.symbolName === 'LargeService');
    expect(classChunk).toBeDefined();
    expect(classChunk!.symbolKind).toBe('class');
    expect(classChunk!.content).toContain('public async methodOne()');
  });

  it('splits a large class by methods when maxChunkTokens is exceeded', async () => {
    // Very tight budget to force splitting the class
    const chunks = await chunker.chunk([tsFile], { maxChunkTokens: 50 });
    
    // The class 'LargeService' has a constructor, methodOne, methodTwo.
    // So it should split into multiple method chunks.
    const methodChunks = chunks.filter(c => c.symbolName === 'methodOne' || c.symbolName === 'methodTwo' || c.symbolName === 'constructor');
    expect(methodChunks.length).toBe(3);

    const methodOneChunk = chunks.find(c => c.symbolName === 'methodOne')!;
    expect(methodOneChunk.symbolKind).toBe('method');
    // It should contain the class skeleton
    expect(methodOneChunk.content).toContain('class LargeService');
    expect(methodOneChunk.content).toContain('public property = 123;');
    expect(methodOneChunk.content).toContain('public async methodOne()');
    // But not methodTwo
    expect(methodOneChunk.content).not.toContain('public async methodTwo()');
  });

  it('skips non-TS/JS files (returns empty array for now)', async () => {
    const chunks = await chunker.chunk([jsonFile]);
    expect(chunks.length).toBe(0);
  });

  it('can omit file headers if requested', async () => {
    const chunks = await chunker.chunk([tsFile], { includeFileHeader: false, maxChunkTokens: 1000 });
    const dtoChunk = chunks.find(c => c.symbolName === 'ChunkDto')!;
    
    expect(dtoChunk.content).toContain('export interface ChunkDto');
    expect(dtoChunk.content).not.toContain("import { Injectable } from '@nestjs/common';");
  });
});
