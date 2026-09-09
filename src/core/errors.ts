export class FileNotFoundError extends Error {
  constructor(public readonly filePath: string) {
    super(`File not found: ${filePath}`);
    this.name = 'FileNotFoundError';
  }
}

export class ParseError extends Error {
  constructor(public readonly filePath: string, public readonly originalError: Error | unknown) {
    super(`Failed to parse file: ${filePath}`);
    this.name = 'ParseError';
  }
}

export class UnresolvedDependencyError extends Error {
  constructor(public readonly dependencyPath: string, public readonly sourceFile: string) {
    super(`Could not resolve dependency '${dependencyPath}' from file: ${sourceFile}`);
    this.name = 'UnresolvedDependencyError';
  }
}
