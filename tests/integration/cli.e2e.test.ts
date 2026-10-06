import { describe, it, expect, beforeAll } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

const PROJECT_ROOT = path.resolve(__dirname, '../../');
const FIXTURE_DIR = path.join(PROJECT_ROOT, 'tests/fixtures/parser-project');

describe('CLI E2E Tests — CE-7', () => {
  beforeAll(async () => {
    // Ensure we have a built version or use tsx
    // In our case we can use tsx since it's likely installed (or vitest's runner)
    // We'll execute using tsx (or node with loader) if available, 
    // or rely on a helper script if we want.
    // Given we might not be sure if tsx is globally available, we can run the TS file with node + typescript, or just compile it once.
    // Let's just build it once for tests:
    await execAsync('cmd /c npm run build', { cwd: PROJECT_ROOT });
  });

  const runCli = async (args: string) => {
    // Execute the compiled JS file
    const cliPath = path.join(PROJECT_ROOT, 'dist/cli/index.js');
    const { stdout, stderr } = await execAsync(`node ${cliPath} ${args} "${FIXTURE_DIR}"`, { cwd: PROJECT_ROOT });
    if (stderr && !stderr.includes('Debugger attached')) {
      // ignore warnings
    }
    return stdout;
  };

  it('context --strategy shallow', async () => {
    const stdout = await runCli('context AuthService.ts --strategy shallow');
    expect(stdout).toContain('# Explain: `AuthService.ts`');
    expect(stdout).toContain('**Strategy**: shallow');
    expect(stdout).toContain('class AuthService');
    expect(stdout).not.toContain('class UserService');
  });

  it('context --strategy signature', async () => {
    const stdout = await runCli('context UserService.ts --strategy signature');
    expect(stdout).toContain('# Explain: `UserService.ts`');
    expect(stdout).toContain('**Strategy**: signature');
    expect(stdout).toContain('class UserService');
  });

  it('context --strategy deep', async () => {
    const stdout = await runCli('context UserService.ts --strategy deep');
    expect(stdout).toContain('# Explain: `UserService.ts`');
    expect(stdout).toContain('**Strategy**: deep');
    expect(stdout).toContain('class UserService');
  });

  it('chunks command generates valid chunks without breaking functions', async () => {
    const stdout = await runCli('chunks --max-tokens 512 --format json');
    const chunks = JSON.parse(stdout);
    expect(Array.isArray(chunks)).toBe(true);
    expect(chunks.length).toBeGreaterThan(0);
    
    const authServiceChunk = chunks.find((c: any) => c.symbolName === 'AuthService');
    expect(authServiceChunk).toBeDefined();
    expect(authServiceChunk.symbolKind).toBe('class');
    expect(authServiceChunk.content).toContain('class AuthService');
  });

  it('tokens command estimates total tokens', async () => {
    const stdout = await runCli('tokens');
    const result = JSON.parse(stdout);
    expect(result.files).toBeGreaterThan(0);
    expect(result.chunks).toBeGreaterThan(0);
    expect(result.estimatedTokens).toBeGreaterThan(0);
  });
});
