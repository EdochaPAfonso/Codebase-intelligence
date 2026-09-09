import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { TypeScriptParser } from '../../src/parsers/typescript/TypeScriptParser.js';

describe('TypeScriptParser', () => {
  const parser = new TypeScriptParser();

  it('should parse AuthService correctly', async () => {
    const filePath = path.resolve(__dirname, '../fixtures/parser-project/AuthService.ts');
    const result = await parser.parse(filePath);

    expect(result.symbols.length).toBeGreaterThan(0);
    
    const classSymbol = result.symbols.find(s => s.name === 'AuthService' && s.kind === 'class');
    expect(classSymbol).toBeDefined();

    const methodSymbol = result.symbols.find(s => s.name === 'login' && s.kind === 'method');
    expect(methodSymbol).toBeDefined();
    expect(methodSymbol?.parentId).toBe(classSymbol?.id);
  });

  it('should parse UserService and its dependencies correctly', async () => {
    const filePath = path.resolve(__dirname, '../fixtures/parser-project/UserService.ts');
    const result = await parser.parse(filePath);

    // Symbols check
    const interfaceSymbol = result.symbols.find(s => s.name === 'IUser' && s.kind === 'interface');
    expect(interfaceSymbol).toBeDefined();

    const classSymbol = result.symbols.find(s => s.name === 'UserService' && s.kind === 'class');
    expect(classSymbol).toBeDefined();

    const methodSymbol = result.symbols.find(s => s.name === 'getUser' && s.kind === 'method');
    expect(methodSymbol).toBeDefined();

    const variableSymbol = result.symbols.find(s => s.name === 'defaultUser' && s.kind === 'variable');
    expect(variableSymbol).toBeDefined();

    // Dependencies check
    const importDep = result.dependencies.find(d => d.type === 'import');
    expect(importDep).toBeDefined();
    expect(importDep?.target).toContain('AuthService'); // Should resolve path roughly

    const implementsDep = result.dependencies.find(d => d.type === 'implements');
    expect(implementsDep).toBeDefined();
    expect(implementsDep?.target).toBe('IUser');
  });
});
