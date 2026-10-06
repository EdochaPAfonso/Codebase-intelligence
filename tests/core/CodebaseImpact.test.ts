import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { Codebase } from '../../src/core/Codebase.js';

const execFile = promisify(execFileCb);

async function git(args: string[], cwd: string): Promise<void> {
  await execFile('git', args, { cwd });
}

function writeFile(dir: string, rel: string, content = 'x'): void {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

describe('Codebase API — DI-4', () => {
  let repoDir: string;
  let codebase: Codebase;

  beforeAll(async () => {
    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-codebase-di4-'));
    
    // Setup git
    await git(['init'], repoDir);
    await git(['config', 'user.email', 'test@ci.local'], repoDir);
    await git(['config', 'user.name', 'CI Test'], repoDir);

    // Setup codebase files
    writeFile(repoDir, 'src/utils.ts', 'export const util = 1;');
    writeFile(repoDir, 'src/service.ts', 'import { util } from "./utils.ts";\nexport class Service {}');
    writeFile(repoDir, 'src/controller.ts', 'import { Service } from "./service.ts";');
    writeFile(repoDir, 'src/controller.test.ts', 'import "./controller.ts";');
    
    await git(['add', '-A'], repoDir);
    await git(['commit', '-m', 'initial'], repoDir);

    // Prepare modified file
    writeFile(repoDir, 'src/utils.ts', 'export const util = 2;'); // Uncommitted change

    codebase = await Codebase.load(repoDir, { cache: false });
    await codebase.analyze();
  });

  afterAll(() => {
    try { fs.rmSync(repoDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('impactOfFiles throws if not analyzed', async () => {
    const unanalyzed = await Codebase.load(repoDir);
    expect(() => unanalyzed.impactOfFiles(['src/utils.ts'])).toThrow(/requires the codebase to be analysed first/);
  });

  it('impactOfChanges throws if not analyzed', async () => {
    const unanalyzed = await Codebase.load(repoDir);
    await expect(unanalyzed.impactOfChanges()).rejects.toThrow(/requires the codebase to be analysed first/);
  });

  it('impactOfFiles returns pure impact without querying git', () => {
    const impact = codebase.impactOfFiles(['src/utils.ts']);
    
    expect(impact.changed).toEqual([{ path: 'src/utils.ts', status: 'modified' }]);
    expect(impact.direct).toEqual(['src/service.ts']);
    expect(impact.indirect).toEqual(['src/controller.test.ts', 'src/controller.ts']);
    expect(impact.tests).toEqual([]);
    expect(impact.metadata.granularity).toBe('file');
  });

  it('impactOfChanges queries git provider and returns full impact', async () => {
    const impact = await codebase.impactOfChanges();
    
    // We modified src/utils.ts, which should be picked up by GitChangeSetProvider
    expect(impact.changed).toEqual([{ path: 'src/utils.ts', status: 'modified' }]);
    expect(impact.direct).toEqual(['src/service.ts']);
    expect(impact.indirect).toEqual(['src/controller.test.ts', 'src/controller.ts']);
    expect(impact.tests).toEqual([]);
    expect(impact.metadata.granularity).toBe('file');
    expect(impact.metadata.base).toBeUndefined(); // We used default uncommitted mode
  });

  it('impactOfChanges respects options', async () => {
    // There are no staged changes yet
    const impact = await codebase.impactOfChanges({ staged: true });
    
    expect(impact.changed).toEqual([]);
    expect(impact.direct).toEqual([]);
    expect(impact.indirect).toEqual([]);
  });
});
