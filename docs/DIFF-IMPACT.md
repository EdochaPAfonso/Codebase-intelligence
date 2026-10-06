# DIFF-IMPACT — Acompanhamento de Implementação

Rastreamento da feature **Impacto baseado em Git diff** no projeto `codebase-intelligence`.

---

## Status Geral

```text
DI-1  ✅  Tipos & Contratos
DI-2  🔄  GitChangeSetProvider (em progresso)
DI-3  ⬜  ChangeSetImpactAnalyzer (puro)
DI-4  ⬜  Integração na API Codebase
DI-5  ⬜  CLI
DI-6  ⬜  Documentação & Exemplo CI
```

---

## ✅ FASE DI-1 — Tipos & Contratos
**Concluída em**: 2026-10-06

### O que foi feito
- Criado `src/diff/types.ts` com todos os tipos públicos da feature:
  - `ChangeStatus`, `FileChange` — representação de mudanças
  - `ChangeSetOptions` — opções mutuamente exclusivas (`since`, `staged`, `uncommitted`)
  - `ChangeSetProvider` — interface para qualquer fonte de mudanças (Git, API de PR, etc.)
  - `UnanalyzableReason` — garante que nenhum ficheiro é omitido silenciosamente
  - `ChangeSetImpact` — resultado completo com `direct`, `indirect`, `tests`, `globalChanges`, `unanalyzable`, `unresolvedDependencies`, `metadata.granularity: 'file'`
- Criado `src/diff/errors.ts` com erros específicos do Git:
  - `GitNotAvailableError`
  - `NotAGitRepositoryError`
  - `InvalidGitRefError`
  - `GitCommandError` (inclui stderr e exit code)
- Adicionados exports públicos em `src/index.ts`

### Ficheiros criados/modificados
| Ficheiro | Estado |
|---|---|
| `src/diff/types.ts` | ✨ novo |
| `src/diff/errors.ts` | ✨ novo |
| `src/index.ts` | ➕ exports DI-1 |

### Testes
- **130/130** passando, sem regressão
- `tsc --noEmit` limpo

### Commit
```
feat(diff): DI-1 - add change set types and contracts
```

---

## ✅ FASE DI-2 — GitChangeSetProvider
**Concluída em**: 2026-10-06

### O que foi feito
Implementado `GitChangeSetProvider.ts` usando `execFile('git', [...])` com tratamento robusto para Windows (resolução de caminhos curtos 8dot3 usando `fs.realpathSync.native`).
Suporta os modos `since` (merge-base), `staged`, e `uncommitted` (com inclusão de untracked files usando `git ls-files`). Parseia a saída de forma segura com delimitadores nulos (`-z`) para lidar com nomes de ficheiros que contenham espaços.

### Testes
- **19/19** testes específicos do `GitChangeSetProvider.test.ts` passando usando repositórios Git temporários criados a quente.
- 132/132 testes no total passando.

### Commit
```
feat(diff): DI-2 - implement GitChangeSetProvider
```

---

## 🔄 FASE DI-3 — ChangeSetImpactAnalyzer (puro)
**Estado**: Em progresso

### Requisitos
- [ ] Resolver raiz do repositório Git (`git rev-parse --show-toplevel`)
- [ ] Converter caminhos para relativos à raiz da codebase; fora → `outside-codebase`
- [ ] `git diff --name-status -M -z` (NUL-delimited, suporta espaços em nomes)
- [ ] Suportar modos: `since` (merge-base, três pontos), `staged`, `uncommitted`, default
- [ ] Incluir untracked files no modo `uncommitted` (`git ls-files --others --exclude-standard -z`)
- [ ] Tratar `R<score>`, `C<score>`, `T`, `D`, `A`, `M`
- [ ] Validar refs (rejeitar vazias, que comecem com `-`, verificar existência com `rev-parse --verify`)
- [ ] Detectar clone raso e lançar erro acionável
- [ ] Detectar opções conflitantes
- [ ] Output ordenado por `path` (determinismo)
- [ ] Testes com repositórios Git temporários reais

### Ficheiros a criar
| Ficheiro | Descrição |
|---|---|
| `src/diff/GitChangeSetProvider.ts` | Implementação |
| `tests/diff/GitChangeSetProvider.test.ts` | Testes |

---

## ⬜ FASE DI-3 — ChangeSetImpactAnalyzer (puro)
**Estado**: Aguarda DI-2

### Objectivo
Analisador puro que combina `FileChange[]` com o grafo de dependências.

