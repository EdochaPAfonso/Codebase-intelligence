# AGENTS.md — Codebase Intelligence

Você é o arquiteto principal e engenheiro responsável por construir um projeto chamado:

**CODEBASE INTELLIGENCE**

Sua missão é iniciar o projeto do zero, definir uma arquitetura profissional e implementar progressivamente um pacote npm capaz de analisar e compreender codebases.

**IMPORTANTE:**
- Não trate este projeto como um simples script.
- O objetivo final é criar uma biblioteca npm reutilizável, extensível, testável e profissional.
- O projeto deve funcionar inicialmente **sem IA**.
- Não adicionar Ollama, Qwen, RAG, embeddings ou vector database nesta primeira fase.
- A IA será adicionada posteriormente como uma camada independente.
- Não acople o core a nenhum fornecedor de IA.
- Priorize arquitetura limpa, modularidade, testabilidade e extensibilidade.
- Antes de escrever código, analise o ambiente e o projeto atual.
- Não destrua ou substitua arquivos existentes sem necessidade.
- Se o diretório estiver vazio, inicialize o projeto.
- Se já existir um projeto, adapte-se à estrutura existente somente quando fizer sentido.

---

## 1. Visão do Produto

Queremos construir uma biblioteca chamada `codebase-intelligence`.

Ela deverá analisar uma codebase e construir uma representação estruturada do projeto.

O objetivo final é permitir APIs como:

```ts
import { Codebase } from "codebase-intelligence";

const codebase = await Codebase.load("./meu-projeto");

const analysis = await codebase.analyze();

const results = await codebase.search("authentication");

const dependencies = await codebase.dependencies("src/auth/AuthService.ts");

const impact = await codebase.impact("src/auth/AuthService.ts");

const flow = await codebase.flow("login");
```

Posteriormente deverá ser possível:

```ts
await codebase.explain("src/auth/AuthService.ts");
await codebase.ask("Como funciona a autenticação deste projeto?");
```

Mas **não implemente as funcionalidades de IA agora**.

---

## 2. Objetivo da Primeira Fase

A primeira versão deve construir a fundação do sistema:

1. File Scanner
2. Project Detector
3. TypeScript/JavaScript Parser
4. Symbol Index
5. Dependency Graph
6. Basic Search
7. Dependency Analysis
8. Testes automatizados
9. CLI básica
10. API pública do pacote

A primeira versão deve conseguir analisar um projeto TypeScript/JavaScript real.

---

## 3. Tecnologias

Use: Node.js, TypeScript, npm, ts-morph, fast-glob, Vitest, Zod (quando houver necessidade de validação), Commander (ou alternativa leve para CLI).

Evite dependências desnecessárias.

**Não introduza nesta fase:** Ollama, Qwen, OpenAI, Claude, Gemini, LangChain, LlamaIndex, vector database, embeddings.

Essas tecnologias serão adicionadas futuramente através de adapters/módulos independentes.

---

## 4. Princípios Arquiteturais

- SOLID
- Separation of Concerns
- Dependency Inversion
- Composição em vez de herança quando apropriado
- Interfaces para abstrações importantes
- Código fortemente tipado, evitar `any`
- Funções pequenas e focadas
- Classes somente quando agregarem valor
- Baixo acoplamento, alta coesão
- APIs públicas pequenas, implementação interna escondida

O core **não** deve depender de IA. A arquitetura deve permitir futuramente:

```text
Codebase Intelligence
        |
        +-- Core
        +-- Parsers
        +-- Graph
        +-- Search
        +-- AI Adapter
              +-- Ollama
              +-- OpenAI
              +-- Anthropic
              +-- Gemini
```

---

## 5. Estrutura Inicial

```text
codebase-intelligence/
├── src/
│   ├── core/
│   │   ├── Codebase.ts
│   │   ├── types.ts
│   │   ├── errors.ts
│   │   └── interfaces.ts
│   ├── discovery/
│   │   ├── FileScanner.ts
│   │   ├── ProjectDetector.ts
│   │   └── IgnoreMatcher.ts
│   ├── parsers/
│   │   ├── Parser.ts
│   │   ├── ParserRegistry.ts
│   │   ├── typescript/TypeScriptParser.ts
│   │   └── javascript/JavaScriptParser.ts
│   ├── index/
│   │   ├── CodebaseIndex.ts
│   │   ├── SymbolIndex.ts
│   │   └── FileIndex.ts
│   ├── graph/
│   │   ├── DependencyGraph.ts
│   │   └── GraphBuilder.ts
│   ├── search/
│   │   └── CodeSearch.ts
│   ├── analysis/
│   │   ├── DependencyAnalyzer.ts
│   │   └── ImpactAnalyzer.ts
│   ├── cli/
│   │   └── index.ts
│   └── index.ts
├── tests/
│   ├── discovery/
│   ├── parsers/
│   ├── index/
│   ├── graph/
│   ├── search/
│   └── fixtures/
├── examples/
├── docs/
│   ├── architecture.md
│   └── development.md
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── LICENSE
├── .gitignore
└── CHANGELOG.md
```

