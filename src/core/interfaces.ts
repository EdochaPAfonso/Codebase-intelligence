import type { ParsedFile } from './types.js';

export interface CodeParser {
  supports(language: string): boolean;
  parse(file: string): Promise<ParsedFile>;
}
