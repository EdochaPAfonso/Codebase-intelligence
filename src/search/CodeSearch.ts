import type { CodebaseFile, CodeSymbol } from '../core/types.js';

export type SearchMode = 'lexical'; // Future: | 'semantic' | 'hybrid'

export interface SearchOptions {
  mode?: SearchMode;
  caseSensitive?: boolean;
  limit?: number;
}

export interface SearchResult {
  file: string;
  symbol?: string;
  score: number;
  matches: string[];
}

export class CodeSearch {
  private files: CodebaseFile[];
  private symbols: CodeSymbol[];

  constructor(files: CodebaseFile[], symbols: CodeSymbol[]) {
    this.files = files;
    this.symbols = symbols;
  }

  public search(query: string, options: SearchOptions = {}): SearchResult[] {
    const { caseSensitive = false, limit } = options;

    const normalizedQuery = caseSensitive ? query : query.toLowerCase();
    const results: SearchResult[] = [];

    // 1. Symbol matches (name-based)
    for (const symbol of this.symbols) {
      const normalizedName = caseSensitive ? symbol.name : symbol.name.toLowerCase();

      if (normalizedName.includes(normalizedQuery)) {
        const isExact = normalizedName === normalizedQuery;
        results.push({
          file: symbol.file,
          symbol: symbol.name,
          score: isExact ? 1.0 : 0.7,
          matches: [`symbol:${symbol.kind}:${symbol.name}`]
        });
      }
    }

    // 2. File path matches (deduplicate from symbol results)
    const filesWithSymbolMatches = new Set(results.map(r => r.file));

    for (const file of this.files) {
      if (filesWithSymbolMatches.has(file.path)) continue; // already covered

      const normalizedPath = caseSensitive ? file.relativePath : file.relativePath.toLowerCase();
      const normalizedBasename = caseSensitive
        ? file.relativePath.split('/').pop() ?? ''
        : (file.relativePath.split('/').pop() ?? '').toLowerCase();

      if (normalizedBasename.includes(normalizedQuery)) {
        results.push({
          file: file.path,
          score: 0.6,
          matches: [`file:${file.relativePath}`]
        });
      } else if (normalizedPath.includes(normalizedQuery)) {
        results.push({
          file: file.path,
          score: 0.5,
          matches: [`path:${file.relativePath}`]
        });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return limit !== undefined ? results.slice(0, limit) : results;
  }
}