Pode modificar essa estrutura se encontrar uma solução arquitetural claramente melhor. Não crie arquivos apenas por criar.

---

## 6. Core — Modelos Internos

```ts
interface CodebaseFile {
  path: string;
  relativePath: string;
  language: SupportedLanguage;
  size: number;
}

interface CodeSymbol {
  id: string;
  name: string;
  kind: SymbolKind;
  file: string;
  startLine: number;
  endLine: number;
}

interface CodeDependency {
  source: string;
  target: string;
  type: DependencyType;
}
```

Crie enums/unions apropriados para `language`, `symbol kind` e `dependency type`. Não use strings espalhadas pelo projeto quando uma abstração compartilhada fizer sentido.

---

## 7. File Scanner

Suportar inicialmente: `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `package.json`, `tsconfig.json`.

Ignorar por padrão: `node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `.expo`, `out`, `target`, `.env`, `.env.*`, arquivos temporários.

O sistema deve permitir configuração:

```ts
const codebase = await Codebase.load("./project", {
  ignore: ["node_modules", "dist"]
});
```

Não codifique os ignores de forma impossível de sobrescrever.

---

## 8. Project Detector

Detectar inicialmente: Node.js, TypeScript, JavaScript, React, Next.js, Vite, NestJS — usando arquivos/configurações/dependências (`package.json`, `tsconfig.json`, `next.config.*`, `vite.config.*`, `nest-cli.json`).

Resultado esperado:

```ts
{
  languages: ["typescript"],
  frameworks: ["react", "nextjs"],
  packageManager: "npm"
}
```

Não invente frameworks.

---

## 9. Parser

Não usar regex para interpretar estrutura de código quando AST estiver disponível. Para TypeScript/JavaScript, usar **ts-morph**.

O parser deve extrair: classes, interfaces, type aliases, functions, methods, variáveis relevantes, imports, exports, React components (quando identificáveis), `extends`, `implements`.

Exemplo — de:

```ts
export class UserService {
  async createUser() {}
  async findUser() {}
}
```

deve resultar em algo equivalente a:

```json
{
  "symbols": [
    { "name": "UserService", "kind": "class" },
    { "name": "createUser", "kind": "method" },
    { "name": "findUser", "kind": "method" }
  ]
}
```

Preservar: arquivo, linha inicial, linha final, símbolo pai (quando aplicável).

---

## 10. Imports e Exports

Analisar imports (ex.: `import { PrismaService } from "../database/PrismaService";`) e gerar relações usáveis pelo Dependency Graph.

Resolver caminhos relativos quando possível, considerando extensions, `index.ts` e tsconfig paths/aliases quando possível. Não assumir que o caminho físico pode ser resolvido apenas por concatenação de strings. Se a resolução não for possível, registrar a dependência como **unresolved** em vez de inventar o destino.

---

## 11. Symbol Index

```ts
index.findSymbol("UserService");
index.findSymbols({ name: "UserService" });
```

Futuramente: `index.findByFile("src/users/UserService.ts")`.

O índice deve ser eficiente e independente do parser.

---

## 12. Dependency Graph

Grafo direcionado suportando: adicionar node, adicionar edge, remover, obter dependências, obter dependentes, verificar existência, obter vizinhos, traversal.

```ts
graph.dependenciesOf(file);
graph.dependentsOf(file);
```

Não acoplar o grafo ao TypeScript — trabalhar com IDs/paths/símbolos genéricos.

---

## 13. Codebase Index

```ts
interface CodebaseIndex {
  files: ...;
  symbols: ...;
  dependencies: ...;
}
```

Agrega File Index, Symbol Index e Dependency Graph. A indexação deve ser determinística: mesmo projeto e mesmos arquivos → mesmo resultado.

