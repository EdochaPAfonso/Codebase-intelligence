export interface IgnoreMatcherOptions {
  extraIgnores?: string[];
  disableDefaultIgnores?: boolean;
}

export const DEFAULT_IGNORES = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.expo/**',
  '**/out/**',
  '**/target/**',
  '**/.env*',
  '**/*.tmp',
  '**/*.temp'
];

export class IgnoreMatcher {
  private ignores: string[];

  constructor(options: IgnoreMatcherOptions = {}) {
    this.ignores = [];
    if (!options.disableDefaultIgnores) {
      this.ignores.push(...DEFAULT_IGNORES);
    }
    if (options.extraIgnores) {
      this.ignores.push(...options.extraIgnores);
    }
  }

  public getGlobIgnores(): string[] {
    return this.ignores;
  }
}
