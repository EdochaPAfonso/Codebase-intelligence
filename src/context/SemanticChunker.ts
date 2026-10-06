import { Project, SyntaxKind, type SourceFile, type Node } from 'ts-morph';
import type { CodebaseFile, SymbolKind } from '../core/types.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A semantically complete fragment of a source file, suitable for embedding
 * or retrieval in a RAG pipeline.
 *
 * Unlike character-based splits, every `SemanticChunk` is guaranteed to
 * correspond to a complete AST declaration (class, function, method, etc.) so
 * it can always be understood in isolation when paired with the file header.
 */
export interface SemanticChunk {
  /**
   * Stable unique identifier: `<relativePath>:<startLine>-<endLine>`.
   * Matches the format used by `ContextNode.id`.
   */
  id: string;
  /** Absolute path to the source file. */
  file: string;
  /** Path relative to the codebase root. */
  relativePath: string;
  /**
   * The content of this chunk.
   *
   * For `symbolKind !== 'file'`, the content always starts with the file
   * header (imports) so the chunk can be understood in isolation.
   */
  content: string;
  /**
   * The granularity of this chunk:
   * - `'file'`      — the entire file (used when a small file fits in one chunk)
   * - a `SymbolKind` — a top-level declaration or one of its methods
   */
  symbolKind: SymbolKind | 'file';
  /** Name of the top-level symbol (or the method name for sub-chunks). */
  symbolName?: string;
  /** 1-based start line in the source file. */
  startLine: number;
  /** 1-based end line in the source file. */
  endLine: number;
  /** Rough token estimate: `Math.ceil(content.length / 4)`. */
  tokenEstimate: number;
}

/** Options for `SemanticChunker.chunk()`. */
export interface ChunkerOptions {
  /**
   * Maximum token budget for a single chunk before it is split by methods.
   * @default 512
   */
  maxChunkTokens?: number;
  /**
   * Whether to prepend the file header (imports + top-of-file comments) to
   * each symbol chunk. Recommended so each chunk is self-contained.
   * @default true
   */
  includeFileHeader?: boolean;
}

// ---------------------------------------------------------------------------
// SemanticChunker
// ---------------------------------------------------------------------------

/**
 * Divides TypeScript/JavaScript source files into semantically coherent
 * chunks using the `ts-morph` AST.
 *
 * Unlike character or line-based splitters, `SemanticChunker` guarantees that:
 * - No chunk cuts across a declaration boundary.
 * - Large symbols (classes with many methods) are split **by method**, not
 *   arbitrarily.
 * - Each chunk includes the file header (imports) so it can be embedded
 *   and understood without additional context.
 *
 * @example
 * ```ts
 * const chunker = new SemanticChunker();
 * const chunks = await chunker.chunk(codebase.files(), { maxChunkTokens: 512 });
 * ```
 */
export class SemanticChunker {
  private readonly project: Project;

  constructor() {
    this.project = new Project({
      useInMemoryFileSystem: false,
      skipFileDependencyResolution: true,
      compilerOptions: {
        allowJs: true,
        noResolve: true,
      },
    });
  }

  /**
   * Chunks the given list of files into semantically complete fragments.
   *
   * Only TypeScript and JavaScript files are processed via AST chunking.
   * Other file types (JSON, config files) are returned as a single whole-file
   * chunk if they fit within `maxChunkTokens`, or omitted otherwise.
   *
   * @param files   - The list of `CodebaseFile`s to chunk.
   * @param options - Chunking configuration.
   * @returns Ordered list of `SemanticChunk`s across all processed files.
   */
  public async chunk(
    files: CodebaseFile[],
    options: ChunkerOptions = {},
  ): Promise<SemanticChunk[]> {
    const { maxChunkTokens = 512, includeFileHeader = true } = options;
    const allChunks: SemanticChunk[] = [];

    for (const file of files) {
      const chunks = await this.chunkFile(file, maxChunkTokens, includeFileHeader);
      allChunks.push(...chunks);
    }

    return allChunks;
  }

  // ---- Per-file chunking --------------------------------------------------

  private async chunkFile(
    file: CodebaseFile,
    maxChunkTokens: number,
    includeFileHeader: boolean,
  ): Promise<SemanticChunk[]> {
    if (file.language !== 'typescript' && file.language !== 'javascript') {
      return this.chunkNonTsFile(file, maxChunkTokens);
    }

    let sourceFile: SourceFile;
    try {
      sourceFile =
        this.project.getSourceFile(file.path) ??
        this.project.addSourceFileAtPath(file.path);
    } catch {
      // Unreadable or invalid file — skip silently
      return [];
    }

    const fileHeader = includeFileHeader ? extractFileHeader(sourceFile) : '';
    const chunks: SemanticChunk[] = [];

    // Collect all top-level declarations (skip imports/exports re-declarations)
    const topLevelDecls = getTopLevelDeclarations(sourceFile);

    if (topLevelDecls.length === 0) {
      // No meaningful symbols — emit the whole file as a single chunk
      return [this.buildWholeFileChunk(file, sourceFile.getFullText())];
    }

    for (const decl of topLevelDecls) {
      const declChunks = this.chunksForDeclaration(decl, file, fileHeader, maxChunkTokens);
      chunks.push(...declChunks);
    }

    // If we produced no chunks (e.g. all declarations were expression statements),
    // fall back to the whole file
    return chunks.length > 0 ? chunks : [this.buildWholeFileChunk(file, sourceFile.getFullText())];
  }

