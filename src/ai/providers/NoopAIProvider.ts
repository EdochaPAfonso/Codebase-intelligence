import type { AIProvider } from '../../context/interfaces.js';

/**
 * A no-operation `AIProvider` that always returns an empty string.
 *
 * Useful for:
 * - Unit tests that exercise the `explain` / `ask` pipeline without
 *   making real LLM calls.
 * - Dry-run scenarios where you want to inspect the prompt that *would*
 *   be sent without incurring cost or latency.
 *
 * @example
 * ```ts
 * const result = await codebase
 *   .withAI(new NoopAIProvider())
 *   .explain('src/auth/AuthService.ts');
 * // result === ''
 * ```
 */
export class NoopAIProvider implements AIProvider {
  public readonly name = 'noop';

  public async complete(_prompt: string, _systemPrompt?: string): Promise<string> {
    return '';
  }
}
