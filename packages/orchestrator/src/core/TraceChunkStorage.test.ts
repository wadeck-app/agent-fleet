/**
 * TraceChunkStorage Tests
 */
import * as fs from 'fs';
import * as path from 'path';
import { directoryExists, fileExists } from 'test-utils/helpers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TraceChunkStorage } from './TraceChunkStorage';

describe('TraceChunkStorage', () => {
	let storage: TraceChunkStorage;
	let testDir: string;

	beforeEach(async () => {
		// Create temporary directory for tests
		testDir = path.join(process.cwd(), 'test-data', `test-${Date.now()}`);
		await fs.promises.mkdir(testDir, { recursive: true });
		storage = new TraceChunkStorage(testDir);
	});

	afterEach(async () => {
		// Clean up test directory
		await fs.promises.rm(testDir, { recursive: true, force: true });
	});

	describe('writeTraceIncremental', () => {
		it('should write initial trace with steps', async () => {
			const taskId = 'task-1';
			const trace = {
				steps: [
					{
						index: 0,
						name: 'step-1',
						startTime: '2024-01-01T00:00:00Z',
						liveLogEntries: [],
					},
				],
			};

			await storage.writeTraceIncremental(taskId, trace);

			const metadata = await storage.loadMetadata(taskId);
			expect(metadata).not.toBeNull();
			expect(metadata?.totalEntries).toBe(1);

			const chunk = await storage.loadChunk(taskId, 0);
			expect(chunk).not.toBeNull();
			expect(chunk?.entries).toHaveLength(1);
			expect(chunk?.entries[0].name).toBe('step-1');
		});

		it('should append new steps incrementally', async () => {
			const taskId = 'task-2';

			// First write
			const trace1 = {
				steps: [
					{
						index: 0,
						name: 'step-1',
						startTime: '2024-01-01T00:00:00Z',
						liveLogEntries: [],
					},
				],
			};
			await storage.writeTraceIncremental(taskId, trace1);

			// Second write with additional step
			const trace2 = {
				steps: [
					{
						index: 0,
						name: 'step-1',
						startTime: '2024-01-01T00:00:00Z',
						liveLogEntries: [],
					},
					{
						index: 1,
						name: 'step-2',
						startTime: '2024-01-01T00:01:00Z',
						liveLogEntries: [],
					},
				],
			};
			await storage.writeTraceIncremental(taskId, trace2);

			const metadata = await storage.loadMetadata(taskId);
			expect(metadata?.totalEntries).toBe(2);

			const chunk = await storage.loadChunk(taskId, 0);
			expect(chunk?.entries).toHaveLength(2);
			expect(chunk?.entries[1].name).toBe('step-2');
		});

		it('should not rewrite when no new steps are added', async () => {
			const taskId = 'task-3';

			const trace = {
				steps: [
					{
						index: 0,
						name: 'step-1',
						startTime: '2024-01-01T00:00:00Z',
						liveLogEntries: [],
					},
				],
			};

			await storage.writeTraceIncremental(taskId, trace);
			const metadata1 = await storage.loadMetadata(taskId);
			const lastUpdated1 = metadata1?.lastUpdated;

			// Small delay to ensure timestamp would differ if rewritten
			await new Promise(resolve => setTimeout(resolve, 10));

			// Write same trace again
			await storage.writeTraceIncremental(taskId, trace);
			const metadata2 = await storage.loadMetadata(taskId);
			const lastUpdated2 = metadata2?.lastUpdated;

			// Metadata should not be updated if no changes
			expect(lastUpdated1).toBe(lastUpdated2);
		});

		it('should update last step when liveLogEntries grow (regression test)', async () => {
			const taskId = 'task-4';

			// Initial write with empty liveLogEntries
			const trace1 = {
				steps: [
					{
						index: 0,
						name: 'step-1',
						startTime: '2024-01-01T00:00:00Z',
						liveLogEntries: [],
					},
				],
			};
			await storage.writeTraceIncremental(taskId, trace1);

			// Verify initial state
			let chunk = await storage.loadChunk(taskId, 0);
			expect(chunk?.entries[0].liveLogEntries).toEqual([]);

			// Update with additional liveLogEntries (simulating streaming logs)
			const trace2 = {
				steps: [
					{
						index: 0,
						name: 'step-1',
						startTime: '2024-01-01T00:00:00Z',
						liveLogEntries: [
							{ timestamp: '2024-01-01T00:00:01Z', message: 'Log 1' },
							{ timestamp: '2024-01-01T00:00:02Z', message: 'Log 2' },
						],
					},
				],
			};
			await storage.writeTraceIncremental(taskId, trace2);

			// Verify liveLogEntries were updated
			chunk = await storage.loadChunk(taskId, 0);
			expect(chunk?.entries[0].liveLogEntries).toHaveLength(2);
			expect(chunk?.entries[0].liveLogEntries[0].message).toBe('Log 1');
			expect(chunk?.entries[0].liveLogEntries[1].message).toBe('Log 2');
		});

		it('should update last step when endTime is added (step completion)', async () => {
			const taskId = 'task-5';

			// Initial write with step in progress
			const trace1 = {
				steps: [
					{
						index: 0,
						name: 'step-1',
						startTime: '2024-01-01T00:00:00Z',
						liveLogEntries: [],
					},
				],
			};
			await storage.writeTraceIncremental(taskId, trace1);

			// Verify initial state has no endTime
			let chunk = await storage.loadChunk(taskId, 0);
			expect(chunk?.entries[0].endTime).toBeUndefined();

			// Update with endTime (step completed)
			const trace2 = {
				steps: [
					{
						index: 0,
						name: 'step-1',
						startTime: '2024-01-01T00:00:00Z',
						endTime: '2024-01-01T00:05:00Z',
						liveLogEntries: [],
					},
				],
			};
			await storage.writeTraceIncremental(taskId, trace2);

			// Verify endTime was added
			chunk = await storage.loadChunk(taskId, 0);
			expect(chunk?.entries[0].endTime).toBe('2024-01-01T00:05:00Z');
		});

		it('should handle multiple updates to the last step', async () => {
			const taskId = 'task-6';

			// Initial write
			const trace1 = {
				steps: [
					{
						index: 0,
						name: 'step-1',
						startTime: '2024-01-01T00:00:00Z',
						liveLogEntries: [],
					},
				],
			};
			await storage.writeTraceIncremental(taskId, trace1);

			// First update - add one log entry
			const trace2 = {
				steps: [
					{
						index: 0,
						name: 'step-1',
						startTime: '2024-01-01T00:00:00Z',
						liveLogEntries: [{ timestamp: '2024-01-01T00:00:01Z', message: 'Log 1' }],
					},
				],
			};
			await storage.writeTraceIncremental(taskId, trace2);

			let chunk = await storage.loadChunk(taskId, 0);
			expect(chunk?.entries[0].liveLogEntries).toHaveLength(1);

			// Second update - add more log entries
			const trace3 = {
				steps: [
					{
						index: 0,
						name: 'step-1',
						startTime: '2024-01-01T00:00:00Z',
						liveLogEntries: [
							{ timestamp: '2024-01-01T00:00:01Z', message: 'Log 1' },
							{ timestamp: '2024-01-01T00:00:02Z', message: 'Log 2' },
							{ timestamp: '2024-01-01T00:00:03Z', message: 'Log 3' },
						],
					},
				],
			};
			await storage.writeTraceIncremental(taskId, trace3);

			chunk = await storage.loadChunk(taskId, 0);
			expect(chunk?.entries[0].liveLogEntries).toHaveLength(3);

			// Third update - add endTime
			const trace4 = {
				steps: [
					{
						index: 0,
						name: 'step-1',
						startTime: '2024-01-01T00:00:00Z',
						endTime: '2024-01-01T00:05:00Z',
						liveLogEntries: [
							{ timestamp: '2024-01-01T00:00:01Z', message: 'Log 1' },
							{ timestamp: '2024-01-01T00:00:02Z', message: 'Log 2' },
							{ timestamp: '2024-01-01T00:00:03Z', message: 'Log 3' },
						],
					},
				],
			};
			await storage.writeTraceIncremental(taskId, trace4);

			chunk = await storage.loadChunk(taskId, 0);
			expect(chunk?.entries[0].liveLogEntries).toHaveLength(3);
			expect(chunk?.entries[0].endTime).toBe('2024-01-01T00:05:00Z');
		});

		it('should not update if step has not changed', async () => {
			const taskId = 'task-7';

			const trace = {
				steps: [
					{
						index: 0,
						name: 'step-1',
						startTime: '2024-01-01T00:00:00Z',
						endTime: '2024-01-01T00:05:00Z',
						liveLogEntries: [{ timestamp: '2024-01-01T00:00:01Z', message: 'Log 1' }],
					},
				],
			};

			await storage.writeTraceIncremental(taskId, trace);
			const chunk1 = await storage.loadChunk(taskId, 0);
			const chunk1Content = JSON.stringify(chunk1);

			// Write same trace again
			await storage.writeTraceIncremental(taskId, trace);
			const chunk2 = await storage.loadChunk(taskId, 0);
			const chunk2Content = JSON.stringify(chunk2);

			// Chunk should be identical (no unnecessary rewrites)
			expect(chunk1Content).toBe(chunk2Content);
		});

		it('should handle updating last step when there are multiple steps', async () => {
			const taskId = 'task-8';

			// Write two steps
			const trace1 = {
				steps: [
					{
						index: 0,
						name: 'step-1',
						startTime: '2024-01-01T00:00:00Z',
						endTime: '2024-01-01T00:01:00Z',
						liveLogEntries: [],
					},
					{
						index: 1,
						name: 'step-2',
						startTime: '2024-01-01T00:01:00Z',
						liveLogEntries: [],
					},
				],
			};
			await storage.writeTraceIncremental(taskId, trace1);

			// Update only the last step (step-2)
			const trace2 = {
				steps: [
					{
						index: 0,
						name: 'step-1',
						startTime: '2024-01-01T00:00:00Z',
						endTime: '2024-01-01T00:01:00Z',
						liveLogEntries: [],
					},
					{
						index: 1,
						name: 'step-2',
						startTime: '2024-01-01T00:01:00Z',
						liveLogEntries: [{ timestamp: '2024-01-01T00:01:30Z', message: 'Processing...' }],
					},
				],
			};
			await storage.writeTraceIncremental(taskId, trace2);

			const chunk = await storage.loadChunk(taskId, 0);
			expect(chunk?.entries).toHaveLength(2);
			expect(chunk?.entries[0].liveLogEntries).toEqual([]);
			expect(chunk?.entries[1].liveLogEntries).toHaveLength(1);
			expect(chunk?.entries[1].liveLogEntries[0].message).toBe('Processing...');
		});
	});

	describe('writeTraceFull', () => {
		it('should write complete trace', async () => {
			const taskId = 'task-full-1';
			const trace = {
				steps: [
					{ index: 0, name: 'step-1', liveLogEntries: [] },
					{ index: 1, name: 'step-2', liveLogEntries: [] },
					{ index: 2, name: 'step-3', liveLogEntries: [] },
				],
			};

			await storage.writeTraceFull(taskId, trace);

			const metadata = await storage.loadMetadata(taskId);
			expect(metadata?.totalEntries).toBe(3);

			const chunk = await storage.loadChunk(taskId, 0);
			expect(chunk?.entries).toHaveLength(3);
		});
	});

	describe('loadChunk', () => {
		it('should return null for non-existent chunk', async () => {
			const chunk = await storage.loadChunk('non-existent-task', 0);
			expect(chunk).toBeNull();
		});
	});

	describe('loadMetadata', () => {
		it('should return null for non-existent metadata', async () => {
			const metadata = await storage.loadMetadata('non-existent-task');
			expect(metadata).toBeNull();
		});
	});

	describe('readLogsPaginated', () => {
		it('should return empty result for non-existent task', async () => {
			const result = await storage.readLogsPaginated('non-existent-task');
			expect(result).toEqual({ logs: [], nextCursor: null, total: 0 });
		});

		it('should paginate logs correctly', async () => {
			const taskId = 'task-paginated';
			const steps = Array.from({ length: 10 }, (_, i) => ({
				index: i,
				name: `step-${i}`,
				liveLogEntries: [],
			}));

			await storage.writeTraceFull(taskId, { steps });

			// Read first 5
			const page1 = await storage.readLogsPaginated(taskId, 0, 5);
			expect(page1.logs).toHaveLength(5);
			expect(page1.nextCursor).toBe(5);
			expect(page1.total).toBe(10);

			// Read next 5
			const page2 = await storage.readLogsPaginated(taskId, 5, 5);
			expect(page2.logs).toHaveLength(5);
			expect(page2.nextCursor).toBeNull();
			expect(page2.total).toBe(10);
		});
	});

	describe('deleteTrace', () => {
		it('should delete trace directory', async () => {
			const taskId = 'task-delete';
			const trace = {
				steps: [{ index: 0, name: 'step-1', liveLogEntries: [] }],
			};

			await storage.writeTraceIncremental(taskId, trace);

			const traceDir = path.join(testDir, taskId, 'trace');
			expect(await directoryExists(traceDir)).toBe(true);

			await storage.deleteTrace(taskId);
			expect(await directoryExists(traceDir)).toBe(false);
		});

		it('should not throw error for non-existent trace', async () => {
			await expect(storage.deleteTrace('non-existent-task')).resolves.not.toThrow();
		});
	});
});
