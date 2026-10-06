# CONTEXT-ENGINE.md — Plano de Implementação

Este documento é o guia de implementação faseado do **Context Engine** — a ponte entre o conhecimento estruturado determinístico (Camadas Discovery → Graph) e os modelos probabilísticos (LLMs).

**Missão**: Dado um alvo (arquivo ou símbolo), determinar exactamente o que um LLM precisa de saber para responder com precisão, usando o mínimo de tokens necessários.

---

## Estado Actual

```text
CE-1  ✅  Tipos & Contratos
CE-2  ✅  FileContextBuilder + ContextEngine
CE-3  ⬜  Estratégias Formais (Shallow / Signature / Deep via ts-morph)
CE-4  ⬜  AI Provider Interface (explain, ask)
CE-5  ⬜  Semantic Chunker
CE-6  ⬜  EmbeddingProvider + VectorStore Abstractions
CE-7  ⬜  Integração, CLI & Testes E2E
```

---

## Mapa de Dependências

```text
CE-1 (tipos)
   └── CE-2 (builder + engine)
           ├── CE-3 (estratégias AST)
           │       └── CE-4 (AI Provider)
           └── CE-5 (chunker)
                   └── CE-6 (RAG abstractions)

CE-4 + CE-6 → CE-7 (CLI + integração E2E)
```

---

## ✅ FASE CE-1 — Tipos & Contratos

**Objectivo**: Definir os tipos públicos do Context Engine sem escrever lógica. Permite que as fases seguintes sejam implementadas sem retrabalho de API.

**Commit**: `feat(context): CE-1 - add Context Engine public types and contracts`

### Ficheiros criados

```text
src/context/
├── types.ts        ← tipos públicos do Context Engine
└── interfaces.ts   ← contratos (AIProvider, EmbeddingProvider, VectorStore)
```

### Ficheiros modificados

```text
src/index.ts        ← 14 novos exports públicos
```

### Tipos implementados

```ts
type ContextNodeKind = 'file' | 'class' | 'function' | 'symbol' | 'signature';

interface ContextNode {
  id: string;           // '<relativePath>:<startLine>-<endLine>'
  file: string;
  relativePath: string;
  content: string;
  kind: ContextNodeKind;
  startLine: number;
  endLine: number;
  symbolName?: string;
  symbolKind?: SymbolKind;
  parentId?: string;
}

type ContextStrategy = 'shallow' | 'signature' | 'deep';

interface ContextOptions {
  strategy?: ContextStrategy;     // default: 'signature'
  maxTokens?: number;             // default: 8000
  includeTests?: boolean;         // default: false
  includeDependents?: boolean;    // default: false
}

interface LLMContextPayload {
  target: string;
  strategy: ContextStrategy;
  nodes: ContextNode[];
  totalTokenEstimate: number;     // Math.ceil(totalChars / 4)
  metadata: ContextPayloadMetadata;
}
```

### Interfaces implementadas

```ts
interface IContextEngine {
  forFile(file: string, options?: ContextOptions): Promise<LLMContextPayload>;
  forSymbol(symbolName: string, options?: ContextOptions): Promise<LLMContextPayload>;
}

interface AIProvider {
  readonly name: string;
  complete(prompt: string, systemPrompt?: string): Promise<string>;
  stream?(prompt: string, systemPrompt?: string): AsyncIterable<string>;
}

interface EmbeddingProvider {
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

interface VectorStore {
  upsert(id: string, vector: number[], metadata: Record<string, unknown>): Promise<void>;
  search(vector: number[], topK: number): Promise<VectorSearchResult[]>;
  delete(id: string): Promise<void>;
}
```

### Decisões de design

- `ContextStrategy` é um union literal, não enum — melhor tree-shaking e inferência.
- `totalTokenEstimate` usa `chars / 4` — evita dependência de `tiktoken` no core.
- `AIProvider.stream()` é opcional — implementações simples não precisam suportá-lo.
- `VectorStore.delete()` deve ser idempotente — sem erro se o ID não existir.

### Critérios de done

- [x] `npm run typecheck` sem erros
- [x] Nenhuma lógica de negócio, apenas tipos e contratos
- [x] Nenhum SDK de IA instalado

---

## ✅ FASE CE-2 — FileContextBuilder + ContextEngine

**Objectivo**: Implementar a lógica central de construção de `LLMContextPayload`. Entregar `codebase.context().forFile(file)` funcional com as três estratégias base.

