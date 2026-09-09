import type { DependencyGraph } from '../graph/DependencyGraph.js';

export class DependencyAnalyzer {
  constructor(private graph: DependencyGraph) {}

  public dependencies(file: string): string[] {
    return this.graph.dependenciesOf(file);
  }

  public dependents(file: string): string[] {
    return this.graph.dependentsOf(file);
  }
}
