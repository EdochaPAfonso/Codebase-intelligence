import * as path from 'path';
import type { IContextEngine } from './interfaces.js';
import type {
  LLMContextPayload,
  ContextNode,
  ContextOptions,
  ContextPayloadMetadata,
  ContextStrategy,
} from './types.js';
import type { DependencyGraph } from '../graph/DependencyGraph.js';
import type { SymbolIndex } from '../index/SymbolIndex.js';
import type { FileIndex } from '../index/FileIndex.js';
import type { CodebaseFile } from '../core/types.js';
import { ShallowStrategy } from './strategies/ShallowStrategy.js';
import { SignatureStrategy } from './strategies/SignatureStrategy.js';
import { DeepStrategy } from './strategies/DeepStrategy.js';
import type { ContextBuildStrategy } from './strategies/ContextBuildStrategy.js';
import { FileContextBuilder } from './FileContextBuilder.js';

const DEFAULT_STRATEGY: ContextStrategy = 'signature';
const DEFAULT_MAX_TOKENS = 8_000;

/**
 * Builds LLM-ready context payloads from an analysed `Codebase`.
 *
 * Consumers should obtain an instance via `codebase.context()` rather than
 * constructing one directly.
 *
 * @example
 * ```ts
 * const payload = await codebase.context().forFile('src/auth/AuthService.ts', {
 *   strategy: 'signature',
 *   maxTokens: 6000,
 * });
 * ```
 */
export class ContextEngine implements IContextEngine {
  private readonly strategies: Record<ContextStrategy, ContextBuildStrategy> = {
    shallow: new ShallowStrategy(),
    signature: new SignatureStrategy(),
    deep: new DeepStrategy(),
  };

  private readonly builder = new FileContextBuilder();

  constructor(
    private readonly graph: DependencyGraph,
    private readonly symbolIndex: SymbolIndex,
    private readonly fileIndex: FileIndex,
    private readonly codebaseRoot: string,
  ) {}

  // ---- Public API -------------------------------------------------------

  public async forFile(
    file: string,
    options: ContextOptions = {},
  ): Promise<LLMContextPayload> {
    const absolutePath = this.resolveFilePath(file);
    const codebaseFile = this.requireFile(absolutePath);
    return this.buildPayload(codebaseFile, options);
  }

  public async forSymbol(
    symbolName: string,
    options: ContextOptions = {},
  ): Promise<LLMContextPayload> {
    const symbol = this.symbolIndex.findSymbol(symbolName);
    if (!symbol) {
      throw new Error(
        `ContextEngine: symbol "${symbolName}" not found in the index. ` +
          `Make sure codebase.analyze() has been called.`,
      );
    }
    const codebaseFile = this.requireFile(symbol.file);
    return this.buildPayload(codebaseFile, options);
  }

  // ---- Core build logic -------------------------------------------------

  private async buildPayload(
    targetFile: CodebaseFile,
    options: ContextOptions,
  ): Promise<LLMContextPayload> {
    const strategy = options.strategy ?? DEFAULT_STRATEGY;
    const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;

    // 1. Gather metadata from the graph
    const directDeps = this.graph.dependenciesOf(targetFile.path);
    const directDependents = this.graph.dependentsOf(targetFile.path);
    const relatedTests = this.findRelatedTests(targetFile.path);

    const metadata: ContextPayloadMetadata = {
      directDependencies: directDeps,
      directDependents,
      relatedTests,
    };

    // 2. Resolve dependency CodebaseFile objects
    const dependencyFiles = directDeps
      .map(depPath => this.fileIndex.getByPath(depPath))
      .filter((f): f is CodebaseFile => f !== undefined);

    // 3. Delegate to the selected strategy
    const strategyImpl = this.strategies[strategy];
    const strategyNodes = await strategyImpl.buildNodes(
      targetFile,
      dependencyFiles,
      this.symbolIndex,
      this.codebaseRoot,
    );

    // 4. Optionally include dependents (always as shallow/full-file nodes)
    const dependentNodes: ContextNode[] = [];
    if (options.includeDependents) {
      for (const depPath of directDependents) {
        const depFile = this.fileIndex.getByPath(depPath);
        if (!depFile) continue;
        dependentNodes.push(await this.builder.buildFileNode(depFile, this.codebaseRoot));
      }
    }

    // 5. Optionally include related test files
    const testNodes: ContextNode[] = [];
    if (options.includeTests) {
      for (const testPath of relatedTests) {
        const testFile = this.fileIndex.getByPath(testPath);
        if (!testFile) continue;
        testNodes.push(await this.builder.buildFileNode(testFile, this.codebaseRoot));
      }
    }

    // 6. Assemble: strategy nodes first, then dependents, then tests.
    //    Respect the maxTokens budget by dropping lower-priority nodes from the end.
    const allNodes = [...strategyNodes, ...dependentNodes, ...testNodes];
    const nodes = this.applyTokenBudget(allNodes, maxTokens);
    const totalTokenEstimate = estimateTokens(nodes);

    return {
      target: targetFile.relativePath,
      strategy,
      nodes,
      totalTokenEstimate,
      metadata,
    };
  }

