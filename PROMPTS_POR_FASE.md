# Prompts por Fase — Codebase Intelligence (Qwen3 4B)

Use um prompt de cada vez. Cole no Qwen Code, espere terminar, valide (testes + typecheck), e só depois avance para o próximo.

Cada prompt já inclui as regras essenciais para não depender do modelo lembrar de um documento gigante anterior.

---

## FASE 0 — Diagnóstico do Ambiente

```text
Você é um engenheiro responsável por iniciar o projeto "codebase-intelligence",
um pacote npm em TypeScript para analisar codebases (sem IA nesta fase).

Tarefa desta etapa (FASE 0 — apenas diagnóstico, não crie nada ainda):

1. Verifique a versão do Node instalada.
2. Verifique a versão do npm instalada.
3. Verifique se o diretório atual está vazio ou já contém um projeto.
4. Verifique se existe um repositório Git.
5. Liste o que encontrou.

Não crie arquivos ainda. Apenas relate o estado atual e diga se está pronto
para inicializar o projeto do zero (assumindo diretório vazio ou quase vazio).

Formato da resposta:

## Ambiente
- Node: ...
- npm: ...
- Git: ...
- Diretório: vazio / contém projeto existente

## Recomendação
- pode inicializar do zero / precisa adaptar-se a projeto existente
```

---

## FASE 1 — Estrutura Inicial do Projeto

```text
Você está construindo "codebase-intelligence", um pacote npm em TypeScript
para analisar codebases (SEM IA nesta fase — não adicione Ollama, OpenAI,
embeddings, RAG ou vector database).

Tarefa desta etapa (FASE 1):

1. Adicione ao package.json scripts (dev, build, test,
   test:run, typecheck, lint, clean), license.
2. Configure Vitest (vitest.config.ts).
3. Crie .gitignore (node_modules, dist, coverage, .env, etc.).
4. Crie a estrutura de pastas:

src/core, src/discovery, src/parsers/typescript, src/parsers/javascript,
src/index, src/graph, src/search, src/analysis, src/cli,
tests/discovery, tests/parsers, tests/index, tests/graph, tests/search,
tests/fixtures, examples, docs

5. Rode `npm run typecheck` para confirmar que a configuração básica funciona
   (pode não haver código ainda, apenas confirme que o comando roda sem erro
   de configuração).

Regras gerais do projeto (aplicam-se a todas as fases seguintes):
- TypeScript fortemente tipado, evitar `any`.
- SOLID, baixo acoplamento, alta coesão.
- Não usar regex para estrutura de código quando AST estiver disponível.
- Não usar console.log espalhado pela biblioteca.
- APIs públicas pequenas e explícitas.
- Não instale nenhuma dependência de IA/embeddings/vector DB nesta fase.

Formato da resposta ao final:

## Completed
## Files
## Tests
## Architecture
## Next
```

---

## FASE 2 — Core Types, Interfaces e Erros

```text
Continuando o projeto "codebase-intelligence" (estrutura já criada na FASE 1).

Tarefa desta etapa (FASE 2): criar os modelos fundamentais em src/core/.

1. src/core/types.ts com pelo menos:

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

Crie os enums/union types SupportedLanguage, SymbolKind e DependencyType
de forma enxuta (apenas os valores necessários para TypeScript/JavaScript
por agora: "typescript", "javascript"; kinds como "class", "interface",
"function", "method", "variable", "typeAlias"; dependency types como
"import", "extends", "implements").

2. src/core/interfaces.ts com as abstrações principais que serão
   implementadas nas próximas fases (ex.: CodeParser, mantendo-o genérico
   o suficiente para suportar outras linguagens no futuro):

interface CodeParser {
  supports(language: string): boolean;
  parse(file: string): Promise<ParsedFile>;
}

3. src/core/errors.ts com classes de erro específicas (ex.: FileNotFoundError,
   ParseError, UnresolvedDependencyError) estendendo Error, com mensagens
   claras.

Não implemente lógica de negócio ainda — apenas tipos, interfaces e erros.
Não use `any`. Rode `npm run typecheck` ao final e corrija qualquer erro.

Formato da resposta ao final:
## Completed
## Files
## Tests
## Architecture
## Next
```

---

## FASE 3 — File Scanner + Ignore Matcher

