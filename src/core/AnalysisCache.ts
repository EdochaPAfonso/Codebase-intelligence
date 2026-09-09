import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { CodeSymbol, CodeDependency } from './types.js';

export const CACHE_DIR_NAME = '.codebase-intelligence-cache';
const CACHE_FILE_NAME = 'analysis.json';

export interface CachedEntry {
  /** sha256 of the file content at the time it was cached */
  contentHash: string;
  /** mtime in ms — fast fingerprint used before hashing */
  mtimeMs: number;
  /** size in bytes */
  size: number;
  symbols: CodeSymbol[];
  dependencies: CodeDependency[];
}

interface CacheStore {
  version: number;
  entries: Record<string, CachedEntry>;
}

const CACHE_VERSION = 1;

export class AnalysisCache {
  private store: CacheStore;
  private readonly cacheFile: string;
  private dirty = false;

  constructor(projectRoot: string) {
    const cacheDir = path.join(projectRoot, CACHE_DIR_NAME);
    this.cacheFile = path.join(cacheDir, CACHE_FILE_NAME);
    this.store = this.load(cacheDir);
  }

  // ---- Static helpers --------------------------------------------------

  /** Compute file fingerprint — mtime+size first (cheap), hash only if needed */
  public static fingerprint(filePath: string): { mtimeMs: number; size: number } {
    const stat = fs.statSync(filePath);
    return { mtimeMs: stat.mtimeMs, size: stat.size };
  }

  public static contentHash(filePath: string): string {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  // ---- Core API --------------------------------------------------------

  /**
   * Returns a cached entry if the file hasn't changed (verified by mtime+size
   * first, then content hash on mismatch-unlikely path).
   */
  public get(filePath: string): CachedEntry | null {
    const entry = this.store.entries[filePath];
    if (!entry) return null;

    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return null; // file deleted
    }

    // Fast path: mtime and size match → trust the cache
    if (stat.mtimeMs === entry.mtimeMs && stat.size === entry.size) {
      return entry;
    }

    // Slow path: mtime changed (e.g. save without content change) → verify hash
    const currentHash = AnalysisCache.contentHash(filePath);
    if (currentHash === entry.contentHash) {
      // Update fingerprint so next hit is fast again
      entry.mtimeMs = stat.mtimeMs;
      entry.size = stat.size;
      this.dirty = true;
      return entry;
    }

    return null; // content changed — cache miss
  }

  public set(filePath: string, data: { symbols: CodeSymbol[]; dependencies: CodeDependency[] }): void {
    const { mtimeMs, size } = AnalysisCache.fingerprint(filePath);
    const contentHash = AnalysisCache.contentHash(filePath);
    this.store.entries[filePath] = { contentHash, mtimeMs, size, ...data };
    this.dirty = true;
  }

  /** Persist updated entries to disk. No-op if nothing changed. */
  public async flush(): Promise<void> {
    if (!this.dirty) return;
    const cacheDir = path.dirname(this.cacheFile);
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(this.cacheFile, JSON.stringify(this.store, null, 2), 'utf8');
    this.dirty = false;
  }

  /** Remove all cached entries for this project and delete the cache file. */
  public invalidate(): void {
    this.store = { version: CACHE_VERSION, entries: {} };
    this.dirty = false;
    try {
      fs.rmSync(path.dirname(this.cacheFile), { recursive: true, force: true });
    } catch {
      // ignore — might not exist yet
    }
  }

  // ---- Private ---------------------------------------------------------

  private load(cacheDir: string): CacheStore {
    try {
      const raw = fs.readFileSync(this.cacheFile, 'utf8');
      const parsed = JSON.parse(raw) as CacheStore;
      if (parsed.version !== CACHE_VERSION) {
        return { version: CACHE_VERSION, entries: {} };
      }
      return parsed;
    } catch {
      return { version: CACHE_VERSION, entries: {} };
    }
  }
}
