import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import { SignatureExtractor } from '../../src/context/SignatureExtractor.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_DIR = path.resolve('tests/fixtures/context-project');
const AUTH_PATH = path.join(FIXTURE_DIR, 'AuthService.ts');
const USER_PATH = path.join(FIXTURE_DIR, 'UserService.ts');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SignatureExtractor — CE-3', () => {
  let extractor: SignatureExtractor;

  beforeEach(() => {
    extractor = new SignatureExtractor();
  });

  // ---- extractFromText (file-free) ----------------------------------------

  describe('extractFromText', () => {
    it('strips method bodies from a simple class', () => {
      const source = `
export class Greeter {
  greet(name: string): string {
    return \`Hello, \${name}!\`;
  }
}`.trim();

      const sig = extractor.extractFromText(source, 'Greeter.ts');
      expect(sig).toContain('export class Greeter');
      expect(sig).toContain('greet(name: string): string;');
      // Must NOT include the implementation body
      expect(sig).not.toContain('return');
    });

    it('preserves import declarations verbatim', () => {
      const source = `
import { Injectable } from '@nestjs/common';
import type { User } from './User.js';

export class UserService {
  async findUser(id: string): Promise<User | null> {
    return null;
  }
}`.trim();

      const sig = extractor.extractFromText(source, 'UserService.ts');
      expect(sig).toContain("import { Injectable } from '@nestjs/common'");
      expect(sig).toContain("import type { User } from './User.js'");
    });

    it('preserves interface declarations in full (no body stripping needed)', () => {
      const source = `
export interface CreateUserDto {
  name: string;
  email: string;
}`.trim();

      const sig = extractor.extractFromText(source, 'dto.ts');
      expect(sig).toContain('export interface CreateUserDto');
      expect(sig).toContain('name: string;');
      expect(sig).toContain('email: string;');
    });

    it('extracts constructor signature with typed parameters', () => {
      const source = `
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly userRepo: UserRepository,
  ) {}

  async login(email: string, password: string): Promise<string> {
    return 'token';
  }
}`.trim();

      const sig = extractor.extractFromText(source, 'AuthService.ts');
      expect(sig).toContain('constructor(');
      expect(sig).toContain('jwtService: JwtService');
      expect(sig).toContain('userRepo: UserRepository');
      // Body of login must not appear
      expect(sig).not.toContain("return 'token'");
      // But the method signature must
      expect(sig).toContain('async login(email: string, password: string): Promise<string>;');
    });

    it('extracts async method signatures with return types', () => {
      const source = `
export class UserService {
  async createUser(dto: CreateUserDto): Promise<User> {
    const user = { id: '1', ...dto };
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    // delete logic here
  }
}`.trim();

      const sig = extractor.extractFromText(source, 'UserService.ts');
      expect(sig).toContain('async createUser(dto: CreateUserDto): Promise<User>;');
      expect(sig).toContain('async deleteUser(id: string): Promise<void>;');
      expect(sig).not.toContain('delete logic');
    });

    it('extracts standalone function signatures', () => {
      const source = `
export function buildUser(name: string, email: string): CreateUserDto {
  return { name, email };
}`.trim();

      const sig = extractor.extractFromText(source, 'utils.ts');
      expect(sig).toContain(
        'export function buildUser(name: string, email: string): CreateUserDto;',
      );
      expect(sig).not.toContain('return { name, email }');
    });

    it('preserves type alias declarations', () => {
      const source = `
export type UserId = string;
export type UserRole = 'admin' | 'viewer' | 'editor';`.trim();

      const sig = extractor.extractFromText(source, 'types.ts');
      expect(sig).toContain("export type UserId = string;");
      expect(sig).toContain("export type UserRole = 'admin' | 'viewer' | 'editor';");
    });

    it('returns a non-empty string for any TypeScript file', () => {
      const source = `export const VERSION = '1.0.0';`;
      const sig = extractor.extractFromText(source, 'version.ts');
      expect(sig.trim().length).toBeGreaterThan(0);
    });

    it('handles a class with no methods gracefully', () => {
      const source = `
export class EmptyService {}`.trim();
      const sig = extractor.extractFromText(source, 'EmptyService.ts');
      expect(sig).toContain('export class EmptyService');
    });

    it('handles generic class and method signatures', () => {
      const source = `
export class Repository<T> {
  async findById(id: string): Promise<T | null> {
    return null;
  }

  async save(entity: T): Promise<T> {
    return entity;
  }
}`.trim();

      const sig = extractor.extractFromText(source, 'Repository.ts');
      expect(sig).toContain('export class Repository<T>');
      expect(sig).toContain('async findById(id: string): Promise<T | null>;');
      expect(sig).toContain('async save(entity: T): Promise<T>;');
    });
  });

  // ---- extract (from disk) ------------------------------------------------

  describe('extract (from disk)', () => {
    it('extracts AuthService signature from disk fixture', () => {
      const sig = extractor.extract(AUTH_PATH);
      expect(sig).toContain('export class AuthService');
      // Method signatures must be present
      expect(sig).toContain('async validate(email: string): Promise<boolean>;');
      expect(sig).toContain('async generateToken(userId: string): Promise<string>;');
      // Bodies must not be present
      expect(sig).not.toContain("return email.includes('@')");
      expect(sig).not.toContain('return `token-');
    });

    it('extracts UserService signature from disk fixture', () => {
      const sig = extractor.extract(USER_PATH);
      // Imports preserved
      expect(sig).toContain("import { AuthService }");
      expect(sig).toContain("import { PrismaService }");
      // Interface in full
      expect(sig).toContain('export interface CreateUserDto');
      expect(sig).toContain('export interface User');
      // Class with method signatures
      expect(sig).toContain('export class UserService');
      expect(sig).toContain('async createUser(dto: CreateUserDto): Promise<User>;');
      expect(sig).toContain('async findUser(id: string): Promise<User | null>;');
      expect(sig).toContain('async deleteUser(id: string): Promise<void>;');
      // Implementations must not bleed through
      expect(sig).not.toContain("throw new Error('Invalid credentials')");
    });

    it('extracts constructor parameters from disk fixture', () => {
      const sig = extractor.extract(USER_PATH);
      expect(sig).toContain('constructor(');
      expect(sig).toContain('auth: AuthService');
      expect(sig).toContain('prisma: PrismaService');
    });
  });
});
