# Codebase Intelligence

**Codebase Intelligence** é uma biblioteca Node.js de nível profissional, projetada para analisar, indexar e compreender bases de código (codebases) de forma programática. Ela escaneia arquivos, constrói grafos de dependência e indexa símbolos (como classes, funções e interfaces) diretamente a partir da AST.

## O Problema que Resolve

Aplicações modernas são complexas. Quando desenvolvedores (ou agentes de IA) precisam entender como as partes do código se encaixam, a busca textual simples (como `grep`) não é suficiente. Encontrar exatamente onde uma classe é usada, entender o impacto de modificar um arquivo específico, ou rastrear dependências transitivas geralmente exige trabalho manual ou uma IDE pesada.

O Codebase Intelligence funciona como um "Grafo de Conhecimento" fundamental para o seu código. Ele fornece insights estruturados sobre sua base de código, servindo como a espinha dorsal perfeita para ferramentas de desenvolvimento assistido por IA, geração de código, pipelines de RAG e sistemas automatizados de revisão de código.

## Funcionalidades

- **Descoberta de Projeto**: Detecta automaticamente linguagens do projeto, frameworks (React, Next.js, etc.) e gerenciadores de pacotes.
- **Análise via AST**: Utiliza o `ts-morph` para uma análise robusta e livre de regex de TypeScript/JavaScript, extraindo classes, funções, métodos e variáveis.
- **Indexação de Símbolos**: Consulte instantaneamente sua base de código por símbolos, seja por nome, tipo ou arquivo.
- **Grafo de Dependências**: Constrói um grafo direcionado de imports, `extends` e `implements`.
- **Busca de Código**: Busca léxica e estrutural em arquivos e símbolos.
- **Análise de Impacto**: Entenda as consequências diretas e indiretas de modificar qualquer arquivo, incluindo arquivos de teste relacionados.
- **Análise de Impacto de Diferenças (Diff Impact)**: Dado um conjunto de alterações no Git (um branch, arquivos em stage, edições não commitadas), descubra *"o que este conjunto de mudanças afeta?"* — de forma conservadora, na granularidade do arquivo, sem inventar relações.
- **Context Engine**: Crie payloads de contexto prontos para LLMs, com controle de tokens, usando três estratégias (shallow, signature, deep).
- **CLI Incluída**: Execute análises e consultas diretamente pelo terminal.

---

## Instalação

```bash
npm install codebase-intelligence
```

*(Nota: Atualmente em fase de MVP. Certifique-se de que seu projeto tenha o TypeScript configurado para uso adequado).*

## Início Rápido

Você pode usar a biblioteca de forma programática em seus próprios scripts:

```typescript
import { Codebase } from 'codebase-intelligence';

async function run() {
  // 1. Carrega a base de código (escaneia arquivos e detecta informações do projeto)
  const codebase = await Codebase.load('./src');

  // 2. Analisa a AST e constrói o grafo de dependências
  await codebase.analyze();

  // 3. Consulta os dados
  console.log('Total de arquivos:', codebase.files().length);
  
  // Busca por uma classe ou função específica
  const searchResults = codebase.search('AuthService');
  console.log('Resultados da busca:', searchResults);

  // Verifica o impacto de uma alteração em um arquivo
  const impact = codebase.impact('src/auth/AuthService.ts');
  console.log('Arquivos que dependem diretamente deste:', impact.direct);
  console.log('Arquivos que dependem indiretamente deste:', impact.indirect);
}

run();
```

---

## Referência da API Pública

### `Codebase.load(path: string, options?: CodebaseOptions): Promise<Codebase>`
Inicializa a instância, escaneando o diretório informado. `options.ignore` aceita um array de padrões glob para excluir arquivos.

### `codebase.analyze(): Promise<void>`
Analisa os arquivos descobertos e popula o Índice de Símbolos e o Grafo de Dependências internos. Deve ser chamado antes de consultar símbolos ou dependências.

### `codebase.files(): CodebaseFile[]`
Retorna todos os arquivos indexados do projeto.

### `codebase.symbols(): CodeSymbol[]`
Retorna todos os símbolos extraídos (classes, funções, interfaces, etc.) do projeto.

### `codebase.search(query: string, options?: SearchOptions): SearchResult[]`
Realiza uma busca léxica/estrutural por arquivos e símbolos que correspondam à consulta.

### `codebase.dependencies(file: string): string[]`
Retorna os arquivos dos quais o arquivo informado depende diretamente (imports).

### `codebase.dependents(file: string): string[]`
Retorna os arquivos que dependem diretamente do arquivo informado.

### `codebase.impact(file: string): ImpactResult`
Retorna `{ direct: string[], indirect: string[], tests: string[] }`, revelando o raio de impacto completo de uma alteração no arquivo informado.

### `codebase.impactOfFiles(paths: string[]): ChangeSetImpact`
Análise de impacto pura e síncrona sem consultar o Git. Trata todos os caminhos relativos fornecidos como `modificados` e resolve as suas dependências através do grafo.

```typescript
// O que é afetado se alterar utils.ts?
const impact = codebase.impactOfFiles(['src/utils.ts']);
console.log(impact.direct);          // importadores diretos
console.log(impact.indirect);        // dependentes transitivos
console.log(impact.tests);           // arquivos de teste (por convenção)
console.log(impact.globalChanges);   // arquivos globais (afetam tudo)
console.log(impact.unanalyzable);    // arquivos não indexados e porquê
```

