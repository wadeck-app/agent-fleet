import type { TableColumn } from '@framework/components/table/Table';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ColumnHelpers, defineColumns } from './ColumnHelpers';

interface TestBook {
	id: string;
	title: string;
	author: string;
	pages: number;
	isbn?: string;
	genre?: string;
	createdAt: string;
	updatedAt: string;
	version: number;
}

const mockBook: TestBook = {
	id: '123',
	title: 'Test Book',
	author: 'Test Author',
	pages: 300,
	isbn: '978-0-123456-78-9',
	genre: 'Fiction',
	createdAt: '2024-01-15T10:30:00Z',
	updatedAt: '2024-02-20T14:45:00Z',
	version: 1,
};

const mockBookWithoutOptional: TestBook = {
	id: '456',
	title: 'Another Book',
	author: 'Another Author',
	pages: 200,
	createdAt: '2024-01-01T00:00:00Z',
	updatedAt: '2024-01-01T00:00:00Z',
	version: 1,
};

describe('ColumnHelpers', () => {
	describe('id()', () => {
		it('should create an ID column with correct structure', () => {
			const column = ColumnHelpers.id<TestBook>();

			expect(column.key).toBe('id');
			expect(column.label).toBe('ID');
			expect(column.canHide).toBe(true);
			expect(column.render).toBeDefined();
		});

		it('should render ID with monospace font and muted styling', () => {
			const column = ColumnHelpers.id<TestBook>();
			const { container } = render(<>{column.render(mockBook, false)}</>);

			const span = container.querySelector('span');
			expect(span).toBeTruthy();
			expect(span?.className).toContain('font-mono');
			expect(span?.className).toContain('text-xs');
			expect(span?.className).toContain('text-muted-foreground');
			expect(span?.textContent).toBe('123');
		});
	});

	describe('date()', () => {
		it('should create a date column with correct structure', () => {
			const column = ColumnHelpers.date<TestBook>('createdAt', 'Created');

			expect(column.key).toBe('createdAt');
			expect(column.label).toBe('Created');
			expect(column.render).toBeDefined();
		});

		it('should render formatted date with tooltip', () => {
			const column = ColumnHelpers.date<TestBook>('createdAt', 'Created');
			const { container } = render(<>{column.render(mockBook, false)}</>);

			const span = container.querySelector('span');
			expect(span).toBeTruthy();
			expect(span?.className).toContain('text-sm');
			expect(span?.className).toContain('text-muted-foreground');
			expect(span?.textContent).toBe('2024-01-15');
			expect(span?.title).toBe('2024-01-15 10:30:00');
		});

		it('should support canHide option', () => {
			const column = ColumnHelpers.date<TestBook>('createdAt', 'Created', { canHide: true });
			expect(column.canHide).toBe(true);
		});

		it('should support sortable option', () => {
			const column = ColumnHelpers.date<TestBook>('createdAt', 'Created', { sortable: true });
			expect(column.sortable).toBe(true);
		});
	});

	describe('numeric()', () => {
		it('should create a numeric column with correct structure', () => {
			const column = ColumnHelpers.numeric<TestBook>('pages', 'Pages');

			expect(column.key).toBe('pages');
			expect(column.label).toBe('Pages');
			expect(column.render).toBeDefined();
		});

		it('should render number with tabular-nums class', () => {
			const column = ColumnHelpers.numeric<TestBook>('pages', 'Pages');
			const { container } = render(<>{column.render(mockBook, false)}</>);

			const span = container.querySelector('span');
			expect(span).toBeTruthy();
			expect(span?.className).toContain('tabular-nums');
			expect(span?.textContent).toBe('300');
		});

		it('should default to right alignment', () => {
			const column = ColumnHelpers.numeric<TestBook>('pages', 'Pages');
			expect(column.className).toContain('text-right');
		});

		it('should support center alignment', () => {
			const column = ColumnHelpers.numeric<TestBook>('pages', 'Pages', { align: 'center' });
			expect(column.className).toContain('text-center');
		});

		it('should support left alignment', () => {
			const column = ColumnHelpers.numeric<TestBook>('pages', 'Pages', { align: 'left' });
			expect(column.className).toContain('text-left');
		});

		it('should support suffix option', () => {
			const column = ColumnHelpers.numeric<TestBook>('pages', 'Pages', { suffix: 'g' });
			const { container } = render(<>{column.render(mockBook, false)}</>);

			const span = container.querySelector('span');
			expect(span?.textContent).toBe('300g');
		});

		it('should display fallback for null/undefined values', () => {
			const column = ColumnHelpers.numeric<TestBook>('pages', 'Pages');
			const bookWithoutPages = { ...mockBook, pages: null as any };
			const { container } = render(<>{column.render(bookWithoutPages, false)}</>);

			expect(container.textContent).toBe('-');
		});
	});

	describe('string()', () => {
		it('should create a string column with correct structure', () => {
			const column = ColumnHelpers.string<TestBook>('title', 'Title');

			expect(column.key).toBe('title');
			expect(column.label).toBe('Title');
			expect(column.render).toBeDefined();
		});

		it('should render string value', () => {
			const column = ColumnHelpers.string<TestBook>('title', 'Title');
			const { container } = render(<>{column.render(mockBook, false)}</>);

			expect(container.textContent).toBe('Test Book');
		});

		it('should support fontWeight option - semibold', () => {
			const column = ColumnHelpers.string<TestBook>('title', 'Title', {
				fontWeight: 'semibold',
			});
			const { container } = render(<>{column.render(mockBook, false)}</>);

			const span = container.querySelector('span');
			expect(span?.className).toContain('font-semibold');
		});

		it('should support fontWeight option - bold', () => {
			const column = ColumnHelpers.string<TestBook>('title', 'Title', { fontWeight: 'bold' });
			const { container } = render(<>{column.render(mockBook, false)}</>);

			const span = container.querySelector('span');
			expect(span?.className).toContain('font-bold');
		});

		it('should support fontWeight option - medium', () => {
			const column = ColumnHelpers.string<TestBook>('title', 'Title', {
				fontWeight: 'medium',
			});
			const { container } = render(<>{column.render(mockBook, false)}</>);

			const span = container.querySelector('span');
			expect(span?.className).toContain('font-medium');
		});

		it('should support textColor option', () => {
			const column = ColumnHelpers.string<TestBook>('genre', 'Genre', {
				textColor: 'text-muted-foreground',
			});
			const { container } = render(<>{column.render(mockBook, false)}</>);

			const span = container.querySelector('span');
			expect(span?.className).toContain('text-muted-foreground');
		});

		it('should use default fallback "-" for null/undefined values', () => {
			const column = ColumnHelpers.string<TestBook>('genre', 'Genre');
			const { container } = render(<>{column.render(mockBookWithoutOptional, false)}</>);

			expect(container.textContent).toBe('-');
		});

		it('should support custom fallback', () => {
			const column = ColumnHelpers.string<TestBook>('genre', 'Genre', { fallback: 'N/A' });
			const { container } = render(<>{column.render(mockBookWithoutOptional, false)}</>);

			expect(container.textContent).toBe('N/A');
		});

		it('should combine multiple class options', () => {
			const column = ColumnHelpers.string<TestBook>('title', 'Title', {
				fontWeight: 'semibold',
				textColor: 'text-primary',
			});
			const { container } = render(<>{column.render(mockBook, false)}</>);

			const span = container.querySelector('span');
			expect(span?.className).toContain('font-semibold');
			expect(span?.className).toContain('text-primary');
		});
	});

	describe('metadata()', () => {
		it('should return array of three columns', () => {
			const columns = ColumnHelpers.metadata<TestBook>();

			expect(columns).toHaveLength(3);
		});

		it('should include id column', () => {
			const columns = ColumnHelpers.metadata<TestBook>();
			const idColumn = columns.find(col => col.key === 'id');

			expect(idColumn).toBeDefined();
			expect(idColumn?.label).toBe('ID');
		});

		it('should include createdAt column', () => {
			const columns = ColumnHelpers.metadata<TestBook>();
			const createdAtColumn = columns.find(col => col.key === 'createdAt');

			expect(createdAtColumn).toBeDefined();
			expect(createdAtColumn?.label).toBe('Created');
			expect(createdAtColumn?.canHide).toBe(true);
		});

		it('should include updatedAt column', () => {
			const columns = ColumnHelpers.metadata<TestBook>();
			const updatedAtColumn = columns.find(col => col.key === 'updatedAt');

			expect(updatedAtColumn).toBeDefined();
			expect(updatedAtColumn?.label).toBe('Updated');
			expect(updatedAtColumn?.canHide).toBe(true);
		});

		it('should render all metadata columns correctly', () => {
			const columns = ColumnHelpers.metadata<TestBook>();

			columns.forEach(column => {
				expect(column.render(mockBook, false)).toBeTruthy();
			});
		});
	});
});

