/**
 * Context Engine — Public Types
 *
 * Defines the data structures produced by the Context Engine. These types are
 * intentionally decoupled from any specific AI provider or LLM SDK.
 */

import type { SymbolKind } from '../core/types.js';

// ---------------------------------------------------------------------------
// Context Nodes
// ---------------------------------------------------------------------------

/**
 * The granularity of a single context node.
 *
 * - `file`      — the full content of a source file
 * - `class`     — a complete class declaration (body included)
 * - `function`  — a complete function/arrow-function declaration
 * - `symbol`    — any other named declaration (variable, type alias, etc.)
 * - `signature` — the declaration *without* its implementation body;
 *                 used by the `signature` strategy to save tokens while
 *                 still conveying type information
 */
export type ContextNodeKind = 'file' | 'class' | 'function' | 'symbol' | 'signature';

/**
 * A self-contained fragment of code with enough metadata for a LLM to reason
 * about its location, role, and relationships inside the codebase.
 */
export interface ContextNode {
  /** Unique identifier: `<relativePath>:<startLine>-<endLine>` */
  id: string;
  /** Absolute path to the source file. */
  file: string;
  /** Path relative to the codebase root (preferred for display). */
  relativePath: string;
  /** The raw source code of this fragment. */
  content: string;
  /** Granularity of this node. */
  kind: ContextNodeKind;
  /** 1-based start line in the source file. */
  startLine: number;
  /** 1-based end line in the source file. */
  endLine: number;
  /**
   * Name of the symbol this node represents (when kind ≠ 'file').
   * Matches the name stored in `SymbolIndex`.
   */
  symbolName?: string;
  /**
   * `SymbolKind` of the symbol this node represents.
   * Omitted when kind === 'file'.
   */
  symbolKind?: SymbolKind;
  /**
   * ID of the parent `ContextNode` when this node is a method or nested
   * member of a larger declaration (e.g. a method inside a class node).
   */
  parentId?: string;
}

// ---------------------------------------------------------------------------
// Context Strategies
// ---------------------------------------------------------------------------

/**
 * The three context-resolution strategies control the trade-off between
 * token usage and information richness.
 *
 * | Strategy    | Target file | Dependency content              | Tokens |
 * |-------------|-------------|---------------------------------|--------|
 * | `shallow`   | full        | none                            | low    |
 * | `signature` | full        | declaration only (no body, AST) | medium |
 * | `deep`      | full        | full source                     | high   |
 *
 * `signature` is the recommended default: it preserves all type information
 * (parameter types, return types, generics) without bloating the prompt with
 * implementation details the LLM does not need.
 */
export type ContextStrategy = 'shallow' | 'signature' | 'deep';

// ---------------------------------------------------------------------------
// Context Options
// ---------------------------------------------------------------------------

/**
 * Options accepted by `ContextEngine.forFile()` and `ContextEngine.forSymbol()`.
 */
export interface ContextOptions {
  /**
   * How dependency content is included in the payload.
   * @default 'signature'
   */
  strategy?: ContextStrategy;
  /**
   * Soft upper bound on the total token estimate of the payload.
   * When the estimate would exceed this value, lower-priority nodes
   * (transitive / indirect dependencies) are dropped first.
   * The target file itself is *never* truncated.
   * @default 8000
   */
  maxTokens?: number;
  /**
   * Whether to include related test files in the payload.
   * @default false
   */
  includeTests?: boolean;
  /**
   * Whether to include files that depend *on* the target (dependents) in
   * addition to the files the target depends *on* (dependencies).
   * Useful when the question is "will my change break callers?".
   * @default false
   */
  includeDependents?: boolean;
}

// ---------------------------------------------------------------------------
// LLM Context Payload
// ---------------------------------------------------------------------------

/**
 * The final structured object delivered to a LLM (or to the caller when
 * used programmatically).
 *
 * `nodes` is ordered: the target node is always first, followed by direct
 * dependencies, then indirect ones, then dependents (if requested).
 */
export interface LLMContextPayload {
  /** The file or symbol that was the focus of the context request. */
  target: string;
  /** The strategy used to build this payload. */
  strategy: ContextStrategy;
  /** Ordered list of code fragments to include in the LLM prompt. */
  nodes: ContextNode[];
  /**
   * Rough estimate of the total token count (`totalChars / 4`).
   * This avoids a hard dependency on tokeniser libraries while being
   * accurate enough for budget planning.
   */
  totalTokenEstimate: number;
  /** Relational metadata derived from the Dependency Graph. */
  metadata: ContextPayloadMetadata;
}

/**
 * Relational metadata attached to every `LLMContextPayload`.
 * Gives the LLM (or the caller) a high-level map of how the target
 * fits into the broader codebase without requiring it to read all nodes.
 */
export interface ContextPayloadMetadata {
  /** Files directly imported by the target. */
  directDependencies: string[];
  /** Files that directly import the target. */
  directDependents: string[];
  /** Test files related to the target (by naming convention). */
  relatedTests: string[];
}
