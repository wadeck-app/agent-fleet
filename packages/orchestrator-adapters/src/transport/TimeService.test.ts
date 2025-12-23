import { beforeEach, describe, expect, it } from 'vitest';

import { ControllableTimeService } from './TimeService';

describe('ControllableTimeService', () => {
	let timeService: ControllableTimeService;

	beforeEach(() => {
		timeService = new ControllableTimeService();
	});

	describe('setTimeout', () => {
		it('should fire timeout after delay', () => {
			const calls: number[] = [];
			timeService.setTimeout(() => calls.push(1), 100);

			timeService.tick(50);
			expect(calls).toEqual([]);

			timeService.tick(50);
			expect(calls).toEqual([1]);
		});

		it('should fire multiple timeouts in chronological order', () => {
			const calls: number[] = [];

			// Create timeouts in non-chronological order
			timeService.setTimeout(() => calls.push(100), 100);
			timeService.setTimeout(() => calls.push(50), 50);
			timeService.setTimeout(() => calls.push(150), 150);
			timeService.setTimeout(() => calls.push(75), 75);

			timeService.tick(200);

			// Should fire in chronological order: 50, 75, 100, 150
			expect(calls).toEqual([50, 75, 100, 150]);
		});

		it('should respect chronological order with large tick', () => {
			const calls: string[] = [];

			timeService.setTimeout(() => calls.push('C@300'), 300);
			timeService.setTimeout(() => calls.push('A@100'), 100);
			timeService.setTimeout(() => calls.push('B@200'), 200);

			// Large tick that fires all timeouts
			timeService.tick(500);

			expect(calls).toEqual(['A@100', 'B@200', 'C@300']);
		});

		it('should not fire timeout before delay', () => {
			const calls: number[] = [];
			timeService.setTimeout(() => calls.push(1), 100);

			timeService.tick(99);
			expect(calls).toEqual([]);
		});

		it('should remove timeout after firing', () => {
			let fired = false;
			timeService.setTimeout(() => (fired = true), 100);

			timeService.tick(100);
			expect(fired).toBe(true);
			expect(timeService.getPendingTimeoutCount()).toBe(0);

			// Second tick should not fire again
			fired = false;
			timeService.tick(100);
			expect(fired).toBe(false);
		});

		it('should support clearTimeout', () => {
			const calls: number[] = [];
			const id = timeService.setTimeout(() => calls.push(1), 100);

			timeService.clearTimeout(id);
			timeService.tick(100);

			expect(calls).toEqual([]);
		});
	});

	describe('setInterval', () => {
		it('should fire interval repeatedly', () => {
			const calls: number[] = [];
			timeService.setInterval(() => calls.push(1), 100);

			timeService.tick(100);
			expect(calls).toEqual([1]);

			timeService.tick(100);
			expect(calls).toEqual([1, 1]);

			timeService.tick(100);
			expect(calls).toEqual([1, 1, 1]);
		});

		it('should fire interval multiple times in large tick', () => {
			const calls: number[] = [];
			timeService.setInterval(() => calls.push(1), 50);

			timeService.tick(150);

			// Should fire at t=50, t=100, t=150
			expect(calls).toEqual([1, 1, 1]);
		});

		it('should fire multiple intervals in chronological order', () => {
			const calls: string[] = [];

			// Interval A fires every 100ms
			timeService.setInterval(() => calls.push('A'), 100);
			// Interval B fires every 60ms
			timeService.setInterval(() => calls.push('B'), 60);

			timeService.tick(200);

			// Expected order:
			// t=60: B
			// t=100: A
			// t=120: B
			// t=180: B
			// t=200: A
			expect(calls).toEqual(['B', 'A', 'B', 'B', 'A']);
		});

		it('should maintain correct elapsed time across ticks', () => {
			const calls: number[] = [];
			timeService.setInterval(() => calls.push(1), 100);

			timeService.tick(30);
			expect(calls).toEqual([]);

			timeService.tick(30);
			expect(calls).toEqual([]);

			timeService.tick(40); // Total: 100ms
			expect(calls).toEqual([1]);

			timeService.tick(100); // Total: 200ms
			expect(calls).toEqual([1, 1]);
		});

		it('should support clearInterval', () => {
			const calls: number[] = [];
			const id = timeService.setInterval(() => calls.push(1), 100);

			timeService.tick(100);
			expect(calls).toEqual([1]);

			timeService.clearInterval(id);
			timeService.tick(100);

			// Should not fire again after clearing
			expect(calls).toEqual([1]);
		});
	});

	describe('mixed timeouts and intervals', () => {
		it('should interleave timeouts and intervals in chronological order', () => {
			const calls: string[] = [];

			// Timeout at t=100
			timeService.setTimeout(() => calls.push('Timeout@100'), 100);

			// Interval every 50ms (fires at t=50, t=100, t=150, t=200)
			timeService.setInterval(() => calls.push('Interval@50'), 50);

			// Timeout at t=75
			timeService.setTimeout(() => calls.push('Timeout@75'), 75);

			timeService.tick(200);

			// Expected order:
			// t=50: Interval
			// t=75: Timeout
			// t=100: Timeout, Interval
			// t=150: Interval
			// t=200: Interval
			expect(calls).toEqual([
				'Interval@50',
				'Timeout@75',
				'Timeout@100',
				'Interval@50',
				'Interval@50',
				'Interval@50',
			]);
		});

		it('should handle complex interleaving scenario', () => {
			const timeline: string[] = [];

			// Multiple timeouts
			timeService.setTimeout(() => timeline.push('T1@30'), 30);
			timeService.setTimeout(() => timeline.push('T2@70'), 70);
			timeService.setTimeout(() => timeline.push('T3@120'), 120);

			// Multiple intervals
			timeService.setInterval(() => timeline.push('I1@40'), 40);
			timeService.setInterval(() => timeline.push('I2@60'), 60);

			timeService.tick(150);

			// Expected timeline:
			// t=30: T1
			// t=40: I1
			// t=60: I2
			// t=70: T2
			// t=80: I1
			// t=120: T3, I1, I2
			expect(timeline).toEqual([
				'T1@30', // t=30
				'I1@40', // t=40
				'I2@60', // t=60
				'T2@70', // t=70
				'I1@40', // t=80
				'T3@120', // t=120
				'I1@40', // t=120
				'I2@60', // t=120
			]);
		});
	});

	describe('edge cases', () => {
		it('should handle zero delay timeout', () => {
			const calls: number[] = [];
			timeService.setTimeout(() => calls.push(1), 0);

			timeService.tick(0);
			expect(calls).toEqual([1]);
		});

		it('should handle multiple timeouts at same time', () => {
			const calls: number[] = [];

			timeService.setTimeout(() => calls.push(1), 100);
			timeService.setTimeout(() => calls.push(2), 100);
			timeService.setTimeout(() => calls.push(3), 100);

			timeService.tick(100);

			// All should fire (order may vary for same time)
			expect(calls).toHaveLength(3);
			expect(calls).toContain(1);
			expect(calls).toContain(2);
			expect(calls).toContain(3);
		});

		it('should handle interval firing multiple times in single tick', () => {
			const calls: number[] = [];
			timeService.setInterval(() => calls.push(1), 10);

			timeService.tick(100);

			// Should fire 10 times
			expect(calls).toHaveLength(10);
		});

		it('should handle tick(0)', () => {
			const calls: number[] = [];
			timeService.setTimeout(() => calls.push(1), 100);
			timeService.setInterval(() => calls.push(2), 50);

			timeService.tick(0);

			expect(calls).toEqual([]);
		});
	});

	describe('reset', () => {
		it('should clear all timeouts and intervals', () => {
			timeService.setTimeout(() => {}, 100);
			timeService.setInterval(() => {}, 50);

			expect(timeService.getPendingTimeoutCount()).toBe(1);
			expect(timeService.getActiveIntervalCount()).toBe(1);

			timeService.reset();

			expect(timeService.getPendingTimeoutCount()).toBe(0);
			expect(timeService.getActiveIntervalCount()).toBe(0);
		});
	});

	describe('helper methods', () => {
		it('should track pending timeout count', () => {
			expect(timeService.getPendingTimeoutCount()).toBe(0);

			const id1 = timeService.setTimeout(() => {}, 100);
			expect(timeService.getPendingTimeoutCount()).toBe(1);

			const id2 = timeService.setTimeout(() => {}, 200);
			expect(timeService.getPendingTimeoutCount()).toBe(2);

			timeService.clearTimeout(id1);
			expect(timeService.getPendingTimeoutCount()).toBe(1);

			timeService.tick(200);
			expect(timeService.getPendingTimeoutCount()).toBe(0);
		});

		it('should track active interval count', () => {
			expect(timeService.getActiveIntervalCount()).toBe(0);

			const id1 = timeService.setInterval(() => {}, 100);
			expect(timeService.getActiveIntervalCount()).toBe(1);

			const id2 = timeService.setInterval(() => {}, 200);
			expect(timeService.getActiveIntervalCount()).toBe(2);

			timeService.clearInterval(id1);
			expect(timeService.getActiveIntervalCount()).toBe(1);

			timeService.clearInterval(id2);
			expect(timeService.getActiveIntervalCount()).toBe(0);
		});
	});
});