### Requisitos
- [ ] Reutilizar `ImpactAnalyzer` por ficheiro (não duplicar travessia do grafo)
- [ ] União de direct/indirect/tests sem duplicados
- [ ] Prioridade: direct > indirect
- [ ] Excluir os próprios ficheiros alterados de `direct`/`indirect`
- [ ] Tratar `renamed` (analisar novo caminho; antigo só se o grafo provar)
- [ ] Tratar `deleted` (só reportar se o grafo tiver edges `unresolved` correspondentes)
- [ ] `globalChanges` — lista de padrões configurável em constante
- [ ] `unsupported-language`, `not-in-index` → `unanalyzable`
- [ ] Expor `codebase.impactOfFiles(paths)` para uso puro sem Git
- [ ] Testes com fixture pequena e grafo conhecido

---

## ⬜ FASE DI-4 — Integração na API `Codebase`
**Estado**: Aguarda DI-3

### Objectivo
```ts
const impact = await codebase.impactOfChanges({ since: 'main' });
const pure = codebase.impactOfFiles(['src/auth/AuthService.ts']);
```

### Requisitos
- [ ] `impactOfChanges(options, provider?)` — provider injectável
- [ ] `impactOfFiles(paths)` — análise pura sem Git
- [ ] Exigir `analyze()` antes (erro consistente com o resto da API)
- [ ] Testes de integração com repositório Git temporário + fixture TypeScript

---

## ⬜ FASE DI-5 — CLI
**Estado**: Aguarda DI-4

### Objectivo
```bash
codebase-intelligence impact --since main .
codebase-intelligence impact --staged .
codebase-intelligence impact --uncommitted .
codebase-intelligence impact --since main --format json .
codebase-intelligence impact --since main --tests-only .
```

### Requisitos
- [ ] `impact <file>` continua a funcionar (retrocompatibilidade)
- [ ] `<file>` e `--since/--staged/--uncommitted` mutuamente exclusivos
- [ ] `--format text|json` (JSON limpo em stdout, diagnósticos em stderr)
- [ ] `--tests-only` imprime caminhos de testes um por linha
- [ ] Output de texto agrupado com aviso de granularidade
- [ ] Códigos de saída: `0` sucesso, `1` erro

---

## ⬜ FASE DI-6 — Documentação & Exemplo CI
**Estado**: Aguarda DI-5

### Objectivo
- [ ] `README.md` + `README.pt-BR.md` — nova secção API + CLI
- [ ] `docs/architecture.md` — onde a feature se encaixa + limitações conhecidas
- [ ] `docs/` ou `examples/` — exemplo GitHub Actions com `fetch-depth: 0`
- [ ] `CHANGELOG.md` — entrada da feature
- [ ] Validar o fluxo do exemplo manualmente

---

## Critérios Finais (MVP)

- [ ] `npm run build`, `npm run typecheck`, `npm run test:run` sem erros
- [ ] `codebase-intelligence impact --since main .` funciona num repositório real
- [ ] Nenhuma nova dependência em `package.json`
- [ ] Saída determinística e `--format json` limpo em stdout
- [ ] `globalChanges` e `unanalyzable` sempre reportados
- [ ] `granularity: "file"` presente no resultado e avisado no texto da CLI
- [ ] README inglês e português actualizados

---

## Decisões Técnicas

| Decisão | Justificação |
|---|---|
| `execFile` em vez de `exec` | Evita shell injection; args são passados como array |
| Modo default = `uncommitted` | Mais útil em desenvolvimento local |
| NUL-delimited output (`-z`) | Suporta espaços e caracteres especiais nos nomes de ficheiros |
| Três pontos (`since...until`) | Merge-base semantics — só o que o branch introduziu |
| Erros em `src/diff/errors.ts` | Não poluem `src/core/errors.ts`; podem ser importados independentemente |
| `ChangeSetProvider` como interface | Core testável sem Git; suporta outros VCS futuramente |

## Limitações Conhecidas (a documentar no README)

- **Granularidade de ficheiro**: resultado é um limite superior (qualquer mudança num ficheiro marca todos os dependentes)
- **Ficheiros de configuração**: `package.json`, `tsconfig.json`, etc. estão fora do grafo de imports
- **Ficheiros apagados/renomeados**: dependem do que o grafo consegue provar via edges `unresolved`
- **Clones rasos**: `since` com merge-base pode falhar em CI sem `fetch-depth: 0`
