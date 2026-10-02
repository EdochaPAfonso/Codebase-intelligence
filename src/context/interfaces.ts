/**
 * Context Engine — Core Interfaces
 *
 * Defines the contracts for the Context Engine and for future AI/embedding
 * adapters. None of these interfaces are coupled to a specific LLM SDK or
 * vector-store implementation.
 *
 * Implementations of AIProvider, EmbeddingProvider and VectorStore are
 * intentionally excluded from the core library and must be provided by
 * downstream packages (e.g. `codebase-intelligence-openai`).
 */

import type { LLMContextPayload, ContextOptions } from './types.js';

// ---------------------------------------------------------------------------
// Context Engine
// ---------------------------------------------------------------------------

/**
 * The primary contract for building LLM-ready context payloads from a
 * codebase that has already been loaded and analysed.
 *
 * Consumers should obtain an instance via `codebase.context()` rather than
 * constructing one directly.
 */
export interface IContextEngine {
  /**
   * Builds a context payload centred on a specific source file.
   *
   * @param file     - Absolute or relative path to the target file.
   * @param options  - Strategy, token budget, and inclusion flags.
   */
  forFile(file: string, options?: ContextOptions): Promise<LLMContextPayload>;

  /**
   * Builds a context payload centred on a named symbol (class, function, etc.).
   * The file that declares the symbol is treated as the target.
   *
   * @param symbolName - The exact name of the symbol (e.g. `AuthService`).
   * @param options    - Strategy, token budget, and inclusion flags.
   */
  forSymbol(symbolName: string, options?: ContextOptions): Promise<LLMContextPayload>;
}

// ---------------------------------------------------------------------------
// AI Provider
// ---------------------------------------------------------------------------

/**
 * Minimal adapter contract for any text-completion LLM.
 *
 * Implementations should be thin wrappers around their respective SDKs
 * and must NOT be part of the `codebase-intelligence` core package.
 *
 * @example
 * ```ts
 * class OpenAIProvider implements AIProvider {
 *   readonly name = 'openai';
 *   async complete(prompt, systemPrompt) {
 *     const res = await openai.chat.completions.create({ ... });
 *     return res.choices[0].message.content ?? '';
 *   }
 * }
 * ```
 */
export interface AIProvider {
  /** Human-readable identifier, e.g. `'openai'`, `'ollama'`, `'anthropic'`. */
  readonly name: string;

  /**
   * Sends a prompt and returns the model's response as a plain string.
   *
   * @param prompt       - The user/human turn of the conversation.
   * @param systemPrompt - Optional system/instruction turn.
   */
  complete(prompt: string, systemPrompt?: string): Promise<string>;

  /**
   * Optional streaming variant.
   * When implemented, callers can iterate over partial response chunks.
   *
   * @param prompt       - The user/human turn of the conversation.
   * @param systemPrompt - Optional system/instruction turn.
   */
  stream?(prompt: string, systemPrompt?: string): AsyncIterable<string>;
}

// ---------------------------------------------------------------------------
// Embedding Provider
// ---------------------------------------------------------------------------

/**
 * Adapter contract for text-embedding models.
 *
 * Used by the RAG pipeline to convert `SemanticChunk` content into dense
 * vectors for similarity search.
 *
 * Implementations must NOT live in the core package.
 *
 * @example
 * ```ts
 * class OllamaEmbeddingProvider implements EmbeddingProvider {
 *   readonly dimensions = 768;
 *   async embed(texts) { ... }
 * }
 * ```
 */
export interface EmbeddingProvider {
  /** Dimensionality of the vectors produced by this provider. */
  readonly dimensions: number;

  /**
   * Converts an array of text strings into an array of embedding vectors.
   * The output array has the same length as the input.
   *
   * @param texts - Raw text strings to embed.
   * @returns     A parallel array of numeric vectors.
   */
  embed(texts: string[]): Promise<number[][]>;
}

// ---------------------------------------------------------------------------
// Vector Store
// ---------------------------------------------------------------------------

/** A single result returned by a vector similarity search. */
export interface VectorSearchResult {
  /** The ID that was passed to `upsert`. */
  id: string;
  /** Similarity score (higher = more similar; exact range is provider-specific). */
  score: number;
  /** Any metadata that was stored alongside the vector. */
  metadata: Record<string, unknown>;
}

/**
 * Adapter contract for a vector database / similarity store.
 *
 * Implementations (Qdrant, pgvector, Chroma, Pinecone, etc.) must NOT live
 * in the core package.
 *
 * @example
 * ```ts
 * class QdrantVectorStore implements VectorStore {
 *   async upsert(id, vector, metadata) { ... }
 *   async search(vector, topK) { ... }
 *   async delete(id) { ... }
 * }
 * ```
 */
export interface VectorStore {
  /**
   * Inserts or updates a vector entry.
   *
   * @param id       - Stable unique identifier for this entry (e.g. chunk ID).
   * @param vector   - Dense embedding vector.
   * @param metadata - Arbitrary key-value metadata to store alongside the vector.
   */
  upsert(id: string, vector: number[], metadata: Record<string, unknown>): Promise<void>;

  /**
   * Returns the `topK` nearest entries to the query vector.
   *
   * @param vector - Query embedding vector.
   * @param topK   - Maximum number of results to return.
   */
  search(vector: number[], topK: number): Promise<VectorSearchResult[]>;

  /**
   * Removes a single entry by ID.
   * Implementations should be idempotent (no error if the ID does not exist).
   *
   * @param id - The ID that was passed to `upsert`.
   */
  delete(id: string): Promise<void>;
}
