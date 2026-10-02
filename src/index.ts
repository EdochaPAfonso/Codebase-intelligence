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
export type { SearchResult, SearchOptions, SearchMode } from './search/CodeSearch.js';
export { CACHE_DIR_NAME } from './core/AnalysisCache.js';

// Context Engine — CE-1: Public types & contracts
export type {
  ContextNode,
  ContextNodeKind,
  ContextStrategy,
  ContextOptions,
  LLMContextPayload,
  ContextPayloadMetadata,
} from './context/types.js';
export type {
  IContextEngine,
  AIProvider,
  EmbeddingProvider,
  VectorStore,
  VectorSearchResult,
} from './context/interfaces.js';
