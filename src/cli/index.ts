#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { Codebase } from '../index.js';
import { CACHE_DIR_NAME } from '../core/AnalysisCache.js';
import { Watcher } from './Watcher.js';

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
  .description('Analyze the impact of changing a file')
  .argument('<file>', 'File path')
  .argument('[path]', 'Path to the codebase', '.')
  .option('-w, --watch', 'Watch for changes and re-run automatically')
  .action(async (file, rawPath, opts) => {
    const targetPath = resolveTarget(rawPath);

    const run = (codebase: Codebase) => {
      const cf = findFile(codebase, file);
      if (!cf) { console.error(`Error: File "${file}" not found.`); return; }
      printJson(codebase.impact(cf.path));
    };

    try {
      if (opts.watch) {
        await startWatch(targetPath, (c) => run(c));
      } else {
        const codebase = await loadAndAnalyze(targetPath);
        const cf = findFile(codebase, file);
        if (!cf) { console.error(`Error: File "${file}" not found.`); process.exit(1); }
        printJson(codebase.impact(cf.path));
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

program.parse();
