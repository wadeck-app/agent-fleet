import { BaseWorker } from '../base/BaseWorker.js';
import { Task, WorkerType, TaskStatus } from '../../shared/types.js';
import { Storage } from '../../shared/Storage.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { ClaudeProcessManager } from './ClaudeProcessManager.js';
import { PromptBuilder } from './PromptBuilder.js';
import { DevWorkerWebSocketServer } from './DevWorkerWebSocketServer.js';

export class DevWorker extends BaseWorker {
  private interactive: boolean;
  private testMode: boolean;
  private processManager: ClaudeProcessManager;
  private promptBuilder: PromptBuilder;
  private wsServer: DevWorkerWebSocketServer;

  constructor(
    wsUrl?: string,
    interactive: boolean = false,
    testMode: boolean = false,
    processManager?: ClaudeProcessManager,
    promptBuilder?: PromptBuilder,
    wsServer?: DevWorkerWebSocketServer
  ) {
    super(WorkerType.DEV, wsUrl);
    this.interactive = interactive;
    this.testMode = testMode;
    if (interactive) console.log(`[DevWorker] Interactive mode enabled`);
    if (testMode) console.log(`[DevWorker] Test mode enabled`);

    // Initialize components (allow dependency injection for testing)
    this.processManager = processManager || new ClaudeProcessManager(interactive, testMode, this.logPrefix());
    this.promptBuilder = promptBuilder || new PromptBuilder();
    this.wsServer = wsServer || new DevWorkerWebSocketServer(this.processManager, this.logPrefix());
  }

  protected async executeTask(task: Task): Promise<void> {
    console.log(`${this.logPrefix()} Starting task execution...`);

    this.sendTaskStarted(TaskStatus.IN_PROGRESS);

    try {
      // Prepare context for task
      const contextDir = Storage.getTaskContextDir(task.id);
      const promptFile = path.join(contextDir, 'prompt.md');

      // Write task description as prompt
      const prompt = this.promptBuilder.buildPrompt(task);
      fs.writeFileSync(promptFile, prompt, 'utf8');

      this.sendTaskProgress('Prompt prepared, launching Claude...');

      // Set environment variables for Claude hooks
      const env = {
        ...process.env,
        CLAUDE_WORKER_ID: this.workerId,
        CLAUDE_WORKER_SOCKET: `ws://localhost:${this.wsServer.getPort()}`,
        CLAUDE_TASK_ID: this.currentTask?.id || '',
        CLAUDE_CONTEXT_DIR: contextDir,
        CLAUDE_CODE_STOPPABLE: this.interactive ? 'true' : 'false'
      };

      // Launch Claude Code
      await this.processManager.launchClaude(promptFile, contextDir, env);

      // Mark task as completed (ready for review)
      this.sendTaskCompleted(
        { message: 'Implementation completed' },
        TaskStatus.REVIEW
      );

      console.log(`${this.logPrefix()} Task completed successfully`);
    } catch (error) {
      console.error(`${this.logPrefix()} Task failed:`, error);
      throw error;
    }
  }

  /**
   * Kill Claude process if running (delegates to process manager)
   */
  killClaude(): void {
    this.processManager.killClaude();
  }

  protected logPrefix():string {
    return `[DevWorker ${this.workerId}] `;
  }

  shutdown(): void {
    this.killClaude();

    // Close Claude WebSocket server
    this.wsServer.close();

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