```text
Continuando "codebase-intelligence" (core types já existem em src/core/).

Tarefa desta etapa (FASE 3):

1. src/discovery/IgnoreMatcher.ts — classe/função responsável por decidir se
   um caminho deve ser ignorado. Ignorar por padrão: node_modules, .git,
   dist, build, coverage, .next, .expo, out, target, .env, .env.*, arquivos
   temporários. Deve aceitar uma lista extra de padrões de ignore fornecida
   pelo usuário, sem sobrescrever os padrões default de forma impossível de
   customizar.

2. src/discovery/FileScanner.ts — usa fast-glob para encontrar arquivos
   relevantes (.ts, .tsx, .js, .jsx, .mjs, .cjs, package.json, tsconfig.json),
   respeitando o IgnoreMatcher, e retorna uma lista de CodebaseFile (do
   src/core/types.ts), preenchendo path, relativePath, language e size.

3. Testes em tests/discovery/ usando Vitest e uma fixture pequena em
   tests/fixtures/basic-project/ (crie 3-4 arquivos de exemplo, incluindo
   um dentro de node_modules para confirmar que é ignorado).

Regras: sem `any`, sem regex para nada que fast-glob já resolve, funções
pequenas e focadas. Ao final rode `npm run typecheck` e `npm run test:run`
e corrija qualquer erro antes de finalizar.

Formato da resposta ao final:
## Completed
## Files
## Tests
## Architecture
## Next
```

---

## FASE 4 — Project Detector

```text
Continuando "codebase-intelligence" (FileScanner já existe).

Tarefa desta etapa (FASE 4):

Crie src/discovery/ProjectDetector.ts capaz de detectar, a partir dos
arquivos encontrados pelo FileScanner:

- linguagens: "typescript" (se houver tsconfig.json ou arquivos .ts/.tsx),
  "javascript" (se houver apenas .js/.jsx)
- frameworks: "react" (dependência react no package.json), "nextjs"
  (next.config.* ou dependência next), "vite" (vite.config.*), "nestjs"
  (nest-cli.json ou dependência @nestjs/core)
- packageManager: "npm" (package-lock.json), "yarn" (yarn.lock), "pnpm"
  (pnpm-lock.yaml) — default "npm" se nenhum lockfile for encontrado

Resultado esperado, por exemplo:

{
  languages: ["typescript"],
  frameworks: ["react", "nextjs"],
  packageManager: "npm"
}

Não invente frameworks que não estejam nesta lista. Baseie a detecção em
arquivos/config reais, não em suposições.

Crie testes em tests/discovery/ usando fixtures pequenas (pode reaproveitar
ou estender tests/fixtures/basic-project/, ou criar uma nova fixture com
sinais de Next.js/React).

Ao final rode `npm run typecheck` e `npm run test:run` e corrija erros.

Formato da resposta ao final:
## Completed
## Files
## Tests
## Architecture
## Next
```

---

## FASE 5 — Parser (ts-morph)

```text
Continuando "codebase-intelligence". Esta é a fase mais delicada — vá com
calma e teste bastante.

Tarefa desta etapa (FASE 5):

1. src/parsers/Parser.ts — reexporte/refine a interface CodeParser definida
   em src/core/interfaces.ts, e defina o tipo ParsedFile (symbols: CodeSymbol[],
   dependencies: CodeDependency[]).

2. src/parsers/ParserRegistry.ts — registro simples que recebe uma lista de
   CodeParser e escolhe o parser certo com base em `supports(language)`.

3. src/parsers/typescript/TypeScriptParser.ts — implementa CodeParser usando
   ts-morph. Deve extrair, no mínimo:
   - classes, interfaces, type aliases, functions, methods, variáveis de
     nível de módulo
   - imports (para alimentar dependências depois)
   - exports
   - extends / implements quando existirem
   Preserve para cada símbolo: nome, kind, arquivo, linha inicial, linha
   final, e símbolo pai quando aplicável (ex.: método pertence a uma classe).

   IMPORTANTE sobre imports: resolva caminhos relativos (considerando
   extensões e index.ts) quando possível. Se não conseguir resolver com
   segurança, registre a dependência com type "unresolved" em vez de
   inventar o destino. Não implemente resolução de tsconfig paths/aliases
   ainda se isso tornar o código muito complexo — deixe como unresolved
   nesse caso e diga isso claramente no relatório final.

4. Crie fixtures em tests/fixtures/ com 2-3 arquivos TypeScript pequenos
   (ex.: uma classe UserService com métodos, um arquivo que a importa).

5. Testes em tests/parsers/ verificando que os símbolos e imports esperados
   são extraídos corretamente.

Não use regex para nada disso — use exclusivamente a API do ts-morph.
Ao final rode `npm run typecheck` e `npm run test:run`. Se algo não
compilar ou os testes falharem, corrija antes de finalizar a fase.

Formato da resposta ao final:
## Completed
## Files
## Tests
## Architecture
## Next
```

---

## FASE 6 — File Index + Symbol Index

