import { Project, SourceFile, SyntaxKind, type Node } from 'ts-morph';

/**
 * Extracts structural signatures from TypeScript source files using the AST.
 *
 * A "signature" is a representation that preserves the public shape of a
 * declaration (name, parameters, return types, generics, modifiers) without
 * including the implementation body. This gives an LLM full type information
 * at a fraction of the token cost of the full source.
 *
 * @example
 * ```ts
 * const extractor = new SignatureExtractor();
 * const sig = extractor.extract('/path/to/UserService.ts');
 * // → "export class UserService {\n  constructor(...);\n  async createUser(...);\n}"
 * ```
 */
export class SignatureExtractor {
  private readonly project: Project;

  constructor() {
    // In-memory project: we add individual source files on demand.
    // No tsconfig.json is needed — we only need type-level text extraction.
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
   * Extracts the signature string for all top-level declarations in the file.
   *
   * The returned string is valid(ish) TypeScript with implementation bodies
   * replaced by `;`. Import statements are preserved verbatim so the LLM
   * retains the dependency context.
   *
   * @param filePath - Absolute path to the source file.
   * @returns The full signature representation as a string.
   */
  public extract(filePath: string): string {
    // Reuse an existing source file if already added; add it otherwise.
    const sourceFile =
      this.project.getSourceFile(filePath) ??
      this.project.addSourceFileAtPath(filePath);

    return this.buildSignatureString(sourceFile);
  }

  /**
   * Extracts the signature string from raw TypeScript source text.
   * Useful when the file is not on disk (e.g. in tests or virtual filesystems).
   *
   * @param content  - Raw TypeScript source text.
   * @param fileName - Virtual file name used to determine language (must end in `.ts` or `.tsx`).
   */
  public extractFromText(content: string, fileName: string): string {
    const key = `__virtual__/${fileName}`;
    // Remove any stale virtual file before re-adding
    const existing = this.project.getSourceFile(key);
    if (existing) {
      this.project.removeSourceFile(existing);
    }
    const sourceFile = this.project.createSourceFile(key, content, {
      overwrite: true,
    });
    const result = this.buildSignatureString(sourceFile);
    // Clean up after extraction to avoid memory bloat
    this.project.removeSourceFile(sourceFile);
    return result;
  }

  // ---- Core extraction logic -----------------------------------------------

  private buildSignatureString(sourceFile: SourceFile): string {
    const lines: string[] = [];

    for (const statement of sourceFile.getStatements()) {
      const kind = statement.getKind();

      switch (kind) {
        // Preserve import/export declarations verbatim
        case SyntaxKind.ImportDeclaration:
        case SyntaxKind.ExportDeclaration:
          lines.push(statement.getText());
          break;

        case SyntaxKind.ClassDeclaration: {
          lines.push(this.extractClassSignature(statement));
          break;
        }

        case SyntaxKind.InterfaceDeclaration: {
          // Interfaces have no bodies to strip — include as-is
          lines.push(statement.getText());
          break;
        }

        case SyntaxKind.FunctionDeclaration: {
          lines.push(this.extractFunctionSignature(statement));
          break;
        }

        case SyntaxKind.TypeAliasDeclaration:
        case SyntaxKind.EnumDeclaration: {
          // Type aliases and enums are declarations without bodies
          lines.push(statement.getText());
          break;
        }

        case SyntaxKind.VariableStatement: {
          lines.push(this.extractVariableSignature(statement));
          break;
        }

        case SyntaxKind.ExpressionStatement: {
          // Skip bare expression statements (e.g. `defaultUser.doSomething()`)
          break;
        }

        default:
          // Unknown statement kind — include the first line as a comment
          // so the LLM knows something exists without including large blobs.
          break;
      }
    }

    return lines.join('\n').trim();
  }

  // ---- Per-declaration extractors ------------------------------------------

  private extractClassSignature(node: Node): string {
    const classDecl = node.asKindOrThrow(SyntaxKind.ClassDeclaration);
    const memberLines: string[] = [];

    for (const member of classDecl.getMembers()) {
      const memberKind = member.getKind();

      if (
        memberKind === SyntaxKind.Constructor ||
        memberKind === SyntaxKind.MethodDeclaration
      ) {
        memberLines.push('  ' + this.stripBody(member.getText()));
      } else if (
        memberKind === SyntaxKind.PropertyDeclaration ||
        memberKind === SyntaxKind.GetAccessor ||
        memberKind === SyntaxKind.SetAccessor
      ) {
        // Properties and accessors: emit declaration line only
        const text = member.getText().split('\n')[0];
        memberLines.push('  ' + (text ?? '').trim());
      }
    }

    // Class "header": everything up to the first `{`
    const classText = classDecl.getText();
    const braceIndex = classText.indexOf('{');
    const header = braceIndex !== -1 ? classText.slice(0, braceIndex).trimEnd() : classText;

    if (memberLines.length === 0) {
      return `${header} {}`;
    }
    return `${header} {\n${memberLines.join('\n')}\n}`;
  }

  private extractFunctionSignature(node: Node): string {
    const fn = node.asKindOrThrow(SyntaxKind.FunctionDeclaration);
    const fullText = fn.getText();
    return this.stripBody(fullText);
  }

  private extractVariableSignature(node: Node): string {
    const varStmt = node.asKindOrThrow(SyntaxKind.VariableStatement);
    // Include only the first line (the declaration) — the initialiser is
    // usually an implementation detail.
    return varStmt.getText().split('\n')[0] ?? varStmt.getText();
  }

  // ---- Helpers -------------------------------------------------------------

  /**
   * Strips a function/method body by replacing `{ ... }` with `;`.
   *
   * Works by locating the last `{` block in the text representation.
   */
  private stripBody(text: string): string {
    const bodyStart = text.indexOf('{');
    if (bodyStart === -1) return text.trim();

    const signature = text.slice(0, bodyStart).trimEnd();
    return `${signature};`;
  }
}
