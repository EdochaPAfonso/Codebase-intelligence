# Codebase Intelligence

**Codebase Intelligence** is a professional-grade Node.js library designed to parse, index, and understand codebases programmatically. It scans files, builds dependency graphs, and indexes symbols (like classes, functions, and interfaces) directly from the AST.

## The Problem It Solves

Modern applications are complex. When developers (or AI agents) need to understand how pieces of code fit together, simple text search (like `grep`) falls short. Finding exactly where a class is used, understanding the impact of modifying a specific file, or tracing transitive dependencies usually requires manual work or a heavy IDE.

Codebase Intelligence acts as a foundational "Knowledge Graph" for your code. It provides structured insights into your codebase, serving as the perfect backbone for AI-assisted development tools, code generation, RAG pipelines, and automated code review systems.

## Features

- **Project Discovery**: Automatically detects project languages, frameworks (React, Next.js, etc.), and package managers.
- **AST Parsing**: Leverages `ts-morph` for robust, regex-free TypeScript/JavaScript parsing to extract classes, functions, methods, and variables.
- **Symbol Indexing**: Instantly query your codebase for symbols by name, type, or file.
- **Dependency Graph**: Builds a directed graph of imports, `extends`, and `implements`.
- **Code Search**: Lexical and structural search across files and symbols.
- **Impact Analysis**: Understand the direct and indirect consequences of modifying any given file, including related test files.
- **Diff Impact Analysis**: Given Git changes (a branch, staged files, uncommitted edits), answer *"what does this set of changes affect?"* — conservatively, at file granularity, without inventing relationships.
- **Context Engine**: Build token-budgeted, LLM-ready context payloads using three strategies (shallow, signature, deep).
- **CLI Included**: Run analyses and queries directly from your terminal.

---

## Installation

```bash
npm i @eduardo-afonso/codebase-intelligence
```

*(Note: Currently in MVP phase. Ensure your project has TypeScript setup to use properly).*

## Quick Start

You can use the library programmatically in your own scripts:

```typescript
import { Codebase } from 'codebase-intelligence';

async function run() {
  // 1. Load the codebase (scans files and detects project info)
  const codebase = await Codebase.load('./src');

  // 2. Analyze the AST and build the dependency graph
  await codebase.analyze();

  // 3. Query the data
  console.log('Total files:', codebase.files().length);
  
  // Search for a specific class or function
  const searchResults = codebase.search('AuthService');
  console.log('Search Results:', searchResults);

  // Check the impact of a file change
  const impact = codebase.impact('src/auth/AuthService.ts');
  console.log('Files directly depending on this:', impact.direct);
  console.log('Files indirectly depending on this:', impact.indirect);
}

run();
```

---

## Public API Reference

### `Codebase.load(path: string, options?: CodebaseOptions): Promise<Codebase>`
Initializes the instance, scanning the given directory path. `options.ignore` accepts an array of glob patterns to exclude.

### `codebase.analyze(): Promise<void>`
Parses the discovered files and populates the internal Symbol Index and Dependency Graph. Must be called before querying symbols or dependencies.

### `codebase.files(): CodebaseFile[]`
Returns all indexed files in the project.

### `codebase.symbols(): CodeSymbol[]`
Returns all extracted symbols (classes, functions, interfaces, etc.) from the project.

### `codebase.search(query: string, options?: SearchOptions): SearchResult[]`
Performs a lexical/structural search for files and symbols matching the query.

### `codebase.dependencies(file: string): string[]`
Returns files that the target file directly depends on (imports).

### `codebase.dependents(file: string): string[]`
Returns files that directly depend on the target file.

### `codebase.impact(file: string): ImpactResult`
Returns `{ direct: string[], indirect: string[], tests: string[] }`, revealing the full blast radius of a change to the given file.

### `codebase.impactOfFiles(paths: string[]): ChangeSetImpact`
Pure, synchronous impact analysis without querying Git. Treats all given relative paths as `modified` and resolves their dependents from the graph.

```typescript
const impact = codebase.impactOfFiles(['src/auth/AuthService.ts']);
console.log(impact.direct);          // direct importers
console.log(impact.indirect);        // transitive dependents
console.log(impact.tests);           // test files (by naming convention)
console.log(impact.globalChanges);   // config files that affect everything
console.log(impact.unanalyzable);    // files that couldn't be traced + why
```

