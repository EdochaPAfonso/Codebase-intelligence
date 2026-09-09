export interface GraphEdge {
  source: string;
  target: string;
  type?: string;
}

/**
 * Directed dependency graph that works with generic string IDs.
 * - dependenciesOf(id): direct outgoing edges (what `id` depends on)
 * - dependentsOf(id): direct incoming edges (what depends on `id`)
 * - For indirect traversal, use traverseBFS / collectReachable.
 */
export class DependencyGraph {
  /** outgoing: node → nodes it depends on */
  private outgoing = new Map<string, Set<string>>();
  /** incoming: node → nodes that depend on it */
  private incoming = new Map<string, Set<string>>();
  /** edge metadata indexed by `source→target` */
  private edges = new Map<string, GraphEdge>();

  // ---- Node operations ------------------------------------------------

  public addNode(id: string): void {
    if (!this.outgoing.has(id)) this.outgoing.set(id, new Set());
    if (!this.incoming.has(id)) this.incoming.set(id, new Set());
  }

  public removeNode(id: string): void {
    // Remove all outgoing edges first
    for (const target of this.outgoing.get(id) ?? []) {
      this.incoming.get(target)?.delete(id);
      this.edges.delete(`${id}→${target}`);
    }
    // Remove all incoming edges
    for (const source of this.incoming.get(id) ?? []) {
      this.outgoing.get(source)?.delete(id);
      this.edges.delete(`${source}→${id}`);
    }
    this.outgoing.delete(id);
    this.incoming.delete(id);
  }

  public hasNode(id: string): boolean {
    return this.outgoing.has(id);
  }

  public nodes(): string[] {
    return Array.from(this.outgoing.keys());
  }

  // ---- Edge operations ------------------------------------------------

  public addEdge(source: string, target: string, type?: string): void {
    this.addNode(source);
    this.addNode(target);
    this.outgoing.get(source)!.add(target);
    this.incoming.get(target)!.add(source);
    const edge: GraphEdge = { source, target };
    if (type) edge.type = type;
    this.edges.set(`${source}→${target}`, edge);
  }

  public removeEdge(source: string, target: string): void {
    this.outgoing.get(source)?.delete(target);
    this.incoming.get(target)?.delete(source);
    this.edges.delete(`${source}→${target}`);
  }

  public getEdge(source: string, target: string): GraphEdge | undefined {
    return this.edges.get(`${source}→${target}`);
  }

  // ---- Query ----------------------------------------------------------

  /** Direct dependencies of `id` (what `id` imports/extends/implements). */
  public dependenciesOf(id: string): string[] {
    return Array.from(this.outgoing.get(id) ?? []);
  }

  /** Direct dependents of `id` (files that import `id`). */
  public dependentsOf(id: string): string[] {
    return Array.from(this.incoming.get(id) ?? []);
  }

  /** All direct neighbours: both dependencies and dependents. */
  public neighbors(id: string): string[] {
    const deps = this.outgoing.get(id) ?? new Set();
    const revDeps = this.incoming.get(id) ?? new Set();
    return Array.from(new Set([...deps, ...revDeps]));
  }

  // ---- Traversal ------------------------------------------------------

  /**
   * BFS starting from `startId` following `direction`:
   * - 'outgoing': traverse dependencies (what startId depends on)
   * - 'incoming': traverse dependents (who depends on startId)
   * Returns all reachable IDs, excluding the start node itself.
   */
  public traverseBFS(startId: string, direction: 'outgoing' | 'incoming'): string[] {
    const visited = new Set<string>();
    const queue: string[] = [startId];
    visited.add(startId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const adjacents =
        direction === 'outgoing'
          ? this.outgoing.get(current) ?? new Set()
          : this.incoming.get(current) ?? new Set();

      for (const adj of adjacents) {
        if (!visited.has(adj)) {
          visited.add(adj);
          queue.push(adj);
        }
      }
    }

    visited.delete(startId);
    return Array.from(visited);
  }

  /**
   * All transitive dependencies (files that `id` depends on, directly or indirectly).
   */
  public allDependenciesOf(id: string): string[] {
    return this.traverseBFS(id, 'outgoing');
  }

  /**
   * All transitive dependents (files that depend on `id`, directly or indirectly).
   */
  public allDependentsOf(id: string): string[] {
    return this.traverseBFS(id, 'incoming');
  }
}
