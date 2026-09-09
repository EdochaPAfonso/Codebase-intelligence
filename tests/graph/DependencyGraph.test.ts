import { describe, it, expect, beforeEach } from 'vitest';
import { DependencyGraph } from '../../src/graph/DependencyGraph.js';
import { GraphBuilder } from '../../src/graph/GraphBuilder.js';
import type { CodeDependency } from '../../src/core/types.js';

describe('DependencyGraph', () => {
  let graph: DependencyGraph;

  beforeEach(() => {
    graph = new DependencyGraph();
  });

  it('should add and detect nodes', () => {
    graph.addNode('A');
    expect(graph.hasNode('A')).toBe(true);
    expect(graph.hasNode('B')).toBe(false);
  });

  it('should add edges and implicitly create nodes', () => {
    graph.addEdge('A', 'B', 'import');
    expect(graph.hasNode('A')).toBe(true);
    expect(graph.hasNode('B')).toBe(true);
    expect(graph.dependenciesOf('A')).toEqual(['B']);
    expect(graph.dependentsOf('B')).toEqual(['A']);
  });

  it('should report direct dependencies and dependents', () => {
    graph.addEdge('AuthController', 'AuthService', 'import');
    graph.addEdge('AuthController', 'JwtService', 'import');
    graph.addEdge('AuthGuard', 'AuthService', 'import');

    expect(graph.dependenciesOf('AuthController')).toEqual(
      expect.arrayContaining(['AuthService', 'JwtService'])
    );
    expect(graph.dependentsOf('AuthService')).toEqual(
      expect.arrayContaining(['AuthController', 'AuthGuard'])
    );
  });

  it('should remove a node and all its edges', () => {
    graph.addEdge('A', 'B', 'import');
    graph.addEdge('B', 'C', 'import');
    graph.removeNode('B');

    expect(graph.hasNode('B')).toBe(false);
    expect(graph.dependenciesOf('A')).toEqual([]);
    expect(graph.dependentsOf('C')).toEqual([]);
  });

  it('should remove a specific edge', () => {
    graph.addEdge('A', 'B', 'import');
    graph.addEdge('A', 'C', 'import');
    graph.removeEdge('A', 'B');

    expect(graph.dependenciesOf('A')).toEqual(['C']);
    expect(graph.dependentsOf('B')).toEqual([]);
  });

  it('should return neighbors (both directions)', () => {
    graph.addEdge('A', 'B', 'import');
    graph.addEdge('C', 'A', 'import');
    const n = graph.neighbors('A');
    expect(n).toEqual(expect.arrayContaining(['B', 'C']));
  });

  it('should traverse BFS outgoing (transitive dependencies)', () => {
    // A → B → C → D
    graph.addEdge('A', 'B', 'import');
    graph.addEdge('B', 'C', 'import');
    graph.addEdge('C', 'D', 'import');

    const all = graph.allDependenciesOf('A');
    expect(all).toEqual(expect.arrayContaining(['B', 'C', 'D']));
    expect(all).not.toContain('A');
  });

  it('should traverse BFS incoming (transitive dependents)', () => {
    // A → B → C → D (C is used indirectly by A)
    graph.addEdge('A', 'B', 'import');
    graph.addEdge('B', 'C', 'import');
    graph.addEdge('C', 'D', 'import');

    // D is depended upon by C, B, and A transitively
    const all = graph.allDependentsOf('D');
    expect(all).toEqual(expect.arrayContaining(['C', 'B', 'A']));
    expect(all).not.toContain('D');
  });

  it('should handle BFS with cycles without infinite loop', () => {
    graph.addEdge('A', 'B', 'import');
    graph.addEdge('B', 'C', 'import');
    graph.addEdge('C', 'A', 'import'); // cycle

    const all = graph.allDependenciesOf('A');
    expect(all).toEqual(expect.arrayContaining(['B', 'C']));
    expect(all).not.toContain('A');
  });

  it('should store edge metadata (type)', () => {
    graph.addEdge('UserService', 'IUser', 'implements');
    const edge = graph.getEdge('UserService', 'IUser');
    expect(edge).toBeDefined();
    expect(edge?.type).toBe('implements');
  });
});

describe('GraphBuilder', () => {
  it('should build graph from CodeDependency list', () => {
    const deps: CodeDependency[] = [
      { source: 'A', target: 'B', type: 'import' },
      { source: 'B', target: 'C', type: 'import' },
    ];

    const graph = new GraphBuilder().build(deps);
    expect(graph.dependenciesOf('A')).toEqual(['B']);
    expect(graph.dependenciesOf('B')).toEqual(['C']);
  });

  it('should skip unresolved dependencies as edges but still register source node', () => {
    const deps: CodeDependency[] = [
      { source: 'A', target: 'some-npm-package', type: 'unresolved' },
      { source: 'A', target: 'B', type: 'import' },
    ];

    const graph = new GraphBuilder().build(deps);
    expect(graph.hasNode('A')).toBe(true);
    expect(graph.hasNode('some-npm-package')).toBe(false);
    expect(graph.dependenciesOf('A')).toEqual(['B']); // only the resolved one
  });
});
