# Arquitetura

A visão do `codebase-intelligence` é construir uma base robusta e pronta para IA para a compreensão de bases de código. Para garantir que permaneça flexível e agnóstica, o sistema é projetado em quatro camadas distintas.

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
              [CONTEXT ENGINE]
                     |
              ┌──────┴──────┐
              v             v
            [RAG]          [AI]
              │             │
              └──────┬──────┘
                     v
              [INTELLIGENCE]
```

*(Nota: As camadas entre colchetes `[]` estão planejadas para versões futuras. O MVP atual implementa integralmente as três primeiras camadas, e a camada de Inteligência é intencionalmente omitida para manter a biblioteca principal livre de dependência de fornecedores específicos de IA).*

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

## 4. Camada de Inteligência (Intelligence Layer) (Futuro)
**Objetivo**: Combinar os dados estruturados determinísticos (Camada de Conhecimento) com modelos probabilísticos (IA).
- **Context Engine**: Percorrerá o `DependencyGraph` para agrupar trechos de código altamente relevantes.
- **Pipeline de RAG**: Dividirá nós da AST em chunks e os alimentará a um `EmbeddingProvider`.
- **Adaptadores de IA**: Interfaces agnósticas para Ollama, OpenAI, Gemini, etc.

Ao manter a Camada de Conhecimento principal desconectada da Camada de Inteligência, garantimos que o `codebase-intelligence` possa ser usado simplesmente como uma ferramenta de análise rápida, ou ser escalado para se tornar um poderoso backend de IA agêntica.
