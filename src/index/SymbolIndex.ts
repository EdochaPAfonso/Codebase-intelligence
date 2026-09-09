import type { CodeSymbol, SymbolKind } from '../core/types.js';

export interface SymbolQuery {
  name?: string;
  kind?: SymbolKind;
  file?: string;
}

export class SymbolIndex {
  private byName = new Map<string, CodeSymbol[]>();
  private byFile = new Map<string, CodeSymbol[]>();
  private all: CodeSymbol[] = [];

  public add(symbol: CodeSymbol): void {
    this.all.push(symbol);

    const byNameList = this.byName.get(symbol.name) ?? [];
    byNameList.push(symbol);
    this.byName.set(symbol.name, byNameList);

    const byFileList = this.byFile.get(symbol.file) ?? [];
    byFileList.push(symbol);
    this.byFile.set(symbol.file, byFileList);
  }

  public addAll(symbols: CodeSymbol[]): void {
    for (const symbol of symbols) {
      this.add(symbol);
    }
  }

  public findSymbol(name: string): CodeSymbol | undefined {
    return this.byName.get(name)?.[0];
  }

  public findSymbols(query: SymbolQuery): CodeSymbol[] {
    return this.all.filter(symbol => {
      if (query.name !== undefined && symbol.name !== query.name) return false;
      if (query.kind !== undefined && symbol.kind !== query.kind) return false;
      if (query.file !== undefined && symbol.file !== query.file) return false;
      return true;
    });
  }

  public findByFile(file: string): CodeSymbol[] {
    return this.byFile.get(file) ?? [];
  }

  public size(): number {
    return this.all.length;
  }
}
