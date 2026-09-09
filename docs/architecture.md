# Architecture

The vision for `codebase-intelligence` is to build a robust, AI-ready foundation for codebase understanding. To ensure it remains flexible and agnostic, the system is designed in four distinct layers. 

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
              [CONTEXT ENGINE]
                     |
              ┌──────┴──────┐
              v             v
            [RAG]          [AI]
              │             │
              └──────┬──────┘
                     v
              [INTELLIGENCE]
```

*(Note: Layers in brackets `[]` are planned for future versions. The current MVP implements the first three layers entirely, and the Intelligence layer is intentionally omitted to keep the core library free of specific AI vendor lock-in).*

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

## 4. Intelligence Layer (Future)
**Goal**: Combine the deterministic structured data (Knowledge Layer) with probabilistic models (AI).
- **Context Engine**: Will traverse the `DependencyGraph` to bundle highly relevant code chunks.
- **RAG Pipeline**: Will chunk AST nodes and feed them to an `EmbeddingProvider`.
- **AI Adapters**: Agnostic interfaces for Ollama, OpenAI, Gemini, etc.

By keeping the core Knowledge Layer disconnected from the Intelligence Layer, we guarantee that `codebase-intelligence` can be used simply as a fast analysis tool, or scaled up into a powerful Agentic AI backend.