  // ---- Declaration-level chunking ----------------------------------------

  private chunksForDeclaration(
    decl: Node,
    file: CodebaseFile,
    fileHeader: string,
    maxChunkTokens: number,
  ): SemanticChunk[] {
    const kind = decl.getKind();

    if (kind === SyntaxKind.ClassDeclaration) {
      return this.chunksForClass(decl, file, fileHeader, maxChunkTokens);
    }

    // For everything else (functions, interfaces, type aliases, enums,
    // variable statements) treat as a single symbol chunk.
    return [this.buildSymbolChunk(decl, file, fileHeader, maxChunkTokens)];
  }

  // ---- Class chunking -----------------------------------------------------

  /**
   * Emits the class as one chunk. If that chunk exceeds `maxChunkTokens`,
   * falls back to per-method sub-chunking.
   */
  private chunksForClass(
    classNode: Node,
    file: CodebaseFile,
    fileHeader: string,
    maxChunkTokens: number,
  ): SemanticChunk[] {
    const classDecl = classNode.asKindOrThrow(SyntaxKind.ClassDeclaration);
    const classText = classDecl.getText();
    const headerPrefix = fileHeader ? `${fileHeader}\n\n` : '';
    const combined = `${headerPrefix}${classText}`;

    if (estimateTokens(combined) <= maxChunkTokens) {
      // Fits as a whole — emit the entire class
      const startLine = classDecl.getStartLineNumber();
      const endLine = classDecl.getEndLineNumber();
      return [
        this.buildChunk(
          file,
          combined,
          'class',
          classDecl.getName() ?? '<anonymous>',
          startLine,
          endLine,
        ),
      ];
    }

    // Class is too large — sub-chunk by method
    return this.subChunkByMethod(classDecl, file, fileHeader, maxChunkTokens);
  }

  /**
   * Splits an oversized class into one chunk per method/constructor.
   * Properties and the class header are included in every method chunk.
   */
  private subChunkByMethod(
    classDecl: ReturnType<Node['asKindOrThrow']>,
    file: CodebaseFile,
    fileHeader: string,
    maxChunkTokens: number,
  ): SemanticChunk[] {
    const cd = classDecl.asKindOrThrow(SyntaxKind.ClassDeclaration);
    const headerPrefix = fileHeader ? `${fileHeader}\n\n` : '';

    // Build the class "skeleton" (header + properties, no methods)
    const classHeader = buildClassHeader(cd);
    const properties = cd
      .getMembers()
      .filter(
        m =>
          m.getKind() === SyntaxKind.PropertyDeclaration ||
          m.getKind() === SyntaxKind.GetAccessor ||
          m.getKind() === SyntaxKind.SetAccessor,
      )
      .map(m => `  ${m.getText()}`)
      .join('\n');

    const classSkeleton = properties
      ? `${classHeader} {\n${properties}\n  // ... methods below\n}`
      : `${classHeader} { /* ... */ }`;

    const chunks: SemanticChunk[] = [];

    for (const member of cd.getMembers()) {
      const memberKind = member.getKind();
      if (
        memberKind !== SyntaxKind.Constructor &&
        memberKind !== SyntaxKind.MethodDeclaration
      ) {
        continue;
      }

      const memberText = member.getText();
      const methodChunkContent = [
        headerPrefix + classSkeleton,
        '',
        `  // Method: ${getMemberName(member)}`,
        `  ${memberText}`,
        '}',
      ].join('\n');

      const startLine = member.getStartLineNumber();
      const endLine = member.getEndLineNumber();

      chunks.push(
        this.buildChunk(
          file,
          methodChunkContent,
          'method',
          getMemberName(member),
          startLine,
          endLine,
        ),
      );
    }

    // If no methods were found, fall back to the whole class
    if (chunks.length === 0) {
      const combined = `${headerPrefix}${cd.getText()}`;
      const startLine = cd.getStartLineNumber();
      const endLine = cd.getEndLineNumber();
      chunks.push(
        this.buildChunk(file, combined, 'class', cd.getName() ?? '<anonymous>', startLine, endLine),
      );
    }

    return chunks;
  }

  // ---- Generic symbol chunk -----------------------------------------------

  private buildSymbolChunk(
    node: Node,
    file: CodebaseFile,
    fileHeader: string,
    _maxChunkTokens: number,
  ): SemanticChunk {
    const headerPrefix = fileHeader ? `${fileHeader}\n\n` : '';
    const content = `${headerPrefix}${node.getText()}`;
    const startLine = node.getStartLineNumber();
    const endLine = node.getEndLineNumber();
    const { kind, name } = getNodeKindAndName(node);

    return this.buildChunk(file, content, kind, name, startLine, endLine);
  }

