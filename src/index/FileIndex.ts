import type { CodebaseFile } from '../core/types.js';

export class FileIndex {
  private byPath = new Map<string, CodebaseFile>();
  private byRelativePath = new Map<string, CodebaseFile>();

  public add(file: CodebaseFile): void {
    this.byPath.set(file.path, file);
    this.byRelativePath.set(file.relativePath, file);
  }

  public addAll(files: CodebaseFile[]): void {
    for (const file of files) {
      this.add(file);
    }
  }

  public getByPath(path: string): CodebaseFile | undefined {
    return this.byPath.get(path);
  }

  public getByRelativePath(relativePath: string): CodebaseFile | undefined {
    return this.byRelativePath.get(relativePath);
  }

  public all(): CodebaseFile[] {
    return Array.from(this.byPath.values());
  }

  public size(): number {
    return this.byPath.size;
  }
}
