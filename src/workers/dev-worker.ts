import { spawn, ChildProcess, execSync } from 'child_process';
import { BaseWorker } from './base-worker.js';
import { Task, WorkerType, TaskStatus } from '../shared/types.js';
import { Storage } from '../shared/storage.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';

export class DevWorker extends BaseWorker {
  private claudeProcess: ChildProcess | null = null;
  private claudeWss: WebSocketServer | null = null;
  private claudeWsPort: number = 0;
  private claudeSocket: WebSocket | null = null;
  private interactive: boolean;
  private claudeStartTime: number = 0;
  private testMode: boolean = false;

  constructor(wsUrl?: string, interactive: boolean = false, testMode: boolean = false) {
    super(WorkerType.DEV, wsUrl);
    this.interactive = interactive;
    this.testMode = testMode;
    if (interactive) console.log(`[DevWorker] Interactive mode enabled`);
    if (testMode) console.log(`[DevWorker] Test mode enabled`);
    this.setupClaudeWebSocketServer();
  }

  protected async executeTask(task: Task): Promise<void> {
    console.log(`[DevWorker ${this.workerId}] Starting task execution...`);

    this.sendTaskStarted(TaskStatus.IN_PROGRESS);

    try {
      // Prepare context for task
      const contextDir = Storage.getTaskContextDir(task.id);
      const promptFile = path.join(contextDir, 'prompt.md');

      // Write task description as prompt
      const prompt = this.buildPrompt(task);
      fs.writeFileSync(promptFile, prompt, 'utf8');

      this.sendTaskProgress('Prompt prepared, launching Claude...');

      // Launch Claude Code
      await this.launchClaude(promptFile, contextDir);

      // Mark task as completed (ready for review)
      this.sendTaskCompleted(
        { message: 'Implementation completed' },
        TaskStatus.REVIEW
      );

      console.log(`[DevWorker ${this.workerId}] Task completed successfully`);
    } catch (error) {
      console.error(`[DevWorker ${this.workerId}] Task failed:`, error);
      throw error;
    }
  }

  /**
   * Setup WebSocket server for Claude processes to communicate with this worker
   */
  private setupClaudeWebSocketServer(): void {
    // Create WebSocket server on a random available port
    this.claudeWss = new WebSocketServer({ port: 0 });

    this.claudeWss.on('listening', () => {
      const address = this.claudeWss!.address();
      if (typeof address === 'object' && address !== null) {
        this.claudeWsPort = address.port;
        console.log(`[DevWorker ${this.workerId}] Claude WebSocket server listening on port ${this.claudeWsPort}`);
      }
    });

    this.claudeWss.on('connection', (socket: WebSocket) => {
      console.log(`[DevWorker ${this.workerId}] Claude process connected to worker socket`);
      this.claudeSocket = socket;

      socket.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClaudeMessage(message);
        } catch (error) {
          console.error(`[DevWorker ${this.workerId}] Error parsing Claude message:`, error);
        }
      });

      socket.on('close', () => {
        console.log(`[DevWorker ${this.workerId}] Claude socket disconnected`);
        this.claudeSocket = null;
      });

