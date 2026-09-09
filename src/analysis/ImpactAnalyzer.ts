import * as path from 'path';
import type { DependencyGraph } from '../graph/DependencyGraph.js';

export interface ImpactResult {
  direct: string[];
  indirect: string[];
  tests: string[];
}

/**
 * Analyzes the impact of changing a file.
 *
 * - `direct`: files that directly import/depend on the given file
 * - `indirect`: all transitive dependents minus the direct ones
 * - `tests`: discovered by convention only — files whose basename matches
 *   `<basename>.test.ts`, `<basename>.spec.ts`, `<basename>.test.js`, or
 *   `<basename>.spec.js` among the nodes in the graph.
 *   This uses NO relationship proof from the graph itself — it is purely
 *   name-based convention. If the convention is insufficient for a project,
 *   the list will be empty.
 */
export class ImpactAnalyzer {
  constructor(private graph: DependencyGraph) {}

  public impact(file: string): ImpactResult {
    const direct = this.graph.dependentsOf(file);
    const directSet = new Set(direct);

    const allTransitive = this.graph.allDependentsOf(file);
    const indirect = allTransitive.filter(dep => !directSet.has(dep));

    const tests = this.findRelatedTests(file);

    return { direct, indirect, tests };
  }

  private findRelatedTests(file: string): string[] {
    const basename = path.basename(file, path.extname(file));
    const testSuffixes = ['.test.ts', '.spec.ts', '.test.js', '.spec.js'];
    const candidateNames = testSuffixes.map(s => `${basename}${s}`);

    const testFiles: string[] = [];
    for (const node of this.graph.nodes()) {
      const nodeName = path.basename(node);
      if (candidateNames.includes(nodeName)) {
        testFiles.push(node);
      }
    }

    return testFiles;
  }
}
