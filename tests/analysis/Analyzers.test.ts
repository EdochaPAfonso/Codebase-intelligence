import { describe, it, expect, beforeEach } from 'vitest';
import { DependencyGraph } from '../../src/graph/DependencyGraph.js';
import { DependencyAnalyzer } from '../../src/analysis/DependencyAnalyzer.js';
import { ImpactAnalyzer } from '../../src/analysis/ImpactAnalyzer.js';

describe('Analysis', () => {
  let graph: DependencyGraph;
  let dependencyAnalyzer: DependencyAnalyzer;
  let impactAnalyzer: ImpactAnalyzer;

  beforeEach(() => {
    graph = new DependencyGraph();
    dependencyAnalyzer = new DependencyAnalyzer(graph);
    impactAnalyzer = new ImpactAnalyzer(graph);

    // Scenario: A depends on B depends on C
    // A.ts -> B.ts -> C.ts
    graph.addEdge('A.ts', 'B.ts', 'import');
    graph.addEdge('B.ts', 'C.ts', 'import');
    
    // Test files scenario
    graph.addNode('C.test.ts'); // Test file for C.ts
  });

  describe('DependencyAnalyzer', () => {
    it('should return direct dependencies of a file', () => {
      const deps = dependencyAnalyzer.dependencies('A.ts');
      expect(deps).toEqual(['B.ts']);
    });

    it('should return direct dependents of a file', () => {
      const deps = dependencyAnalyzer.dependents('C.ts');
      expect(deps).toEqual(['B.ts']);
    });
  });

  describe('ImpactAnalyzer', () => {
    it('should correctly separate direct and indirect impact', () => {
      const result = impactAnalyzer.impact('C.ts');
      
      expect(result.direct).toEqual(['B.ts']);
      expect(result.indirect).toEqual(['A.ts']);
    });

    it('should find related test files by convention', () => {
      const result = impactAnalyzer.impact('C.ts');
      
      expect(result.tests).toContain('C.test.ts');
    });

    it('should return empty test list if no tests found', () => {
      const result = impactAnalyzer.impact('A.ts');
      
      expect(result.tests).toEqual([]);
    });
  });
});