**Commit**: `feat(context): CE-2 - implement FileContextBuilder and ContextEngine`

### Ficheiros criados

```text
src/context/
├── FileContextBuilder.ts   ← lê ficheiros e constrói ContextNodes
└── ContextEngine.ts        ← IContextEngine implementation

tests/context/
└── ContextEngine.test.ts   ← 16 testes
```

### Ficheiros modificados

```text
src/core/Codebase.ts   ← novo método codebase.context()
src/index.ts           ← exporta ContextEngine como classe pública
```

### API entregue

```ts
const codebase = await Codebase.load('./meu-projeto');
await codebase.analyze();

const payload = await codebase.context().forFile('src/auth/AuthService.ts', {
  strategy: 'signature',
  maxTokens: 8000,
});

payload.nodes;              // ContextNode[] ordenados: target primeiro
payload.totalTokenEstimate; // estimativa de tokens
payload.metadata;           // directDependencies, directDependents, relatedTests
```

### Estratégias implementadas

| Estratégia | Arquivo alvo | Deps incluídas | Tokens |
|---|---|---|---|
| `shallow` | conteúdo completo | nenhuma | baixo |
| `signature` | conteúdo completo | imports + linhas de declaração | médio |
| `deep` | conteúdo completo | conteúdo completo | alto |

### Comportamentos garantidos

- O arquivo alvo **nunca** é truncado, mesmo com `maxTokens` muito baixo.
- Nodes são descartados do fim (menor prioridade) quando o budget é excedido.
- Aceita paths absolutos e relativos à raiz da codebase.
- `forSymbol(name)` resolve o ficheiro do símbolo via `SymbolIndex`.
- Erros são descritivos: `"file X not in index"`, `"symbol Y not found"`.

### Testes

- [x] 16/16 testes a passar
- [x] 86/86 testes totais (zero regressões)
- [x] Cobertura: 3 estratégias, `forSymbol`, paths relativos, erros, budget

---

## ⬜ FASE CE-3 — Estratégias Formais via ts-morph

**Objectivo**: Extrair assinaturas reais de código (declaração completa sem corpo de implementação) usando `ts-morph`, não apenas linhas de declaração. Separar cada estratégia numa classe dedicada.

### Problema que resolve

A estratégia `signature` actual usa linhas de declaração do `SymbolIndex`. Isso produz apenas a linha da keyword (`export class AuthService {`). A versão correcta deve produzir:

```ts
// Input completo:
export class UserService {
  private prisma: PrismaService;
  constructor(private auth: AuthService) {}
  async createUser(dto: CreateUserDto): Promise<User> {
    // ... 50 linhas de lógica
  }
}

// Output da estratégia 'signature':
export class UserService {
  constructor(private auth: AuthService);
  async createUser(dto: CreateUserDto): Promise<User>;
}
```

Isso preserva tipos, parâmetros e return types sem expor implementação.

### Ficheiros a criar

```text
src/context/
├── strategies/
│   ├── ShallowStrategy.ts      ← conteúdo completo, sem deps
│   ├── SignatureStrategy.ts    ← declarações via ts-morph (sem corpo)
│   └── DeepStrategy.ts        ← conteúdo completo, com deps completas
└── SignatureExtractor.ts       ← extracção de assinaturas (reutilizável)
```

### Interface das estratégias

```ts
interface ContextBuildStrategy {
  buildNodes(
    targetFile: CodebaseFile,
    dependencyFiles: CodebaseFile[],
    symbolIndex: SymbolIndex,
    codebaseRoot: string,
  ): Promise<ContextNode[]>;
}
```

### `SignatureExtractor` — API esperada

```ts
// De um ficheiro TypeScript, extrai apenas as assinaturas:
const extractor = new SignatureExtractor();
const signatures = extractor.extract('src/auth/UserService.ts');
// → "export class UserService {\n  constructor(...);\n  async createUser(...);\n}"
```

### Critérios de done

- [ ] `SignatureStrategy` usa `ts-morph`, não regex nem `slice` de linhas
- [ ] Assinaturas incluem parâmetros tipados e return types
- [ ] `maxTokens` é respeitado por cada estratégia
- [ ] Testes para cada estratégia com fixtures TypeScript
- [ ] `ContextEngine.buildNode()` é refactorado para delegar às estratégias
- [ ] `tsc --noEmit` sem erros
- [ ] Todos os testes existentes continuam a passar

---

## ⬜ FASE CE-4 — AI Provider Interface

