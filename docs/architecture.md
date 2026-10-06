# Architecture

The vision for `codebase-intelligence` is to build a robust, AI-ready foundation for codebase understanding. To ensure it remains flexible and agnostic, the system is designed in five distinct layers.

```text
                  CODEBASE
                     |
                     v
                DISCOVERY
                     |
                     v
                  PARSERS
                     |
                     v
              SYMBOL / FILE INDEX
                     |
                     v
             DEPENDENCY GRAPH
                     |
          ┌──────────┼──────────┐
          v          v          v
       SEARCH      IMPACT      FLOW
          │          │          │
          └──────────┼──────────┘
                     v
              CONTEXT ENGINE          ← Implemented ✅
             ┌───────┴────────┐
             v                v
     SemanticChunker     ContextEngine
     (AST-based chunks)  (forFile/forSymbol)
             │                │
             └───────┬────────┘
                     v
               RAG PIPELINE           ← Interfaces implemented ✅
              (EmbeddingProvider +
               VectorStore + RAGPipeline)
                     |
          ┌──────────┴──────────┐
          v                     v
      AI ADAPTER             [CONCRETE
    (AIProvider +           INTEGRATIONS]  ← Future packages
     NoopAIProvider)         (OpenAI, Ollama,
                              Qdrant, Chroma)
                     |
                     v
              [INTELLIGENCE]            ← Future
```

*(Note: Layers marked `[Future packages]` are the external adapter packages to be published separately, e.g. `@codebase-intelligence/openai`. All interfaces and contracts are already defined and stable in the core.)*

---

## 1. Discovery Layer
**Goal**: Understand the physical boundaries and environment of the project.
- **FileScanner**: Crawls the file system based on rules and ignore lists.
- **ProjectDetector**: Inspects `package.json`, `tsconfig.json`, etc., to identify the active languages, frameworks (e.g., React, Next.js), and package managers.

## 2. Analysis Layer
**Goal**: Extract semantic meaning from raw text files without resorting to brittle regex.
- **CodeParser Interface**: A standard contract for reading a file and outputting `CodeSymbol`s and `CodeDependency`s.
- **TypeScriptParser**: Uses `ts-morph` to generate an Abstract Syntax Tree (AST), accurately pulling classes, interfaces, and module-level variables alongside exact line numbers and parent-child relationships.

## 3. Knowledge Layer
**Goal**: Store the extracted information in query-optimized memory structures.
- **FileIndex & SymbolIndex**: Fast, O(1) or O(N) lookup tables for files and code symbols. Completely decoupled from the parser implementations.
- **DependencyGraph**: A generic, directed graph mapping relationships (imports, extends, implements) between IDs.
- **Analyzers (Impact & Dependency)**: Wrappers around the graph that answer complex questions (e.g., "What is the transitive impact of changing this file?").

## 4. Context Engine Layer ✅ Implemented
**Goal**: Transform raw Knowledge Layer data into structured, token-budgeted context payloads suitable for LLMs and RAG pipelines.

### Context Strategies
Three strategies are available via `codebase.context().forFile(path, { strategy })`:

| Strategy | Behaviour | Token Cost |
|---|---|---|
| `shallow` | Target file only, full source | Low |
| `signature` | Target file + AST signatures of all dependencies (no bodies) | Medium |
| `deep` | Target file + full source of all dependencies | High |

### Components
- **`ContextEngine`**: Builds `LLMContextPayload` objects — token-budgeted, dependency-aware context bundles. Exposes `forFile()` and `forSymbol()`.
- **`FileContextBuilder`**: Reads and structures individual file content as `ContextNode`s with token estimates.
- **`SignatureExtractor`**: Uses `ts-morph` AST to strip function bodies and keep only type-level signatures — reduces token usage by 60–80% for dependency context.
- **`ShallowStrategy` / `SignatureStrategy` / `DeepStrategy`**: Pluggable strategy pattern. New strategies can be added without changing the engine.
- **`SemanticChunker`**: Divides files into semantically complete AST-boundary chunks (never cuts declarations in half). Oversized classes are split per-method. Used to feed the RAG pipeline.

### API Entry Points
```ts
// Via Codebase (recommended):
const payload = await codebase.context().forFile('src/auth/AuthService.ts', { strategy: 'signature' });
const chunks  = await codebase.chunks({ maxChunkTokens: 512 });

// Via CLI:
codebase-intelligence context src/auth/AuthService.ts --strategy signature
codebase-intelligence chunks . --max-tokens 512
codebase-intelligence tokens .
```

## 5. Intelligence Layer — Interfaces Implemented ✅, Adapters Are External
**Goal**: Combine the deterministic structured data (Knowledge Layer + Context Engine) with probabilistic models (AI).

The core library defines all contracts but ships **zero** LLM or vector-store SDKs. This keeps the library lightweight and prevents vendor lock-in.

### Interfaces (in `src/context/interfaces.ts`)
- **`AIProvider`**: `complete(prompt, systemPrompt?) → Promise<string>` and optional `stream()`. Implemented by external packages (OpenAI, Anthropic, Ollama, etc.).
- **`EmbeddingProvider`**: `embed(texts: string[]) → Promise<number[][]>`. Produces dense vectors for similarity search.
- **`VectorStore`**: `upsert / search / delete`. Abstracts Qdrant, pgvector, Chroma, Pinecone, etc.

### Implemented in Core
- **`NoopAIProvider`**: A safe stub that returns `''`. Used in tests and dry-runs.
- **`CodebaseWithAI`**: Composes `Codebase` with an `AIProvider`. Exposes `explain(file)`, `ask(question)`, and `buildExplainPayload(file)` (dry-run, no LLM call).
- **`RAGPipeline`**: Orchestrates the full `codebase.chunks() → EmbeddingProvider → VectorStore` pipeline. Ready to be wired to real adapters.

### Entry Point
```ts
const cbWithAI = codebase.withAI(new OpenAIProvider()); // external package
await cbWithAI.explain('src/auth/AuthService.ts');
await cbWithAI.ask('How does authentication work?');

const pipeline = new RAGPipeline({ chunker, embedder, store });
await pipeline.index(codebase);
const results = await pipeline.search('login flow');
```

### Future: Concrete Adapter Packages
These are published separately to avoid bloating the core dependency tree:

| Package | Implements |
|---|---|
| `@codebase-intelligence/openai` | `AIProvider` + `EmbeddingProvider` |
| `@codebase-intelligence/ollama` | `AIProvider` + `EmbeddingProvider` |
| `@codebase-intelligence/qdrant` | `VectorStore` |
| `@codebase-intelligence/chroma` | `VectorStore` |

---

By keeping the Knowledge Layer and Context Engine disconnected from concrete AI vendor implementations, `codebase-intelligence` can be used as a standalone fast analysis tool *or* scaled up into a full Agentic AI backend — with no architectural changes required.
