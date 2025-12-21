import type { TableColumn } from '@framework/components/table/Table';

import { applyColumnOrder } from './columnOrdering';

interface TestItem {
	id: string;
	name: string;
	age: number;
}

const mockColumns: TableColumn<TestItem>[] = [
	{
		key: 'id',
		label: 'ID',
		render: item => item.id,
	},
	{
		key: 'name',
		label: 'Name',
		render: item => item.name,
	},
	{
		key: 'age',
		label: 'Age',
		render: item => item.age,
	},
];

describe('applyColumnOrder', () => {
	it('should return columns in the specified order', () => {
		const order = ['age', 'name', 'id'];
		const result = applyColumnOrder(mockColumns, order);

		expect(result.map(col => col.key)).toEqual(['age', 'name', 'id']);
	});

	it('should handle partial ordering by appending unordered columns at the end', () => {
		const order = ['name', 'age'];
		const result = applyColumnOrder(mockColumns, order);

		expect(result.map(col => col.key)).toEqual(['name', 'age', 'id']);
	});

	it('should ignore non-existent column keys in order', () => {
		const order = ['name', 'nonexistent', 'id'];
		const result = applyColumnOrder(mockColumns, order);

		expect(result.map(col => col.key)).toEqual(['name', 'id', 'age']);
	});

	it('should return columns unchanged when order is empty', () => {
		const order: string[] = [];
		const result = applyColumnOrder(mockColumns, order);

		expect(result.map(col => col.key)).toEqual(['id', 'name', 'age']);
	});

	it('should handle duplicate keys in order by using first occurrence', () => {
		const order = ['name', 'name', 'id'];
		const result = applyColumnOrder(mockColumns, order);

		expect(result.map(col => col.key)).toEqual(['name', 'id', 'age']);
	});

	it('should not mutate the original columns array', () => {
		const order = ['age', 'name', 'id'];
		const originalKeys = mockColumns.map(col => col.key);

		applyColumnOrder(mockColumns, order);

		expect(mockColumns.map(col => col.key)).toEqual(originalKeys);
	});

	it('should maintain column properties when reordering', () => {
		const order = ['age', 'name'];
		const result = applyColumnOrder(mockColumns, order);

		expect(result[0]!.label).toBe('Age');
		expect(result[1]!.label).toBe('Name');
	});
});