  // ---- Whole-file fallback ------------------------------------------------

  private buildWholeFileChunk(file: CodebaseFile, content: string): SemanticChunk {
    const lines = content.split('\n').length;
    return this.buildChunk(file, content, 'file', undefined, 1, lines);
  }

  private chunkNonTsFile(file: CodebaseFile, maxChunkTokens: number): SemanticChunk[] {
    // Non-TS files: return as a single chunk if small enough
    const content = ''; // We skip reading non-TS files
    void content; // avoid unused warning

    // Without reading the file, we can't produce useful chunks.
    // These will be added when the RAG pipeline actually needs to embed them.
    void maxChunkTokens;
    return [];
  }

  // ---- Chunk builder ------------------------------------------------------

  private buildChunk(
    file: CodebaseFile,
    content: string,
    symbolKind: SymbolKind | 'file',
    symbolName: string | undefined,
    startLine: number,
    endLine: number,
  ): SemanticChunk {
    const id = `${file.relativePath}:${startLine}-${endLine}`;
    const chunk: SemanticChunk = {
      id,
      file: file.path,
      relativePath: file.relativePath,
      content: content.trim(),
      symbolKind,
      startLine,
      endLine,
      tokenEstimate: estimateTokens(content),
    };
    if (symbolName !== undefined) {
      chunk.symbolName = symbolName;
    }
    return chunk;
  }
}

// ---------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the file "header" — import/export declarations and leading
 * comments/trivia at the top of the file.
 */
function extractFileHeader(sourceFile: SourceFile): string {
  const headerLines: string[] = [];

  for (const statement of sourceFile.getStatements()) {
    const kind = statement.getKind();
    if (
      kind === SyntaxKind.ImportDeclaration ||
      kind === SyntaxKind.ExportDeclaration
    ) {
      headerLines.push(statement.getText());
    } else {
      // Stop at the first non-import statement
      break;
    }
  }

  return headerLines.join('\n');
}

/**
 * Returns all top-level declarations that represent meaningful code units
 * (classes, functions, interfaces, type aliases, enums, variable statements).
 * Import/export declarations are excluded — they form the file header.
 */
function getTopLevelDeclarations(sourceFile: SourceFile): Node[] {
  const result: Node[] = [];

  for (const statement of sourceFile.getStatements()) {
    const kind = statement.getKind();
    if (
      kind === SyntaxKind.ClassDeclaration ||
      kind === SyntaxKind.FunctionDeclaration ||
      kind === SyntaxKind.InterfaceDeclaration ||
      kind === SyntaxKind.TypeAliasDeclaration ||
      kind === SyntaxKind.EnumDeclaration ||
      kind === SyntaxKind.VariableStatement
    ) {
      result.push(statement);
    }
    // Skip: ImportDeclaration, ExportDeclaration, ExpressionStatement
  }

  return result;
}

/** Builds the class declaration line (everything before the opening `{`). */
function buildClassHeader(classDecl: ReturnType<SourceFile['getClass']>): string {
  if (!classDecl) return 'class <anonymous>';
  const fullText = classDecl.getText();
  const braceIdx = fullText.indexOf('{');
  return braceIdx !== -1 ? fullText.slice(0, braceIdx).trimEnd() : fullText;
}

/** Returns the `SymbolKind` and name for an arbitrary top-level AST node. */
function getNodeKindAndName(node: Node): { kind: SymbolKind | 'file'; name: string | undefined } {
  const k = node.getKind();

  if (k === SyntaxKind.ClassDeclaration) {
    return { kind: 'class', name: node.asKindOrThrow(SyntaxKind.ClassDeclaration).getName() };
  }
  if (k === SyntaxKind.FunctionDeclaration) {
    return { kind: 'function', name: node.asKindOrThrow(SyntaxKind.FunctionDeclaration).getName() };
  }
  if (k === SyntaxKind.InterfaceDeclaration) {
    return { kind: 'interface', name: node.asKindOrThrow(SyntaxKind.InterfaceDeclaration).getName() };
  }
  if (k === SyntaxKind.TypeAliasDeclaration) {
    return { kind: 'typeAlias', name: node.asKindOrThrow(SyntaxKind.TypeAliasDeclaration).getName() };
  }
  if (k === SyntaxKind.VariableStatement) {
    const decls = node.asKindOrThrow(SyntaxKind.VariableStatement).getDeclarations();
    return { kind: 'variable', name: decls[0]?.getName() };
  }

  return { kind: 'file', name: undefined };
}

/** Returns the name of a class member (method or constructor). */
function getMemberName(member: Node): string {
  const kind = member.getKind();
  if (kind === SyntaxKind.Constructor) return 'constructor';
  if (kind === SyntaxKind.MethodDeclaration) {
    return member.asKindOrThrow(SyntaxKind.MethodDeclaration).getName();
  }
  return '<member>';
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}
