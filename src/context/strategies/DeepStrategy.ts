import type { ContextBuildStrategy } from './ContextBuildStrategy.js';
import type { ContextNode } from '../types.js';
import type { CodebaseFile } from '../../core/types.js';
import type { SymbolIndex } from '../../index/SymbolIndex.js';
import { FileContextBuilder } from '../FileContextBuilder.js';

/**
 * `deep` strategy — target file + all dependencies with full source content.
 *
 * Use when the LLM needs the complete implementation context, for example
 * when debugging subtle runtime behaviour or when generating code that must
 * match a specific implementation detail.
 *
 * Token usage is high; pair with a generous `maxTokens` budget.
 */
export class DeepStrategy implements ContextBuildStrategy {
  private readonly builder = new FileContextBuilder();

  public async buildNodes(
    targetFile: CodebaseFile,
    dependencyFiles: CodebaseFile[],
    _symbolIndex: SymbolIndex,
    codebaseRoot: string,
  ): Promise<ContextNode[]> {
    const targetNode = await this.builder.buildFileNode(targetFile, codebaseRoot);

    const depNodes = await Promise.all(
      dependencyFiles.map(dep => this.builder.buildFileNode(dep, codebaseRoot)),
    );

    return [targetNode, ...depNodes];
  }
}
