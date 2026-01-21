import type { LogEntry } from '@shared/api/tasks.contract';
import { describe, expect, it } from 'vitest';

import { LogBuffer } from './LogBuffer';

// Helper to create test logs
function createLog(id: string, timestamp: number, stepId: string = 's1'): LogEntry {
	return {
		id,
		timestamp,
		level: 'info',
		message: `Log ${id}`,
		stepId,
		stepName: stepId,
		stepType: 'script',
	};
}

describe('LogBuffer', () => {
	describe('basic operations', () => {
		it('should initialize with empty logs', () => {
			const buffer = new LogBuffer();
			expect(buffer.getCount()).toBe(0);
			expect(buffer.getLogs()).toEqual([]);
			expect(buffer.getLatestTimestamp()).toBeNull();
		});

		it('should initialize with existing logs sorted by timestamp', () => {
			const logs = [createLog('log-3', 300), createLog('log-1', 100), createLog('log-2', 200)];
			const buffer = new LogBuffer(logs);

			expect(buffer.getCount()).toBe(3);
			expect(buffer.getLogs().map(l => l.id)).toEqual(['log-1', 'log-2', 'log-3']);
			expect(buffer.getLatestTimestamp()).toBe(300);
		});
	});

	describe('in-order insertion', () => {
		it('should append logs that arrive in order', () => {
			const buffer = new LogBuffer();

			buffer.addLogs([createLog('log-1', 100)]);
			buffer.addLogs([createLog('log-2', 200)]);
			buffer.addLogs([createLog('log-3', 300)]);

			expect(buffer.getCount()).toBe(3);
			expect(buffer.getLogs().map(l => l.id)).toEqual(['log-1', 'log-2', 'log-3']);
		});

		it('should handle batch insertion in order', () => {
			const buffer = new LogBuffer();

			buffer.addLogs([createLog('log-1', 100), createLog('log-2', 200), createLog('log-3', 300)]);

			expect(buffer.getCount()).toBe(3);
			expect(buffer.getLogs().map(l => l.id)).toEqual(['log-1', 'log-2', 'log-3']);
		});
	});

	describe('out-of-order insertion', () => {
		it('should insert a late log at correct position', () => {
			const buffer = new LogBuffer();

			// Logs arrive: 100, 300, then 200 (out of order)
			buffer.addLogs([createLog('log-1', 100)]);
			buffer.addLogs([createLog('log-3', 300)]);
			buffer.addLogs([createLog('log-2', 200)]); // Late arrival

			expect(buffer.getCount()).toBe(3);
			expect(buffer.getLogs().map(l => l.id)).toEqual(['log-1', 'log-2', 'log-3']);
			expect(buffer.getLogs().map(l => l.timestamp)).toEqual([100, 200, 300]);
		});

		it('should handle multiple out-of-order insertions', () => {
			const buffer = new LogBuffer();

			// Logs arrive: 100, 500, then 200, 400, 300 (all out of order)
			buffer.addLogs([createLog('log-1', 100)]);
			buffer.addLogs([createLog('log-5', 500)]);
			buffer.addLogs([createLog('log-2', 200), createLog('log-4', 400), createLog('log-3', 300)]);

			expect(buffer.getCount()).toBe(5);
			expect(buffer.getLogs().map(l => l.id)).toEqual(['log-1', 'log-2', 'log-3', 'log-4', 'log-5']);
			expect(buffer.getLogs().map(l => l.timestamp)).toEqual([100, 200, 300, 400, 500]);
		});

		it('should insert at beginning if timestamp is before all existing', () => {
			const buffer = new LogBuffer();

			buffer.addLogs([createLog('log-2', 200), createLog('log-3', 300)]);
			buffer.addLogs([createLog('log-1', 100)]); // Earlier than all

			expect(buffer.getLogs().map(l => l.id)).toEqual(['log-1', 'log-2', 'log-3']);
		});
	});

	describe('deduplication', () => {
		it('should not add logs with duplicate IDs', () => {
			const buffer = new LogBuffer();

			buffer.addLogs([createLog('log-1', 100)]);
			const added = buffer.addLogs([createLog('log-1', 100)]); // Duplicate

			expect(added).toBe(false);
			expect(buffer.getCount()).toBe(1);
		});

		it('should deduplicate within a batch', () => {
			const buffer = new LogBuffer();

			buffer.addLogs([createLog('log-1', 100), createLog('log-1', 100), createLog('log-2', 200)]);

			expect(buffer.getCount()).toBe(2);
			expect(buffer.getLogs().map(l => l.id)).toEqual(['log-1', 'log-2']);
		});

		it('should deduplicate across multiple calls', () => {
			const buffer = new LogBuffer();

			buffer.addLogs([createLog('log-1', 100), createLog('log-2', 200)]);
			buffer.addLogs([createLog('log-2', 200), createLog('log-3', 300)]); // log-2 is duplicate

			expect(buffer.getCount()).toBe(3);
			expect(buffer.getLogs().map(l => l.id)).toEqual(['log-1', 'log-2', 'log-3']);
		});
	});

	describe('concurrent scenarios (simulating double WebSocket events)', () => {
		it('should handle duplicate batch from concurrent calls', () => {
			const buffer = new LogBuffer();

			buffer.addLogs([createLog('log-1', 100)]);

			// Simulate two concurrent appendNewLogs calls returning same data
			const batch = [createLog('log-2', 200), createLog('log-3', 300)];
			buffer.addLogs(batch);
			buffer.addLogs(batch); // Duplicate batch

			expect(buffer.getCount()).toBe(3);
			expect(buffer.getLogs().map(l => l.id)).toEqual(['log-1', 'log-2', 'log-3']);
		});

		it('should handle overlapping batches from concurrent calls', () => {
			const buffer = new LogBuffer();

			buffer.addLogs([createLog('log-1', 100)]);

			// Simulate two concurrent calls with overlapping data
			buffer.addLogs([createLog('log-2', 200)]);
			buffer.addLogs([createLog('log-2', 200), createLog('log-3', 300)]); // Overlaps log-2

			expect(buffer.getCount()).toBe(3);
			expect(buffer.getLogs().map(l => l.id)).toEqual(['log-1', 'log-2', 'log-3']);
		});
	});

	describe('parallel steps (different stepIds, overlapping timestamps)', () => {
		it('should correctly order logs from parallel steps', () => {
			const buffer = new LogBuffer();

			// Step A starts and completes
			buffer.addLogs([createLog('step-a-start', 100, 'step-a'), createLog('step-a-end', 150, 'step-a')]);

			// Step B starts and completes (parallel with A)
			buffer.addLogs([createLog('step-b-start', 120, 'step-b'), createLog('step-b-end', 180, 'step-b')]);

			// Should be ordered by timestamp
			expect(buffer.getLogs().map(l => l.id)).toEqual([
				'step-a-start',
				'step-b-start',
				'step-a-end',
				'step-b-end',
			]);
			expect(buffer.getLogs().map(l => l.timestamp)).toEqual([100, 120, 150, 180]);
		});

		it('should handle step finishing before earlier step', () => {
			const buffer = new LogBuffer();

			// Step 2 finishes before Step 1
			buffer.addLogs([createLog('step-1-start', 100, 'step-1')]);
			buffer.addLogs([createLog('step-2-start', 110, 'step-2')]);
			buffer.addLogs([createLog('step-2-end', 130, 'step-2')]); // Step 2 finishes first
			buffer.addLogs([createLog('step-1-end', 200, 'step-1')]); // Step 1 finishes later

			expect(buffer.getLogs().map(l => l.timestamp)).toEqual([100, 110, 130, 200]);
		});
	});

	describe('edge cases', () => {
		it('should handle empty batch', () => {
			const buffer = new LogBuffer();
			buffer.addLogs([createLog('log-1', 100)]);

			const added = buffer.addLogs([]);

			expect(added).toBe(false);
			expect(buffer.getCount()).toBe(1);
		});

		it('should handle logs with identical timestamps', () => {
			const buffer = new LogBuffer();

			buffer.addLogs([
				createLog('log-1', 100),
				createLog('log-2', 100), // Same timestamp
				createLog('log-3', 100), // Same timestamp
			]);

			expect(buffer.getCount()).toBe(3);
			// Order is stable based on insertion order for same timestamp
		});

		it('should handle very large timestamp differences', () => {
			const buffer = new LogBuffer();

			buffer.addLogs([createLog('log-1', 1000000), createLog('log-2', 1)]);

			expect(buffer.getLogs().map(l => l.id)).toEqual(['log-2', 'log-1']);
		});
	});

	describe('utility methods', () => {
		it('should check if log exists by ID', () => {
			const buffer = new LogBuffer();
			buffer.addLogs([createLog('log-1', 100)]);

			expect(buffer.has('log-1')).toBe(true);
			expect(buffer.has('log-2')).toBe(false);
		});

		it('should clear all logs', () => {
			const buffer = new LogBuffer();
			buffer.addLogs([createLog('log-1', 100), createLog('log-2', 200)]);

			buffer.clear();

			expect(buffer.getCount()).toBe(0);
			expect(buffer.getLogs()).toEqual([]);
			expect(buffer.getLatestTimestamp()).toBeNull();
		});

		it('should get latest timestamp', () => {
			const buffer = new LogBuffer();

			expect(buffer.getLatestTimestamp()).toBeNull();

			buffer.addLogs([createLog('log-1', 100), createLog('log-3', 300), createLog('log-2', 200)]);

			expect(buffer.getLatestTimestamp()).toBe(300);
		});
	});

	describe('performance optimization (append fast path)', () => {
		it('should use fast append when all new logs are after existing', () => {
			const buffer = new LogBuffer();

			buffer.addLogs([createLog('log-1', 100), createLog('log-2', 200)]);

			// All new logs have timestamps >= 200
			buffer.addLogs([createLog('log-3', 300), createLog('log-4', 400)]);

			expect(buffer.getLogs().map(l => l.id)).toEqual(['log-1', 'log-2', 'log-3', 'log-4']);
		});

		it('should use insertion when any new log is out of order', () => {
			const buffer = new LogBuffer();

			buffer.addLogs([createLog('log-1', 100), createLog('log-3', 300)]);

			// One log is out of order
			buffer.addLogs([createLog('log-2', 200), createLog('log-4', 400)]);

			expect(buffer.getLogs().map(l => l.id)).toEqual(['log-1', 'log-2', 'log-3', 'log-4']);
		});
	});
});
