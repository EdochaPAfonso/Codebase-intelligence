import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { ChangeSetOptions, ChangeSetProvider, ChangeStatus, FileChange } from './types.js';
import {
  GitCommandError,
  GitNotAvailableError,
  InvalidGitRefError,
  NotAGitRepositoryError,
} from './errors.js';

const execFile = promisify(execFileCb);

// ---------------------------------------------------------------------------
// GitChangeSetProvider
// ---------------------------------------------------------------------------

/**
 * A `ChangeSetProvider` implementation that reads file changes from a local
 * Git repository using the `git` CLI.
 *
 * **Safety guarantees**:
 * - All git calls use `execFile` with an args array (never `exec` with a
 *   shell-interpolated string). This prevents shell injection.
 * - Refs provided by callers are validated and rejected if they begin with
 *   `-` or cannot be resolved in the repository.
 * - Output is parsed using NUL (`\0`) as the field separator (`-z` flag),
 *   which correctly handles file names containing spaces, tabs, or newlines.
 *
 * @example
 * ```ts
 * const provider = new GitChangeSetProvider('/path/to/codebase');
 * const changes = await provider.getChanges({ since: 'main' });
 * ```
 */
export class GitChangeSetProvider implements ChangeSetProvider {
  /**
   * @param codebaseRoot - Absolute path to the codebase root as passed to
   *   `Codebase.load()`. May differ from the Git repository root (e.g. when
   *   the codebase is a sub-directory of a monorepo).
   */
  constructor(private readonly codebaseRoot: string) {}

  public async getChanges(options: ChangeSetOptions = {}): Promise<FileChange[]> {
    await this.ensureGitAvailable();

    const gitRoot = await this.resolveGitRoot();

    this.validateOptions(options);
    if (options.since !== undefined) await this.validateRef(options.since, gitRoot);
    if (options.until !== undefined) await this.validateRef(options.until, gitRoot);

    let changes: FileChange[];

    if (options.staged) {
      changes = await this.getStagedChanges(gitRoot);
    } else if (options.uncommitted) {
      changes = await this.getUncommittedChanges(gitRoot);
    } else if (options.since !== undefined) {
      changes = await this.getChangesSince(gitRoot, options.since, options.until ?? 'HEAD');
    } else {
      // Default: uncommitted (staged + working tree)
      changes = await this.getUncommittedChanges(gitRoot);
    }

    // Normalise all paths to be relative to the codebase root and sort
    return this.normaliseAndSort(changes, gitRoot);
  }

  // ---- Git modes ----------------------------------------------------------

  /** Returns only staged (index) changes: `git diff --cached`. */
  private async getStagedChanges(gitRoot: string): Promise<FileChange[]> {
    const stdout = await this.runGit(
      ['diff', '--name-status', '-M', '-z', '--cached'],
      gitRoot,
    );
    return this.parseDiffOutput(stdout);
  }

  /**
   * Returns all uncommitted changes (staged + working tree) plus untracked
   * files. This is the most useful default for local development.
   */
  private async getUncommittedChanges(gitRoot: string): Promise<FileChange[]> {
    // Check whether HEAD exists (fresh repos before first commit have no HEAD)
    const hasHead = await this.headExists(gitRoot);

    let diffChanges: FileChange[] = [];
    if (hasHead) {
      // staged + unstaged changes vs HEAD
      const diffStdout = await this.runGit(
        ['diff', '--name-status', '-M', '-z', 'HEAD'],
        gitRoot,
      );
      diffChanges = this.parseDiffOutput(diffStdout);
    }

    // untracked files (not ignored)
    const untrackedStdout = await this.runGit(
      ['ls-files', '--others', '--exclude-standard', '-z'],
      gitRoot,
    );
    const untrackedChanges = this.parseUntrackedOutput(untrackedStdout);

    return [...diffChanges, ...untrackedChanges];
  }

