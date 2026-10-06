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
// Context Engine — CE-2: Implementation
export { ContextEngine } from './context/ContextEngine.js';

// Context Engine — CE-3: Strategy classes & SignatureExtractor
export { ShallowStrategy, SignatureStrategy, DeepStrategy } from './context/strategies/index.js';
export type { ContextBuildStrategy } from './context/strategies/index.js';
export { SignatureExtractor } from './context/SignatureExtractor.js';

// Context Engine — CE-4: AI Provider Interface
export { NoopAIProvider } from './ai/providers/NoopAIProvider.js';
export { CodebaseWithAI } from './ai/CodebaseWithAI.js';
export type { ExplainOptions, AskOptions } from './ai/CodebaseWithAI.js';
