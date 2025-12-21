import { act, renderHook } from '@testing-library/react';

import { useTableSorting } from './useTableSorting';

interface TestItem {
	id: string;
	name: string;
	age: number;
	active: boolean;
	department?: string;
}

const mockData: TestItem[] = [
	{ id: '1', name: 'Charlie', age: 30, active: true, department: 'Engineering' },
	{ id: '2', name: 'Alice', age: 25, active: false, department: 'Sales' },
	{ id: '3', name: 'Bob', age: 35, active: true, department: 'Engineering' },
	{ id: '4', name: 'David', age: 28, active: false, department: 'Sales' },
];

describe('useTableSorting', () => {
	it('should return unsorted data initially', () => {
		const { result } = renderHook(() => useTableSorting({ data: mockData }));

		expect(result.current.sortedData).toEqual(mockData);
		expect(result.current.sortConfigs).toEqual([]);
	});

	it('should apply initial sort if provided', () => {
		const { result } = renderHook(() =>
			useTableSorting({
				data: mockData,
				initialSort: [{ key: 'name', direction: 'asc' }],
			})
		);

		expect(result.current.sortedData[0]!.name).toBe('Alice');
		expect(result.current.sortedData[3]!.name).toBe('David');
	});

	it('should sort strings in ascending order', () => {
		const { result } = renderHook(() => useTableSorting({ data: mockData }));

		act(() => {
			result.current.handleSort('name', false);
		});

		expect(result.current.sortedData[0]!.name).toBe('Alice');
		expect(result.current.sortedData[1]!.name).toBe('Bob');
		expect(result.current.sortedData[2]!.name).toBe('Charlie');
		expect(result.current.sortedData[3]!.name).toBe('David');
		expect(result.current.sortConfigs).toEqual([{ key: 'name', direction: 'asc' }]);
	});

	it('should sort strings in descending order on second click', () => {
		const { result } = renderHook(() => useTableSorting({ data: mockData }));

		act(() => {
			result.current.handleSort('name', false);
		});

		act(() => {
			result.current.handleSort('name', false);
		});

		expect(result.current.sortedData[0]!.name).toBe('David');
		expect(result.current.sortedData[1]!.name).toBe('Charlie');
		expect(result.current.sortedData[2]!.name).toBe('Bob');
		expect(result.current.sortedData[3]!.name).toBe('Alice');
		expect(result.current.sortConfigs).toEqual([{ key: 'name', direction: 'desc' }]);
	});

	it('should clear sort on third click', () => {
		const { result } = renderHook(() => useTableSorting({ data: mockData }));

		act(() => {
			result.current.handleSort('name', false);
		});

		act(() => {
			result.current.handleSort('name', false);
		});

		act(() => {
			result.current.handleSort('name', false);
		});

		expect(result.current.sortedData).toEqual(mockData);
		expect(result.current.sortConfigs).toEqual([]);
	});

	it('should sort numbers correctly', () => {
		const { result } = renderHook(() => useTableSorting({ data: mockData }));

		act(() => {
			result.current.handleSort('age', false);
		});

		expect(result.current.sortedData.map(item => item.age)).toEqual([25, 28, 30, 35]);

		act(() => {
			result.current.handleSort('age', false);
		});

		expect(result.current.sortedData.map(item => item.age)).toEqual([35, 30, 28, 25]);
	});

	it('should sort booleans correctly', () => {
		const { result } = renderHook(() => useTableSorting({ data: mockData }));

		act(() => {
			result.current.handleSort('active', false);
		});

		// false comes before true in ascending order
		expect(result.current.sortedData[0]!.active).toBe(false);
		expect(result.current.sortedData[1]!.active).toBe(false);
		expect(result.current.sortedData[2]!.active).toBe(true);
		expect(result.current.sortedData[3]!.active).toBe(true);
	});

	it('should handle switching to different column', () => {
		const { result } = renderHook(() => useTableSorting({ data: mockData }));

		act(() => {
			result.current.handleSort('name', false);
		});

		expect(result.current.sortConfigs).toEqual([{ key: 'name', direction: 'asc' }]);

		act(() => {
			result.current.handleSort('age', false);
		});

		expect(result.current.sortConfigs).toEqual([{ key: 'age', direction: 'asc' }]);
		expect(result.current.sortedData.map(item => item.age)).toEqual([25, 28, 30, 35]);
	});

	it('should handle null/undefined values', () => {
		const dataWithNulls = [
			{ id: '1', name: 'Alice', age: 25 },
			{ id: '2', name: null as any, age: 30 },
			{ id: '3', name: 'Bob', age: 35 },
			{ id: '4', name: undefined as any, age: 28 },
		];

		const { result } = renderHook(() => useTableSorting({ data: dataWithNulls }));

		act(() => {
			result.current.handleSort('name', false);
		});

		// null/undefined should be sorted to the end
		expect(result.current.sortedData[0]!.name).toBe('Alice');
		expect(result.current.sortedData[1]!.name).toBe('Bob');
		expect([null, undefined]).toContain(result.current.sortedData[2]!.name);
		expect([null, undefined]).toContain(result.current.sortedData[3]!.name);
	});

	it('should not mutate original data array', () => {
		const originalData = [...mockData];
		const { result } = renderHook(() => useTableSorting({ data: mockData }));

		act(() => {
			result.current.handleSort('name', false);
		});

		expect(mockData).toEqual(originalData);
	});

	// Multi-column sorting tests
	describe('Multi-column sorting', () => {
		it('should add column to sort on shift+click', () => {
			const { result } = renderHook(() => useTableSorting({ data: mockData }));

			// First sort by department
			act(() => {
				result.current.handleSort('department', false);
			});

			expect(result.current.sortConfigs).toEqual([{ key: 'department', direction: 'asc' }]);

			// Shift+click to add age sort
			act(() => {
				result.current.handleSort('age', true);
			});

			expect(result.current.sortConfigs).toEqual([
				{ key: 'department', direction: 'asc' },
				{ key: 'age', direction: 'asc' },
			]);
		});

		it('should apply multi-column sort in priority order', () => {
			const { result } = renderHook(() => useTableSorting({ data: mockData }));

			// Sort by department first
			act(() => {
				result.current.handleSort('department', false);
			});

			// Then shift+click to add age sort
			act(() => {
				result.current.handleSort('age', true);
			});

			// Both Bob and Charlie are in Engineering, sorted by age asc: Charlie (30) < Bob (35)
			// Both Alice and David are in Sales, sorted by age asc: Alice (25) < David (28)
			const sorted = result.current.sortedData;
			expect(sorted[0]!.name).toBe('Charlie'); // Engineering, age 30
			expect(sorted[1]!.name).toBe('Bob'); // Engineering, age 35
			expect(sorted[2]!.name).toBe('Alice'); // Sales, age 25
			expect(sorted[3]!.name).toBe('David'); // Sales, age 28
		});

		it('should cycle through directions on shift+click of existing sort', () => {
			const { result } = renderHook(() => useTableSorting({ data: mockData }));

			// Add two sorts
			act(() => {
				result.current.handleSort('department', false);
			});
			act(() => {
				result.current.handleSort('age', true);
			});

			expect(result.current.sortConfigs).toEqual([
				{ key: 'department', direction: 'asc' },
				{ key: 'age', direction: 'asc' },
			]);

			// Shift+click age again to flip to desc
			act(() => {
				result.current.handleSort('age', true);
			});

			expect(result.current.sortConfigs).toEqual([
				{ key: 'department', direction: 'asc' },
				{ key: 'age', direction: 'desc' },
			]);

			// Shift+click age again to remove
			act(() => {
				result.current.handleSort('age', true);
			});

			expect(result.current.sortConfigs).toEqual([{ key: 'department', direction: 'asc' }]);
		});

		it('should clear all sorts when clicking without shift on sorted column', () => {
			const { result } = renderHook(() => useTableSorting({ data: mockData }));

			// Add two sorts
			act(() => {
				result.current.handleSort('department', false);
			});
			act(() => {
				result.current.handleSort('age', true);
			});

			expect(result.current.sortConfigs.length).toBe(2);

			// Regular click on department should replace all with dept desc
			act(() => {
				result.current.handleSort('department', false);
			});

			expect(result.current.sortConfigs).toEqual([{ key: 'department', direction: 'desc' }]);
		});

		it('should return correct sort info via getSortInfo', () => {
			const { result } = renderHook(() => useTableSorting({ data: mockData }));

			// Initially no sorts
			expect(result.current.getSortInfo('name')).toEqual({
				direction: null,
				priority: null,
			});

			// Add first sort
			act(() => {
				result.current.handleSort('department', false);
			});

			expect(result.current.getSortInfo('department')).toEqual({
				direction: 'asc',
				priority: null, // Only one sort, no priority shown
			});

			// Add second sort
			act(() => {
				result.current.handleSort('age', true);
			});

			expect(result.current.getSortInfo('department')).toEqual({
				direction: 'asc',
				priority: 1, // First priority
			});

			expect(result.current.getSortInfo('age')).toEqual({
				direction: 'asc',
				priority: 2, // Second priority
			});

			expect(result.current.getSortInfo('name')).toEqual({
				direction: null,
				priority: null,
			});
		});

		it('should handle multi-sort with initial sort', () => {
			const { result } = renderHook(() =>
				useTableSorting({
					data: mockData,
					initialSort: [
						{ key: 'department', direction: 'asc' },
						{ key: 'name', direction: 'desc' },
					],
				})
			);

			expect(result.current.sortConfigs).toEqual([
				{ key: 'department', direction: 'asc' },
				{ key: 'name', direction: 'desc' },
			]);

			// Engineering: Charlie (C), Bob (B) - descending by name -> Charlie, Bob
			// Sales: David (D), Alice (A) - descending by name -> David, Alice
			expect(result.current.sortedData[0]!.name).toBe('Charlie');
			expect(result.current.sortedData[1]!.name).toBe('Bob');
			expect(result.current.sortedData[2]!.name).toBe('David');
			expect(result.current.sortedData[3]!.name).toBe('Alice');
		});
	});
});
