import { Task, TaskStatus } from '../../shared/types.js';

/**
 * PromptBuilder
 *
 * Builds prompts for Claude Code from task information including:
 * - Task description and metadata
 * - Comments from reviewers
 * - Implementation instructions
 * - Status-specific warnings
 */
export class PromptBuilder {
  /**
   * Build prompt for Claude from task
   */
  buildPrompt(task: Task): string {
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
}
