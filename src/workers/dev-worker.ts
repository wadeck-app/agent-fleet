import { spawn, ChildProcess } from 'child_process';
import { BaseWorker } from './base-worker.js';
import { Task, WorkerType, TaskStatus } from '../shared/types.js';
import { Storage } from '../shared/storage.js';
import path from 'path';
import fs from 'fs';

export class DevWorker extends BaseWorker {
  private claudeProcess: ChildProcess | null = null;

  constructor(wsUrl?: string) {
    super(WorkerType.DEV, wsUrl);
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
      console.log(`[DevWorker ${this.workerId}] Launching Claude...`);

      // Set environment variables for Claude hooks
      const env = {
        ...process.env,
        CLAUDE_WORKER_ID: this.workerId,
        CLAUDE_WORKER_SOCKET: this.wsUrl,
        CLAUDE_TASK_ID: this.currentTask?.id || '',
        CLAUDE_CONTEXT_DIR: contextDir
      };

      // Launch Claude in non-interactive mode
      // For MVP, we'll use a simple approach: pass prompt via stdin
      this.claudeProcess = spawn('claude', ['-p', promptFile], {
        env,
        stdio: ['pipe', 'pipe', 'pipe']
      });

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

      this.claudeProcess.on('close', (code) => {
        console.log(`[DevWorker ${this.workerId}] Claude exited with code ${code}`);
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
    });
  }

  /**
   * Kill Claude process if running
   */
  killClaude(): void {
    if (this.claudeProcess) {
      console.log(`[DevWorker ${this.workerId}] Killing Claude process...`);
      this.claudeProcess.kill('SIGTERM');
      this.claudeProcess = null;
    }
  }

  shutdown(): void {
    this.killClaude();
    super.shutdown();
  }
}

// Entry point if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const worker = new DevWorker();

  worker.connect().then(() => {
    console.log('[DevWorker] Worker started and connected');
  }).catch((error) => {
    console.error('[DevWorker] Failed to start:', error);
    process.exit(1);
  });

  // Handle shutdown signals
  process.on('SIGINT', () => {
    console.log('\n[DevWorker] Received SIGINT, shutting down...');
    worker.shutdown();
  });

  process.on('SIGTERM', () => {
    console.log('\n[DevWorker] Received SIGTERM, shutting down...');
    worker.shutdown();
  });
}