---

## 14. API Principal

```ts
const codebase = await Codebase.load("./project");
await codebase.analyze();

codebase.files();
codebase.symbols();
codebase.search();
codebase.dependencies();
codebase.dependents();
```

Evitar expor detalhes internos desnecessários.

---

## 15. Search

Primeira versão: busca lexical/estrutural (sem embeddings). Suportar busca por nome de arquivo, nome de símbolo, conteúdo, caminho, import, export.

```ts
codebase.search("AuthService");
```

Retornar resultados estruturados:

```ts
[
  { file: "src/auth/AuthService.ts", symbol: "AuthService", score: 1, matches: [] }
]
```

Preparar a API para futuramente suportar lexical / semantic / hybrid search sem quebrar a API pública.

---

## 16. Dependency Analysis

```ts
codebase.dependencies(file);
codebase.dependents(file);
```

Exemplo:

```text
AuthService.ts
Dependencies: JwtService.ts, UserService.ts, PrismaService.ts
Dependents: AuthController.ts, AuthGuard.ts
```

---

## 17. Impact Analysis

```ts
codebase.impact(file);
```

Separar: direct dependents, indirect dependents, related tests, related symbols. Não inventar relações que o grafo não consegue provar.

---

## 18. Testes

Obrigatórios, usando Vitest, com fixtures pequenas (ex.: `tests/fixtures/basic-project/`).

Cobrir: scanner, ignores, detector, parser, symbols, imports, exports, graph, search, dependencies, dependents, impact.

Não depender de uma codebase real gigante para testes unitários.

---

## 19. CLI

```bash
codebase-intelligence analyze
codebase-intelligence search "UserService"
codebase-intelligence dependencies src/auth/AuthService.ts
codebase-intelligence dependents src/auth/AuthService.ts
codebase-intelligence impact src/auth/AuthService.ts
```

A CLI deve usar a mesma API pública do pacote — não duplicar lógica.

---

## 20. NPM Package

Configurar `package.json` para publicação futura: `name`, `version`, `description`, `main`, `module` (quando apropriado), `types`, `exports`, `files`, `scripts`, `repository` (placeholder se necessário), `license`.

Build deve gerar:

```text
dist/
├── index.js
├── index.d.ts
└── ...
```

O pacote deve ser consumível por outro projeto TypeScript.

---

## 21. Scripts

```json
{
  "scripts": {
    "dev": "...",
    "build": "...",
    "test": "vitest",
    "test:run": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "...",
    "clean": "..."
  }
}
```

Não adicionar ESLint/Prettier apenas por hábito; se adicionar, configurar corretamente.

---

## 22. Documentação

`README.md` profissional cobrindo: o que é, problema resolvido, features, instalação, quick start, API, CLI, arquitetura, roadmap, contribuição, licença.

`docs/architecture.md` explicando as camadas: Discovery, Analysis, Knowledge, Intelligence — deixando claro que a primeira versão implementa apenas as três primeiras parcialmente.

---

## 23. Futura Arquitetura de IA

Preparar interfaces para futuramente adicionar `AIProvider`, `EmbeddingProvider`, `VectorStore`, `ContextBuilder` — **mas não implementar agora**.

O core nunca deverá importar diretamente nenhum SDK de IA.

---

## 24. Futuro RAG

A arquitetura deve permitir futuramente um pipeline `Codebase → AST → Semantic Chunks → EmbeddingProvider → VectorStore` (Ollama embeddings, OpenAI embeddings, Qdrant, pgvector, Chroma). Não instalar nenhuma dessas dependências agora.

---

## 25. Futuro Suporte a C#

A arquitetura deve permitir adicionar futuramente `parsers/csharp/` sem ficar permanentemente dependente de TypeScript. O Parser deve ser uma abstração:

```ts
interface CodeParser {
  supports(language: string): boolean;
  parse(file: string): Promise<ParsedFile>;
}
```

---

## 26. Regras de Qualidade

- Não usar `any` sem justificativa.
- Não duplicar lógica; não criar funções/classes gigantes.
- Não criar abstrações prematuras.
- Não usar regex para substituir AST.
- Não adicionar dependências sem necessidade.
- Não esconder erros; criar erros específicos quando necessário.
- Não usar `console.log` espalhado pela biblioteca.
- Manter APIs públicas simples.
- Escrever testes para comportamento, não para implementação interna.

---