### `codebase.impactOfChanges(options?, provider?): Promise<ChangeSetImpact>`
Queries a `ChangeSetProvider` (Git by default) to determine which files changed, then maps that to a `ChangeSetImpact`.

```typescript
// Changes introduced by the current branch vs main:
const impact = await codebase.impactOfChanges({ since: 'main' });

// Only staged changes:
const staged = await codebase.impactOfChanges({ staged: true });

// All uncommitted changes (including untracked files):
const uncommitted = await codebase.impactOfChanges();

// Custom provider (e.g. GitHub PR API, test stub):
const impact = await codebase.impactOfChanges({}, myCustomProvider);
```

**`ChangeSetImpact` shape:**
```typescript
{
  changed: FileChange[];               // raw list from the provider
  direct: string[];                    // files that directly import a changed file
  indirect: string[];                  // transitive dependents (minus direct)
  tests: string[];                     // test files by naming convention
  globalChanges: string[];             // e.g. package.json, tsconfig.json
  unanalyzable: { path, reason }[];    // files that couldn't be traced
  unresolvedDependencies: string[];    // unresolvable import specifiers
  metadata: { granularity: 'file'; base?: string; head?: string };
}
```

> ⚠️ **Granularity note**: the analysis operates at **file granularity**. A one-line change marks *all* dependents of that file as potentially affected. The result is a conservative upper bound.

---

## CLI Reference

Codebase Intelligence comes with a CLI for terminal use:

```bash
# Analyze the current directory and output a summary
npx codebase-intelligence analyze .

# Search for a specific symbol
npx codebase-intelligence search "UserService" .

# View what a file depends on
npx codebase-intelligence dependencies "src/auth/AuthService.ts" .

# View what depends on a file
npx codebase-intelligence dependents "src/auth/AuthService.ts" .

# ── Impact Analysis ─────────────────────────────────────────────────────

# Classic file-mode: impact of a single file
npx codebase-intelligence impact src/auth/AuthService.ts .

# Diff mode: what does changing since main affect? (merge-base comparison)
npx codebase-intelligence impact . --since main

# Diff mode: only staged changes
npx codebase-intelligence impact . --staged

# Diff mode: all uncommitted changes + untracked files
npx codebase-intelligence impact . --uncommitted

# Output as JSON (clean on stdout, suitable for piping)
npx codebase-intelligence impact . --since main --format json

# Print only related test paths — useful in CI scripts
npx codebase-intelligence impact . --since main --tests-only

# ── Context & Chunking ───────────────────────────────────────────────────

# Generate an LLM-ready context payload for a file (including dependencies)
npx codebase-intelligence context "src/auth/AuthService.ts" --strategy signature .

# Generate semantic chunks for the codebase
npx codebase-intelligence chunks . --max-tokens 512

# Estimate token usage for the entire codebase
npx codebase-intelligence tokens .
```

---

## Architecture Overview

Codebase Intelligence is designed in modular layers to allow future extensibility (e.g., adding C# or Python parsers):

1. **Discovery Layer**: Responsible for finding files (`FileScanner`) and detecting project properties (`ProjectDetector`).
2. **Analysis Layer**: Houses parsers (`TypeScriptParser`) that turn raw code into structured `CodeSymbol` and `CodeDependency` objects.
3. **Knowledge Layer**: Indexes the data for fast retrieval (`SymbolIndex`, `FileIndex`, `DependencyGraph`).

For deeper architectural details, see [docs/architecture.md](docs/architecture.md).

---

## Roadmap

The current version establishes the deterministic structural analysis of a codebase, includes the **Context Engine** for semantic chunking and RAG pipelines, and now features **Diff Impact Analysis** for Git change sets. Future versions will introduce:

- **AI Adapters**: Concrete implementations to connect external LLMs (OpenAI, Anthropic, Gemini, Ollama) and Vector Stores (Qdrant, Chroma).
- **Multi-language Support**: Expanding the `ParserRegistry` to handle Python, Go, and C#.
- **Symbol-level Granularity**: Narrowing impact analysis from file-level to the specific changed symbols.
- **Incremental Indexing**: Avoid full re-analysis on every run by detecting changed files from the index cache.

---

## Contributing

Contributions are welcome. Please ensure that you:
1. Discuss major architectural changes in an issue first.
2. Ensure all tests pass (`npm run test:run`).
3. Ensure no type errors (`npm run typecheck`).
4. Avoid introducing unnecessary dependencies. The core library aims to remain lightweight.

## License

ISC License. See the `LICENSE` file for details.