      socket.on('error', (error) => {
        console.error(`[DevWorker ${this.workerId}] Claude socket error:`, error);
      });
    });

    this.claudeWss.on('error', (error) => {
      console.error(`[DevWorker ${this.workerId}] Claude WebSocket server error:`, error);
    });
  }

  /**
   * Handle messages from Claude processes (via hooks)
   */
  private handleClaudeMessage(message: any): void {
    switch (message.type) {
      case 'STOP_REQUESTED':
        console.log(`[DevWorker ${this.workerId}] Stop requested by Claude, killing process...`);
        this.killClaude();
        break;

      case 'HOOK_EVENT':
        console.log(`[DevWorker ${this.workerId}] Hook event: ${message.hookName}`);
        break;

      default:
        console.log(`[DevWorker ${this.workerId}] Unknown message type: ${message.type}`);
    }
  }

  /**
   * Find the full path to claude executable
   */
  private findClaudePath(): string {
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
      console.warn(`[DevWorker ${this.workerId}] Could not find claude in PATH, using 'claude' as fallback`);
      return 'claude';
    }
  }

  /**
   * Build prompt for Claude from task
   */
  private buildPrompt(task: Task): string {
    let prompt = `# Task: ${task.description}\n\n`;
    prompt += `**Priority:** ${task.priority}\n`;
    prompt += `**Task ID:** ${task.id}\n\n`;

    if (task.comments.length > 0) {
      prompt += `## Comments:\n\n`;
      task.comments.forEach(comment => {
        prompt += `- **${comment.author}** (${comment.timestamp}):\n`;
        prompt += `  ${comment.content}\n\n`;
      });
    }

    prompt += `## Instructions:\n\n`;
    prompt += `Please implement this task following these guidelines:\n\n`;
    prompt += `1. Read and understand the existing codebase\n`;
    prompt += `2. Implement the required functionality\n`;
    prompt += `3. Write tests for your implementation\n`;
    prompt += `4. Run tests to ensure everything works\n`;
    prompt += `5. Create a clean, well-documented solution\n\n`;

    if (task.status === TaskStatus.CHANGES_REQUESTED) {
      prompt += `⚠️ **This task has been returned from review with requested changes.**\n`;
      prompt += `Please address all review comments before re-submitting.\n\n`;
    }

    return prompt;
  }

  /**
   * Launch Claude Code process
   */
  private async launchClaude(promptFile: string, contextDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`[DevWorker ${this.workerId}] Launching Claude in ${this.interactive ? 'INTERACTIVE' : 'BACKGROUND'} mode...`);

      // Set environment variables for Claude hooks
      const env = {
        ...process.env,
        CLAUDE_WORKER_ID: this.workerId,
        CLAUDE_WORKER_SOCKET: `ws://localhost:${this.claudeWsPort}`,
        CLAUDE_TASK_ID: this.currentTask?.id || '',
        CLAUDE_CONTEXT_DIR: contextDir,
        CLAUDE_CODE_STOPPABLE: this.interactive ? 'true' : 'false'
      };

      if (this.interactive) {
        // Interactive mode: Claude takes over the terminal
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
          console.log(`[DevWorker ${this.workerId}] Claude exited with code ${code}`);
          console.log(`[DevWorker ${this.workerId}] Execution time: ${duration}s`);
          this.claudeProcess = null;

          // In interactive mode, accept normal exit (0), taskkill (1), or signal (null)
          if (code === 0 || code === 1 || code === null) {
            resolve();
          } else {
            reject(new Error(`Claude exited with code ${code}`));
          }
        });

        this.claudeProcess.on('error', (error) => {
          console.error(`[DevWorker ${this.workerId}] Claude process error:`, error);
          this.claudeProcess = null;
          reject(error);
        });
      } else {
        // Background mode: Capture output
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
          console.log(`[DevWorker ${this.workerId}] Claude exited with code ${code}`);
          console.log(`[DevWorker ${this.workerId}] Execution time: ${duration}s`);
          this.claudeProcess = null;

          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Claude exited with code ${code}\n${stderr}`));
          }
        });

        this.claudeProcess.on('error', (error) => {
          console.error(`[DevWorker ${this.workerId}] Claude process error:`, error);
          this.claudeProcess = null;
          reject(error);
        });
      }
    });
  }

  /**
   * Kill Claude process if running
   */
  killClaude(): void {
    if (this.claudeProcess) {
      const pid = this.claudeProcess.pid;
      console.log(`[DevWorker ${this.workerId}] Killing Claude process (PID: ${pid})...`);

      try {
        if (pid && process.platform === 'win32') {
          // On Windows with stdio: 'inherit', only taskkill works reliably
          // Node.js signals close handles but don't affect the Windows process
          try {
            execSync(`taskkill /PID ${pid} /T /F`, {
              stdio: 'inherit', // Important: helps reset terminal state for Ctrl+C
              windowsHide: false
            });
            console.log(`[DevWorker ${this.workerId}] Process killed successfully`);
          } catch (killError: any) {
            // Process may have already exited
            if (!killError.message?.includes('not found')) {
              console.error(`[DevWorker ${this.workerId}] Kill error:`, killError.message);
            }
          }
        } else if (this.claudeProcess) {
          // Non-Windows: use SIGKILL
          this.claudeProcess.kill('SIGKILL');
        }

        this.claudeProcess = null;
      } catch (error) {
        console.error(`[DevWorker ${this.workerId}] Error killing process:`, error);
        this.claudeProcess = null;
      }
    }
  }

  shutdown(): void {
    this.killClaude();

    // Close Claude WebSocket server
    if (this.claudeWss) {
      console.log(`[DevWorker ${this.workerId}] Closing Claude WebSocket server...`);
      this.claudeWss.close(() => {
        console.log(`[DevWorker ${this.workerId}] Claude WebSocket server closed`);
      });
      this.claudeWss = null;
    }

    super.shutdown();
  }
}

// Entry point if run directly
// Use fileURLToPath to properly compare paths on all platforms
const currentFilePath = fileURLToPath(import.meta.url);
const mainFilePath = process.argv[1];
const isMainModule = currentFilePath === mainFilePath;

if (isMainModule) {
  console.log('[DevWorker] Starting Dev Worker...');

  // Check for interactive mode from CLI args or environment variable
  const interactiveArg = process.argv.includes('--interactive') || process.argv.includes('-i');
  const interactiveEnv = process.env.WORKER_INTERACTIVE === 'true';
  const interactive = interactiveArg || interactiveEnv;

  // Check for test mode
  const testMode = process.argv.includes('--test') || process.env.WORKER_TEST === 'true';

  const worker = new DevWorker(undefined, interactive, testMode);

  worker.connect().then(() => {
    console.log('[DevWorker] Worker started and connected');
  }).catch((error) => {
    console.error('[DevWorker] Failed to connect:', error.message);
    console.error('[DevWorker] Make sure the orchestrator is running on ws://localhost:3738');
    process.exit(1);
  });

  // Handle shutdown signals
  process.on('SIGINT', () => {
    console.log('\n[DevWorker] Received SIGINT, shutting down...');
    worker.shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n[DevWorker] Received SIGTERM, shutting down...');
    worker.shutdown();
    process.exit(0);
  });
}
