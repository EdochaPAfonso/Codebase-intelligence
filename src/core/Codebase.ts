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

export interface CodebaseOptions {
  ignore?: string[];
}

export class Codebase {
  private _files: CodebaseFile[] = [];
  private _projectInfo: ProjectInfo | null = null;
  private _fileIndex = new FileIndex();
  private _symbolIndex = new SymbolIndex();
  private _graph = new DependencyGraph();
  private _analyzed = false;

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

      try {
        const parsed = await parser.parse(file.path);
        this._symbolIndex.addAll(parsed.symbols);
        allDependencies.push(...parsed.dependencies);
      } catch {
        // Skip files that fail to parse (e.g., invalid syntax)
      }
    }

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
}