  /**
   * Returns changes introduced by the current branch relative to `since`.
   * Uses three-dot merge-base semantics so only commits not in `since` are
   * included.
   */
  private async getChangesSince(
    gitRoot: string,
    since: string,
    until: string,
  ): Promise<FileChange[]> {
    // Verify merge-base is reachable (fails on shallow clones without full history)
    try {
      await this.runGit(['merge-base', '--is-ancestor', since, until], gitRoot);
    } catch {
      // merge-base failure — check if this is a shallow clone
      const isShallow = await this.isShallowRepository(gitRoot);
      if (isShallow) {
        throw new GitCommandError(
          'git',
          ['merge-base', since, until],
          `Repository is a shallow clone. The merge-base between "${since}" and "${until}" cannot be determined.\n` +
            'In GitHub Actions, add `fetch-depth: 0` to the checkout step. ' +
            'Locally, run `git fetch --unshallow`.',
          1,
        );
      }
      // Not shallow — just proceed; three-dot diff handles this gracefully
    }

    const stdout = await this.runGit(
      ['diff', '--name-status', '-M', '-z', `${since}...${until}`],
      gitRoot,
    );
    return this.parseDiffOutput(stdout);
  }

  // ---- Output parsers -----------------------------------------------------

  /**
   * Parses the NUL-delimited output of `git diff --name-status -M -z`.
   *
   * The `-z` flag makes git output fields separated by NUL bytes instead of
   * newlines. For most statuses the format is:
   *   `<status> NUL <path> NUL`
   * For renames and copies it is:
   *   `R<score> NUL <old-path> NUL <new-path> NUL`
   */
  private parseDiffOutput(raw: string): FileChange[] {
    if (!raw.trim()) return [];

    const changes: FileChange[] = [];
    // Split on NUL; filter empty trailing entries
    const tokens = raw.split('\0').filter((t, i, arr) => {
      // The last token after a trailing NUL is always empty — drop it
      return !(i === arr.length - 1 && t === '');
    });

    let i = 0;
    while (i < tokens.length) {
      const statusToken = tokens[i];
      if (!statusToken) { i++; continue; }

      const statusCode = statusToken[0] ?? '';
      i++;

      if (statusCode === 'R' || statusCode === 'C') {
        // rename / copy: next two tokens are old-path and new-path
        const oldPath = tokens[i] ?? '';
        const newPath = tokens[i + 1] ?? '';
        i += 2;
        changes.push({
          path: newPath,
          oldPath,
          status: statusCode === 'R' ? 'renamed' : 'copied',
        });
      } else {
        const filePath = tokens[i] ?? '';
        i++;
        const status = this.mapStatusCode(statusCode);
        if (status !== null) {
          changes.push({ path: filePath, status });
        }
      }
    }

    return changes;
  }

  /** Parses NUL-delimited output of `git ls-files --others -z`. */
  private parseUntrackedOutput(raw: string): FileChange[] {
    if (!raw.trim()) return [];
    return raw
      .split('\0')
      .filter(p => p.length > 0)
      .map(p => ({ path: p, status: 'added' as ChangeStatus }));
  }

  private mapStatusCode(code: string): ChangeStatus | null {
    switch (code) {
      case 'A': return 'added';
      case 'M': return 'modified';
      case 'D': return 'deleted';
      case 'T': return 'typechange';
      default:  return null;
    }
  }

  // ---- Path normalisation -------------------------------------------------

