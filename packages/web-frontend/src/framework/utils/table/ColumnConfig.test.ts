import type { TableColumn } from '@framework/components/table/Table';
import { describe, expect, it } from 'vitest';

import {
	extractCanHideConstraints,
	extractColumnIds,
	extractDefaultVisible,
	toColumnVisibilityDefs,
} from './ColumnConfig';

/**
 * ===========================================================================================
 * COLUMN CONFIG UTILITIES - TEST SUITE
 * ===========================================================================================
 *
 * Tests for column configuration utility functions.
 * Ensures correct transformation of TableColumn[] to various formats.
 *
 * Coverage target: 100% (pure functions, easy to test)
 *
 * ===========================================================================================
 */

// Test data type
interface TestItem {
	id: string;
	name: string;
	email: string;
}

// Helper to create mock TableColumn
function createMockColumn(key: string, label: string, options: { canHide?: boolean } = {}): TableColumn<TestItem> {
	return {
		key,
		label,
		render: () => null,
		canHide: options.canHide,
	};
}

describe('ColumnConfig utilities', () => {
	describe('toColumnVisibilityDefs', () => {
		it('should convert TableColumn[] to ColumnDef[]', () => {
			const columns: TableColumn<TestItem>[] = [
				createMockColumn('id', 'ID'),
				createMockColumn('name', 'Name'),
				createMockColumn('email', 'Email'),
			];

			const result = toColumnVisibilityDefs(columns);

			expect(result).toEqual([
				{ id: 'id', label: 'ID', canHide: true },
				{ id: 'name', label: 'Name', canHide: true },
				{ id: 'email', label: 'Email', canHide: true },
			]);
		});

		it('should preserve canHide property when true', () => {
			const columns: TableColumn<TestItem>[] = [createMockColumn('id', 'ID', { canHide: true })];

			const result = toColumnVisibilityDefs(columns);

			expect(result[0]!.canHide).toBe(true);
		});

		it('should preserve canHide property when false', () => {
			const columns: TableColumn<TestItem>[] = [createMockColumn('name', 'Name', { canHide: false })];

			const result = toColumnVisibilityDefs(columns);

			expect(result[0]!.canHide).toBe(false);
		});

		it('should default canHide to true when undefined', () => {
			const columns: TableColumn<TestItem>[] = [
				createMockColumn('email', 'Email'), // canHide not specified
			];

			const result = toColumnVisibilityDefs(columns);

			expect(result[0]!.canHide).toBe(true);
		});

		it('should handle empty array', () => {
			const result = toColumnVisibilityDefs([]);

			expect(result).toEqual([]);
		});

		it('should handle mixed canHide values', () => {
			const columns: TableColumn<TestItem>[] = [
				createMockColumn('id', 'ID', { canHide: false }),
				createMockColumn('name', 'Name'), // undefined → defaults to true
				createMockColumn('email', 'Email', { canHide: true }),
			];

			const result = toColumnVisibilityDefs(columns);

			expect(result).toEqual([
				{ id: 'id', label: 'ID', canHide: false },
				{ id: 'name', label: 'Name', canHide: true },
				{ id: 'email', label: 'Email', canHide: true },
			]);
		});

		it('should preserve column order', () => {
			const columns: TableColumn<TestItem>[] = [
				createMockColumn('email', 'Email'),
				createMockColumn('name', 'Name'),
				createMockColumn('id', 'ID'),
			];

			const result = toColumnVisibilityDefs(columns);

			expect(result.map(col => col.id)).toEqual(['email', 'name', 'id']);
		});
	});

	describe('extractColumnIds', () => {
		it('should extract column IDs from TableColumn[]', () => {
			const columns: TableColumn<TestItem>[] = [
				createMockColumn('id', 'ID'),
				createMockColumn('name', 'Name'),
				createMockColumn('email', 'Email'),
			];

			const result = extractColumnIds(columns);

			expect(result).toEqual(['id', 'name', 'email']);
		});

		it('should handle empty array', () => {
			const result = extractColumnIds([]);

			expect(result).toEqual([]);
		});

		it('should preserve column order', () => {
			const columns: TableColumn<TestItem>[] = [
				createMockColumn('email', 'Email'),
				createMockColumn('id', 'ID'),
				createMockColumn('name', 'Name'),
			];

			const result = extractColumnIds(columns);

			expect(result).toEqual(['email', 'id', 'name']);
		});

		it('should work with columns that have various properties', () => {
			const columns: TableColumn<TestItem>[] = [
				createMockColumn('id', 'ID', { canHide: false }),
				createMockColumn('name', 'Name'),
			];

			const result = extractColumnIds(columns);

			expect(result).toEqual(['id', 'name']);
		});
	});

	describe('extractDefaultVisible', () => {
		it('should extract columns with defaultVisible=true', () => {
			const columns: TableColumn<TestItem>[] = [
				{ ...createMockColumn('id', 'ID'), defaultVisible: false },
				{ ...createMockColumn('name', 'Name'), defaultVisible: true },
				createMockColumn('email', 'Email'), // undefined → defaults to false
			];

			const result = extractDefaultVisible(columns);

			expect(result).toEqual(['name']);
		});

		it('should handle empty array', () => {
			const result = extractDefaultVisible([]);

			expect(result).toEqual([]);
		});

		it('should return empty array when no columns have defaultVisible=true', () => {
			const columns: TableColumn<TestItem>[] = [
				createMockColumn('id', 'ID'),
				{ ...createMockColumn('name', 'Name'), defaultVisible: false },
			];

			const result = extractDefaultVisible(columns);

			expect(result).toEqual([]);
		});

		it('should extract multiple columns with defaultVisible=true', () => {
			const columns: TableColumn<TestItem>[] = [
				{ ...createMockColumn('id', 'ID'), defaultVisible: true },
				{ ...createMockColumn('name', 'Name'), defaultVisible: true },
				{ ...createMockColumn('email', 'Email'), defaultVisible: false },
			];

			const result = extractDefaultVisible(columns);

			expect(result).toEqual(['id', 'name']);
		});

		it('should preserve column order', () => {
			const columns: TableColumn<TestItem>[] = [
				{ ...createMockColumn('email', 'Email'), defaultVisible: true },
				{ ...createMockColumn('name', 'Name'), defaultVisible: false },
				{ ...createMockColumn('id', 'ID'), defaultVisible: true },
			];

			const result = extractDefaultVisible(columns);

			expect(result).toEqual(['email', 'id']);
		});
	});

	describe('extractCanHideConstraints', () => {
		it('should extract canHide constraints as a record', () => {
			const columns: TableColumn<TestItem>[] = [
				createMockColumn('id', 'ID', { canHide: false }),
				createMockColumn('name', 'Name', { canHide: true }),
				createMockColumn('email', 'Email'), // default: true
			];

			const constraints = extractCanHideConstraints(columns);

			expect(constraints).toEqual({
				id: { canHide: false },
				name: { canHide: true },
				email: { canHide: true },
			});
		});

		it('should default canHide to true when not specified', () => {
			const columns: TableColumn<TestItem>[] = [
				createMockColumn('name', 'Name'),
				createMockColumn('email', 'Email'),
			];

			const constraints = extractCanHideConstraints(columns);

			expect(constraints).toEqual({
				name: { canHide: true },
				email: { canHide: true },
			});
		});

		it('should handle empty columns array', () => {
			const columns: TableColumn<TestItem>[] = [];

			const constraints = extractCanHideConstraints(columns);

			expect(constraints).toEqual({});
		});

		it('should handle all columns with canHide: false', () => {
			const columns: TableColumn<TestItem>[] = [
				createMockColumn('id', 'ID', { canHide: false }),
				createMockColumn('name', 'Name', { canHide: false }),
			];

			const constraints = extractCanHideConstraints(columns);

			expect(constraints).toEqual({
				id: { canHide: false },
				name: { canHide: false },
			});
		});
	});

	describe('integration: using all utilities together', () => {
		it('should work together to transform table columns for visibility system', () => {
			const columns: TableColumn<TestItem>[] = [
				{ ...createMockColumn('id', 'ID', { canHide: false }), defaultVisible: false },
				{ ...createMockColumn('name', 'Name'), defaultVisible: true },
				{ ...createMockColumn('email', 'Email'), defaultVisible: true },
			];

			// Extract data for useColumnVisibility hook
			const allColumnIds = extractColumnIds(columns);
			expect(allColumnIds).toEqual(['id', 'name', 'email']);

			// Extract data for ColumnVisibility component
			const visibilityDefs = toColumnVisibilityDefs(columns);
			expect(visibilityDefs).toHaveLength(3);
			expect(visibilityDefs[0]).toEqual({ id: 'id', label: 'ID', canHide: false });

			// Extract default visible columns
			const defaultVisible = extractDefaultVisible(columns);
			expect(defaultVisible).toEqual(['name', 'email']);

			// Extract canHide constraints for hook
			const constraints = extractCanHideConstraints(columns);
			expect(constraints).toEqual({
				id: { canHide: false },
				name: { canHide: true },
				email: { canHide: true },
			});
		});
	});
});
