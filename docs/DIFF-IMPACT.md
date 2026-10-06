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

## ✅ FASE DI-3 — ChangeSetImpactAnalyzer (puro)
**Concluída em**: 2026-10-06

### O que foi feito
- Implementado o `ChangeSetImpactAnalyzer` que actua como cola entre as mudanças de ficheiros (`FileChange[]`) e o `DependencyGraph`.
- Usa o `ImpactAnalyzer` base para evitar duplicação da travessia em grafo.
- Identifica correctamente as razões de `unanalyzable` (`outside-codebase`, `unsupported-language`, `not-in-index`, `deleted-unprovable`).
- Agrupa directos vs indirectos com a precedência correcta e filtra os próprios ficheiros modificados do conjunto resultante.
- Exibe specifiers não resolvidos a partir de ficheiros alterados como diagnóstico.

### Testes
- Adicionado `ChangeSetImpactAnalyzer.test.ts` com um grafo e index falsos (`mock`).
- 9/9 testes de unidade focados na lógica pura de correlação e agrupamento.
- 160/160 no total a passar, `typecheck` limpo.

### Commit
```
feat(diff): DI-3 - implement ChangeSetImpactAnalyzer
```

---

## ✅ FASE DI-4 — Integração na API `Codebase`
**Concluída em**: 2026-10-06

### O que foi feito
- Adicionado `impactOfFiles(paths: string[]): ChangeSetImpact` — análise pura e síncrona sem Git
- Adicionado `impactOfChanges(options?, provider?): Promise<ChangeSetImpact>` — com `GitChangeSetProvider` por defeito, provider injectável para testes
- Ambos os métodos lançam erro se chamados antes de `analyze()`
- Exportados `GitChangeSetProvider` e `ChangeSetImpactAnalyzer` no `src/index.ts`

### Testes
- `CodebaseImpact.test.ts` — 5/5 testes de integração com repositório Git temporário
- 165/165 total a passar, `typecheck` limpo

### Commit
```
feat(diff): DI-4 - integrate diff impact into Codebase API
```

---

## ✅ FASE DI-5 — CLI
**Concluída em**: 2026-10-06

### O que foi feito
Extendido o comando `impact` mantendo retrocompatibilidade total:

```bash
# Modo ficheiro (inalterado):
codebase-intelligence impact src/auth/AuthService.ts .

# Modo Git diff (novo):
codebase-intelligence impact . --since main
codebase-intelligence impact . --staged
codebase-intelligence impact . --uncommitted
codebase-intelligence impact . --since main --format json
codebase-intelligence impact . --since main --tests-only
```

- `--since`, `--staged`, `--uncommitted` mutuamente exclusivos (validação com saída `1`)
- `--format text|json` — JSON limpo em stdout, texto legível por defeito
- `--tests-only` — imprime caminhos de testes um por linha
- Output de texto inclui aviso de granularidade + secções agrupadas

### Commit
```
feat(diff): DI-5 - extend impact CLI with diff-mode options
```

---

## ✅ FASE DI-6 — Documentação & Exemplo CI
**Concluída em**: 2026-10-06

### O que foi feito
- [x] `README.md` + `README.pt-BR.md` — nova secção API + CLI
- [x] `docs/architecture.md` — onde a feature se encaixa + limitações conhecidas
- [x] `docs/` ou `examples/` — exemplo GitHub Actions com `fetch-depth: 0`
- [x] `CHANGELOG.md` — entrada da feature
- [x] Validar o fluxo do exemplo manualmente

---

## Critérios Finais (MVP)

- [x] `npm run build`, `npm run typecheck`, `npm run test:run` sem erros
- [x] `codebase-intelligence impact --since main .` funciona num repositório real
- [x] Nenhuma nova dependência em `package.json`
- [x] Saída determinística e `--format json` limpo em stdout
- [x] `globalChanges` e `unanalyzable` sempre reportados
- [x] `granularity: "file"` presente no resultado e avisado no texto da CLI
- [x] README inglês e português actualizados

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