  // ---- Token budget enforcement -----------------------------------------

  /**
   * Drops nodes from the *end* of the list (lower priority) until the
   * total token estimate fits within the budget.
   *
   * The first node (the target) is NEVER dropped.
   */
  private applyTokenBudget(nodes: ContextNode[], maxTokens: number): ContextNode[] {
    if (nodes.length === 0) return nodes;

    // nodes[0] is guaranteed to exist — the length check above ensures it.
    const target = nodes[0] as ContextNode;
    const result: ContextNode[] = [target];
    let tokensSoFar = estimateTokens(result);

    for (let i = 1; i < nodes.length; i++) {
      const candidate = nodes[i] as ContextNode;
      const candidateTokens = estimateTokens([candidate]);
      if (tokensSoFar + candidateTokens <= maxTokens) {
        result.push(candidate);
        tokensSoFar += candidateTokens;
      }
      // Drop the node silently — the metadata still records it existed
    }

    return result;
  }

  // ---- Path resolution --------------------------------------------------

  /**
   * Resolves a file argument to an absolute path.
   * Accepts both absolute paths and paths relative to the codebase root.
   */
  private resolveFilePath(file: string): string {
    if (path.isAbsolute(file)) return file;
    return path.resolve(this.codebaseRoot, file);
  }

  /**
   * Returns the `CodebaseFile` for the given absolute path.
   * Throws a descriptive error if the file is not in the index.
   */
  private requireFile(absolutePath: string): CodebaseFile {
    const file =
      this.fileIndex.getByPath(absolutePath) ??
      this.fileIndex.getByRelativePath(path.relative(this.codebaseRoot, absolutePath));

    if (!file) {
      throw new Error(
        `ContextEngine: file "${absolutePath}" is not in the codebase index. ` +
          `Make sure codebase.analyze() has been called and the path is correct.`,
      );
    }

    return file;
  }

  // ---- Related tests ----------------------------------------------------

  /**
   * Finds test files related to `filePath` by naming convention only.
   * No graph proof is used — this mirrors the behaviour of `ImpactAnalyzer`.
   */
  private findRelatedTests(filePath: string): string[] {
    const basename = path.basename(filePath, path.extname(filePath));
    const testSuffixes = ['.test.ts', '.spec.ts', '.test.js', '.spec.js'];
    const candidates = new Set(testSuffixes.map(s => `${basename}${s}`));

    return this.graph.nodes().filter(node => candidates.has(path.basename(node)));
  }
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/**
 * Rough token estimate: `totalChars / 4`.
 * Avoids a hard dependency on a tokeniser library while being accurate enough
 * for budget planning (typical ratio for English/code text).
 */
function estimateTokens(nodes: ContextNode[]): number {
  const totalChars = nodes.reduce((sum, n) => sum + n.content.length, 0);
  return Math.ceil(totalChars / 4);
}
