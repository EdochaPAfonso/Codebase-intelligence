import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { FileScanner } from '../../src/discovery/FileScanner.js';
import { ProjectDetector } from '../../src/discovery/ProjectDetector.js';

describe('ProjectDetector', () => {
  it('should detect basic project as typescript/npm', async () => {
    const cwd = path.resolve(__dirname, '../fixtures/basic-project');
    const scanner = new FileScanner({ cwd });
    const files = await scanner.scan();

    const detector = new ProjectDetector(cwd, files);
    const info = await detector.detect();

    expect(info.languages).toEqual(['typescript']);
    expect(info.frameworks).toEqual([]);
    expect(info.packageManager).toBe('npm'); // Default
  });

  it('should detect next project as typescript/react/nextjs/yarn', async () => {
    const cwd = path.resolve(__dirname, '../fixtures/next-project');
    const scanner = new FileScanner({ cwd });
    const files = await scanner.scan();

    const detector = new ProjectDetector(cwd, files);
    const info = await detector.detect();

    expect(info.languages).toEqual(['typescript']);
    expect(info.frameworks).toContain('react');
    expect(info.frameworks).toContain('nextjs');
    expect(info.packageManager).toBe('yarn');
  });
});
