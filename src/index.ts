// Public API — only expose what consumers need
export { Codebase } from './core/Codebase.js';
export type { CodebaseOptions } from './core/Codebase.js';
export type {
  CodebaseFile,
  CodeSymbol,
  CodeDependency,
  SupportedLanguage,
  SymbolKind,
  DependencyType,
  ParsedFile
} from './core/types.js';
export type { ProjectInfo } from './discovery/ProjectDetector.js';
export type { SymbolQuery } from './index/SymbolIndex.js';