```text
Continuando "codebase-intelligence" (Parser já extrai símbolos e imports).

Tarefa desta etapa (FASE 6):

1. src/index/FileIndex.ts — guarda os CodebaseFile indexados por path e
   relativePath, com métodos simples de consulta (ex.: getByPath,
   getByRelativePath, all()).

2. src/index/SymbolIndex.ts — guarda os CodeSymbol extraídos pelo parser,
   com métodos:
   - findSymbol(name: string): CodeSymbol | undefined
   - findSymbols(query: { name?: string; kind?: SymbolKind; file?: string }): CodeSymbol[]
   - findByFile(file: string): CodeSymbol[]

O índice deve ser independente do parser (recebe símbolos já extraídos,
não sabe nada sobre ts-morph).

3. Testes em tests/index/ cobrindo os métodos acima com dados de exemplo
   (não precisa rodar o parser real nos testes deste índice — pode usar
   objetos CodeSymbol construídos manualmente).

Ao final rode `npm run typecheck` e `npm run test:run` e corrija erros.

Formato da resposta ao final:
## Completed
## Files
## Tests
## Architecture
## Next
```

---

## FASE 7 — Dependency Graph

```text
Continuando "codebase-intelligence".

Tarefa desta etapa (FASE 7):

1. src/graph/DependencyGraph.ts — grafo direcionado genérico, que trabalha
   com IDs/paths de string (não deve saber nada sobre TypeScript ou
   ts-morph). Deve suportar:
   - addNode(id: string)
   - addEdge(source: string, target: string, type?: string)
   - removeNode(id: string)
   - removeEdge(source: string, target: string)
   - hasNode(id: string): boolean
   - dependenciesOf(id: string): string[]
   - dependentsOf(id: string): string[]
   - neighbors(id: string): string[]
   - Alguma forma de traversal (ex.: breadth-first) reutilizável pelas
     próximas fases (Impact Analysis vai precisar disso).

2. src/graph/GraphBuilder.ts — recebe os CodeDependency (do parser) e
   constrói um DependencyGraph a partir deles, ignorando ou marcando
   dependências "unresolved" de forma explícita (não as trate como edges
   válidas para outro arquivo).

3. Testes em tests/graph/ cobrindo adicionar/remover nodes e edges,
   dependenciesOf/dependentsOf, e um teste de traversal simples (ex.:
   A depende de B depende de C → dependentsOf(C) inclui A indiretamente
   se você expuser essa função, ou documente que dependentsOf é direto e
   crie um método separado para indireto — decida e documente).

Ao final rode `npm run typecheck` e `npm run test:run` e corrija erros.

Formato da resposta ao final:
## Completed
## Files
## Tests
## Architecture
## Next
```

---

## FASE 8 — API Pública (classe Codebase) + Testes de Integração

```text
Continuando "codebase-intelligence" (FileScanner, ProjectDetector, Parser,
FileIndex, SymbolIndex e DependencyGraph já existem e têm testes passando).

Tarefa desta etapa (FASE 8): integrar tudo através da classe pública Codebase.

1. src/core/Codebase.ts — implementa:

class Codebase {
  static async load(path: string, options?: { ignore?: string[] }): Promise<Codebase>
  async analyze(): Promise<void>
  files(): CodebaseFile[]
  symbols(): CodeSymbol[]
}

`load` deve apenas preparar o estado (rodar FileScanner + ProjectDetector).
`analyze` deve rodar o Parser em cada arquivo suportado, popular o
SymbolIndex, e construir o DependencyGraph via GraphBuilder.

2. src/index.ts — exporta publicamente apenas o necessário (Codebase e os
   tipos essenciais de src/core/types.ts). Não exponha classes internas
   como TypeScriptParser ou GraphBuilder diretamente.

3. Testes de integração em tests/ (pode criar tests/integration/) usando a
   fixture de projeto TypeScript já existente: chamar Codebase.load(),
   depois analyze(), e verificar que files() e symbols() retornam o
   esperado.

Ao final rode `npm run build`, `npm run typecheck` e `npm run test:run`.
O build deve gerar dist/ com index.js e index.d.ts sem erros. Corrija
qualquer problema antes de finalizar.

Formato da resposta ao final:
## Completed
## Files
## Tests
## Architecture
## Next
```

---

## FASE 9 — Search

