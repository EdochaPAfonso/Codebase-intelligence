import * as fs from 'fs/promises';
import * as path from 'path';
import type { ContextNode } from './types.js';
import type { CodebaseFile, CodeSymbol } from '../core/types.js';

/**
 * Reads a source file from disk and constructs a `ContextNode` of kind `'file'`
 * that represents the full content of that file.
 *
 * This is the low-level primitive used by strategies. Strategies decide *which*
 * files to pass here and how to compose the resulting nodes into a payload.
 */
export class FileContextBuilder {
  /**
   * Builds a single `ContextNode` for a whole file.
   *
   * @param file     - The `CodebaseFile` descriptor (path, relativePath, etc.).
   * @param codebaseRoot - Absolute path to the codebase root, used to compute
   *                       `relativePath` as a fallback when `file.relativePath`
   *                       is an absolute path.
   */
  public async buildFileNode(
    file: CodebaseFile,
    codebaseRoot: string,
  ): Promise<ContextNode> {
    const content = await this.readFile(file.path);
    const lines = content.split('\n');
    const totalLines = lines.length;

    const relativePath = this.normaliseRelativePath(file.relativePath, file.path, codebaseRoot);

    return {
      id: buildNodeId(relativePath, 1, totalLines),
      file: file.path,
      relativePath,
      content,
      kind: 'file',
      startLine: 1,
      endLine: totalLines,
    };
  }

  /**
   * Builds a `ContextNode` of kind `'signature'` for a given file.
   *
   * A signature node contains only the lines that correspond to top-level
   * symbol declarations (class, function, interface, etc.) as extracted by
   * the `SymbolIndex`. This gives the LLM full type information without the
   * implementation body.
   *
   * When no symbols are found for the file, falls back to returning a full
   * file node so the payload is never empty.
   *
   * @param file     - The `CodebaseFile` descriptor.
   * @param symbols  - Symbols extracted for this file by the `SymbolIndex`.
   * @param codebaseRoot - Absolute codebase root for relativePath computation.
   */
  public async buildSignatureNode(
    file: CodebaseFile,
    symbols: CodeSymbol[],
    codebaseRoot: string,
  ): Promise<ContextNode> {
    const content = await this.readFile(file.path);
    const lines = content.split('\n');
    const relativePath = this.normaliseRelativePath(file.relativePath, file.path, codebaseRoot);

    if (symbols.length === 0) {
      // No symbols — fall back to the full file node
      return this.buildFileNode(file, codebaseRoot);
    }

    // Collect only the declaration lines (startLine) of top-level symbols.
    // Children (methods inside a class) are intentionally excluded because
    // the class signature line already signals the class's existence.
    const topLevelSymbols = symbols.filter(s => s.parentId === undefined);
    const declarationLineNumbers = new Set(topLevelSymbols.map(s => s.startLine));

    const signatureLines = lines
      .map((line, i) => ({ line, lineNumber: i + 1 })) // 1-based
      .filter(({ lineNumber }) => declarationLineNumbers.has(lineNumber))
      .map(({ line }) => line);

    // Always include import lines — they communicate the dependency surface.
    const importLines = lines.filter(l => l.trimStart().startsWith('import '));

    // Deduplicate (import lines may already be declaration lines for re-exports)
    const signatureContent = [
      ...importLines,
      ...(importLines.length > 0 ? [''] : []), // blank separator
      ...signatureLines,
    ]
      .join('\n')
      .trim();

    return {
      id: buildNodeId(relativePath, 1, lines.length),
      file: file.path,
      relativePath,
      content: signatureContent || content, // never return empty content
      kind: 'signature',
      startLine: 1,
      endLine: lines.length,
    };
  }

  // ---- Public helpers -----------------------------------------------------

  /**
   * Returns a normalised relative path for `file`, computing it from the
   * absolute path when `file.relativePath` is itself absolute (can happen
   * with older index builds).
   */
  public resolveRelativePath(file: CodebaseFile, codebaseRoot: string): string {
    return this.normaliseRelativePath(file.relativePath, file.path, codebaseRoot);
  }

  // ---- Private helpers ----------------------------------------------------

  private async readFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (err) {
      // Surface a clear error rather than a generic ENOENT stack trace.
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`ContextEngine: could not read file "${filePath}": ${message}`);
    }
  }

  private normaliseRelativePath(
    relativePath: string,
    absolutePath: string,
    codebaseRoot: string,
  ): string {
    // If the stored relativePath happens to be an absolute path (older index
    // versions), compute it from scratch.
    if (path.isAbsolute(relativePath)) {
      return path.relative(codebaseRoot, absolutePath);
    }
    return relativePath;
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Builds a stable, unique node ID in the format `relativePath:start-end`.
 */
export function buildNodeId(relativePath: string, start: number, end: number): string {
  return `${relativePath}:${start}-${end}`;
}
