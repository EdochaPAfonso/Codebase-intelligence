import { describe, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { GitChangeSetProvider } from '../../src/diff/GitChangeSetProvider.js';

const execFile = promisify(execFileCb);

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFile('git', args, { cwd });
  return stdout.trim();
}

function writeFile(dir: string, rel: string, content = 'x'): void {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

describe('debug', () => {
  it('prints codebase root path output', async () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'di2-debug-'));
    try {
      await git(['init'], repoDir);
      await git(['config', 'user.email', 'test@ci.local'], repoDir);
      await git(['config', 'user.name', 'CI Test'], repoDir);

      writeFile(repoDir, 'packages/api/src/auth.ts', 'const a = 1;');
      await git(['add', '-A'], repoDir);
      await git(['commit', '-m', 'init'], repoDir);
      writeFile(repoDir, 'packages/api/src/auth.ts', 'const a = 2;');

      const codebaseRoot = path.join(repoDir, 'packages', 'api');
      const provider = new GitChangeSetProvider(codebaseRoot);
      const changes = await provider.getChanges();
      console.log('repoDir:', repoDir);
      console.log('codebaseRoot:', codebaseRoot);
      console.log('changes:', JSON.stringify(changes, null, 2));
    } finally {
      fs.rmSync(repoDir, { recursive: true });
    }
  });

  it('prints since mode output', async () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'di2-since-'));
    try {
      await git(['init'], repoDir);
      await git(['config', 'user.email', 'test@ci.local'], repoDir);
      await git(['config', 'user.name', 'CI Test'], repoDir);

      writeFile(repoDir, 'src/existing.ts', 'const e = 1;');
      await git(['add', '-A'], repoDir);
      await git(['commit', '-m', 'initial'], repoDir);
      const defaultBranch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], repoDir);
      console.log('defaultBranch:', defaultBranch);

      await git(['checkout', '-b', 'add-feature'], repoDir);
      writeFile(repoDir, 'src/new-feature.ts', 'class NewFeature {}');
      await git(['add', '-A'], repoDir);
      await git(['commit', '-m', 'add feature'], repoDir);

      const provider = new GitChangeSetProvider(repoDir);
      const changes = await provider.getChanges({ since: defaultBranch });
      console.log('since changes:', JSON.stringify(changes, null, 2));
    } finally {
      fs.rmSync(repoDir, { recursive: true });
    }
  });
});
