/**
 * Script Executor
 *
 * Executes shell scripts/commands and captures output.
 * Simple wrapper around child_process for flow steps.
 */

import { spawn } from 'child_process';
import * as path from 'path';

/**
 * Result of script execution
 */
export interface ScriptExecutionResult {
  /** Exit code (0 = success) */
  exitCode: number;

  /** Standard output */
  stdout: string;

  /** Standard error */
  stderr: string;

  /** Execution duration in milliseconds */
  durationMs: number;

  /** Whether execution was successful (exitCode === 0) */
  success: boolean;
}

/**
 * Options for script execution
 */
export interface ScriptExecutionOptions {
  /** Script/command to execute */
  script: string;

  /** Working directory (defaults to current directory) */
  workingDir?: string;

  /** Environment variables (merged with process.env) */
  env?: Record<string, string>;

  /** Timeout in milliseconds (0 = no timeout) */
  timeout?: number;

  /** Shell to use (defaults to platform default) */
  shell?: string | boolean;
}

/**
 * Script execution error
 */
export class ScriptExecutionError extends Error {
  constructor(
    message: string,
    public exitCode: number,
    public stdout: string,
    public stderr: string
  ) {
    super(message);
    this.name = 'ScriptExecutionError';
  }
}

/**
 * Script Executor class
 */
export class ScriptExecutor {
  /**
   * Execute a script and return the result
   *
   * @param options - Execution options
   * @returns Execution result
   */
  public async execute(
    options: ScriptExecutionOptions
  ): Promise<ScriptExecutionResult> {
    const startTime = Date.now();
    const workingDir = options.workingDir || process.cwd();
    const env = { ...process.env, ...options.env };
    const shell = options.shell !== undefined ? options.shell : true;

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let killed = false;

      // Spawn process
      const child = spawn(options.script, [], {
        cwd: workingDir,
        env,
        shell,
        stdio: ['ignore', 'pipe', 'pipe'], // stdin ignored, capture stdout/stderr
      });

      // Capture stdout
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      // Capture stderr
      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Handle timeout
      let timeoutId: NodeJS.Timeout | undefined;
      if (options.timeout && options.timeout > 0) {
        timeoutId = setTimeout(() => {
          killed = true;
          child.kill('SIGTERM');

          // Force kill after 5s if still running
          setTimeout(() => {
            if (!child.killed) {
              child.kill('SIGKILL');
            }
          }, 5000);
        }, options.timeout);
      }

      // Handle exit
      child.on('close', (code) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        const durationMs = Date.now() - startTime;
        const exitCode = killed ? -1 : (code ?? -1);

        const result: ScriptExecutionResult = {
          exitCode,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          durationMs,
          success: exitCode === 0,
        };

        if (killed) {
          reject(
            new ScriptExecutionError(
              `Script execution timed out after ${options.timeout}ms`,
              -1,
              stdout,
              stderr
            )
          );
        } else {
          resolve(result);
        }
      });

      // Handle errors
      child.on('error', (error) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        reject(
          new ScriptExecutionError(
            `Failed to execute script: ${error.message}`,
            -1,
            stdout,
            stderr
          )
        );
      });
    });
  }

  /**
   * Execute a script and throw on non-zero exit code
   *
   * @param options - Execution options
   * @returns Execution result
   * @throws ScriptExecutionError if exit code is non-zero
   */
  public async executeOrThrow(
    options: ScriptExecutionOptions
  ): Promise<ScriptExecutionResult> {
    const result = await this.execute(options);

    if (!result.success) {
      throw new ScriptExecutionError(
        `Script failed with exit code ${result.exitCode}`,
        result.exitCode,
        result.stdout,
        result.stderr
      );
    }

    return result;
  }

  /**
   * Execute a simple command (convenience method)
   *
   * @param script - Script/command to execute
   * @param workingDir - Optional working directory
   * @returns Execution result
   */
  public async run(
    script: string,
    workingDir?: string
  ): Promise<ScriptExecutionResult> {
    return this.execute({ script, workingDir });
  }
}