  /**
   * Converts absolute-or-git-root-relative paths to codebase-root-relative
   * paths. Paths that fall outside the codebase root are kept with their
   * original path so the analyser can mark them as `outside-codebase`.
   */
  private normaliseAndSort(changes: FileChange[], gitRoot: string): FileChange[] {
    // Resolve gitRoot and codebaseRoot to their real absolute paths
    // This is crucial on Windows where git might return short paths (e.g. MIRANT~1)
    let realGitRoot = path.resolve(gitRoot);
    let realCbRoot = path.resolve(this.codebaseRoot);
    try {
      realGitRoot = fs.realpathSync.native(realGitRoot);
    } catch { /* ignore */ }
    try {
      realCbRoot = fs.realpathSync.native(realCbRoot);
    } catch { /* ignore */ }

    const normalised = changes.map(change => {
      // Resolve path using path.resolve (Windows-aware) relative to realGitRoot
      const absolutePath = path.resolve(realGitRoot, change.path);
      const relativeToCb = path.relative(realCbRoot, absolutePath).replace(/\\/g, '/');

      const normalisedChange: FileChange = { ...change, path: relativeToCb };

      if (change.oldPath !== undefined) {
        const absOld = path.resolve(realGitRoot, change.oldPath);
        normalisedChange.oldPath = path.relative(realCbRoot, absOld).replace(/\\/g, '/');
      }

      return normalisedChange;
    });

    return normalised.sort((a, b) => a.path.localeCompare(b.path));
  }

  // ---- Validation ---------------------------------------------------------

  private validateOptions(options: ChangeSetOptions): void {
    const modes = [
      options.since !== undefined,
      options.staged === true,
      options.uncommitted === true,
    ].filter(Boolean).length;

    if (modes > 1) {
      throw new Error(
        'GitChangeSetProvider: options `since`, `staged`, and `uncommitted` are mutually exclusive. ' +
          'Provide at most one.',
      );
    }
  }

  /**
   * Validates a git ref string.
   * Rejects empty strings and strings beginning with `-` (which could be
   * interpreted as flags by git).
   * Uses `git rev-parse --verify --quiet <ref>^{commit}` to confirm the ref
   * resolves to a commit object in the repository.
   */
  private async validateRef(ref: string, gitRoot: string): Promise<void> {
    if (!ref || ref.startsWith('-')) {
      throw new InvalidGitRefError(ref);
    }
    try {
      await this.runGit(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], gitRoot);
    } catch {
      throw new InvalidGitRefError(ref);
    }
  }

  // ---- Git helpers --------------------------------------------------------

  /** Resolves the root of the Git repository containing `codebaseRoot`. */
  private async resolveGitRoot(): Promise<string> {
    try {
      const stdout = await this.runGit(
        ['rev-parse', '--show-toplevel'],
        this.codebaseRoot,
      );
      return stdout.trim();
    } catch {
      throw new NotAGitRepositoryError(this.codebaseRoot);
    }
  }

  /** Returns `true` when the repository is a shallow clone. */
  private async isShallowRepository(gitRoot: string): Promise<boolean> {
    try {
      const stdout = await this.runGit(
        ['rev-parse', '--is-shallow-repository'],
        gitRoot,
      );
      return stdout.trim() === 'true';
    } catch {
      return false;
    }
  }

  /** Returns `true` if HEAD resolves to a commit (repo has at least one commit). */
  private async headExists(gitRoot: string): Promise<boolean> {
    try {
      await this.runGit(['rev-parse', '--verify', 'HEAD'], gitRoot);
      return true;
    } catch {
      return false;
    }
  }

  /** Throws `GitNotAvailableError` if `git --version` fails. */
  private async ensureGitAvailable(): Promise<void> {
    try {
      await execFile('git', ['--version']);
    } catch {
      throw new GitNotAvailableError();
    }
  }

  /**
   * Runs a git command in the given working directory.
   * Always uses `execFile` with an args array — never `exec` with a string.
   *
   * @throws `GitCommandError` on non-zero exit.
   */
  private async runGit(args: string[], cwd: string): Promise<string> {
    try {
      const { stdout } = await execFile('git', args, { cwd, maxBuffer: 50 * 1024 * 1024 });
      return stdout;
    } catch (err: unknown) {
      const e = err as { stderr?: string; code?: number; message?: string };
      throw new GitCommandError(
        'git',
        args,
        e.stderr ?? e.message ?? '',
        typeof e.code === 'number' ? e.code : 1,
      );
    }
  }
}
