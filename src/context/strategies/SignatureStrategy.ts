import type { ContextBuildStrategy } from './ContextBuildStrategy.js';
import type { ContextNode } from '../types.js';
import type { CodebaseFile } from '../../core/types.js';
import type { SymbolIndex } from '../../index/SymbolIndex.js';
import { FileContextBuilder, buildNodeId } from '../FileContextBuilder.js';
import { SignatureExtractor } from '../SignatureExtractor.js';

/**
 * `signature` strategy — target file as full content; dependencies as
 * AST-extracted signatures (no implementation bodies).
 *
 * This is the recommended default. It gives the LLM complete type information
 * (parameter types, return types, generics, modifiers) for every dependency
 * without including their implementation details. Typically 60–80 % fewer
 * tokens than `deep` for the same informational value.
 */
export class SignatureStrategy implements ContextBuildStrategy {
  private readonly builder = new FileContextBuilder();
  private readonly extractor = new SignatureExtractor();

  public async buildNodes(
    targetFile: CodebaseFile,
    dependencyFiles: CodebaseFile[],
    _symbolIndex: SymbolIndex,
    codebaseRoot: string,
  ): Promise<ContextNode[]> {
    const targetNode = await this.builder.buildFileNode(targetFile, codebaseRoot);

    const depNodes: ContextNode[] = [];
    for (const dep of dependencyFiles) {
      // Only TypeScript/JavaScript files can be processed by ts-morph.
      // JSON and other files fall back to the full-file node.
      if (dep.language === 'typescript' || dep.language === 'javascript') {
        const node = await this.buildAstSignatureNode(dep, codebaseRoot);
        depNodes.push(node);
      } else {
        depNodes.push(await this.builder.buildFileNode(dep, codebaseRoot));
      }
    }

    return [targetNode, ...depNodes];
  }

  // ---- Private helpers -----------------------------------------------------

  private async buildAstSignatureNode(
    file: CodebaseFile,
    codebaseRoot: string,
  ): Promise<ContextNode> {
    const relativePath = this.builder.resolveRelativePath(file, codebaseRoot);

    let signatureContent: string;
    try {
      signatureContent = this.extractor.extract(file.path);
    } catch {
      // If ts-morph fails (e.g. unsupported syntax), fall back to the full file.
      const fallback = await this.builder.buildFileNode(file, codebaseRoot);
      return fallback;
    }

    // Never produce an empty node — fall back to the full file.
    if (!signatureContent.trim()) {
      return this.builder.buildFileNode(file, codebaseRoot);
    }

    const totalLines = signatureContent.split('\n').length;

    return {
      id: buildNodeId(relativePath, 1, totalLines),
      file: file.path,
      relativePath,
      content: signatureContent,
      kind: 'signature',
      startLine: 1,
      endLine: totalLines,
    };
  }
}
