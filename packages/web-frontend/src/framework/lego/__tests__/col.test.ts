import { describe, expect, it } from 'vitest';

import { col } from '../helpers/col';
import type { ColumnDef } from '../types/ColTypes';

/**
 * ===========================================================================================
 * COLUMN BUILDER TESTS
 * ===========================================================================================
 *
 * Validates the col builder API creates properly typed column definitions.
 *
 * ===========================================================================================
 */

interface TestProduct {
	id: string;
	name: string;
	price: number;
	category: string;
	stock: number;
	featured: boolean;
	createdAt: Date;
}

describe('col builder', () => {
	it('should create text column with defaults', () => {
		const column: ColumnDef<TestProduct> = col.text('name', 'Product Name');

		expect(column).toEqual({
			key: 'name',
			label: 'Product Name',
			type: 'text',
			visible: true,
			sortable: false,
		});
	});

	it('should create number column with prefix and suffix', () => {
		const column: ColumnDef<TestProduct> = col.number('price', 'Price', {
			prefix: '$',
			sortable: true,
		});

		expect(column).toEqual({
			key: 'price',
			label: 'Price',
			type: 'number',
			prefix: '$',
			visible: true,
			sortable: true,
		});
	});

	it('should create enum column with badge', () => {
		const categories = ['electronics', 'clothing', 'food'] as const;
		const column: ColumnDef<TestProduct> = col.enum('category', 'Category', categories, {
			badge: true,
		});

		expect(column).toEqual({
			key: 'category',
			label: 'Category',
			type: 'enum',
			enumValues: categories,
			badge: true,
			visible: true,
			sortable: false,
		});
	});

	it('should create boolean column', () => {
		const column: ColumnDef<TestProduct> = col.boolean('featured', 'Featured');

		expect(column).toEqual({
			key: 'featured',
			label: 'Featured',
			type: 'boolean',
			visible: true,
			sortable: false,
		});
	});

	it('should create date column with sorting', () => {
		const column: ColumnDef<TestProduct> = col.date('createdAt', 'Created', {
			sortable: true,
		});

		expect(column).toEqual({
			key: 'createdAt',
			label: 'Created',
			type: 'date',
			visible: true,
			sortable: true,
		});
	});

	it('should create custom column with render function', () => {
		const renderFn = (item: TestProduct) => item.name.toUpperCase();
		const column: ColumnDef<TestProduct> = col.custom('name', 'Name', renderFn);

		expect(column).toEqual({
			key: 'name',
			label: 'Name',
			type: 'custom',
			render: renderFn,
			visible: true,
			sortable: false,
		});
	});

	it('should support sticky positioning', () => {
		const column: ColumnDef<TestProduct> = col.text('name', 'Name', {
			sticky: 'left',
			width: 200,
		});

		expect(column).toEqual({
			key: 'name',
			label: 'Name',
			type: 'text',
			visible: true,
			sortable: false,
			sticky: 'left',
			width: 200,
		});
	});

	it('should allow hiding column by default', () => {
		const column: ColumnDef<TestProduct> = col.text('id', 'ID', {
			visible: false,
		});

		expect(column.visible).toBe(false);
	});
});