### `codebase.impactOfChanges(options?, provider?): Promise<ChangeSetImpact>`
Consulta um `ChangeSetProvider` (Git por defeito) para determinar quais os arquivos alterados, mapeando-os para um `ChangeSetImpact`.

```typescript
// Alterações introduzidas pela branch atual vs main:
const impact = await codebase.impactOfChanges({ since: 'main' });

// Apenas arquivos em stage:
const staged = await codebase.impactOfChanges({ staged: true });

// Todas as alterações não commitadas (incluindo arquivos untracked):
const uncommitted = await codebase.impactOfChanges();

// Provider personalizado (ex: API de PR do GitHub, mock de teste):
const impact = await codebase.impactOfChanges({}, meuProvider);
```

**Formato de `ChangeSetImpact`:**
```typescript
{
  changed: FileChange[];               // lista bruta do provider
  direct: string[];                    // arquivos que importam um arquivo alterado
  indirect: string[];                  // dependentes transitivos (excluindo direct)
  tests: string[];                     // arquivos de teste por convenção de nomes
  globalChanges: string[];             // ex: package.json, tsconfig.json
  unanalyzable: { path, reason }[];    // arquivos não rastreáveis
  unresolvedDependencies: string[];    // imports impossíveis de resolver
  metadata: { granularity: 'file'; base?: string; head?: string };
}
```

> ⚠️ **Nota sobre granularidade**: a análise opera na **granularidade de arquivo**. Uma alteração de uma linha marca *todos* os dependentes desse arquivo como potencialmente afetados. O resultado é um limite superior conservador.

---

## Referência da CLI

O Codebase Intelligence vem com uma CLI para uso no terminal:

```bash
# Analisa o diretório atual e exibe um resumo
npx codebase-intelligence analyze .

# Busca por um símbolo específico
npx codebase-intelligence search "UserService" .

# Exibe as dependências de um arquivo
npx codebase-intelligence dependencies "src/auth/AuthService.ts" .

# Exibe o que depende de um arquivo
npx codebase-intelligence dependents "src/auth/AuthService.ts" .

# ── Análise de Impacto ──────────────────────────────────────────────────

# Modo de arquivo clássico: impacto de um único arquivo
npx codebase-intelligence impact src/auth/AuthService.ts .

# Modo Diff: o que afetam as mudanças desde a branch main? (comparação merge-base)
npx codebase-intelligence impact . --since main

# Modo Diff: apenas arquivos em stage
npx codebase-intelligence impact . --staged

# Modo Diff: todas as alterações não commitadas + arquivos untracked
npx codebase-intelligence impact . --uncommitted

# Saída em JSON (limpo em stdout, ideal para scripts)
npx codebase-intelligence impact . --since main --format json

# Imprime apenas caminhos de testes relacionados — útil em CI
npx codebase-intelligence impact . --since main --tests-only

# ── Context Engine & Chunking ────────────────────────────────────────────

# Gera um payload de contexto pronto para LLMs para um arquivo (incluindo dependências)
npx codebase-intelligence context "src/auth/AuthService.ts" --strategy signature .

# Gera chunks semânticos para a base de código
npx codebase-intelligence chunks . --max-tokens 512

# Estima o uso de tokens de toda a base de código
npx codebase-intelligence tokens .
```

---

## Visão Geral da Arquitetura

O Codebase Intelligence é projetado em camadas modulares para permitir extensibilidade futura (por exemplo, adicionar parsers de C# ou Python):

1. **Camada de Descoberta**: Responsável por encontrar arquivos (`FileScanner`) e detectar propriedades do projeto (`ProjectDetector`).
2. **Camada de Análise**: Contém os parsers (`TypeScriptParser`) que transformam código bruto em objetos estruturados `CodeSymbol` e `CodeDependency`.
3. **Camada de Conhecimento**: Indexa os dados para recuperação rápida (`SymbolIndex`, `FileIndex`, `DependencyGraph`).

Para detalhes arquiteturais mais profundos, veja [docs/architecture.md](docs/architecture.md).

---

## Roadmap

A versão atual estabelece a análise estrutural determinística de uma base de código, inclui o **Context Engine** para chunking semântico e pipelines de RAG, e agora inclui **Análise de Impacto de Diferenças (Diff Impact)** para as alterações no Git. Versões futuras irão introduzir:

- **Adaptadores de IA**: Implementações concretas para conectar LLMs externos (OpenAI, Anthropic, Gemini, Ollama) e Vector Stores (Qdrant, Chroma).
- **Suporte Multi-linguagem**: Expansão do `ParserRegistry` para suportar Python, Go e C#.
- **Granularidade a nível de Símbolo**: Reduzindo a análise de impacto ao nível do arquivo para os símbolos especificamente alterados.
- **Indexação Incremental**: Evita a re-análise completa a cada execução detetando arquivos alterados da cache.

---

## Contribuindo

Contribuições são bem-vindas. Por favor, certifique-se de que você:
1. Discuta mudanças arquiteturais importantes em uma issue primeiro.
2. Garanta que todos os testes passem (`npm run test:run`).
3. Garanta que não haja erros de tipo (`npm run typecheck`).
4. Evite introduzir dependências desnecessárias. A biblioteca principal busca permanecer leve.

## Licença

Licença ISC. Veja o arquivo `LICENSE` para mais detalhes.