import type { ContextBuildStrategy } from './ContextBuildStrategy.js';
import type { ContextNode } from '../types.js';
import type { CodebaseFile } from '../../core/types.js';
import type { SymbolIndex } from '../../index/SymbolIndex.js';
import { FileContextBuilder } from '../FileContextBuilder.js';

/**
 * `shallow` strategy — target file only, full content, no dependencies.
 *
 * Use when you want the minimum possible context. Ideal for large files
 * where the LLM should focus exclusively on the file itself.
 */
export class ShallowStrategy implements ContextBuildStrategy {
  private readonly builder = new FileContextBuilder();

  public async buildNodes(
    targetFile: CodebaseFile,
    _dependencyFiles: CodebaseFile[],
    _symbolIndex: SymbolIndex,
    codebaseRoot: string,
  ): Promise<ContextNode[]> {
    const targetNode = await this.builder.buildFileNode(targetFile, codebaseRoot);
    return [targetNode];
  }
}
