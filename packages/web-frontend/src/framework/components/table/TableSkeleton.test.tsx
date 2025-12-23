import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { TableColumn } from './Table';
import { TableSkeleton } from './TableSkeleton';

describe('TableSkeleton', () => {
	it('should render skeleton rows with correct count', () => {
		const columns: TableColumn<any>[] = [
			{ key: 'name', label: 'Name', render: () => 'test' },
			{ key: 'email', label: 'Email', render: () => 'test' },
		];

		render(<TableSkeleton columns={columns} rowCount={5} />);

		const rows = screen.getAllByRole('row');
		// 5 skeleton rows
		expect(rows).toHaveLength(5);
	});

	it('should render skeleton cells for data columns', () => {
		const columns: TableColumn<any>[] = [{ key: 'name', label: 'Name', render: () => 'test' }];

		const { container } = render(<TableSkeleton columns={columns} rowCount={1} />);

		// Should have animated skeleton divs
		const skeletonDivs = container.querySelectorAll('.animate-pulse');
		expect(skeletonDivs.length).toBeGreaterThan(0);
	});

	it('should include checkbox column when selectable is true', () => {
		const columns: TableColumn<any>[] = [{ key: 'name', label: 'Name', render: () => 'test' }];

		const { container } = render(<TableSkeleton columns={columns} rowCount={1} selectable={true} />);

		// Should have an extra cell for checkbox (1 column + 1 checkbox)
		const cells = container.querySelectorAll('td');
		expect(cells.length).toBe(2); // 1 checkbox + 1 data column
	});

	it('should include action column when renderActions is true', () => {
		const columns: TableColumn<any>[] = [{ key: 'name', label: 'Name', render: () => 'test' }];

		const { container } = render(<TableSkeleton columns={columns} rowCount={1} renderActions={true} />);

		// Should have an extra cell for actions (1 column + 1 actions)
		const cells = container.querySelectorAll('td');
		expect(cells.length).toBe(2); // 1 data column + 1 actions column
	});

	it('should use default rowCount of 10', () => {
		const columns: TableColumn<any>[] = [{ key: 'name', label: 'Name', render: () => 'test' }];

		render(<TableSkeleton columns={columns} />);

		const rows = screen.getAllByRole('row');
		expect(rows).toHaveLength(10);
	});
});
