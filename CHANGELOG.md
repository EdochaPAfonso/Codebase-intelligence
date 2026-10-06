# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- **Diff Impact Analysis**: Added `Codebase.impactOfChanges(options?, provider?)` and `Codebase.impactOfFiles(paths: string[])` to determine the structural blast radius of a set of file changes.
- **Diff Impact CLI**: Extended the `impact` CLI command with `--since <ref>`, `--staged`, and `--uncommitted` to analyze Git changes directly from the terminal.
- **Test Discovery**: Impact analysis now automatically discovers related test files by naming convention (e.g., `*.test.ts`, `*.spec.js`).
- `GitChangeSetProvider` to query Git for modified, added, and deleted files.
- `ChangeSetImpactAnalyzer` to correlate file changes with the dependency graph.

### Changed
- CLI `impact` command now outputs a more structured, grouped text format with a `--format json` option for machine parsing.

### Fixed
- Fixed unresolvable import specifiers crashing the dependency graph generation (they are now categorized as `unresolvedDependencies`).
