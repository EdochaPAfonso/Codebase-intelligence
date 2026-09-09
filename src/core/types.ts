export type SupportedLanguage = 'typescript' | 'javascript' | 'json';

export type SymbolKind = 'class' | 'interface' | 'function' | 'method' | 'variable' | 'typeAlias';

export type DependencyType = 'import' | 'extends' | 'implements';

export interface CodebaseFile {
  path: string;
  relativePath: string;
  language: SupportedLanguage;
  size: number;
}

export interface CodeSymbol {
  id: string;
  name: string;
  kind: SymbolKind;
  file: string;
  startLine: number;
  endLine: number;
}

export interface CodeDependency {
  source: string;
  target: string;
  type: DependencyType;
}

export interface ParsedFile {
  file: CodebaseFile;
  symbols: CodeSymbol[];
  dependencies: CodeDependency[];
}
