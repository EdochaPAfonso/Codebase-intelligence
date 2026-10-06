/**
 * Diff Impact — Git-specific Errors
 *
 * These errors are specific to the Git layer and should not be caught by
 * general application code unless the caller is explicitly handling Git
 * failures.
 *
 * Library consumers who inject a custom `ChangeSetProvider` will never see
 * these errors unless their provider chooses to re-use them.
 */

/**
 * Thrown when `git` is not found in PATH or returns a non-zero exit code
 * during the availability check.
 */
export class GitNotAvailableError extends Error {
  constructor(message = 'git is not available in PATH.') {
    super(message);
    this.name = 'GitNotAvailableError';
  }
}

/**
 * Thrown when the target directory (or any ancestor) is not a Git repository.
 *
 * Typically triggered when `git rev-parse --git-dir` fails.
 */
export class NotAGitRepositoryError extends Error {
  constructor(public readonly directory: string) {
    super(
      `"${directory}" is not inside a Git repository. ` +
        'Run `git init` or specify a path that is part of a repository.',
    );
    this.name = 'NotAGitRepositoryError';
  }
}

/**
 * Thrown when a Git ref (branch, tag, commit SHA) provided by the caller
 * cannot be resolved in the current repository.
 */
export class InvalidGitRefError extends Error {
  constructor(public readonly ref: string) {
    super(
      `Git ref "${ref}" could not be resolved. ` +
        'Make sure the ref exists and that the repository has been fetched. ' +
        'In CI environments, use `fetch-depth: 0` to include all history.',
    );
    this.name = 'InvalidGitRefError';
  }
}

/**
 * Thrown when a `git` sub-command exits with a non-zero status code.
 *
 * The `command` and `args` fields allow callers to log or display the
 * exact invocation that failed.
 */
export class GitCommandError extends Error {
  constructor(
    public readonly command: string,
    public readonly args: string[],
    public readonly stderr: string,
    public readonly exitCode: number,
  ) {
    super(
      `git ${args.join(' ')} failed with exit code ${exitCode}.\n` +
        (stderr ? `stderr: ${stderr}` : ''),
    );
    this.name = 'GitCommandError';
  }
}
