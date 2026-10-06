import type { SemanticChunker, SemanticChunk } from '../context/SemanticChunker.js';
import type { EmbeddingProvider, VectorStore } from '../context/interfaces.js';
import type { Codebase } from '../core/Codebase.js';
import type { SymbolKind } from '../core/types.js';

/**
 * Options for instantiating the RAG pipeline.
 */
export interface RAGPipelineOptions {
  /** 
   * Responsible for dividing codebase files into semantically meaningful 
   * text chunks before embedding. 
   */
  chunker: SemanticChunker;
  /** 
   * Converts text chunks into dense numeric vectors.
   * This is provided by an external integration (e.g. Ollama, OpenAI).
   */
  embedder: EmbeddingProvider;
  /** 
   * Storage layer for the embeddings and chunk metadata, used for 
   * fast similarity search. Provided by an external integration (e.g. Qdrant).
   */
  store: VectorStore;
}

/**
 * Orchestrates the Retrieval-Augmented Generation (RAG) pipeline for a codebase.
 * 
 * It coordinates the extraction of semantic chunks, their conversion to 
 * embeddings, and storage in a vector database for semantic search.
 * 
 * @example
 * ```ts
 * const pipeline = new RAGPipeline({
 *   chunker: new SemanticChunker(),
 *   embedder: new OllamaEmbeddingProvider({ model: 'nomic-embed-text' }),
 *   store: new QdrantVectorStore({ url: 'http://localhost:6333' }),
 * });
 * 
 * await pipeline.index(codebase);
 * const results = await pipeline.search('authentication logic');
 * ```
 */
export class RAGPipeline {
  private chunker: SemanticChunker;
  private embedder: EmbeddingProvider;
  private store: VectorStore;

  constructor(options: RAGPipelineOptions) {
    this.chunker = options.chunker;
    this.embedder = options.embedder;
    this.store = options.store;
  }

  /**
   * Processes the entire codebase: generates semantic chunks, embeds them,
   * and upserts the vectors and metadata into the vector store.
   * 
   * @param codebase The fully analyzed codebase.
   */
  public async index(codebase: Codebase): Promise<void> {
    const chunks = await codebase.chunks();
    if (chunks.length === 0) return;

    // We may want to batch this in a real-world scenario if chunks.length is huge.
    // For now, we delegate the batching responsibility to the embedder/store adapters.
    const texts = chunks.map(chunk => chunk.content);
    const vectors = await this.embedder.embed(texts);

    if (vectors.length !== chunks.length) {
      throw new Error(
        `RAGPipeline: embedding provider returned ${vectors.length} vectors, but expected ${chunks.length}.`
      );
    }

    const promises: Promise<void>[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const vector = vectors[i]!;
      
      const metadata: Record<string, unknown> = {
        file: chunk.file,
        relativePath: chunk.relativePath,
        content: chunk.content,
        symbolKind: chunk.symbolKind,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        tokenEstimate: chunk.tokenEstimate,
      };

      if (chunk.symbolName !== undefined) {
        metadata.symbolName = chunk.symbolName;
      }

      promises.push(this.store.upsert(chunk.id, vector, metadata));
    }

    // Await all upserts to complete
    await Promise.all(promises);
  }

  /**
   * Performs a semantic search over the indexed codebase.
   * 
   * Embeds the query text and retrieves the closest matching chunks
   * from the vector store.
   * 
   * @param query The natural language search query.
   * @param topK  The maximum number of results to return. Default is 5.
   * @returns     The top matching semantic chunks.
   */
  public async search(query: string, topK: number = 5): Promise<SemanticChunk[]> {
    const queryVectors = await this.embedder.embed([query]);
    if (queryVectors.length === 0) {
      return [];
    }

    const queryVector = queryVectors[0]!;
    const results = await this.store.search(queryVector, topK);

    return results.map(result => {
      const m = result.metadata;
      const chunk: SemanticChunk = {
        id: result.id,
        file: m.file as string,
        relativePath: m.relativePath as string,
        content: m.content as string,
        symbolKind: m.symbolKind as SymbolKind | 'file',
        startLine: m.startLine as number,
        endLine: m.endLine as number,
        tokenEstimate: m.tokenEstimate as number,
      };

      if (m.symbolName !== undefined) {
        chunk.symbolName = m.symbolName as string;
      }

      return chunk;
    });
  }
}
