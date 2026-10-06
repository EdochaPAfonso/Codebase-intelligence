import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'node:path';
import { DependencyGraph } from '../../src/graph/DependencyGraph.js';
import { FileIndex } from '../../src/index/FileIndex.js';
import { ChangeSetImpactAnalyzer } from '../../src/diff/ChangeSetImpactAnalyzer.js';
import type { FileChange } from '../../src/diff/types.js';
import type { CodebaseFile } from '../../src/core/types.js';

describe('ChangeSetImpactAnalyzer — DI-3', () => {
  let graph: DependencyGraph;
  let fileIndex: FileIndex;
  let analyzer: ChangeSetImpactAnalyzer;

  const cbRoot = path.resolve(process.cwd(), 'mock/codebase').replace(/\\/g, '/');

  function addMockFile(relPath: string) {
    const absPath = path.resolve(cbRoot, relPath).replace(/\\/g, '/');
    const file: CodebaseFile = {
      path: absPath,
      relativePath: relPath,
      language: 'typescript',
      size: 100,
    };
    fileIndex.add(file);
    graph.addNode(absPath);
    return absPath;
  }

  function addMockDependency(relSource: string, relTarget: string, type = 'import') {
    const absSource = path.resolve(cbRoot, relSource).replace(/\\/g, '/');
    const absTarget = path.resolve(cbRoot, relTarget).replace(/\\/g, '/');
    graph.addEdge(absSource, absTarget, type);
  }

  beforeEach(() => {
    graph = new DependencyGraph();
    fileIndex = new FileIndex();
    analyzer = new ChangeSetImpactAnalyzer(graph, fileIndex, cbRoot);
  });

  it('identifies unanalyzable outside-codebase changes', () => {
    const changes: FileChange[] = [{ path: '../outside/file.ts', status: 'modified' }];
    const res = analyzer.analyze(changes);
    expect(res.unanalyzable).toEqual([
      { path: '../outside/file.ts', reason: 'outside-codebase' },
    ]);
  });

  it('identifies unanalyzable unsupported-language changes', () => {
    const changes: FileChange[] = [{ path: 'src/styles.css', status: 'added' }];
    const res = analyzer.analyze(changes);
    expect(res.unanalyzable).toEqual([
      { path: 'src/styles.css', reason: 'unsupported-language' },
    ]);
  });

  it('identifies unanalyzable not-in-index changes (supported extension but missing)', () => {
    const changes: FileChange[] = [{ path: 'src/new-file.ts', status: 'added' }];
    const res = analyzer.analyze(changes);
    expect(res.unanalyzable).toEqual([
      { path: 'src/new-file.ts', reason: 'not-in-index' },
    ]);
  });

  it('identifies global changes', () => {
    addMockFile('package.json');
    const changes: FileChange[] = [{ path: 'package.json', status: 'modified' }];
    const res = analyzer.analyze(changes);
    expect(res.globalChanges).toEqual(['package.json']);
  });

  it('identifies direct and indirect dependents excluding the changed files themselves', () => {
    // core <- service <- controller
    addMockFile('core.ts');
    addMockFile('service.ts');
    addMockFile('controller.ts');

    addMockDependency('service.ts', 'core.ts');
    addMockDependency('controller.ts', 'service.ts');

    const changes: FileChange[] = [{ path: 'core.ts', status: 'modified' }];
    const res = analyzer.analyze(changes);

    expect(res.direct).toEqual(['service.ts']);
    expect(res.indirect).toEqual(['controller.ts']);
    expect(res.direct).not.toContain('core.ts');
    expect(res.indirect).not.toContain('core.ts');
  });

  it('resolves direct > indirect priority', () => {
    // utils <- service <- controller
    // utils <- controller (controller depends on utils both directly and via service)
    addMockFile('utils.ts');
    addMockFile('service.ts');
    addMockFile('controller.ts');

    addMockDependency('service.ts', 'utils.ts');
    addMockDependency('controller.ts', 'service.ts');
    addMockDependency('controller.ts', 'utils.ts');

    const changes: FileChange[] = [{ path: 'utils.ts', status: 'modified' }];
    const res = analyzer.analyze(changes);

    expect(res.direct).toEqual(['controller.ts', 'service.ts']);
    expect(res.indirect).toEqual([]); // controller is direct, so removed from indirect
  });

  it('finds related tests by convention', () => {
    addMockFile('service.ts');
    addMockFile('service.test.ts');
    addMockDependency('service.test.ts', 'service.ts');

    const changes: FileChange[] = [{ path: 'service.ts', status: 'modified' }];
    const res = analyzer.analyze(changes);

    expect(res.tests).toEqual(['service.test.ts']);
  });

  it('reports unresolved dependencies originating from the changed file', () => {
    const absPath = addMockFile('service.ts');
    // Simulate an unresolved edge
    graph.addEdge(absPath, 'crypto', 'unresolved');

    const changes: FileChange[] = [{ path: 'service.ts', status: 'modified' }];
    const res = analyzer.analyze(changes);

    expect(res.unresolvedDependencies).toEqual(['crypto']);
  });

  it('identifies deleted-unprovable when file is deleted and not in index', () => {
    // It's deleted in git, and we analyzed after deletion (so it's not in fileIndex)
    const changes: FileChange[] = [{ path: 'deleted-file.ts', status: 'deleted' }];
    const res = analyzer.analyze(changes);

    expect(res.unanalyzable).toEqual([
      { path: 'deleted-file.ts', reason: 'deleted-unprovable' },
    ]);
  });
});
