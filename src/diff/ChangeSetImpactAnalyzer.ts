import * as path from 'node:path';
import type { DependencyGraph } from '../graph/DependencyGraph.js';
import type { FileIndex } from '../index/FileIndex.js';
import { ImpactAnalyzer } from '../analysis/ImpactAnalyzer.js';
import type {
  ChangeSetImpact,
  FileChange,
  UnanalyzableReason,
} from './types.js';

export class ChangeSetImpactAnalyzer {
  private readonly impactAnalyzer: ImpactAnalyzer;

  // Configuration and infrastructure files that can affect the whole codebase
  private readonly globalPatterns = [
    /^package\.json$/,
    /^tsconfig.*\.json$/,
    /^vite\.config\..*$/,
    /^nest-cli\.json$/,
    /^next\.config\..*$/,
    /.*lock.*/,
    /^\.env.*/,
  ];

  // Language extensions supported by the parsers
  private readonly supportedExtensions = new Set([
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.json',
  ]);

  constructor(
    private readonly graph: DependencyGraph,
    private readonly fileIndex: FileIndex,
    private readonly codebaseRoot: string,
  ) {
    this.impactAnalyzer = new ImpactAnalyzer(this.graph);
  }

  /**
   * Analyzes a list of file changes and correlates them with the dependency
   * graph to produce a consolidated impact result.
   */
  public analyze(changes: FileChange[]): Omit<ChangeSetImpact, 'metadata' | 'changed'> {
    const directSet = new Set<string>();
    const indirectSet = new Set<string>();
    const testsSet = new Set<string>();
    const globalChanges = new Set<string>();
    const unanalyzable: { path: string; reason: UnanalyzableReason }[] = [];
    const unresolvedDependencies = new Set<string>();

    const changedPaths = new Set(changes.map(c => c.path));

    for (const change of changes) {
      // 1. Outside codebase?
      if (change.path.startsWith('../') || change.path.startsWith('..\\')) {
        unanalyzable.push({ path: change.path, reason: 'outside-codebase' });
        continue;
      }

      // 2. Global change?
      const basename = path.basename(change.path);
      if (this.globalPatterns.some(p => p.test(basename))) {
        globalChanges.add(change.path);
      }

      const absPath = path.resolve(this.codebaseRoot, change.path).replace(/\\/g, '/');
      const inIndex = this.fileIndex.getByPath(absPath) !== undefined;
      const isSupported = this.supportedExtensions.has(path.extname(change.path));

      // 3. Deleted file
      if (change.status === 'deleted') {
        // If it's deleted and not in the index, we can't prove who depended on it
        // unless there are explicit unresolved edges (not currently modeled backwards well)
        if (!inIndex) {
          unanalyzable.push({ path: change.path, reason: 'deleted-unprovable' });
          continue;
        }
      }

      // 4. Added / Modified / Renamed file not in index
      if (!inIndex && change.status !== 'deleted') {
        if (!isSupported) {
          unanalyzable.push({ path: change.path, reason: 'unsupported-language' });
        } else {
          unanalyzable.push({ path: change.path, reason: 'not-in-index' });
        }
        continue;
      }

      // 5. Impact analysis
      const impact = this.impactAnalyzer.impact(absPath);
      for (const d of impact.direct) directSet.add(d);
      for (const i of impact.indirect) indirectSet.add(i);
      for (const t of impact.tests) testsSet.add(t);

      // Collect unresolved dependencies originating from the changed file
      if (this.graph.hasNode(absPath)) {
        for (const depTarget of this.graph.dependenciesOf(absPath)) {
          const edge = this.graph.getEdge(absPath, depTarget);
          if (edge && edge.type === 'unresolved') {
            unresolvedDependencies.add(depTarget);
          }
        }
      }
    }

    // Process sets (priority: direct > indirect)
    for (const d of directSet) {
      if (changedPaths.has(this.toRel(d))) {
        directSet.delete(d);
      }
    }

    for (const i of indirectSet) {
      if (directSet.has(i) || changedPaths.has(this.toRel(i))) {
        indirectSet.delete(i);
      }
    }

    return {
      direct: Array.from(directSet).map(p => this.toRel(p)).sort(),
      indirect: Array.from(indirectSet).map(p => this.toRel(p)).sort(),
      tests: Array.from(testsSet).map(p => this.toRel(p)).sort(),
      globalChanges: Array.from(globalChanges).sort(),
      unanalyzable: unanalyzable.sort((a, b) => a.path.localeCompare(b.path)),
      unresolvedDependencies: Array.from(unresolvedDependencies).sort(),
    };
  }

  private toRel(absPath: string): string {
    return path.relative(this.codebaseRoot, absPath).replace(/\\/g, '/');
  }
}