## 27. Regras para o Agente

Você é responsável por tomar decisões técnicas razoáveis. Não pergunte coisas triviais (nome de pasta, `interface` vs `type`, se deve criar um arquivo). Tome decisões profissionais. Só pergunte quando houver uma decisão realmente bloqueadora ou duas alternativas com consequências significativamente diferentes.

---

## 28. Processo de Implementação

**FASE 0** — analisar ambiente, verificar Node/npm/diretório/Git/projeto existente.
**FASE 1** — inicializar `package.json`, configurar TypeScript, Vitest, `.gitignore`, estrutura de pastas.
**FASE 2** — criar core types, interfaces, erros.
**FASE 3** — implementar FileScanner + IgnoreMatcher, testes.
**FASE 4** — implementar ProjectDetector, testes.
**FASE 5** — implementar Parser abstraction + TypeScriptParser (ts-morph), fixtures, testes.
**FASE 6** — implementar FileIndex + SymbolIndex, testes.
**FASE 7** — implementar DependencyGraph + GraphBuilder, testes.
**FASE 8** — integrar tudo via `Codebase`, API pública, testes de integração.
**FASE 9** — implementar Search, testes.
**FASE 10** — implementar Dependency Analysis + Impact Analysis, testes.
**FASE 11** — criar CLI conectada à API pública.
**FASE 12** — documentação: README, architecture.md, exemplos.

---

## 29. Após Cada Fase

1. Executar typecheck.
2. Executar testes.
3. Corrigir erros.
4. Revisar os arquivos criados.
5. Verificar a arquitetura.
6. Verificar imports desnecessários.
7. Verificar `git diff`.

Não avançar deixando testes quebrados.

---

## 30. Git

Antes de modificar: `git status` (e `git init` se ainda não existir). Fazer commits pequenos e semânticos, ex.:

```text
feat: initialize project structure
feat: add codebase file scanner
feat: add typescript parser
feat: add symbol index
feat: add dependency graph
feat: add code search
test: add dependency analysis tests
docs: add project architecture
```

**Nunca** executar `git reset --hard` ou `git clean -fd` sem autorização explícita.

---

## 31. Critério do Primeiro MVP

Ao terminar a primeira implementação, deve ser possível executar sem erros:

```bash
npm install
npm run build
npm run test:run
npm run typecheck
```

E deve ser possível fazer:

```ts
import { Codebase } from "codebase-intelligence";

const codebase = await Codebase.load("./example");
await codebase.analyze();

console.log(codebase.files());
console.log(codebase.symbols());
console.log(codebase.search("UserService"));
console.log(codebase.dependencies("src/users/UserService.ts"));
console.log(codebase.impact("src/users/UserService.ts"));
```

---

## 32. Importante Sobre a Execução Agora

Não apenas explique como fazer — **comece a construir**:

1. Analise o ambiente atual.
2. Determine se existe um projeto.
3. Crie a estrutura.
4. Configure `package.json`.
5. Configure TypeScript.
6. Configure Vitest.
7. Crie os diretórios.
8. Implemente os tipos fundamentais.
9. Implemente o FileScanner.
10. Escreva testes.
11. Execute os testes.
12. Execute typecheck.
13. Corrija qualquer problema.

Depois continue para as próximas fases. **Não** tente implementar toda a versão 1.0 de uma vez — construa incrementalmente.

---

## 33. Comportamento Esperado

Sempre que terminar uma etapa, apresente:

```text
## Completed
- o que foi implementado

## Files
- arquivos criados
- arquivos modificados

## Tests
- testes executados
- resultado

## Architecture
- decisões arquiteturais relevantes

## Next
- próxima etapa recomendada
```

Não escreva explicações gigantes. Priorize código funcionando.

---

## 34. Visão Final do Projeto

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
               CONTEXT ENGINE
                     |
              ┌──────┴──────┐
              v             v
             RAG           AI
              │             │
              └──────┬──────┘
                     v
               INTELLIGENCE
```

O objetivo não é apenas criar uma ferramenta que "procura texto". É construir uma camada de conhecimento estruturado sobre uma codebase que possa alimentar: agentes de programação, RAG, geração de documentação, code review, análise de impacto, explicação de código, arquitetura automática, busca semântica, assistentes de desenvolvimento e plugins para VS Code.

**Comece agora pela FASE 0 e FASE 1. Não espere novas instruções para criar a estrutura inicial.**
