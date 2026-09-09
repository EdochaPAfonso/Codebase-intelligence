#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { Codebase } from '../index.js';
import { CACHE_DIR_NAME } from '../core/AnalysisCache.js';

const program = new Command();

program
  .name('codebase-intelligence')
  .description('CLI to analyze and understand codebases')
  .version('0.1.0');

const getCodebase = async (path: string) => {
  const targetPath = path || '.';
  const codebase = await Codebase.load(targetPath);
  await codebase.analyze();
  return codebase;
};

const printJson = (data: any) => {
  console.log(JSON.stringify(data, null, 2));
};

program
  .command('analyze')
  .description('Analyze the codebase and output project info, files and symbols summary')
  .argument('[path]', 'Path to the codebase', '.')
  .action(async (path) => {
    try {
      const codebase = await getCodebase(path);
      const result = {
        project: codebase.projectInfo(),
        filesCount: codebase.files().length,
        symbolsCount: codebase.symbols().length
      };
      printJson(result);
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('search')
  .description('Search for a symbol or file')
  .argument('<query>', 'The search query')
  .argument('[path]', 'Path to the codebase', '.')
  .action(async (query, path) => {
    try {
      const codebase = await getCodebase(path);
      const results = codebase.search(query);
      printJson(results);
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('dependencies')
  .description('List dependencies of a specific file')
  .argument('<file>', 'File path (relative to codebase or absolute)')
  .argument('[path]', 'Path to the codebase', '.')
  .action(async (file, path) => {
    try {
      const codebase = await getCodebase(path);
      // Ensure file path matches the graph's format (usually absolute or specific relative)
      // For the CLI, users might provide short paths, but our graph expects the full path or the normalized relative path
      // Let's search for the exact file first
      const codebaseFile = codebase.files().find(f => f.path.endsWith(file) || f.relativePath === file);
      if (!codebaseFile) {
        console.error(`Error: File "${file}" not found in codebase.`);
        process.exit(1);
      }
      
      const deps = codebase.dependencies(codebaseFile.path);
      printJson(deps);
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('dependents')
  .description('List files that depend on a specific file')
  .argument('<file>', 'File path')
  .argument('[path]', 'Path to the codebase', '.')
  .action(async (file, path) => {
    try {
      const codebase = await getCodebase(path);
      const codebaseFile = codebase.files().find(f => f.path.endsWith(file) || f.relativePath === file);
      if (!codebaseFile) {
        console.error(`Error: File "${file}" not found in codebase.`);
        process.exit(1);
      }
      
      const deps = codebase.dependents(codebaseFile.path);
      printJson(deps);
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('impact')
  .description('Analyze the impact of changing a file')
  .argument('<file>', 'File path')
  .argument('[path]', 'Path to the codebase', '.')
  .action(async (file, path) => {
    try {
      const codebase = await getCodebase(path);
      const codebaseFile = codebase.files().find(f => f.path.endsWith(file) || f.relativePath === file);
      if (!codebaseFile) {
        console.error(`Error: File "${file}" not found in codebase.`);
        process.exit(1);
      }
      
      const impact = codebase.impact(codebaseFile.path);
      printJson(impact);
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
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
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

program.parse();