```text
Continuando "codebase-intelligence" (Codebase.analyze() já popula os
índices).

Tarefa desta etapa (FASE 9):

1. src/search/CodeSearch.ts — busca lexical/estrutural (SEM embeddings) por:
   nome de arquivo, nome de símbolo, caminho, e opcionalmente conteúdo
   simples (substring). Retorna resultados estruturados:

interface SearchResult {
  file: string;
  symbol?: string;
  score: number;
  matches: string[];
}

2. Adicione o método `search(query: string): SearchResult[]` na classe
   Codebase (src/core/Codebase.ts), delegando para CodeSearch.

3. Testes em tests/search/ cobrindo busca por nome de símbolo exato,
   parcial (case-insensitive, se fizer sentido) e por nome de arquivo.

Projete a interface de forma que, no futuro, seja possível adicionar busca
semântica sem quebrar a API pública (ex.: aceitar um parâmetro opcional de
modo, mesmo que só "lexical" exista por agora) — mas não implemente nada
além de lexical agora.

Ao final rode `npm run typecheck` e `npm run test:run` e corrija erros.

Formato da resposta ao final:
## Completed
## Files
## Tests
## Architecture
## Next
```

---

## FASE 10 — Dependency Analysis + Impact Analysis

```text
Continuando "codebase-intelligence" (DependencyGraph e Codebase já
integrados).

Tarefa desta etapa (FASE 10):

1. src/analysis/DependencyAnalyzer.ts com:
   - dependencies(file: string): string[]  (usa graph.dependenciesOf)
   - dependents(file: string): string[]    (usa graph.dependentsOf)

2. src/analysis/ImpactAnalyzer.ts com:
   - impact(file: string): { direct: string[]; indirect: string[]; tests: string[] }
   "direct" = dependentsOf direto. "indirect" = dependentes de dependentes,
   sem duplicar os diretos. "tests" = arquivos cujo nome sugira ser teste
   do arquivo (ex.: mesmo nome base + .spec.ts ou .test.ts) — não invente
   relações que o grafo não consiga provar; se não houver forma confiável
   de achar os testes relacionados, retorne lista vazia e diga isso no
   relatório.

3. Adicione os métodos `dependencies(file)`, `dependents(file)` e
   `impact(file)` na classe Codebase, delegando para os analisadores acima.

4. Testes em tests/ cobrindo um cenário com pelo menos 3 arquivos
   encadeados (A depende de B depende de C) confirmando direct vs indirect.

Ao final rode `npm run typecheck` e `npm run test:run` e corrija erros.

Formato da resposta ao final:
## Completed
## Files
## Tests
## Architecture
## Next
```

---

## FASE 11 — CLI

```text
Continuando "codebase-intelligence" (API pública completa: analyze, search,
dependencies, dependents, impact).

Tarefa desta etapa (FASE 11):

Crie src/cli/index.ts usando Commander (ou alternativa já instalada) com
os comandos:

codebase-intelligence analyze [path]
codebase-intelligence search <query> [path]
codebase-intelligence dependencies <file> [path]
codebase-intelligence dependents <file> [path]
codebase-intelligence impact <file> [path]

Cada comando deve: carregar Codebase.load(path ?? "."), chamar analyze(),
e então chamar o método correspondente, imprimindo o resultado formatado
no terminal (pode ser JSON.stringify com indentação, ou uma formatação
simples de texto — escolha uma e seja consistente).

A CLI NÃO deve reimplementar nenhuma lógica — apenas chamar a API pública
do pacote (import { Codebase } from "../index").

Configure o "bin" no package.json apontando para o build da CLI.

Teste manualmente rodando `npm run build` e depois executando a CLI contra
a fixture de exemplo, colando o output no relatório final.

Formato da resposta ao final:
## Completed
## Files
## Tests
## Architecture
## Next
```

---

## FASE 12 — Documentação

```text
Continuando "codebase-intelligence" (projeto funcionalmente completo para
o MVP: analyze, search, dependencies, dependents, impact, CLI).

Tarefa desta etapa (FASE 12):

1. README.md profissional cobrindo, nesta ordem: o que é o projeto, o
   problema que resolve, features, instalação, quick start (código real
   que funciona com a fixture de exemplo), referência da API pública,
   referência dos comandos da CLI, visão geral da arquitetura, roadmap
   (mencionando que IA/RAG/embeddings virão depois, sem implementá-los),
   como contribuir, licença.

2. docs/architecture.md explicando as camadas Discovery, Analysis,
   Knowledge, Intelligence — deixando claro que esta versão implementa
   Discovery e Analysis completos, e Knowledge parcialmente (índices e
   grafo), sem Intelligence (IA) ainda.

3. Um exemplo funcional em examples/ mostrando o uso da API pública
   (Codebase.load → analyze → files/symbols/search/dependencies/impact).

Não invente features que não existem. Não prometa nada que o código atual
não faça.

Ao final, confirme rodando novamente: `npm install`, `npm run build`,
`npm run test:run`, `npm run typecheck` — tudo deve passar sem erros. Esse
é o critério de aceitação do MVP.

Formato da resposta ao final:
## Completed
## Files
## Tests
## Architecture
## Next (sugestão de próximos passos pós-MVP: AI Adapter, RAG, C# parser)
```
