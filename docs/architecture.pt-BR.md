# Arquitetura

A visão do `codebase-intelligence` é construir uma base robusta e pronta para IA para a compreensão de bases de código. Para garantir que permaneça flexível e agnóstica, o sistema é projetado em cinco camadas distintas.

```text
                  CODEBASE
                     |
                     v
                DISCOVERY
                     |
                     v
                  PARSERS
                     |
                     v
              SYMBOL / FILE INDEX
                     |
                     v
             DEPENDENCY GRAPH
                     |
          ┌──────────┼──────────┐
          v          v          v
       SEARCH      IMPACT      FLOW
          │          │          │
          └──────────┼──────────┘
                     v
              CONTEXT ENGINE          ← Implementado ✅
             ┌───────┴────────┐
             v                v
     SemanticChunker     ContextEngine
     (chunks via AST)   (forFile/forSymbol)
             │                │
             └───────┬────────┘
                     v
               RAG PIPELINE           ← Interfaces implementadas ✅
              (EmbeddingProvider +
               VectorStore + RAGPipeline)
                     |
          ┌──────────┴──────────┐
          v                     v
      AI ADAPTER          [ADAPTADORES
    (AIProvider +          CONCRETOS]       ← Pacotes futuros
     NoopAIProvider)       (OpenAI, Ollama,
                            Qdrant, Chroma)
                     |
                     v
              [INTELLIGENCE]               ← Futuro
```

*(Nota: As camadas marcadas como `[Pacotes futuros]` serão publicadas separadamente para não inflar as dependências do core, ex: `@codebase-intelligence/openai`. Todas as interfaces e contratos já estão definidos e estáveis no core.)*

---

## 1. Camada de Descoberta (Discovery Layer)
**Objetivo**: Compreender os limites físicos e o ambiente do projeto.
- **FileScanner**: Percorre o sistema de arquivos com base em regras e listas de exclusão.
- **ProjectDetector**: Inspeciona `package.json`, `tsconfig.json`, etc., para identificar as linguagens ativas, frameworks (por exemplo, React, Next.js) e gerenciadores de pacotes.

## 2. Camada de Análise (Analysis Layer)
**Objetivo**: Extrair o significado semântico de arquivos de texto bruto sem recorrer a regex frágeis.
- **Interface CodeParser**: Um contrato padrão para ler um arquivo e gerar `CodeSymbol`s e `CodeDependency`s.
- **TypeScriptParser**: Utiliza o `ts-morph` para gerar uma Árvore de Sintaxe Abstrata (AST), extraindo com precisão classes, interfaces e variáveis em nível de módulo, junto com números de linha exatos e relações pai-filho.

## 3. Camada de Conhecimento (Knowledge Layer)
**Objetivo**: Armazenar as informações extraídas em estruturas de memória otimizadas para consulta.
- **FileIndex & SymbolIndex**: Tabelas de consulta rápidas, com complexidade O(1) ou O(N), para arquivos e símbolos de código. Completamente desacopladas das implementações dos parsers.
- **DependencyGraph**: Um grafo genérico e direcionado que mapeia relações (imports, extends, implements) entre IDs.
- **Analisadores (Impact & Dependency)**: Wrappers em torno do grafo que respondem a perguntas complexas (por exemplo, "Qual é o impacto transitivo de alterar este arquivo?").

## 4. Camada do Context Engine ✅ Implementado
**Objetivo**: Transformar os dados brutos da Camada de Conhecimento em payloads de contexto estruturados, com orçamento de tokens, adequados para LLMs e pipelines de RAG.

### Estratégias de Contexto
Três estratégias estão disponíveis via `codebase.context().forFile(path, { strategy })`:

| Estratégia | Comportamento | Custo em Tokens |
|---|---|---|
| `shallow` | Apenas o arquivo alvo, com o código-fonte completo | Baixo |
| `signature` | Arquivo alvo + assinaturas AST de todas as dependências (sem corpos de função) | Médio |
| `deep` | Arquivo alvo + código-fonte completo de todas as dependências | Alto |

