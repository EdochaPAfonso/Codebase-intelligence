/**
 * Diff Impact — Core Types
 *
 * Defines all public-facing types for the git-diff-based impact analysis
 * feature. No business logic lives here.
 */

// ---------------------------------------------------------------------------
// Change representation
// ---------------------------------------------------------------------------

/**
 * Git status codes mapped to a human-readable union.
 * Mirrors the single-letter codes from `git diff --name-status`.
 */
export type ChangeStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'typechange';

/**
 * A single file change as reported by a `ChangeSetProvider`.
 */
export interface FileChange {
  /** Current path, relative to the codebase root. */
  path: string;
  /**
   * Original path before a rename or copy.
   * Only present when `status` is `'renamed'` or `'copied'`.
   */
  oldPath?: string;
  status: ChangeStatus;
}

// ---------------------------------------------------------------------------
// Provider options
// ---------------------------------------------------------------------------

/**
 * Options controlling how a `ChangeSetProvider` collects file changes.
 *
 * **Mutual exclusivity**:
 * - `since` may be combined with `until` but not with `staged` or `uncommitted`.
 * - `staged` and `uncommitted` are mutually exclusive with each other.
 *
 * **Default (no options)**:
 * Returns uncommitted changes (staged + working tree vs HEAD), which is the
 * most useful default for a local development workflow.
 */
export interface ChangeSetOptions {
  /**
   * Base ref for a branch/PR comparison.
   * The provider will use `git diff <since>...<until>` (three-dot, merge-base
   * semantics) so only commits introduced by the branch are considered.
   */
  since?: string;
  /**
   * Head ref for the comparison.
   * @default 'HEAD'
   */
  until?: string;
  /**
   * When `true`, return only staged (index) changes (`git diff --cached`).
   */
  staged?: boolean;
  /**
   * When `true`, return all uncommitted changes — staged and unstaged — plus
   * untracked files. This is the equivalent of what a developer sees before
   * committing.
   */
  uncommitted?: boolean;
}

// ---------------------------------------------------------------------------
// Provider contract
// ---------------------------------------------------------------------------

/**
 * Contract for any source of file changes.
 *
 * The core library ships `GitChangeSetProvider` as the default implementation.
 * Alternative implementations (e.g. a GitHub PR API client, a Mercurial
 * adapter, or a test stub) can be injected via `codebase.impactOfChanges()`.
 */
export interface ChangeSetProvider {
  /**
   * Returns the list of changed files according to the provider's source.
   * The returned list is ordered by `path` (deterministic).
   */
  getChanges(options?: ChangeSetOptions): Promise<FileChange[]>;
}

// ---------------------------------------------------------------------------
// Reason a file cannot be fully analysed
// ---------------------------------------------------------------------------

/**
 * Explains why a changed file could not be traced through the dependency graph.
 *
 * The analyser is honest: it never invents relationships it cannot prove.
 * Files that cannot be analysed are reported explicitly here instead of being
 * silently omitted.
 */
export type UnanalyzableReason =
  /** The file path is outside the codebase root that was loaded. */
  | 'outside-codebase'
  /** The file extension has no registered parser (e.g. `.md`, `.css`). */
  | 'unsupported-language'
  /**
   * The file exists on disk but was not indexed (e.g. it was added after
   * `codebase.analyze()` was called, or it is excluded by ignore rules).
   */
  | 'not-in-index'
  /**
   * The file was deleted and the graph cannot prove which files depended on
   * it (no recorded `unresolved` edges matching the old path).
   */
  | 'deleted-unprovable';

// ---------------------------------------------------------------------------
// Impact result
// ---------------------------------------------------------------------------

/**
 * The complete result of a change-set impact analysis.
 *
 * **Important — granularity**: the result operates at file granularity, not
 * symbol granularity. A single line change in a file marks *all* dependents
 * of that file as potentially affected. The result is therefore a
 * **conservative upper bound**, not a minimal set.
 */
export interface ChangeSetImpact {
  /** The raw list of file changes as provided by the `ChangeSetProvider`. */
  changed: FileChange[];

  /**
   * Files that directly import/depend on at least one changed file.
   * The changed files themselves are excluded from this list.
   *
   * If a file is both a direct dependent of one change and an indirect
   * dependent of another, it is classified as **direct** (highest priority).
   */
  direct: string[];

  /**
   * All transitive dependents, minus the files already in `direct`.
   * Ordered alphabetically.
   */
  indirect: string[];

  /**
   * Test files related to any changed or dependent file, discovered by
   * naming convention (e.g. `AuthService.test.ts`). Union across all changes.
   * Ordered alphabetically.
   */
  tests: string[];

  /**
   * Configuration and infrastructure files that are outside the import graph
   * but whose modification can affect the entire codebase.
   *
   * Examples: `package.json`, `tsconfig.json`, `vite.config.*`, lockfiles.
   * These are reported separately because the graph cannot model their impact.
   */
  globalChanges: string[];

  /**
   * Files that could not be fully traced through the dependency graph,
   * along with the reason why.
   */
  unanalyzable: { path: string; reason: UnanalyzableReason }[];

  /**
   * Specifiers that appear as `unresolved` edges in the dependency graph
   * (i.e. imports whose absolute path the parser could not determine).
   * Reported for transparency; not treated as errors.
   */
  unresolvedDependencies: string[];

  metadata: {
    /**
     * The analyser operates at file granularity.
     * Every dependent of every changed file is considered potentially affected.
     */
    granularity: 'file';
    /** The base ref used for the comparison, if any. */
    base?: string;
    /** The head ref used for the comparison, if any. */
    head?: string;
  };
}
