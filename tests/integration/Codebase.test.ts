import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { Codebase } from '../../src/core/Codebase.js';

const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/parser-project');

describe('Codebase integration', () => {
  it('should load and list files from a project', async () => {
    const codebase = await Codebase.load(FIXTURE_PATH);
    const files = codebase.files();

    expect(files.length).toBeGreaterThan(0);
    const relativePaths = files.map(f => f.relativePath);
    expect(relativePaths).toContain('AuthService.ts');
    expect(relativePaths).toContain('UserService.ts');
  });

  it('should analyze and populate symbols', async () => {
    const codebase = await Codebase.load(FIXTURE_PATH);
    await codebase.analyze();

    const symbols = codebase.symbols();
    expect(symbols.length).toBeGreaterThan(0);

    const names = symbols.map(s => s.name);
    expect(names).toContain('AuthService');
    expect(names).toContain('login');
    expect(names).toContain('UserService');
    expect(names).toContain('IUser');
  });

  it('should build the dependency graph after analyze()', async () => {
    const codebase = await Codebase.load(FIXTURE_PATH);
    await codebase.analyze();

    const graph = codebase.graph();
    // UserService.ts imports AuthService.ts — there should be an edge
    const userServicePath = path.join(FIXTURE_PATH, 'UserService.ts').replace(/\\/g, '/');
    expect(graph.hasNode(userServicePath)).toBe(true);
    expect(graph.dependenciesOf(userServicePath).length).toBeGreaterThan(0);
  });

  it('should expose project info after load()', async () => {
    const codebase = await Codebase.load(FIXTURE_PATH);
    const info = codebase.projectInfo();

    expect(info).toBeDefined();
    expect(info?.languages).toContain('typescript');
  });

  it('should report isAnalyzed correctly', async () => {
    const codebase = await Codebase.load(FIXTURE_PATH);
    expect(codebase.isAnalyzed()).toBe(false);
    await codebase.analyze();
    expect(codebase.isAnalyzed()).toBe(true);
  });
});
