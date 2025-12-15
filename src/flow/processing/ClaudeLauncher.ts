/**
 * Claude Launcher
 *
 * Launches and executes Claude Code processes in:
 * - Interactive mode (stdio: inherit, terminal takeover)
 * - Background mode (capture stdout/stderr)
 */

import { spawn, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Result from launching Claude in interactive mode
 */
export interface ClaudeInteractiveResult {
  response: string;
  exitCode: number | null;
}

/**
 * Result from launching Claude in background mode
 */
export interface ClaudeBackgroundResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Options for launching Claude
 */
export interface ClaudeLaunchOptions {
  /** Working directory */
  workingDir: string;

  /** Prompt to send to Claude */
  prompt: string;

  /** Step ID (for temp file naming) */
  stepId: string;

  /** Model to use (optional) */
  model?: string;

  /** Environment variables for Claude */
  env?: Record<string, string>;

  /** Callback when process starts */
  onProcessStarted?: (process: any) => void;
}

/**
 * Claude Launcher
 */
export class ClaudeLauncher {
  /**
   * Find Claude executable path
   */
  public findClaudePath(): string {
    try {
      if (process.platform === 'win32') {
        const result = execSync('where claude', { encoding: 'utf8' }).trim();
        const paths = result.split('\n').map(p => p.trim());
        const cmdPath = paths.find(p => p.endsWith('.cmd'));
        if (cmdPath) return cmdPath;
        const batPath = paths.find(p => p.endsWith('.bat'));
        if (batPath) return batPath;
        return paths[0];
      } else {
        return execSync('which claude', { encoding: 'utf8' }).trim();
      }
    } catch (error) {
      console.warn('Could not find claude in PATH, using "claude" as fallback');
      return 'claude';
    }
  }

  /**
   * Launch Claude in interactive mode
   */
  public async launchInteractive(
    options: ClaudeLaunchOptions
  ): Promise<ClaudeInteractiveResult> {
    const claudePath = this.findClaudePath();
    const { command, args } = this.buildCommand(
      claudePath,
      options.prompt,
      options.model,
      undefined, // No temp file for interactive mode
      true // interactive
    );

    console.log(`\n🤖 Launching Claude (${options.model || 'default'}) in interactive mode...`);
    console.log(`💬 Prompt: ${options.prompt.substring(0, 100)}${options.prompt.length > 100 ? '...' : ''}\n`);

    return this.executeInteractive(command, args, options);
  }

  /**
   * Launch Claude in background mode
   */
  public async launchBackground(
    options: ClaudeLaunchOptions
  ): Promise<ClaudeBackgroundResult> {
    const claudePath = this.findClaudePath();

    // Create temp prompt file
    const tempPromptFile = path.join(
      options.workingDir,
      `.agent-fleet-prompt-${options.stepId}.txt`
    );
    fs.writeFileSync(tempPromptFile, options.prompt, 'utf8');

    try {
      const { command, args } = this.buildCommand(
        claudePath,
        options.prompt,
        options.model,
        tempPromptFile,
        false // background
      );

      console.log(`🤖 Launching Claude (${options.model || 'default'}) in background mode...`);

      return await this.executeBackground(command, args, options);
    } finally {
      // Cleanup temp file
      if (fs.existsSync(tempPromptFile)) {
        fs.unlinkSync(tempPromptFile);
      }
    }
  }

  /**
   * Build command and args for launching Claude
   */
  private buildCommand(
    claudePath: string,
    prompt: string,
    model: string | undefined,
    tempPromptFile: string | undefined,
    interactive: boolean
  ): { command: string; args: string[] } {
    let command: string;
    let args: string[];

    if (process.platform === 'win32' && claudePath.endsWith('.cmd')) {
      command = 'cmd.exe';
      args = ['/c', claudePath, '--dangerously-skip-permissions'];
    } else {
      command = claudePath;
      args = ['--dangerously-skip-permissions'];
    }

    if (model) {
      args.push('--model', model);
    }

    if (interactive) {
      // Interactive mode: pass prompt directly
      args.push(prompt);
    } else {
      // Background mode: use temp file
      args.push('-p', tempPromptFile!);
    }

    return { command, args };
  }

  /**
   * Execute Claude in interactive mode
   */
  private async executeInteractive(
    command: string,
    args: string[],
    options: ClaudeLaunchOptions
  ): Promise<ClaudeInteractiveResult> {
    return new Promise((resolve, reject) => {
      const claudeProcess = spawn(command, args, {
        cwd: options.workingDir,
        stdio: 'inherit',
        shell: false,
        env: {
          ...process.env,
          ...options.env,
        },
      });

      // Call callback to store process reference
      if (options.onProcessStarted) {
        options.onProcessStarted(claudeProcess);
      }

      claudeProcess.on('close', (code) => {
        resolve({
          response: '', // Interactive mode doesn't capture output
          exitCode: code,
        });
      });

      claudeProcess.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Execute Claude in background mode
   */
  private async executeBackground(
    command: string,
    args: string[],
    options: ClaudeLaunchOptions
  ): Promise<ClaudeBackgroundResult> {
    return new Promise((resolve, reject) => {
      const claudeProcess = spawn(command, args, {
        cwd: options.workingDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        env: {
          ...process.env,
          ...options.env,
        },
      });

      // Call callback to store process reference
      if (options.onProcessStarted) {
        options.onProcessStarted(claudeProcess);
      }

      // Close stdin immediately
      if (claudeProcess.stdin) {
        claudeProcess.stdin.end();
      }

      let stdout = '';
      let stderr = '';

      claudeProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        console.log(`[Claude] ${output.trim()}`);
      });

      claudeProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        console.error(`[Claude Error] ${output.trim()}`);
      });

      claudeProcess.on('close', (code) => {
        resolve({
          stdout,
          stderr,
          exitCode: code || 0,
        });
      });

      claudeProcess.on('error', (error) => {
        reject(error);
      });
    });
  }
}
