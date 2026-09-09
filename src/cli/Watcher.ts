import * as fs from 'fs';

export type WatchEventHandler = (changedFiles: ReadonlySet<string>) => Promise<void>;

export interface WatcherOptions {
  /** Debounce window in ms (default: 300) */
  debounceMs?: number;
  /** Called after debounce with the set of changed absolute paths */
  onChanged: WatchEventHandler;
  /**
   * Injection point for tests — replaces the real `fs.watch` call.
   * The factory receives the directory and a raw event callback, and must
   * return a { close() } handle.
   */
  watchFactory?: (
    dir: string,
    signal: AbortSignal,
    rawHandler: (filename: string) => void
  ) => void;
}

/**
 * Lightweight file watcher built on Node's native `fs.watch` with:
 * - `recursive: true` (Node ≥ 18.8)
 * - Configurable debounce window
 * - Graceful shutdown via AbortController
 *
 * `dependenciesOf`/`dependentsOf` are direct (not transitive).
 * For transitive traversal use `allDependenciesOf` / `allDependentsOf`.
 */
export class Watcher {
  private readonly debounceMs: number;
  private readonly onChanged: WatchEventHandler;
  private readonly watchFactory: WatcherOptions['watchFactory'];

  private abortController: AbortController | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingFiles = new Set<string>();

  constructor(opts: WatcherOptions) {
    this.debounceMs = opts.debounceMs ?? 300;
    this.onChanged = opts.onChanged;
    this.watchFactory = opts.watchFactory;
  }

  public start(dir: string): void {
    if (this.abortController) {
      throw new Error('Watcher is already running. Call stop() first.');
    }

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    if (this.watchFactory) {
      // Testable path — delegate to injected factory
      this.watchFactory(dir, signal, (filename) => this.handleRaw(dir, filename));
    } else {
      // Production path — native fs.watch
      const watcher = fs.watch(
        dir,
        { recursive: true, signal },
        (_event, filename) => {
          if (filename) this.handleRaw(dir, filename);
        }
      );

      watcher.on('error', (err: NodeJS.ErrnoException) => {
        // AbortError is expected on stop() — swallow it silently
        if (err.name !== 'AbortError') {
          console.error('[watch] error:', err.message);
        }
      });
    }
  }

  public stop(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingFiles.clear();
    this.abortController?.abort();
    this.abortController = null;
  }

  // ---- Internal -------------------------------------------------------

  /**
   * Exposed for testing: directly enqueue a file change.
   */
  public _enqueue(absolutePath: string): void {
    this.handleRaw('', absolutePath, true);
  }

  private handleRaw(dir: string, filename: string, alreadyAbsolute = false): void {
    const fullPath = alreadyAbsolute ? filename : `${dir}/${filename}`.replace(/\\/g, '/');
    this.pendingFiles.add(fullPath);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(async () => {
      this.debounceTimer = null;
      const snapshot = new Set(this.pendingFiles);
      this.pendingFiles.clear();
      await this.onChanged(snapshot);
    }, this.debounceMs);
  }
}
