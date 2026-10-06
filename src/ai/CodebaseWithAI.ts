import type { AIProvider } from '../context/interfaces.js';
import type { ContextOptions, LLMContextPayload } from '../context/types.js';
import type { Codebase } from '../core/Codebase.js';
import type { SearchOptions } from '../search/CodeSearch.js';

/** Options accepted by `CodebaseWithAI.explain()`. */
export interface ExplainOptions extends ContextOptions {
  /**
   * Optional instruction appended to the system prompt.
   * Use to tailor the explanation style, e.g. `'Focus on security implications'`.
   */
  instruction?: string;
}

/** Options accepted by `CodebaseWithAI.ask()`. */
export interface AskOptions {
  /**
   * Maximum number of top search results to include as context.
   * @default 3
   */
  topK?: number;
  /**
   * Context strategy applied when building each file's payload.
   * @default 'signature'
   */
  strategy?: ContextOptions['strategy'];
  /**
   * Token budget for each individual context payload.
   * @default 4000
   */
  maxTokens?: number;
}

/**
 * Composes a `Codebase` with an `AIProvider` to expose high-level AI APIs.
 *
 * Consumers obtain an instance via `codebase.withAI(provider)`:
 * ```ts
 * const cbWithAI = codebase.withAI(new OpenAIProvider());
 *
 * const explanation = await cbWithAI.explain('src/auth/AuthService.ts');
 * const answer = await cbWithAI.ask('Como funciona a autenticação?');
 * ```
 *
 * This class is intentionally thin: it delegates context-building to the
 * `ContextEngine` and text-completion to the injected `AIProvider`.
 * No LLM SDK is imported here.
 */
export class CodebaseWithAI {
  constructor(
    private readonly codebase: Codebase,
    private readonly provider: AIProvider,
  ) {}

  // ---- Public API -------------------------------------------------------

  /**
   * Generates a natural-language explanation of the given file.
   *
   * The implementation:
   * 1. Builds an `LLMContextPayload` for the file using the specified strategy.
   * 2. Serialises the nodes as a Markdown-fenced code block per node.
   * 3. Constructs a system prompt that includes project metadata.
   * 4. Calls `provider.complete(prompt, systemPrompt)` and returns the result.
   *
   * @param file    - Absolute or codebase-relative path to the file to explain.
   * @param options - Context and explanation options.
   * @returns The provider's plain-text response, or `''` for stub providers.
   */
  public async explain(file: string, options: ExplainOptions = {}): Promise<string> {
    const payload = await this.codebase.context().forFile(file, options);
    const prompt = this.buildExplainPrompt(payload);
    const systemPrompt = this.buildSystemPrompt(options.instruction);
    return this.provider.complete(prompt, systemPrompt);
  }

  /**
   * Answers a free-text question about the codebase.
   *
   * The implementation:
   * 1. Uses `codebase.search()` to find the most relevant files.
   * 2. Builds context payloads for the top-K results.
   * 3. Concatenates the serialised nodes into a single prompt.
   * 4. Calls `provider.complete(prompt, systemPrompt)` and returns the result.
   *
   * @param question - Natural-language question about the codebase.
   * @param options  - Search and context options.
   * @returns The provider's plain-text response, or `''` for stub providers.
   */
  public async ask(question: string, options: AskOptions = {}): Promise<string> {
    const { topK = 3, strategy = 'signature', maxTokens = 4_000 } = options;

    const searchOpts: SearchOptions = { limit: topK };
    const results = this.codebase.search(question, searchOpts);

    if (results.length === 0) {
      const systemPrompt = this.buildSystemPrompt();
      return this.provider.complete(
        `Question: ${question}\n\nNo relevant files were found in the codebase.`,
        systemPrompt,
      );
    }

    const contextEngine = this.codebase.context();
    const payloads: LLMContextPayload[] = [];

    for (const result of results) {
      try {
        const payload = await contextEngine.forFile(result.file, { strategy, maxTokens });
        payloads.push(payload);
      } catch {
        // Skip files that fail context building (e.g. not in index)
      }
    }

    const prompt = this.buildAskPrompt(question, payloads);
    const systemPrompt = this.buildSystemPrompt();
    return this.provider.complete(prompt, systemPrompt);
  }

  /**
   * Exposes the prompt that `explain()` would send to the provider.
   * Useful for debugging, logging, or prompt tuning without incurring
   * LLM cost.
   */
  public async buildExplainPayload(
    file: string,
    options: ExplainOptions = {},
  ): Promise<{ prompt: string; systemPrompt: string; payload: LLMContextPayload }> {
    const payload = await this.codebase.context().forFile(file, options);
    return {
      prompt: this.buildExplainPrompt(payload),
      systemPrompt: this.buildSystemPrompt(options.instruction),
      payload,
    };
  }

  // ---- Prompt builders --------------------------------------------------

  private buildExplainPrompt(payload: LLMContextPayload): string {
    const sections: string[] = [
      `# Explain: \`${payload.target}\``,
      '',
      `**Strategy**: ${payload.strategy} | **~${payload.totalTokenEstimate} tokens**`,
      '',
    ];

    if (payload.metadata.directDependencies.length > 0) {
      sections.push(
        `**Direct dependencies**: ${payload.metadata.directDependencies.join(', ')}`,
        '',
      );
    }

    sections.push('## Source code\n');

    for (const node of payload.nodes) {
      const label =
        node.kind === 'file'
          ? `File: ${node.relativePath}`
          : `${node.kind}: ${node.symbolName ?? node.relativePath}`;
      sections.push(`### ${label}\n`);
      sections.push(`\`\`\`typescript\n${node.content}\n\`\`\`\n`);
    }

    sections.push('\n---\nPlease explain the code above clearly and concisely.');
    return sections.join('\n');
  }

  private buildAskPrompt(question: string, payloads: LLMContextPayload[]): string {
    const sections: string[] = ['# Codebase Context\n'];

    for (const payload of payloads) {
      sections.push(`## File: \`${payload.target}\`\n`);
      for (const node of payload.nodes) {
        const label =
          node.kind === 'file'
            ? node.relativePath
            : `${node.kind}: ${node.symbolName ?? node.relativePath}`;
        sections.push(`### ${label}\n`);
        sections.push(`\`\`\`typescript\n${node.content}\n\`\`\`\n`);
      }
    }

    sections.push(`\n---\n# Question\n\n${question}`);
    return sections.join('\n');
  }

  private buildSystemPrompt(extraInstruction?: string): string {
    const projectInfo = this.codebase.projectInfo();
    const parts: string[] = [
      'You are an expert software engineer analysing a codebase.',
    ];

    if (projectInfo) {
      const langs = projectInfo.languages.join(', ');
      const frameworks = projectInfo.frameworks.join(', ');
      if (langs) parts.push(`The project uses: ${langs}.`);
      if (frameworks) parts.push(`Frameworks detected: ${frameworks}.`);
    }

    parts.push(
      'Answer precisely and concisely. Cite specific symbols, files, and line references when relevant.',
    );

    if (extraInstruction) {
      parts.push(extraInstruction);
    }

    return parts.join(' ');
  }
}