**Objectivo**: Criar a interface `AIProvider`, uma implementação stub para testes, e expor `codebase.withAI(provider)` para as APIs de alto nível `explain` e `ask`.

### Ficheiros a criar

```text
src/ai/
├── providers/
│   └── NoopAIProvider.ts      ← stub para testes (devolve string vazia)
├── CodebaseWithAI.ts          ← compõe Codebase + AIProvider
└── index.ts                   ← re-exporta contratos
```

### API entregue

```ts
// O utilizador injeta o seu provider externo:
class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  async complete(prompt: string): Promise<string> { ... }
}

const result = await codebase
  .withAI(new OpenAIProvider())
  .explain('src/auth/AuthService.ts', { strategy: 'signature' });

const answer = await codebase
  .withAI(new OpenAIProvider())
  .ask('Como funciona a autenticação deste projecto?');
```

### Lógica de `explain`

1. `codebase.context().forFile(file, options)` → `LLMContextPayload`
2. Formatar `payload.nodes` como Markdown estruturado (um bloco de código por node)
3. Construir system prompt com contexto do projecto (`projectInfo`)
4. `provider.complete(prompt, systemPrompt)` → resposta em texto

### Lógica de `ask`

1. Busca léxica com `codebase.search(question)` para identificar ficheiros relevantes
2. Constrói payload de contexto para os top N resultados
3. Formula a pergunta como prompt com o contexto anexado
4. `provider.complete(prompt, systemPrompt)` → resposta

### Critérios de done

- [ ] `NoopAIProvider` implementa `AIProvider` e devolve string vazia
- [ ] `explain` funciona com `NoopAIProvider` nos testes
- [ ] `AIProvider` exportado na API pública
- [ ] Nenhum SDK de LLM adicionado como dependência
- [ ] `tsc --noEmit` sem erros

---

## ⬜ FASE CE-5 — Semantic Chunker

**Objectivo**: Dividir ficheiros em chunks semânticos (baseados em AST, não em caracteres) para uso em pipelines de RAG e embeddings futuros.

### Problema que resolve

RAG pipelines convencionais dividem código por número fixo de tokens, cortando funções e classes a meio. O `SemanticChunker` usa a AST do `ts-morph` para garantir que cada chunk é uma unidade semântica completa.

### Ficheiros a criar

```text
src/context/
└── SemanticChunker.ts
```

### API esperada

```ts
interface SemanticChunk {
  id: string;
  file: string;
  content: string;
  symbolKind: SymbolKind | 'file';
  symbolName?: string;
  startLine: number;
  endLine: number;
  tokenEstimate: number;
}

interface ChunkerOptions {
  maxChunkTokens?: number;       // default: 512
  includeFileHeader?: boolean;   // default: true (imports + comentários topo)
}

class SemanticChunker {
  async chunk(files: CodebaseFile[], options?: ChunkerOptions): Promise<SemanticChunk[]>;
}
```

### Integração em `Codebase`

```ts
// Novo método público:
public async chunks(options?: ChunkerOptions): Promise<SemanticChunk[]>;
```

### Regras de chunking

- Dividir por símbolos top-level (classes, funções exportadas)
- Se um símbolo for maior que `maxChunkTokens`, subdividir pelos seus métodos
- Cada chunk inclui o cabeçalho do ficheiro (imports) para contexto
- Nunca cortar uma declaração a meio

### Critérios de done

- [ ] Nenhum chunk cruza uma barreira de declaração de função/classe
- [ ] Chunks grandes são subdivididos por métodos
- [ ] `codebase.chunks()` funciona após `codebase.analyze()`
- [ ] `SemanticChunk` exportado na API pública
- [ ] Testes com fixtures TypeScript
- [ ] `tsc --noEmit` sem erros

---

## ⬜ FASE CE-6 — EmbeddingProvider + VectorStore Abstractions

**Objectivo**: Criar o `RAGPipeline` que orquestra chunks → embeddings → vector store. Nenhum SDK externo é instalado — o utilizador fornece as implementações concretas.

### Ficheiros a criar

```text
src/ai/
├── EmbeddingProvider.ts   ← re-exporta interface de context/interfaces.ts
├── VectorStore.ts         ← re-exporta interface de context/interfaces.ts
└── RAGPipeline.ts         ← orquestra o pipeline completo
```

### API esperada

