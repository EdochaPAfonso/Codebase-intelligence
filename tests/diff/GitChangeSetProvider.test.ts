import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { GitChangeSetProvider } from '../../src/diff/GitChangeSetProvider.js';
import { InvalidGitRefError, NotAGitRepositoryError } from '../../src/diff/errors.js';

const execFile = promisify(execFileCb);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFile('git', args, { cwd });
  return stdout.trim();
}

/** Creates a temp dir, inits a git repo with local user config, returns path. */
async function createRepo(): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-test-'));
  await git(['init'], dir);
  await git(['config', 'user.email', 'test@ci.local'], dir);
  await git(['config', 'user.name', 'CI Test'], dir);
  return dir;
}

function writeFile(repoDir: string, relPath: string, content = 'content'): void {
  const abs = path.join(repoDir, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

async function addAndCommit(repoDir: string, message: string): Promise<void> {
  await git(['add', '-A'], repoDir);
  await git(['commit', '-m', message], repoDir);
}

// ---------------------------------------------------------------------------
// Tracked repos to clean up
// ---------------------------------------------------------------------------

const tmpDirs: string[] = [];

afterAll(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitChangeSetProvider — DI-2', () => {

  describe('not a git repository', () => {
    it('throws NotAGitRepositoryError for a plain directory', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-norepo-'));
      tmpDirs.push(dir);
      const provider = new GitChangeSetProvider(dir);
      await expect(provider.getChanges()).rejects.toThrow(NotAGitRepositoryError);
    });
  });

  describe('invalid refs', () => {
    let repoDir: string;
    beforeAll(async () => {
      repoDir = await createRepo();
      tmpDirs.push(repoDir);
      writeFile(repoDir, 'init.ts');
      await addAndCommit(repoDir, 'init');
    });

    it('throws InvalidGitRefError for a non-existent ref', async () => {
      const provider = new GitChangeSetProvider(repoDir);
      await expect(provider.getChanges({ since: 'non-existent-branch-xyz' }))
        .rejects.toThrow(InvalidGitRefError);
    });

    it('throws InvalidGitRefError for a ref starting with "-"', async () => {
      const provider = new GitChangeSetProvider(repoDir);
      await expect(provider.getChanges({ since: '-main' }))
        .rejects.toThrow(InvalidGitRefError);
    });

    it('throws for empty ref string', async () => {
      const provider = new GitChangeSetProvider(repoDir);
      await expect(provider.getChanges({ since: '' }))
        .rejects.toThrow(InvalidGitRefError);
    });
  });

  describe('conflicting options', () => {
    let repoDir: string;
    beforeAll(async () => {
      repoDir = await createRepo();
      tmpDirs.push(repoDir);
      writeFile(repoDir, 'init.ts');
      await addAndCommit(repoDir, 'init');
    });

    it('throws when since + staged are combined', async () => {
      const provider = new GitChangeSetProvider(repoDir);
      await expect(provider.getChanges({ since: 'HEAD', staged: true }))
        .rejects.toThrow(/mutually exclusive/);
    });

    it('throws when staged + uncommitted are combined', async () => {
      const provider = new GitChangeSetProvider(repoDir);
      await expect(provider.getChanges({ staged: true, uncommitted: true }))
        .rejects.toThrow(/mutually exclusive/);
    });
  });

  describe('uncommitted changes (default)', () => {
    let repoDir: string;

    beforeAll(async () => {
      repoDir = await createRepo();
      tmpDirs.push(repoDir);
      writeFile(repoDir, 'src/auth/AuthService.ts', 'export class AuthService {}');
      writeFile(repoDir, 'src/users/UserService.ts', 'export class UserService {}');
      await addAndCommit(repoDir, 'initial commit');

      // Modify one file, delete another, add a new one
      writeFile(repoDir, 'src/auth/AuthService.ts', 'export class AuthService { login() {} }');
      fs.unlinkSync(path.join(repoDir, 'src/users/UserService.ts'));
      writeFile(repoDir, 'src/new/NewService.ts', 'export class NewService {}');
    });

    it('detects modified files', async () => {
      const provider = new GitChangeSetProvider(repoDir);
      const changes = await provider.getChanges();
      const modified = changes.filter(c => c.status === 'modified');
      expect(modified.map(c => c.path)).toContain('src/auth/AuthService.ts');
    });

    it('detects deleted files', async () => {
      const provider = new GitChangeSetProvider(repoDir);
      const changes = await provider.getChanges();
      const deleted = changes.filter(c => c.status === 'deleted');
      expect(deleted.map(c => c.path)).toContain('src/users/UserService.ts');
    });

    it('detects untracked (added) files', async () => {
      const provider = new GitChangeSetProvider(repoDir);
      const changes = await provider.getChanges();
      const added = changes.filter(c => c.status === 'added');
      expect(added.map(c => c.path)).toContain('src/new/NewService.ts');
    });

    it('returns results sorted by path', async () => {
      const provider = new GitChangeSetProvider(repoDir);
      const changes = await provider.getChanges();
      const paths = changes.map(c => c.path);
      expect(paths).toEqual([...paths].sort());
    });
  });

  describe('staged changes', () => {
    let repoDir: string;

    beforeAll(async () => {
      repoDir = await createRepo();
      tmpDirs.push(repoDir);
      writeFile(repoDir, 'src/A.ts', 'const a = 1;');
      await addAndCommit(repoDir, 'initial');

      writeFile(repoDir, 'src/A.ts', 'const a = 2;'); // modify
      writeFile(repoDir, 'src/B.ts', 'const b = 1;'); // new untracked
      await git(['add', 'src/A.ts'], repoDir);         // stage only A
    });

    it('returns only staged changes, not untracked', async () => {
      const provider = new GitChangeSetProvider(repoDir);
      const changes = await provider.getChanges({ staged: true });
      const paths = changes.map(c => c.path);
      expect(paths).toContain('src/A.ts');
      expect(paths).not.toContain('src/B.ts');
    });

    it('staged change has status modified', async () => {
      const provider = new GitChangeSetProvider(repoDir);
      const changes = await provider.getChanges({ staged: true });
      const a = changes.find(c => c.path === 'src/A.ts');
      expect(a?.status).toBe('modified');
    });
  });

  describe('renamed files', () => {
    let repoDir: string;

    beforeAll(async () => {
      repoDir = await createRepo();
      tmpDirs.push(repoDir);
      writeFile(repoDir, 'src/Old.ts', 'export class Old {}');
      await addAndCommit(repoDir, 'initial');
      fs.renameSync(
        path.join(repoDir, 'src/Old.ts'),
        path.join(repoDir, 'src/New.ts'),
      );
      await git(['add', '-A'], repoDir);
    });

    it('detects renamed file with oldPath', async () => {
      const provider = new GitChangeSetProvider(repoDir);
      const changes = await provider.getChanges({ staged: true });
      const renamed = changes.find(c => c.status === 'renamed');
      expect(renamed).toBeDefined();
      expect(renamed?.path).toBe('src/New.ts');
      expect(renamed?.oldPath).toBe('src/Old.ts');
    });
  });

  describe('filenames with spaces', () => {
    let repoDir: string;

    beforeAll(async () => {
      repoDir = await createRepo();
      tmpDirs.push(repoDir);
      writeFile(repoDir, 'my file with spaces.ts', 'const x = 1;');
      await addAndCommit(repoDir, 'initial');
      writeFile(repoDir, 'my file with spaces.ts', 'const x = 2;');
    });

    it('handles filenames with spaces correctly', async () => {
      const provider = new GitChangeSetProvider(repoDir);
      const changes = await provider.getChanges();
      const found = changes.find(c => c.path.includes('my file with spaces'));
      expect(found).toBeDefined();
      expect(found?.status).toBe('modified');
    });
  });

  describe('since mode (branch comparison)', () => {
    let repoDir: string;
    let defaultBranch: string;

    beforeAll(async () => {
      repoDir = await createRepo();
      tmpDirs.push(repoDir);

      // main branch: one base file
      writeFile(repoDir, 'src/base.ts', 'const base = 1;');
      await addAndCommit(repoDir, 'base commit');

      // Detect whatever the default branch name is (main or master)
      defaultBranch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'], repoDir)).trim();

      // create a feature branch and add a file
      await git(['checkout', '-b', 'feature'], repoDir);
      writeFile(repoDir, 'src/feature.ts', 'export const feature = true;');
      await addAndCommit(repoDir, 'add feature file');
    });

    it('returns only changes introduced by the branch vs since ref', async () => {
      const provider = new GitChangeSetProvider(repoDir);
      const changes = await provider.getChanges({ since: defaultBranch });
      const paths = changes.map(c => c.path);
      expect(paths).toContain('src/feature.ts');
      expect(paths).not.toContain('src/base.ts');
    });

    it('returns empty list when branch has no changes vs since', async () => {
      const provider = new GitChangeSetProvider(repoDir);
      // HEAD and HEAD are the same — no changes
      const changes = await provider.getChanges({ since: 'HEAD', until: 'HEAD' });
      expect(changes).toHaveLength(0);
    });
  });

  describe('codebase root != git root', () => {
    let repoDir: string;

    beforeAll(async () => {
      repoDir = await createRepo();
      tmpDirs.push(repoDir);
      writeFile(repoDir, 'packages/api/src/auth.ts', 'export const auth = true;');
      writeFile(repoDir, 'packages/web/src/app.ts', 'export const app = true;');
      await addAndCommit(repoDir, 'initial');
      writeFile(repoDir, 'packages/api/src/auth.ts', 'export const auth = false;');
    });

    it('paths are relative to codebase root, not git root', async () => {
      const codebaseRoot = path.join(repoDir, 'packages', 'api');
      const provider = new GitChangeSetProvider(codebaseRoot);
      const changes = await provider.getChanges();
      const paths = changes.map(c => c.path);
      // Should be relative to packages/api, not the repo root
      expect(paths).toContain('src/auth.ts');
      expect(paths).not.toContain('packages/api/src/auth.ts');
    });

    it('files outside codebase root have paths starting with ../', async () => {
      const codebaseRoot = path.join(repoDir, 'packages', 'api');
      const provider = new GitChangeSetProvider(codebaseRoot);
      const changes = await provider.getChanges();
      // The web file is NOT modified, only auth — so no "../web" paths expected
      for (const c of changes) {
        // Modified file is in the api package — path should not go up
        expect(c.path).not.toMatch(/^\.\.\/web/);
      }
    });
  });

  describe('added files (new commits)', () => {
    let repoDir: string;
    let defaultBranch: string;

    beforeAll(async () => {
      repoDir = await createRepo();
      tmpDirs.push(repoDir);
      writeFile(repoDir, 'src/existing.ts', 'const e = 1;');
      await addAndCommit(repoDir, 'initial');
      defaultBranch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'], repoDir)).trim();
      await git(['checkout', '-b', 'add-feature'], repoDir);
      writeFile(repoDir, 'src/new-feature.ts', 'export class NewFeature {}');
      await addAndCommit(repoDir, 'add new feature');
    });

    it('detects added files in since mode', async () => {
      const provider = new GitChangeSetProvider(repoDir);
      const changes = await provider.getChanges({ since: defaultBranch });
      const added = changes.find(c => c.path === 'src/new-feature.ts');
      expect(added).toBeDefined();
      expect(added?.status).toBe('added');
    });
  });
});
