import type { CodeDependency } from '../core/types.js';
import { DependencyGraph } from './DependencyGraph.js';

/**
 * Builds a DependencyGraph from a list of CodeDependency objects.
 * Unresolved dependencies are explicitly skipped as graph edges —
 * they are not valid file-to-file relationships.
 */
export class GraphBuilder {
  public build(dependencies: CodeDependency[]): DependencyGraph {
    const graph = new DependencyGraph();

    for (const dep of dependencies) {
      if (dep.type === 'unresolved') {
        // Register source node so it appears in the graph, but don't
        // create an edge to an unknown/invented target.
        graph.addNode(dep.source);
        continue;
      }

      graph.addEdge(dep.source, dep.target, dep.type);
    }

    return graph;
  }
}