describe('defineColumns', () => {
	it('should return the same columns array', () => {
		const columns: TableColumn<TestBook>[] = [
			ColumnHelpers.string<TestBook>('title', 'Title'),
			ColumnHelpers.string<TestBook>('author', 'Author'),
		];

		const result = defineColumns(columns);
		expect(result).toBe(columns);
		expect(result).toHaveLength(2);
	});

	it('should not throw error for unique column keys', () => {
		const columns: TableColumn<TestBook>[] = [
			ColumnHelpers.string<TestBook>('title', 'Title'),
			ColumnHelpers.string<TestBook>('author', 'Author'),
			ColumnHelpers.numeric<TestBook>('pages', 'Pages'),
		];

		expect(() => defineColumns(columns)).not.toThrow();
	});

	it('should throw error for duplicate column keys', () => {
		const columns: TableColumn<TestBook>[] = [
			ColumnHelpers.string<TestBook>('title', 'Title'),
			ColumnHelpers.string<TestBook>('title', 'Title (Duplicate)'),
		];

		expect(() => defineColumns(columns)).toThrow('Duplicate column key detected: "title"');
	});

	it('should throw error for duplicate keys in metadata columns', () => {
		const columns: TableColumn<TestBook>[] = [
			...ColumnHelpers.metadata<TestBook>(),
			ColumnHelpers.string<TestBook>('id', 'Custom ID'),
		];

		expect(() => defineColumns(columns)).toThrow('Duplicate column key detected: "id"');
	});

	it('should validate complex column arrays', () => {
		const columns: TableColumn<TestBook>[] = [
			...ColumnHelpers.metadata<TestBook>(),
			ColumnHelpers.string<TestBook>('title', 'Title'),
			ColumnHelpers.string<TestBook>('author', 'Author'),
			ColumnHelpers.numeric<TestBook>('pages', 'Pages'),
		];

		expect(() => defineColumns(columns)).not.toThrow();
		expect(defineColumns(columns)).toHaveLength(6);
	});

	it('should handle empty arrays', () => {
		const columns: TableColumn<TestBook>[] = [];
		expect(() => defineColumns(columns)).not.toThrow();
		expect(defineColumns(columns)).toHaveLength(0);
	});
});
