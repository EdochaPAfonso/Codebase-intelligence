import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AnalysisCache, CACHE_DIR_NAME } from '../../src/core/AnalysisCache.js';
import type { CodeSymbol, CodeDependency } from '../../src/core/types.js';

// ---- Helpers ---------------------------------------------------------

const makeSymbol = (name: string): CodeSymbol => ({
  id: `file.ts#${name}`,
  name,
  kind: 'class',
  file: 'file.ts',
  startLine: 1,
  endLine: 10
});

const makeDep = (source: string, target: string): CodeDependency => ({
  source,
  target,
  type: 'import'
});

/** Create a temp project directory with a real file */
const makeTempProject = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cbi-cache-test-'));
  const filePath = path.join(dir, 'Sample.ts');
  fs.writeFileSync(filePath, 'export class Sample {}', 'utf8');
  return { dir, filePath };
};

// ---- Tests -----------------------------------------------------------

describe('AnalysisCache', () => {
  let dir: string;
  let filePath: string;
  let cache: AnalysisCache;

  beforeEach(() => {
    const tmp = makeTempProject();
    dir = tmp.dir;
    filePath = tmp.filePath;
    cache = new AnalysisCache(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns null on a cold cache (miss)', () => {
    expect(cache.get(filePath)).toBeNull();
  });

  it('stores and retrieves a cached entry (hit)', async () => {
    const symbols = [makeSymbol('Sample')];
    const deps = [makeDep(filePath, 'other.ts')];
    cache.set(filePath, { symbols, dependencies: deps });
    await cache.flush();

    // A new cache instance reads from disk — simulates next process run
    const cache2 = new AnalysisCache(dir);
    const hit = cache2.get(filePath);

    expect(hit).not.toBeNull();
    expect(hit?.symbols).toHaveLength(1);
    expect(hit?.symbols[0]?.name).toBe('Sample');
    expect(hit?.dependencies).toHaveLength(1);
  });

  it('returns null after file content changes (cache miss)', async () => {
    cache.set(filePath, { symbols: [makeSymbol('Sample')], dependencies: [] });
    await cache.flush();

    // Simulate file content change (different content → different hash)
    // Sleep a tick so mtime has a chance to differ, then write new content
    await new Promise(r => setTimeout(r, 20));
    fs.writeFileSync(filePath, 'export class UpdatedSample {}', 'utf8');

    const cache2 = new AnalysisCache(dir);
    expect(cache2.get(filePath)).toBeNull();
  });

  it('creates the cache directory on flush', async () => {
    cache.set(filePath, { symbols: [], dependencies: [] });
    await cache.flush();

    const cacheDir = path.join(dir, CACHE_DIR_NAME);
    expect(fs.existsSync(cacheDir)).toBe(true);
  });

  it('invalidate() removes the cache directory', async () => {
    cache.set(filePath, { symbols: [], dependencies: [] });
    await cache.flush();

    cache.invalidate();

    const cacheDir = path.join(dir, CACHE_DIR_NAME);
    expect(fs.existsSync(cacheDir)).toBe(false);
  });
});

// ---- Codebase.analyze() integration -----------------------------------

import * as pathMod from 'path';
import { Codebase } from '../../src/core/Codebase.js';

describe('Codebase cache option', () => {
  const FIXTURE = pathMod.resolve(__dirname, '../fixtures/parser-project');

  it('produces same symbols with cache enabled and disabled', async () => {
    const withCache = await Codebase.load(FIXTURE, { cache: true });
    await withCache.analyze();
    withCache.invalidateCache(); // clean up

    const noCache = await Codebase.load(FIXTURE, { cache: false });
    await noCache.analyze();

    expect(withCache.symbols().length).toBe(noCache.symbols().length);
    expect(withCache.symbols().map(s => s.name).sort())
      .toEqual(noCache.symbols().map(s => s.name).sort());
  });

  it('cache: false does not create cache directory', async () => {
    const codebase = await Codebase.load(FIXTURE, { cache: false });
    await codebase.analyze();

    const cacheDir = pathMod.join(FIXTURE, CACHE_DIR_NAME);
    expect(fs.existsSync(cacheDir)).toBe(false);
  });

  it('invalidateCache() removes the cache dir', async () => {
    const codebase = await Codebase.load(FIXTURE, { cache: true });
    await codebase.analyze();

    codebase.invalidateCache();

    const cacheDir = pathMod.join(FIXTURE, CACHE_DIR_NAME);
    expect(fs.existsSync(cacheDir)).toBe(false);
  });
});
