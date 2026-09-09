import fg from 'fast-glob';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { CodebaseFile, SupportedLanguage } from '../core/types.js';
import { IgnoreMatcher } from './IgnoreMatcher.js';
import type { IgnoreMatcherOptions } from './IgnoreMatcher.js';

export interface FileScannerOptions extends IgnoreMatcherOptions {
  cwd: string;
}

const RELEVANT_PATTERNS = [
  '**/*.ts',
  '**/*.tsx',
  '**/*.js',
  '**/*.jsx',
  '**/*.mjs',
  '**/*.cjs',
  '**/package.json',
  '**/tsconfig.json'
];

export class FileScanner {
  private ignoreMatcher: IgnoreMatcher;
  private cwd: string;

  constructor(options: FileScannerOptions) {
    this.cwd = options.cwd;
    this.ignoreMatcher = new IgnoreMatcher(options);
  }

  public async scan(): Promise<CodebaseFile[]> {
    const ignores = this.ignoreMatcher.getGlobIgnores();
    
    const entries = await fg(RELEVANT_PATTERNS, {
      cwd: this.cwd,
      ignore: ignores,
      absolute: true,
      stats: true,
      dot: true
    });

    const codebaseFiles: CodebaseFile[] = [];

    for (const entry of entries) {
      if (!entry.stats) continue;

      codebaseFiles.push({
        path: entry.path,
        relativePath: path.relative(this.cwd, entry.path).replace(/\\/g, '/'),
        language: this.determineLanguage(entry.path),
        size: entry.stats.size
      });
    }

    return codebaseFiles;
  }

  private determineLanguage(filePath: string): SupportedLanguage {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.ts' || ext === '.tsx') return 'typescript';
    if (ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs') return 'javascript';
    if (ext === '.json') return 'json';
    return 'typescript'; // fallback
  }
}
