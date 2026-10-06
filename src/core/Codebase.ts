import * as path from 'path';
import { FileScanner } from '../discovery/FileScanner.js';
import { ProjectDetector } from '../discovery/ProjectDetector.js';
import { TypeScriptParser } from '../parsers/typescript/TypeScriptParser.js';
import { ParserRegistry } from '../parsers/ParserRegistry.js';
import { FileIndex } from '../index/FileIndex.js';
import { SymbolIndex } from '../index/SymbolIndex.js';
import { DependencyGraph } from '../graph/DependencyGraph.js';
import { GraphBuilder } from '../graph/GraphBuilder.js';
import type { CodebaseFile, CodeSymbol, CodeDependency } from './types.js';
import type { ProjectInfo } from '../discovery/ProjectDetector.js';
import { CodeSearch } from '../search/CodeSearch.js';
import type { SearchResult, SearchOptions } from '../search/CodeSearch.js';
import { DependencyAnalyzer } from '../analysis/DependencyAnalyzer.js';
import { ImpactAnalyzer } from '../analysis/ImpactAnalyzer.js';
import type { ImpactResult } from '../analysis/ImpactAnalyzer.js';
import { AnalysisCache } from './AnalysisCache.js';
import { ContextEngine } from '../context/ContextEngine.js';
import { SemanticChunker } from '../context/SemanticChunker.js';
import type { SemanticChunk, ChunkerOptions } from '../context/SemanticChunker.js';
import { CodebaseWithAI } from '../ai/CodebaseWithAI.js';
import type { AIProvider } from '../context/interfaces.js';

export interface CodebaseOptions {
  ignore?: string[];
  /** Enable on-disk caching of parse results. Defaults to true. */
  cache?: boolean;
}

export class Codebase {
  private _files: CodebaseFile[] = [];
  private _projectInfo: ProjectInfo | null = null;
  private _fileIndex = new FileIndex();
  private _symbolIndex = new SymbolIndex();
  private _graph = new DependencyGraph();
  private _analyzed = false;
  private _cache: AnalysisCache | null = null;

  private readonly cwd: string;
  private readonly options: CodebaseOptions;

  private constructor(cwd: string, options: CodebaseOptions) {
    this.cwd = path.resolve(cwd);
    this.options = options;
  }

  // ---- Factory --------------------------------------------------------

  public static async load(cwd: string, options: CodebaseOptions = {}): Promise<Codebase> {
    const instance = new Codebase(cwd, options);

    const scannerOptions = options.ignore
      ? { cwd: instance.cwd, extraIgnores: options.ignore }
      : { cwd: instance.cwd };
    const scanner = new FileScanner(scannerOptions);
    instance._files = await scanner.scan();

    const detector = new ProjectDetector(instance.cwd, instance._files);
    instance._projectInfo = await detector.detect();

    instance._fileIndex.addAll(instance._files);

    // Initialise cache unless explicitly disabled
    const useCache = options.cache !== false;
    if (useCache) {
      instance._cache = new AnalysisCache(instance.cwd);
    }

    return instance;
  }

  // ---- Analysis -------------------------------------------------------

  public async analyze(): Promise<void> {
    const registry = new ParserRegistry();
    registry.register(new TypeScriptParser());

    const allDependencies: CodeDependency[] = [];

    for (const file of this._files) {
      const parser = registry.getParser(file.language);
      if (!parser) continue;

      // Cache hit?
      const cached = this._cache?.get(file.path) ?? null;
      if (cached) {
        this._symbolIndex.addAll(cached.symbols);
        allDependencies.push(...cached.dependencies);
        continue;
      }

      // Cache miss — parse and store result
      try {
        const parsed = await parser.parse(file.path);
        this._symbolIndex.addAll(parsed.symbols);
        allDependencies.push(...parsed.dependencies);

        this._cache?.set(file.path, {
          symbols: parsed.symbols,
          dependencies: parsed.dependencies
        });
      } catch {
        // Skip files that fail to parse (e.g., invalid syntax)
      }
    }

    // Prune deleted/renamed files from the cache
    this._cache?.prune(new Set(this._files.map(f => f.path)));

    // Persist updated cache entries to disk
    await this._cache?.flush();

    const builder = new GraphBuilder();
    this._graph = builder.build(allDependencies);

    this._analyzed = true;
  }

  // ---- Public API -----------------------------------------------------

  public files(): CodebaseFile[] {
    return this._fileIndex.all();
  }

  public symbols(): CodeSymbol[] {
    return this._symbolIndex.findSymbols({});
  }

  public projectInfo(): ProjectInfo | null {
    return this._projectInfo;
  }

  public graph(): DependencyGraph {
    return this._graph;
  }

  public search(query: string, options: SearchOptions = {}): SearchResult[] {
    const searcher = new CodeSearch(this.files(), this.symbols());
    return searcher.search(query, options);
  }

  public dependencies(file: string): string[] {
    return new DependencyAnalyzer(this._graph).dependencies(file);
  }

  public dependents(file: string): string[] {
    return new DependencyAnalyzer(this._graph).dependents(file);
  }

  public impact(file: string): ImpactResult {
    return new ImpactAnalyzer(this._graph).impact(file);
  }

  public isAnalyzed(): boolean {
    return this._analyzed;
  }

  /**
   * Returns a `ContextEngine` pre-configured with this codebase's graph,
   * symbol index, and file index.
   *
   * Use the returned engine to build LLM-ready context payloads:
   * ```ts
   * const payload = await codebase.context().forFile('src/auth/AuthService.ts');
   * ```
   *
   * @throws if called before `analyze()`.
   */
  public context(): ContextEngine {
    if (!this._analyzed) {
      throw new Error(
        'Codebase.context() requires the codebase to be analysed first. ' +
          'Call await codebase.analyze() before calling context().',
      );
    }
    return new ContextEngine(
      this._graph,
      this._symbolIndex,
      this._fileIndex,
      this.cwd,
    );
  }

  /**
   * Returns a `CodebaseWithAI` instance that pairs this codebase with the
   * given AI provider, exposing the `explain` and `ask` high-level APIs.
   *
   * ```ts
   * const answer = await codebase
   *   .withAI(new OpenAIProvider())
   *   .ask('Como funciona a autenticação?');
   * ```
   *
   * @throws if called before `analyze()`.
   */
  public withAI(provider: AIProvider): CodebaseWithAI {
    if (!this._analyzed) {
      throw new Error(
        'Codebase.withAI() requires the codebase to be analysed first. ' +
          'Call await codebase.analyze() before calling withAI().',
      );
    }
    return new CodebaseWithAI(this, provider);
  }

  /**
   * Dividir ficheiros em chunks semânticos (baseados em AST, não em caracteres).
   * 
   * @throws se chamado antes de `analyze()`.
   */
  public async chunks(options?: ChunkerOptions): Promise<SemanticChunk[]> {
    if (!this._analyzed) {
      throw new Error(
        'Codebase.chunks() requires the codebase to be analysed first. ' +
          'Call await codebase.analyze() before calling chunks().',
      );
    }
    const chunker = new SemanticChunker();
    return chunker.chunk(this._files, options);
  }

  /**
   * Deletes the on-disk cache for this codebase.
   * Subsequent calls to analyze() will re-parse all files.
   */
  public invalidateCache(): void {
    this._cache?.invalidate();
    this._cache = null;
  }
}
