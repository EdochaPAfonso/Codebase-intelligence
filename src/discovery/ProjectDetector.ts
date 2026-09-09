import * as path from 'path';
import * as fs from 'fs/promises';
import type { CodebaseFile } from '../core/types.js';

export interface ProjectInfo {
  languages: string[];
  frameworks: string[];
  packageManager: string;
}

export class ProjectDetector {
  constructor(private cwd: string, private files: CodebaseFile[]) {}

  public async detect(): Promise<ProjectInfo> {
    const languages = this.detectLanguages();
    const packageJsonContent = await this.readPackageJson();
    const frameworks = this.detectFrameworks(packageJsonContent);
    const packageManager = await this.detectPackageManager();

    return {
      languages,
      frameworks,
      packageManager
    };
  }

  private detectLanguages(): string[] {
    const hasTs = this.files.some(f => f.relativePath === 'tsconfig.json' || f.language === 'typescript');
    const hasJs = this.files.some(f => f.language === 'javascript');
    
    if (hasTs) return ['typescript'];
    if (hasJs) return ['javascript'];
    return [];
  }

  private async readPackageJson(): Promise<any> {
    const pkgFile = this.files.find(f => f.relativePath === 'package.json');
    if (!pkgFile) return null;

    try {
      const content = await fs.readFile(pkgFile.path, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  private detectFrameworks(packageJson: any): string[] {
    const frameworks = new Set<string>();

    // Dependencies check
    const deps = { ...(packageJson?.dependencies || {}), ...(packageJson?.devDependencies || {}) };
    
    if (deps['react']) frameworks.add('react');
    if (deps['next']) frameworks.add('nextjs');
    if (deps['@nestjs/core']) frameworks.add('nestjs');

    // Config files check
    for (const file of this.files) {
      if (file.relativePath.startsWith('next.config.')) frameworks.add('nextjs');
      if (file.relativePath.startsWith('vite.config.')) frameworks.add('vite');
      if (file.relativePath === 'nest-cli.json') frameworks.add('nestjs');
    }

    return Array.from(frameworks);
  }

  private async detectPackageManager(): Promise<string> {
    const checkFile = async (filename: string) => {
      try {
        await fs.access(path.join(this.cwd, filename));
        return true;
      } catch {
        return false;
      }
    };

    if (await checkFile('yarn.lock')) return 'yarn';
    if (await checkFile('pnpm-lock.yaml')) return 'pnpm';
    if (await checkFile('package-lock.json')) return 'npm';

    return 'npm'; // Default
  }
}
