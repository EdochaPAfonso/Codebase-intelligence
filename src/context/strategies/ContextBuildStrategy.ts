import type { ContextNode } from '../types.js';
import type { CodebaseFile } from '../../core/types.js';
import type { SymbolIndex } from '../../index/SymbolIndex.js';
import { FileContextBuilder } from '../FileContextBuilder.js';

/**
 * Contract that each context-build strategy must fulfil.
 *
 * A strategy is responsible for converting a target file + its dependency
 * files into an ordered list of `ContextNode`s.  The `ContextEngine` owns
 * the budget enforcement and metadata collection; the strategy only decides
 * *how* each file is represented.
 */
export interface ContextBuildStrategy {
  /**
   * Builds the ordered list of `ContextNode`s for the payload.
   *
   * @param targetFile       - The file the user asked about (always first).
   * @param dependencyFiles  - Files directly imported by the target.
   * @param symbolIndex      - Symbol index for signature extraction.
   * @param codebaseRoot     - Absolute path used for `relativePath` normalisation.
   */
  buildNodes(
    targetFile: CodebaseFile,
    dependencyFiles: CodebaseFile[],
    symbolIndex: SymbolIndex,
    codebaseRoot: string,
  ): Promise<ContextNode[]>;
}

export { FileContextBuilder };
