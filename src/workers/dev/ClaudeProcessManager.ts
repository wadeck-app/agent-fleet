import { spawn, ChildProcess, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * ClaudeProcessManager
 *
 * Manages Claude Code process lifecycle including:
 * - Finding Claude executable path
 * - Spawning Claude processes (background/interactive/test modes)
 * - Killing Claude processes (platform-specific)
 * - Tracking process state
 */
export class ClaudeProcessManager {
  private claudeProcess: ChildProcess | null = null;
  private claudeStartTime: number = 0;
  private interactive: boolean;
  private testMode: boolean;
  private logPrefix: string;

  constructor(interactive: boolean = false, testMode: boolean = false, logPrefix: string = '[ClaudeProcessManager]') {
    this.interactive = interactive;
    this.testMode = testMode;
    this.logPrefix = logPrefix;
  }

  /**
   * Find the full path to claude executable
   */
  findClaudePath(): string {
    try {
      if (process.platform === 'win32') {
        const result = execSync('where claude', { encoding: 'utf8' }).trim();
        const paths = result.split('\n').map(p => p.trim());

        // Prefer .cmd over .bat
        const cmdPath = paths.find(p => p.endsWith('.cmd'));
        if (cmdPath) return cmdPath;

        const batPath = paths.find(p => p.endsWith('.bat'));
        if (batPath) return batPath;

        return paths[0];
      } else {
        return execSync('which claude', { encoding: 'utf8' }).trim();
      }
    } catch (error) {
      console.warn(`${this.logPrefix} Could not find claude in PATH, using 'claude' as fallback`);
      return 'claude';
    }
  }

  /**
   * Launch Claude Code process
   */
  async launchClaude(
    promptFile: string,
    contextDir: string,
    env: NodeJS.ProcessEnv
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`${this.logPrefix} Launching Claude in ${this.interactive ? 'INTERACTIVE' : 'BACKGROUND'} mode...`);

      if (this.interactive) {
        this.launchInteractive(promptFile, env, resolve, reject);
      } else {
        this.launchBackground(promptFile, env, resolve, reject);
      }
    });
  }

  /**
   * Launch Claude in interactive mode (stdio: 'inherit')
   */
  private launchInteractive(
    promptFile: string,
    env: NodeJS.ProcessEnv,
    resolve: () => void,
    reject: (error: Error) => void
  ): void {
    // Read prompt content for inline execution
    const promptContent = fs.readFileSync(promptFile, 'utf8');

    let command: string;
    let args: string[];

    if (this.testMode) {
      // TEST MODE: Use test script instead of real Claude
      const testScriptPath = path.join(process.cwd(), 'test-claude-with-stop.js');
      command = 'node';
      args = [testScriptPath, promptContent];
    } else {
      // Use real Claude
      const claudePath = this.findClaudePath();

      // On Windows, .cmd files need to be executed via cmd.exe
      if (process.platform === 'win32' && claudePath.endsWith('.cmd')) {
        command = 'cmd.exe';
        args = ['/c', claudePath, '--dangerously-skip-permissions', promptContent];
      } else {
        command = claudePath;
        args = ['--dangerously-skip-permissions', promptContent];
      }
    }

    // Record start time
    this.claudeStartTime = Date.now();

    // Use stdio: 'inherit' for full terminal control
    this.claudeProcess = spawn(command, args, {
      env,
      stdio: 'inherit',
      shell: false
    });

    this.claudeProcess.on('close', (code) => {
      const duration = ((Date.now() - this.claudeStartTime) / 1000).toFixed(2);
      console.log(`${this.logPrefix} Claude exited with code ${code}`);
      console.log(`${this.logPrefix} Execution time: ${duration}s`);
      this.claudeProcess = null;

      // In interactive mode, accept normal exit (0), taskkill (1), or signal (null)
      if (code === 0 || code === 1 || code === null) {
        resolve();
      } else {
        reject(new Error(`Claude exited with code ${code}`));
      }
    });

    this.claudeProcess.on('error', (error) => {
      console.error(`${this.logPrefix} Claude process error:`, error);
      this.claudeProcess = null;
      reject(error);
    });
  }

  /**
   * Launch Claude in background mode (capture output)
   */
  private launchBackground(
    promptFile: string,
    env: NodeJS.ProcessEnv,
    resolve: () => void,
    reject: (error: Error) => void
  ): void {
    let command: string;
    let args: string[];

    if (this.testMode) {
      const testScriptPath = path.join(process.cwd(), 'test-claude.bat');
      command = 'cmd.exe';
      args = ['/c', testScriptPath, 'background test'];
    } else {
      const claudePath = this.findClaudePath();

      // On Windows, .cmd files need to be executed via cmd.exe
      if (process.platform === 'win32' && claudePath.endsWith('.cmd')) {
        command = 'cmd.exe';
        args = ['/c', claudePath, '--dangerously-skip-permissions', '-p', promptFile];
      } else {
        command = claudePath;
        args = ['--dangerously-skip-permissions', '-p', promptFile];
      }
    }

    // Record start time
    this.claudeStartTime = Date.now();

    this.claudeProcess = spawn(command, args, {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false
    });

    // Close stdin immediately - Claude with -p flag reads from file, not stdin
    if (this.claudeProcess.stdin) {
      this.claudeProcess.stdin.end();
    }

    let stdout = '';
    let stderr = '';

    this.claudeProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      console.log(`[Claude] ${output.trim()}`);
    });

    this.claudeProcess.stderr?.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      console.error(`[Claude Error] ${output.trim()}`);
    });

    this.claudeProcess.on('close', (code, signal) => {
      const duration = ((Date.now() - this.claudeStartTime) / 1000).toFixed(2);
      console.log(`${this.logPrefix} Claude exited with code ${code}`);
      console.log(`${this.logPrefix} Execution time: ${duration}s`);
      this.claudeProcess = null;

      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Claude exited with code ${code}\n${stderr}`));
      }
    });

    this.claudeProcess.on('error', (error) => {
      console.error(`${this.logPrefix} Claude process error:`, error);
      this.claudeProcess = null;
      reject(error);
    });
  }

  /**
   * Kill Claude process if running
   */
  killClaude(): void {
    if (this.claudeProcess) {
      const pid = this.claudeProcess.pid;
      console.log(`${this.logPrefix} Killing Claude process (PID: ${pid})...`);

      try {
        if (pid && process.platform === 'win32') {
          // On Windows with stdio: 'inherit', only taskkill works reliably
          // Node.js signals close handles but don't affect the Windows process
          try {
            execSync(`taskkill /PID ${pid} /T /F`, {
              stdio: 'inherit', // Important: helps reset terminal state for Ctrl+C
              windowsHide: false
            });
            console.log(`${this.logPrefix} Process killed successfully`);
          } catch (killError: any) {
            // Process may have already exited
            if (!killError.message?.includes('not found')) {
              console.error(`${this.logPrefix} Kill error:`, killError.message);
            }
          }
        } else if (this.claudeProcess) {
          // Non-Windows: use SIGKILL
          this.claudeProcess.kill('SIGKILL');
        }

        this.claudeProcess = null;
      } catch (error) {
        console.error(`${this.logPrefix} Error killing process:`, error);
        this.claudeProcess = null;
      }
    }
  }

  /**
   * Check if Claude process is running
   */
  isRunning(): boolean {
    return this.claudeProcess !== null;
  }

  /**
   * Get current process PID
   */
  getProcessId(): number | undefined {
    return this.claudeProcess?.pid;
  }
}
