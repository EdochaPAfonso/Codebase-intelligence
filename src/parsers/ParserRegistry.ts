import type { CodeParser } from '../core/interfaces.js';

export class ParserRegistry {
  private parsers: CodeParser[] = [];

  public register(parser: CodeParser): void {
    this.parsers.push(parser);
  }

  public getParser(language: string): CodeParser | undefined {
    return this.parsers.find(p => p.supports(language));
  }
}
