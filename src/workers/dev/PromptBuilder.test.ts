/**
 * PromptBuilder Tests
 *
 * Tests for the PromptBuilder class which builds prompts for Claude Code.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PromptBuilder } from './PromptBuilder.js';
import type { Task, TaskStatus } from '../../shared/types.js';

describe('PromptBuilder', () => {
	let builder: PromptBuilder;
	let mockTask: Task;

	beforeEach(() => {
		builder = new PromptBuilder();

		mockTask = {
			id: 'task-123',
			description: 'Test task description',
			status: 'todo' as TaskStatus,
			priority: 'medium',
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			assignedTo: null,
			comments: [],
			metadata: {},
			history: [],
		};
	});

	describe('buildPrompt', () => {
		it('should build prompt with task description', () => {
			const prompt = builder.buildPrompt(mockTask);

			expect(prompt).toContain('# Task: Test task description');
		});

		it('should include priority in prompt', () => {
			const prompt = builder.buildPrompt(mockTask);

			expect(prompt).toContain('**Priority:** medium');
		});

		it('should include task ID in prompt', () => {
			const prompt = builder.buildPrompt(mockTask);

			expect(prompt).toContain('**Task ID:** task-123');
		});

		it('should include implementation instructions', () => {
			const prompt = builder.buildPrompt(mockTask);

			expect(prompt).toContain('## Instructions:');
			expect(prompt).toContain('Read and understand the existing codebase');
			expect(prompt).toContain('Write tests for your implementation');
		});

		it('should include comments section when comments exist', () => {
			const taskWithComments: Task = {
				...mockTask,
				comments: [
					{
						timestamp: '2025-01-01T10:00:00Z',
						author: 'Jane Smith',
						content: 'Add logging',
					},
				],
			};

			const prompt = builder.buildPrompt(taskWithComments);

			expect(prompt).toContain('## Comments:');
			expect(prompt).toContain('Jane Smith');
			expect(prompt).toContain('Add logging');
		});

		it('should not include comments section when no comments', () => {
			const prompt = builder.buildPrompt(mockTask);

			expect(prompt).not.toContain('## Comments:');
		});

		it('should include multiple comments if present', () => {
			const taskWithComments: Task = {
				...mockTask,
				comments: [
					{
						timestamp: '2025-01-01T10:00:00Z',
						author: 'Alice',
						content: 'First comment',
					},
					{
						timestamp: '2025-01-01T11:00:00Z',
						author: 'Bob',
						content: 'Second comment',
					},
				],
			};

			const prompt = builder.buildPrompt(taskWithComments);

			expect(prompt).toContain('Alice');
			expect(prompt).toContain('First comment');
			expect(prompt).toContain('Bob');
			expect(prompt).toContain('Second comment');
		});

		it('should include warning for CHANGES_REQUESTED status', () => {
			const taskWithChanges: Task = {
				...mockTask,
				status: 'changes_requested' as TaskStatus,
			};

			const prompt = builder.buildPrompt(taskWithChanges);

			expect(prompt).toContain('⚠️');
			expect(prompt).toContain('returned from review with requested changes');
			expect(prompt).toContain('Please address all review comments');
		});

		it('should not include warning for other statuses', () => {
			const prompt = builder.buildPrompt(mockTask);

			expect(prompt).not.toContain('⚠️');
			expect(prompt).not.toContain('returned from review');
		});

		it('should format comments with author and timestamp', () => {
			const taskWithComments: Task = {
				...mockTask,
				comments: [
					{
						timestamp: '2025-01-01T10:00:00Z',
						author: 'John Doe',
						content: 'Please add error handling',
					},
				],
			};

			const prompt = builder.buildPrompt(taskWithComments);

			expect(prompt).toContain('**John Doe** (2025-01-01T10:00:00Z)');
			expect(prompt).toContain('Please add error handling');
		});

		it('should handle empty task description', () => {
			const taskEmpty: Task = {
				...mockTask,
				description: '',
			};

			const prompt = builder.buildPrompt(taskEmpty);

			expect(prompt).toContain('# Task: ');
		});

		it('should handle tasks with high priority', () => {
			const taskHighPriority: Task = {
				...mockTask,
				priority: 'high',
			};

			const prompt = builder.buildPrompt(taskHighPriority);

			expect(prompt).toContain('**Priority:** high');
		});
	});
});