```ts
interface RAGPipelineOptions {
  chunker: SemanticChunker;
  embedder: EmbeddingProvider;
  store: VectorStore;
}

class RAGPipeline {
  constructor(options: RAGPipelineOptions);

  // Indexa a codebase completa: chunks → embeddings → vector store
  async index(codebase: Codebase): Promise<void>;

  // Busca semântica por texto livre
  async search(query: string, topK?: number): Promise<SemanticChunk[]>;
}
```

### Exemplo de uso (utilizador final)

```ts
// As implementações concretas vivem em pacotes externos:
// npm install codebase-intelligence-ollama
// npm install codebase-intelligence-qdrant

const pipeline = new RAGPipeline({
  chunker: new SemanticChunker(),
  embedder: new OllamaEmbeddingProvider({ model: 'nomic-embed-text' }),
  store: new QdrantVectorStore({ url: 'http://localhost:6333' }),
});

await pipeline.index(codebase);

const results = await pipeline.search('como funciona a autenticação?');
```

### Critérios de done

- [ ] `RAGPipeline` funciona com stubs/mocks nos testes
- [ ] Nenhuma dependência de vector store ou embedding no core
- [ ] Interfaces exportadas na API pública
- [ ] `tsc --noEmit` sem erros

---

## ⬜ FASE CE-7 — Integração, CLI & Testes E2E

**Objectivo**: Expor todas as novas funcionalidades na CLI e garantir testes de integração end-to-end com o projecto `examples/`.

### Novos comandos CLI

```bash
# Gera o contexto para um arquivo (Markdown, pronto para colar num LLM)
codebase-intelligence context src/auth/AuthService.ts --strategy signature

# Gera chunks semânticos em JSON
codebase-intelligence chunks . --max-tokens 512 --format json

# Estimativa de tokens por arquivo
codebase-intelligence tokens .
```

### API pública final (`src/index.ts`)

```ts
// CE-3
export { ShallowStrategy, SignatureStrategy, DeepStrategy } from './context/strategies/index.js';
export { SignatureExtractor } from './context/SignatureExtractor.js';

// CE-4
export { NoopAIProvider } from './ai/providers/NoopAIProvider.js';
export type { CodebaseWithAI } from './ai/CodebaseWithAI.js';

// CE-5
export { SemanticChunker } from './context/SemanticChunker.js';
export type { SemanticChunk, ChunkerOptions } from './context/SemanticChunker.js';

// CE-6
export { RAGPipeline } from './ai/RAGPipeline.js';
```

### Testes E2E (usando `examples/`)

- `context --strategy shallow` → `LLMContextPayload` com 1 node
- `context --strategy signature` → deps como assinaturas (sem corpo)
- `context --strategy deep` → deps com implementação completa
- `chunks` → nenhum chunk corta uma função a meio
- `explain` com `NoopAIProvider` → retorna string (sem erros)

### Critérios de done

- [ ] `npm run build` sem erros
- [ ] Todos os comandos CLI funcionam
- [ ] Testes E2E passam com o projecto `examples/`
- [ ] `tsc --noEmit` sem erros
- [ ] README actualizado com exemplos do Context Engine

---

## Arquitectura do Context Engine

```text
Codebase.context() → ContextEngine
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ShallowStrategy  SignatureStrategy  DeepStrategy
                              │
                       SignatureExtractor
                         (ts-morph)
                              │
                       FileContextBuilder
                              │
                    LLMContextPayload
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
       Codebase.withAI()              RAGPipeline
       CodebaseWithAI                 (CE-6)
       (explain / ask)
              │
         AIProvider
         (interface — sem SDK)
```

---

## Regras de Qualidade

As mesmas regras do `AGENTS.md` aplicam-se:

- Não usar `any` sem justificativa.
- Não usar regex para substituir AST — usar `ts-morph` quando disponível.
- Não adicionar SDKs de LLM/embeddings/vector store ao core.
- Não esconder erros — lançar erros descritivos com contexto suficiente.
- Não avançar de fase com testes quebrados.
- Não duplicar lógica — estratégias delegam ao `FileContextBuilder`.
- APIs públicas pequenas — expor apenas o que o consumidor precisa.

---

## Após Cada Fase

1. Executar `tsc --noEmit`.
2. Executar `vitest run`.
3. Corrigir erros antes de avançar.
4. Revisar ficheiros criados.
5. Fazer commit semântico.

```text
feat(context): CE-3 — implement signature extraction via ts-morph
feat(context): CE-4 — add AI provider interface and explain/ask API
feat(context): CE-5 — add semantic chunker
feat(context): CE-6 — add RAG pipeline abstractions
feat(context): CE-7 — integrate context engine into CLI
```
