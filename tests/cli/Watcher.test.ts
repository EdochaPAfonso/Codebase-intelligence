import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Watcher } from '../../src/cli/Watcher.js';

// Use fake timers to control debounce without real delays
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('Watcher — debounce', () => {
  it('calls onChanged once after debounce window, even with multiple rapid events', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);

    const watcher = new Watcher({
      debounceMs: 300,
      onChanged: handler,
      watchFactory: (_dir, _signal, rawHandler) => {
        // Store rawHandler so tests can trigger events manually
        (watcher as any).__trigger = rawHandler;
      }
    });

    watcher.start('/fake/project');
    const trigger = (watcher as any).__trigger as (f: string) => void;

    // Fire 5 rapid changes
    trigger('src/A.ts');
    trigger('src/B.ts');
    trigger('src/A.ts');
    trigger('src/C.ts');
    trigger('src/B.ts');

    // Handler must NOT have been called yet (debounce still pending)
    expect(handler).not.toHaveBeenCalled();

    // Advance past the debounce window
    await vi.advanceTimersByTimeAsync(300);
    await vi.runAllTimersAsync();

    expect(handler).toHaveBeenCalledTimes(1);

    // The set should contain unique paths
    const receivedSet: Set<string> = handler.mock.calls[0]![0];
    expect(receivedSet.size).toBe(3); // A, B, C (de-duplicated)

    watcher.stop();
  });

  it('resets the debounce window on each new event', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);

    const watcher = new Watcher({
      debounceMs: 300,
      onChanged: handler,
      watchFactory: (_dir, _signal, rawHandler) => {
        (watcher as any).__trigger = rawHandler;
      }
    });

    watcher.start('/fake/project');
    const trigger = (watcher as any).__trigger as (f: string) => void;

    trigger('src/A.ts');

    // Advance only 200ms — handler should still not fire
    await vi.advanceTimersByTimeAsync(200);
    expect(handler).not.toHaveBeenCalled();

    // New event resets the window
    trigger('src/B.ts');

    await vi.advanceTimersByTimeAsync(200);
    expect(handler).not.toHaveBeenCalled(); // still within new window

    await vi.advanceTimersByTimeAsync(100);
    await vi.runAllTimersAsync();
    expect(handler).toHaveBeenCalledTimes(1);

    watcher.stop();
  });
});

describe('Watcher — stop()', () => {
  it('cancels a pending debounce on stop()', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);

    const watcher = new Watcher({
      debounceMs: 300,
      onChanged: handler,
      watchFactory: (_dir, _signal, rawHandler) => {
        (watcher as any).__trigger = rawHandler;
      }
    });

    watcher.start('/fake/project');
    const trigger = (watcher as any).__trigger as (f: string) => void;

    trigger('src/A.ts');

    // Stop before debounce fires
    watcher.stop();

    await vi.advanceTimersByTimeAsync(500);
    await vi.runAllTimersAsync();

    // Handler must never have been called
    expect(handler).not.toHaveBeenCalled();
  });

  it('throws if start() is called while already running', () => {
    const handler = vi.fn().mockResolvedValue(undefined);

    const watcher = new Watcher({
      debounceMs: 300,
      onChanged: handler,
      watchFactory: () => { /* noop */ }
    });

    watcher.start('/fake/project');
    expect(() => watcher.start('/fake/project')).toThrow('already running');

    watcher.stop();
  });
});

describe('Watcher — selective reprocessing', () => {
  it('accumulates distinct changed files across the debounce window', async () => {
    const received: string[][] = [];
    const handler = vi.fn(async (files: ReadonlySet<string>) => {
      received.push(Array.from(files).sort());
    });

    const watcher = new Watcher({
      debounceMs: 300,
      onChanged: handler,
      watchFactory: (_dir, _signal, rawHandler) => {
        (watcher as any).__trigger = rawHandler;
      }
    });

    watcher.start('/p');
    const trigger = (watcher as any).__trigger as (f: string) => void;

    // First burst
    trigger('src/auth/AuthService.ts');
    trigger('src/auth/AuthService.ts'); // duplicate — should be collapsed
    trigger('src/users/UserService.ts');

    await vi.advanceTimersByTimeAsync(300);
    await vi.runAllTimersAsync();

    // Second burst (after first flush)
    trigger('src/graph/DependencyGraph.ts');

    await vi.advanceTimersByTimeAsync(300);
    await vi.runAllTimersAsync();

    expect(handler).toHaveBeenCalledTimes(2);
    expect(received[0]).toEqual([
      '/p/src/auth/AuthService.ts',
      '/p/src/users/UserService.ts'
    ]);
    expect(received[1]).toEqual(['/p/src/graph/DependencyGraph.ts']);

    watcher.stop();
  });
});
