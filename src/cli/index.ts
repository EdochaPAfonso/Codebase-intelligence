#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { Codebase, NoopAIProvider, type ExplainOptions } from '../index.js';
import { CACHE_DIR_NAME } from '../core/AnalysisCache.js';
import { Watcher } from './Watcher.js';
import type { ContextOptions } from '../context/types.js';

const program = new Command();

program
  .name('codebase-intelligence')
  .description('CLI to analyze and understand codebases')
  .version('0.1.0');

// ---- Shared helpers --------------------------------------------------

const printJson = (data: unknown) => {
  console.log(JSON.stringify(data, null, 2));
};

const resolveTarget = (rawPath: string) => path.resolve(rawPath || '.');

const findFile = (codebase: Codebase, file: string) =>
  codebase.files().find(f => f.path.endsWith(file) || f.relativePath === file);

const loadAndAnalyze = async (targetPath: string): Promise<Codebase> => {
  const codebase = await Codebase.load(targetPath);
  await codebase.analyze();
  return codebase;
};

/** Register SIGINT handler that shuts down the watcher cleanly. */
const handleCtrlC = (watcher: Watcher) => {
  const cleanup = () => {
    watcher.stop();
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
};

/**
 * Start a watch loop: run `action` immediately, then re-run on any change.
 * Prints a separator and timestamp before each re-run.
 */
const startWatch = async (
  targetPath: string,
  action: (codebase: Codebase, changedFiles: ReadonlySet<string>) => void | Promise<void>
) => {
  // Initial run
  let codebase = await loadAndAnalyze(targetPath);
  await action(codebase, new Set());

  console.error('\n[watch] Watching for changes… (Ctrl+C to stop)\n');

  const watcher = new Watcher({
    debounceMs: 300,
    onChanged: async (changedFiles) => {
      const ts = new Date().toLocaleTimeString();
      console.error(`\n[watch ${ts}] ${changedFiles.size} file(s) changed — re-analysing…`);
      try {
        codebase = await loadAndAnalyze(targetPath);
        await action(codebase, changedFiles);
      } catch (err: unknown) {
        console.error('[watch] Error during re-analysis:', (err as Error).message);
      }
    }
  });

  handleCtrlC(watcher);
  watcher.start(targetPath);
};

// ---- Commands --------------------------------------------------------

program
  .command('analyze')
  .description('Analyze the codebase and output a summary')
  .argument('[path]', 'Path to the codebase', '.')
  .option('-w, --watch', 'Watch for changes and re-analyse automatically')
  .action(async (rawPath, opts) => {
    const targetPath = resolveTarget(rawPath);

    const run = (codebase: Codebase, changedFiles: ReadonlySet<string>) => {
      const result: Record<string, unknown> = {
        project: codebase.projectInfo(),
        filesCount: codebase.files().length,
        symbolsCount: codebase.symbols().length
      };
      if (changedFiles.size > 0) {
        result['reanalysed'] = Array.from(changedFiles);
      }
      printJson(result);
    };

    try {
      if (opts.watch) {
        await startWatch(targetPath, run);
      } else {
        const codebase = await loadAndAnalyze(targetPath);
        run(codebase, new Set());
      }
    } catch (err: unknown) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('search')
  .description('Search for a symbol or file')
  .argument('<query>', 'The search query')
  .argument('[path]', 'Path to the codebase', '.')
  .option('-w, --watch', 'Watch for changes and re-run automatically')
  .action(async (query, rawPath, opts) => {
    const targetPath = resolveTarget(rawPath);

    const run = (codebase: Codebase) => {
      printJson(codebase.search(query));
    };

    try {
      if (opts.watch) {
        await startWatch(targetPath, (c) => run(c));
      } else {
        run(await loadAndAnalyze(targetPath));
      }
    } catch (err: unknown) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('dependencies')
  .description('List dependencies of a specific file')
  .argument('<file>', 'File path (relative or suffix match)')
  .argument('[path]', 'Path to the codebase', '.')
  .option('-w, --watch', 'Watch for changes and re-run automatically')
  .action(async (file, rawPath, opts) => {
    const targetPath = resolveTarget(rawPath);

    const run = (codebase: Codebase) => {
      const cf = findFile(codebase, file);
      if (!cf) { console.error(`Error: File "${file}" not found.`); return; }
      printJson(codebase.dependencies(cf.path));
    };

    try {
      if (opts.watch) {
        await startWatch(targetPath, (c) => run(c));
      } else {
        const codebase = await loadAndAnalyze(targetPath);
        const cf = findFile(codebase, file);
        if (!cf) { console.error(`Error: File "${file}" not found.`); process.exit(1); }
        printJson(codebase.dependencies(cf.path));
      }
    } catch (err: unknown) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('dependents')
  .description('List files that depend on a specific file')
  .argument('<file>', 'File path')
  .argument('[path]', 'Path to the codebase', '.')
  .option('-w, --watch', 'Watch for changes and re-run automatically')
  .action(async (file, rawPath, opts) => {
    const targetPath = resolveTarget(rawPath);

    const run = (codebase: Codebase) => {
      const cf = findFile(codebase, file);
      if (!cf) { console.error(`Error: File "${file}" not found.`); return; }
      printJson(codebase.dependents(cf.path));
    };

    try {
      if (opts.watch) {
        await startWatch(targetPath, (c) => run(c));
      } else {
        const codebase = await loadAndAnalyze(targetPath);
        const cf = findFile(codebase, file);
        if (!cf) { console.error(`Error: File "${file}" not found.`); process.exit(1); }
        printJson(codebase.dependents(cf.path));
      }
    } catch (err: unknown) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('impact')
  .description(
    'Analyze the impact of changing a file or a set of Git changes.\n\n' +
    '  File mode (original):  impact <file> [path]\n' +
    '  Git diff mode:         impact [path] --since <ref> | --staged | --uncommitted',
  )
  .argument('[file-or-path]', 'File path (file mode) or codebase path (diff mode)', '.')
  .argument('[path]', 'Path to the codebase when in file mode', '')
  .option('--since <ref>', 'Changes introduced since <ref> (merge-base comparison)')
  .option('--staged', 'Only staged (indexed) changes')
  .option('--uncommitted', 'All uncommitted changes including untracked files (default Git mode)')
  .option('-f, --format <format>', 'Output format: text | json (default: text)')
  .option('--tests-only', 'Print only related test file paths, one per line')
  .option('-w, --watch', 'Watch for changes and re-run automatically (file mode only)')
  .action(async (fileOrPath, secondPath, opts) => {
    // Determine mode: diff mode if any of --since/--staged/--uncommitted are set
    const isDiffMode = opts.since !== undefined || opts.staged === true || opts.uncommitted === true;

    if (opts.since !== undefined && (opts.staged || opts.uncommitted)) {
      console.error('Error: --since cannot be combined with --staged or --uncommitted.');
      process.exit(1);
    }
    if (opts.staged && opts.uncommitted) {
      console.error('Error: --staged and --uncommitted are mutually exclusive.');
      process.exit(1);
    }

    const format: 'text' | 'json' = opts.format === 'json' ? 'json' : 'text';

    // ---- DIFF MODE -------------------------------------------------------
    if (isDiffMode) {
      const targetPath = resolveTarget(fileOrPath || '.');
      try {
        const codebase = await loadAndAnalyze(targetPath);

        const changeOpts: { since?: string; staged?: boolean; uncommitted?: boolean } = {};
        if (opts.since) changeOpts.since = opts.since;
        if (opts.staged) changeOpts.staged = true;
        if (opts.uncommitted) changeOpts.uncommitted = true;

        const impact = await codebase.impactOfChanges(changeOpts);

        if (opts.testsOnly) {
          impact.tests.forEach(t => process.stdout.write(t + '\n'));
          return;
        }

        if (format === 'json') {
          printJson(impact);
          return;
        }

        // Text output
        const heading = (label: string) => console.log(`\n${label}`);
        const items = (arr: string[]) =>
          arr.length ? arr.forEach(f => console.log(`  ${f}`)) : console.log('  (none)');

        console.log('⚠  Granularity: file — all dependents of every changed file are listed.');
        heading('Changed:');
        impact.changed.forEach(c => console.log(`  [${c.status.padEnd(8)}] ${c.path}`));
        heading('Direct dependents:');
        items(impact.direct);
        heading('Indirect dependents:');
        items(impact.indirect);
        heading('Related tests:');
        items(impact.tests);
        if (impact.globalChanges.length) {
          heading('Global changes (affect entire codebase):');
          items(impact.globalChanges);
        }
        if (impact.unanalyzable.length) {
          heading('Unanalyzable:');
          impact.unanalyzable.forEach(u => console.log(`  [${u.reason}] ${u.path}`));
        }
        if (impact.unresolvedDependencies.length) {
          heading('Unresolved dependencies from changed files:');
          items(impact.unresolvedDependencies);
        }
      } catch (err: unknown) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
      return;
    }

    // ---- FILE MODE (original, backwards-compat) --------------------------
    const file = fileOrPath;
    const rawPath = secondPath || '.';
    const targetPath = resolveTarget(rawPath);

    const run = (codebase: Codebase) => {
      const cf = findFile(codebase, file);
      if (!cf) { console.error(`Error: File "${file}" not found.`); return; }

      if (format === 'json') {
        printJson(codebase.impact(cf.path));
        return;
      }

      const result = codebase.impact(cf.path);
      const items = (arr: string[]) =>
        arr.length ? arr.forEach(f => console.log(`  ${f}`)) : console.log('  (none)');
      console.log('\nDirect dependents:');
      items(result.direct);
      console.log('\nIndirect dependents:');
      items(result.indirect);
      console.log('\nRelated tests:');
      items(result.tests);
    };

    try {
      if (opts.watch) {
        await startWatch(targetPath, (c) => run(c));
      } else {
        const codebase = await loadAndAnalyze(targetPath);
        const cf = findFile(codebase, file);
        if (!cf) { console.error(`Error: File "${file}" not found.`); process.exit(1); }
        run(codebase);
      }
    } catch (err: unknown) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });


program
  .command('clear-cache')
  .description('Clear the analysis cache for the given codebase directory')
  .argument('[path]', 'Path to the codebase', '.')
  .action(async (targetPath) => {
    try {
      const resolvedPath = path.resolve(targetPath);
      const cacheDir = path.join(resolvedPath, CACHE_DIR_NAME);
      if (fs.existsSync(cacheDir)) {
        fs.rmSync(cacheDir, { recursive: true, force: true });
        console.log(`Cache cleared: ${cacheDir}`);
      } else {
        console.log('No cache found — nothing to clear.');
      }
    } catch (err: unknown) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('context')
  .description('Generate LLM context for a specific file')
  .argument('<file>', 'File path')
  .argument('[path]', 'Path to the codebase', '.')
  .option('-s, --strategy <strategy>', 'Context strategy (shallow, signature, deep)', 'signature')
  .action(async (file, rawPath, opts) => {
    try {
      const targetPath = resolveTarget(rawPath);
      const codebase = await loadAndAnalyze(targetPath);
      const cf = findFile(codebase, file);
      if (!cf) {
        console.error(`Error: File "${file}" not found.`);
        process.exit(1);
      }

      const cbAI = codebase.withAI(new NoopAIProvider());
      const explainOpts: ExplainOptions = {};
      if (opts.strategy) {
        explainOpts.strategy = opts.strategy as any;
      }
      
      const payload = await cbAI.buildExplainPayload(cf.path, explainOpts);

      console.log(payload.prompt);
    } catch (err: unknown) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('chunks')
  .description('Generate semantic chunks for the codebase')
  .argument('[path]', 'Path to the codebase', '.')
  .option('-m, --max-tokens <number>', 'Max tokens per chunk', '512')
  .option('-f, --format <format>', 'Output format (json, pretty)', 'json')
  .action(async (rawPath, opts) => {
    try {
      const targetPath = resolveTarget(rawPath);
      const codebase = await loadAndAnalyze(targetPath);
      
      const maxChunkTokens = parseInt(opts.maxTokens, 10);
      const chunks = await codebase.chunks({ maxChunkTokens });

      if (opts.format === 'json') {
        printJson(chunks);
      } else {
        chunks.forEach((c, i) => {
          console.log(`\n--- Chunk ${i + 1} | ${c.id} | ~${c.tokenEstimate} tokens ---`);
          console.log(c.content);
        });
      }
    } catch (err: unknown) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('tokens')
  .description('Estimate tokens for the codebase')
  .argument('[path]', 'Path to the codebase', '.')
  .action(async (rawPath) => {
    try {
      const targetPath = resolveTarget(rawPath);
      const codebase = await loadAndAnalyze(targetPath);
      
      const chunks = await codebase.chunks();
      const totalTokens = chunks.reduce((acc, c) => acc + c.tokenEstimate, 0);

      printJson({
        files: codebase.files().length,
        chunks: chunks.length,
        estimatedTokens: totalTokens,
      });
    } catch (err: unknown) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program.parse();
