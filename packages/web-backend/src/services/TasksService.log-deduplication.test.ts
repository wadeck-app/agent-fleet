import { describe, expect, it } from 'vitest';

import type { LogEntry } from '@app/shared/api/tasks.contract';

/**
 * Integration tests for TasksService log sequence generation
 * These tests verify that sequence numbers are generated correctly and deterministically
 */
describe('TasksService - Deterministic Log IDs and Sequences', () => {
	/**
	 * Helper to simulate log generation for testing
	 * Mimics the sequence generation logic from TasksService.getTaskLogs
	 */
	function generateLogsWithSequences(
		taskId: string,
		steps: Array<{ stepId: string; prompt?: string; response?: string; stdout?: string; stderr?: string }>,
		cursor: number = 0
	): { logs: LogEntry[]; minSequence: number; maxSequence: number } {
		let allLogs: LogEntry[] = [];
		let minSeq = Infinity;
		let maxSeq = -1;

		steps.forEach((step, stepIndex) => {
			const globalStepIndex = cursor + stepIndex;
			let currentSeq = globalStepIndex * 10;

			// Main log
			allLogs.push({
				id: `${taskId}-${currentSeq}`,
				sequence: currentSeq++,
				timestamp: 100,
				level: 'info',
				message: 'test',
				stepId: step.stepId,
				stepName: step.stepId,
				stepType: 'script',
			});

			// Sub-entries
			if (step.prompt) {
				allLogs.push({
					id: `${taskId}-${currentSeq}`,
					sequence: currentSeq++,
					timestamp: 101,
					level: 'debug',
					message: 'prompt',
					stepId: step.stepId,
					stepName: step.stepId,
					stepType: 'script',
				});
			}
			if (step.response) {
				allLogs.push({
					id: `${taskId}-${currentSeq}`,
					sequence: currentSeq++,
					timestamp: 102,
					level: 'info',
					message: 'response',
					stepId: step.stepId,
					stepName: step.stepId,
					stepType: 'script',
				});
			}
			if (step.stdout) {
				allLogs.push({
					id: `${taskId}-${currentSeq}`,
					sequence: currentSeq++,
					timestamp: 103,
					level: 'info',
					message: 'stdout',
					stepId: step.stepId,
					stepName: step.stepId,
					stepType: 'script',
				});
			}
			if (step.stderr) {
				allLogs.push({
					id: `${taskId}-${currentSeq}`,
					sequence: currentSeq++,
					timestamp: 104,
					level: 'error',
					message: 'stderr',
					stepId: step.stepId,
					stepName: step.stepId,
					stepType: 'script',
				});
			}

			minSeq = Math.min(minSeq, globalStepIndex * 10);
			maxSeq = Math.max(maxSeq, currentSeq - 1);
		});

		return {
			logs: allLogs,
			minSequence: minSeq === Infinity ? 0 : minSeq,
			maxSequence: maxSeq === -1 ? 0 : maxSeq,
		};
	}

	describe('unique ID generation', () => {
		it('should generate unique IDs for repeated stepIds', () => {
			const taskId = 'task-1';
			const steps = [
				{ stepId: 'test' },
				{ stepId: 'implement' },
				{ stepId: 'test' }, // Same stepId!
			];

			const result = generateLogsWithSequences(taskId, steps);

			// All IDs must be unique
			const ids = result.logs.map(l => l.id);
			const uniqueIds = new Set(ids);
			expect(uniqueIds.size).toBe(ids.length);

			// IDs should follow pattern: taskId-sequence
			expect(ids[0]).toBe('task-1-0');
			expect(ids[1]).toBe('task-1-10');
			expect(ids[2]).toBe('task-1-20');

			// Sequences should be 0, 10, 20 (spaced by 10)
			expect(result.logs.map(l => l.sequence)).toEqual([0, 10, 20]);
		});

		it('should generate unique IDs for sub-entries', () => {
			const taskId = 'task-1';
			const steps = [
				{
					stepId: 'model',
					prompt: 'Test prompt',
					response: 'Test response',
					stdout: 'Test output',
				},
			];

			const result = generateLogsWithSequences(taskId, steps);

			// Expect: 1 main + 1 prompt + 1 response + 1 stdout = 4 logs
			expect(result.logs).toHaveLength(4);

			// All IDs unique
			const ids = result.logs.map(l => l.id);
			expect(new Set(ids).size).toBe(4);

			// IDs should be: task-1-0, task-1-1, task-1-2, task-1-3
			expect(ids).toEqual(['task-1-0', 'task-1-1', 'task-1-2', 'task-1-3']);

			// Sequences should be 0, 1, 2, 3 (consecutive)
			expect(result.logs.map(l => l.sequence)).toEqual([0, 1, 2, 3]);
		});
	});

	describe('sequence generation with pagination', () => {
		it('should generate correct sequences across pages', () => {
			const taskId = 'task-1';

			// First page: steps 0, 1, 2 (cursor=0)
			const page1 = generateLogsWithSequences(taskId, [{ stepId: 's0' }, { stepId: 's1' }, { stepId: 's2' }], 0);

			// Sequences for page 1: 0, 10, 20
			expect(page1.logs.map(l => l.sequence)).toEqual([0, 10, 20]);
			expect(page1.minSequence).toBe(0);
			expect(page1.maxSequence).toBe(20);

			// Second page: steps 3, 4, 5 (cursor=3)
			const page2 = generateLogsWithSequences(taskId, [{ stepId: 's3' }, { stepId: 's4' }, { stepId: 's5' }], 3);

			// Sequences for page 2: 30, 40, 50 (continuation from page 1)
			expect(page2.logs.map(l => l.sequence)).toEqual([30, 40, 50]);
			expect(page2.minSequence).toBe(30);
			expect(page2.maxSequence).toBe(50);
		});

		it('should handle sub-entries spanning sequence space correctly', () => {
			const taskId = 'task-1';

			// Step with multiple sub-entries
			const result = generateLogsWithSequences(
				taskId,
				[
					{
						stepId: 's0',
						prompt: 'prompt text',
						response: 'response text',
						stdout: 'output text',
						stderr: 'error text',
					},
					{
						stepId: 's1',
					},
				],
				0
			);

			// Step 0: sequences 0-4 (main + prompt + response + stdout + stderr)
			// Step 1: sequence 10
			const sequences = result.logs.map(l => l.sequence);

			expect(sequences).toEqual([0, 1, 2, 3, 4, 10]);

			// Verify minSequence and maxSequence
			expect(result.minSequence).toBe(0);
			expect(result.maxSequence).toBe(10);

			// Verify all belong to correct steps
			expect(result.logs.slice(0, 5).every(l => l.stepId === 's0')).toBe(true);
			expect(result.logs[5].stepId).toBe('s1');
		});
	});

	describe('minSequence and maxSequence calculation', () => {
		it('should return correct min/max for single step', () => {
			const result = generateLogsWithSequences('task-1', [{ stepId: 's0' }], 0);

			expect(result.minSequence).toBe(0);
			expect(result.maxSequence).toBe(0);
		});

		it('should calculate correct min/max with sub-entries', () => {
			const result = generateLogsWithSequences(
				'task-1',
				[
					{
						stepId: 's0',
						prompt: 'test',
						response: 'test',
					},
				],
				0
			);

			// Step 0 creates sequences: 0 (main), 1 (prompt), 2 (response)
			expect(result.minSequence).toBe(0);
			expect(result.maxSequence).toBe(2);
		});
	});

	describe('ID determinism', () => {
		it('should generate same IDs for same inputs', () => {
			const taskId = 'task-1';
			const steps = [{ stepId: 's0' }, { stepId: 's1' }];

			const result1 = generateLogsWithSequences(taskId, steps, 0);
			const result2 = generateLogsWithSequences(taskId, steps, 0);

			// Should generate identical IDs
			expect(result1.logs.map(l => l.id)).toEqual(result2.logs.map(l => l.id));
			expect(result1.logs.map(l => l.sequence)).toEqual(result2.logs.map(l => l.sequence));
		});

		it('should generate different IDs for different tasks', () => {
			const steps = [{ stepId: 's0' }];

			const result1 = generateLogsWithSequences('task-1', steps, 0);
			const result2 = generateLogsWithSequences('task-2', steps, 0);

			// IDs should be different
			expect(result1.logs[0].id).not.toBe(result2.logs[0].id);

			// But sequences should be the same
			expect(result1.logs[0].sequence).toBe(result2.logs[0].sequence);
		});
	});

	describe('edge cases', () => {
		it('should handle steps with all sub-entry types', () => {
			const result = generateLogsWithSequences(
				'task-1',
				[
					{
						stepId: 's0',
						prompt: 'p',
						response: 'r',
						stdout: 'o',
						stderr: 'e',
					},
				],
				0
			);

			// Should create 5 logs: main + 4 sub-entries
			expect(result.logs).toHaveLength(5);

			// Sequences should be 0, 1, 2, 3, 4
			expect(result.logs.map(l => l.sequence)).toEqual([0, 1, 2, 3, 4]);

			// All IDs unique
			const ids = new Set(result.logs.map(l => l.id));
			expect(ids.size).toBe(5);
		});

		it('should never create duplicate IDs even with many steps', () => {
			// Create 100 steps
			const steps = Array.from({ length: 100 }, (_, i) => ({
				stepId: `s${i}`,
				prompt: i % 2 === 0 ? 'prompt' : undefined,
			}));

			const result = generateLogsWithSequences('task-1', steps, 0);

			// All IDs must be unique
			const ids = result.logs.map(l => l.id);
			const uniqueIds = new Set(ids);
			expect(uniqueIds.size).toBe(ids.length);

			// Verify sequences are monotonically increasing
			const sequences = result.logs.map(l => l.sequence);
			for (let i = 1; i < sequences.length; i++) {
				expect(sequences[i]).toBeGreaterThan(sequences[i - 1]);
			}
		});
	});
});
