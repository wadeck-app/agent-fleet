import { describe, expect, it } from 'vitest';

import type { BaseEntity } from '@app/shared/common/base-entity';

import { InMemoryQueryBuilder } from './InMemoryQueryBuilder';

/**
 * ===========================================================================================
 * IN-MEMORY QUERY BUILDER TESTS
 * ===========================================================================================
 *
 * Test Strategy:
 * - Test single-column sorting
 * - Test multi-column sorting with thenBy
 * - Test filtering and sorting combination
 * - Test pagination with sorting
 *
 * ===========================================================================================
 */

interface TestEntity extends BaseEntity {
	name: string;
	category: string;
	priority: number;
	status: string;
}

describe('InMemoryQueryBuilder', () => {
	const testData: TestEntity[] = [
		{
			id: '1',
			name: 'Task A',
			category: 'Work',
			priority: 1,
			status: 'open',
			version: 1,
			createdAt: '2024-01-01T00:00:00.000Z',
			updatedAt: '2024-01-01T00:00:00.000Z',
		},
		{
			id: '2',
			name: 'Task B',
			category: 'Work',
			priority: 2,
			status: 'closed',
			version: 1,
			createdAt: '2024-01-02T00:00:00.000Z',
			updatedAt: '2024-01-02T00:00:00.000Z',
		},
		{
			id: '3',
			name: 'Task C',
			category: 'Personal',
			priority: 1,
			status: 'open',
			version: 1,
			createdAt: '2024-01-03T00:00:00.000Z',
			updatedAt: '2024-01-03T00:00:00.000Z',
		},
		{
			id: '4',
			name: 'Task D',
			category: 'Personal',
			priority: 3,
			status: 'open',
			version: 1,
			createdAt: '2024-01-04T00:00:00.000Z',
			updatedAt: '2024-01-04T00:00:00.000Z',
		},
		{
			id: '5',
			name: 'Task E',
			category: 'Work',
			priority: 1,
			status: 'open',
			version: 1,
			createdAt: '2024-01-05T00:00:00.000Z',
			updatedAt: '2024-01-05T00:00:00.000Z',
		},
	];

	describe('orderBy - Single column sorting', () => {
		it('should sort by name ASC', async () => {
			const qb = new InMemoryQueryBuilder(testData);
			const results = await qb.orderBy('name', 'ASC').execute();

			expect(results.map(r => r.name)).toEqual(['Task A', 'Task B', 'Task C', 'Task D', 'Task E']);
		});

		it('should sort by name DESC', async () => {
			const qb = new InMemoryQueryBuilder(testData);
			const results = await qb.orderBy('name', 'DESC').execute();

			expect(results.map(r => r.name)).toEqual(['Task E', 'Task D', 'Task C', 'Task B', 'Task A']);
		});

		it('should sort by priority ASC', async () => {
			const qb = new InMemoryQueryBuilder(testData);
			const results = await qb.orderBy('priority', 'ASC').execute();

			// Priority 1: Task A, Task C, Task E
			// Priority 2: Task B
			// Priority 3: Task D
			const priorities = results.map(r => r.priority);
			expect(priorities).toEqual([1, 1, 1, 2, 3]);
		});
	});

	describe('thenBy - Multi-column sorting', () => {
		it('should sort by category ASC, then by priority ASC', async () => {
			const qb = new InMemoryQueryBuilder(testData);
			const results = await qb.orderBy('category', 'ASC').thenBy('priority', 'ASC').execute();

			// Personal: Task C (priority 1), Task D (priority 3)
			// Work: Task A (priority 1), Task E (priority 1), Task B (priority 2)
			expect(results.map(r => `${r.category}:${r.name}:${r.priority}`)).toEqual([
				'Personal:Task C:1',
				'Personal:Task D:3',
				'Work:Task A:1',
				'Work:Task E:1',
				'Work:Task B:2',
			]);
		});

		it('should sort by category ASC, then by priority DESC', async () => {
			const qb = new InMemoryQueryBuilder(testData);
			const results = await qb.orderBy('category', 'ASC').thenBy('priority', 'DESC').execute();

			// Personal: Task D (priority 3), Task C (priority 1)
			// Work: Task B (priority 2), Task A (priority 1), Task E (priority 1)
			expect(results.map(r => `${r.category}:${r.name}:${r.priority}`)).toEqual([
				'Personal:Task D:3',
				'Personal:Task C:1',
				'Work:Task B:2',
				'Work:Task A:1',
				'Work:Task E:1',
			]);
		});

		it('should sort by priority ASC, then by category ASC, then by name ASC', async () => {
			const qb = new InMemoryQueryBuilder(testData);
			const results = await qb
				.orderBy('priority', 'ASC')
				.thenBy('category', 'ASC')
				.thenBy('name', 'ASC')
				.execute();

			// Priority 1: Personal (Task C), Work (Task A, Task E)
			// Priority 2: Work (Task B)
			// Priority 3: Personal (Task D)
			expect(results.map(r => r.name)).toEqual([
				'Task C', // Priority 1, Personal, name C
				'Task A', // Priority 1, Work, name A
				'Task E', // Priority 1, Work, name E
				'Task B', // Priority 2, Work
				'Task D', // Priority 3, Personal
			]);
		});

		it('should handle equal values across all sort columns', async () => {
			const duplicateData: TestEntity[] = [
				{
					id: '1',
					name: 'Task X',
					category: 'Work',
					priority: 1,
					status: 'open',
					version: 1,
					createdAt: '2024-01-01T00:00:00.000Z',
					updatedAt: '2024-01-01T00:00:00.000Z',
				},
				{
					id: '2',
					name: 'Task X',
					category: 'Work',
					priority: 1,
					status: 'open',
					version: 1,
					createdAt: '2024-01-02T00:00:00.000Z',
					updatedAt: '2024-01-02T00:00:00.000Z',
				},
			];

			const qb = new InMemoryQueryBuilder(duplicateData);
			const results = await qb
				.orderBy('category', 'ASC')
				.thenBy('priority', 'ASC')
				.thenBy('name', 'ASC')
				.execute();

			// Should maintain stable sort (original order preserved when all keys equal)
			expect(results).toHaveLength(2);
			expect(results[0].id).toBe('1');
			expect(results[1].id).toBe('2');
		});
	});

	describe('Filtering and Sorting', () => {
		it('should filter by category then sort by priority DESC', async () => {
			const qb = new InMemoryQueryBuilder(testData);
			const results = await qb.where('category', '=', 'Work').orderBy('priority', 'DESC').execute();

			expect(results.map(r => r.name)).toEqual(['Task B', 'Task A', 'Task E']);
			expect(results.map(r => r.priority)).toEqual([2, 1, 1]);
		});

		it('should filter by status and sort by category ASC, priority DESC', async () => {
			const qb = new InMemoryQueryBuilder(testData);
			const results = await qb
				.where('status', '=', 'open')
				.orderBy('category', 'ASC')
				.thenBy('priority', 'DESC')
				.execute();

			// Open: Personal (Task D priority 3, Task C priority 1), Work (Task A priority 1, Task E priority 1)
			expect(results.map(r => r.name)).toEqual(['Task D', 'Task C', 'Task A', 'Task E']);
		});
	});

	describe('Pagination with Sorting', () => {
		it('should apply sorting before pagination', async () => {
			const qb = new InMemoryQueryBuilder(testData);
			const results = await qb.orderBy('name', 'ASC').limit(3).execute();

			expect(results.map(r => r.name)).toEqual(['Task A', 'Task B', 'Task C']);
		});

		it('should apply multi-column sort before pagination with offset', async () => {
			const qb = new InMemoryQueryBuilder(testData);
			const results = await qb.orderBy('category', 'ASC').thenBy('priority', 'ASC').offset(2).limit(2).execute();

			// Order: Personal (C, D), Work (A, E, B)
			// Offset 2: Skip Personal (C, D)
			// Limit 2: Get Work (A, E)
			expect(results.map(r => r.name)).toEqual(['Task A', 'Task E']);
		});
	});

	describe('Edge cases', () => {
		it('should handle empty data', async () => {
			const qb = new InMemoryQueryBuilder<TestEntity>([]);
			const results = await qb.orderBy('name', 'ASC').thenBy('priority', 'DESC').execute();

			expect(results).toEqual([]);
		});

		it('should handle single item', async () => {
			const singleItem = [testData[0]];
			const qb = new InMemoryQueryBuilder(singleItem);
			const results = await qb.orderBy('name', 'ASC').thenBy('priority', 'DESC').execute();

			expect(results).toEqual(singleItem);
		});

		it('should work without any sorting', async () => {
			const qb = new InMemoryQueryBuilder(testData);
			const results = await qb.execute();

			// Should return original order
			expect(results).toEqual(testData);
		});
	});
});