### Componentes
- **`ContextEngine`**: Constrói objetos `LLMContextPayload` — bundles de contexto com orçamento de tokens e consciência de dependências. Expõe `forFile()` e `forSymbol()`.
- **`FileContextBuilder`**: Lê e estrutura o conteúdo de arquivos individuais como `ContextNode`s com estimativas de tokens.
- **`SignatureExtractor`**: Usa a AST do `ts-morph` para remover corpos de funções e manter apenas assinaturas de tipo — reduz o uso de tokens em 60–80% para contexto de dependências.
- **`ShallowStrategy` / `SignatureStrategy` / `DeepStrategy`**: Padrão de estratégia plugável. Novas estratégias podem ser adicionadas sem alterar o engine.
- **`SemanticChunker`**: Divide arquivos em chunks semanticamente completos (nunca corta declarações ao meio). Classes muito grandes são divididas por método. Usado para alimentar o pipeline de RAG.

### Pontos de Entrada da API
```ts
// Via Codebase (recomendado):
const payload = await codebase.context().forFile('src/auth/AuthService.ts', { strategy: 'signature' });
const chunks  = await codebase.chunks({ maxChunkTokens: 512 });

// Via CLI:
codebase-intelligence context src/auth/AuthService.ts --strategy signature
codebase-intelligence chunks . --max-tokens 512
codebase-intelligence tokens .
```

## 5. Camada de Inteligência — Interfaces Implementadas ✅, Adaptadores São Externos
**Objetivo**: Combinar os dados estruturados determinísticos (Camada de Conhecimento + Context Engine) com modelos probabilísticos (IA).

O core da biblioteca define todos os contratos mas não inclui **nenhum** SDK de LLM ou de banco de dados vetorial. Isso mantém a biblioteca leve e evita dependência de fornecedores.

### Interfaces (em `src/context/interfaces.ts`)
- **`AIProvider`**: `complete(prompt, systemPrompt?) → Promise<string>` e `stream()` opcional. Implementada por pacotes externos (OpenAI, Anthropic, Ollama, etc.).
- **`EmbeddingProvider`**: `embed(texts: string[]) → Promise<number[][]>`. Produz vetores densos para busca por similaridade.
- **`VectorStore`**: `upsert / search / delete`. Abstrai Qdrant, pgvector, Chroma, Pinecone, etc.

### Implementado no Core
- **`NoopAIProvider`**: Um stub seguro que retorna `''`. Usado em testes e dry-runs.
- **`CodebaseWithAI`**: Compõe `Codebase` com um `AIProvider`. Expõe `explain(file)`, `ask(question)` e `buildExplainPayload(file)` (dry-run, sem chamada ao LLM).
- **`RAGPipeline`**: Orquestra o pipeline completo `codebase.chunks() → EmbeddingProvider → VectorStore`. Pronto para ser conectado a adaptadores reais.

### Ponto de Entrada
```ts
const cbWithAI = codebase.withAI(new OpenAIProvider()); // pacote externo
await cbWithAI.explain('src/auth/AuthService.ts');
await cbWithAI.ask('Como funciona a autenticação?');

const pipeline = new RAGPipeline({ chunker, embedder, store });
await pipeline.index(codebase);
const results = await pipeline.search('fluxo de login');
```

### Futuro: Pacotes de Adaptadores Concretos
Serão publicados separadamente para não poluir a árvore de dependências do core:

| Pacote | Implementa |
|---|---|
| `@codebase-intelligence/openai` | `AIProvider` + `EmbeddingProvider` |
| `@codebase-intelligence/ollama` | `AIProvider` + `EmbeddingProvider` |
| `@codebase-intelligence/qdrant` | `VectorStore` |
| `@codebase-intelligence/chroma` | `VectorStore` |

---

Ao manter a Camada de Conhecimento e o Context Engine desconectados de implementações concretas de fornecedores de IA, o `codebase-intelligence` pode ser usado como uma ferramenta de análise rápida e standalone *ou* escalado para se tornar um poderoso backend de IA agêntica — sem nenhuma mudança arquitetural necessária.
