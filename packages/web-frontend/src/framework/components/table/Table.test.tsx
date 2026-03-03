import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Table, type TableColumn } from './Table';

interface MockItem {
	id: string;
	name: string;
	value: number;
}

const mockData: MockItem[] = [
	{ id: '1', name: 'Item 1', value: 10 },
	{ id: '2', name: 'Item 2', value: 20 },
	{ id: '3', name: 'Item 3', value: 30 },
];

const mockColumns: TableColumn<MockItem>[] = [
	{ key: 'name', label: 'Name', render: item => item.name },
	{ key: 'value', label: 'Value', render: item => item.value },
];

describe('Table', () => {
	it('should render table with data', () => {
		render(<Table data={mockData} columns={mockColumns} getItemId={item => item.id} />);

		expect(screen.getByText('Item 1')).toBeInTheDocument();
		expect(screen.getByText('Item 2')).toBeInTheDocument();
		expect(screen.getByText('Item 3')).toBeInTheDocument();
	});

	it('should render column headers', () => {
		render(<Table data={mockData} columns={mockColumns} getItemId={item => item.id} />);

		expect(screen.getByText('Name')).toBeInTheDocument();
		expect(screen.getByText('Value')).toBeInTheDocument();
	});

	it('should render empty state when no data', () => {
		render(<Table data={[]} columns={mockColumns} getItemId={item => item.id} emptyMessage="No items found" />);

		expect(screen.getByText('No items found')).toBeInTheDocument();
	});

	it('should render loading state', () => {
		render(
			<Table
				data={[]}
				columns={mockColumns}
				getItemId={item => item.id}
				loading={true}
				loadingMessage="Loading items..."
			/>
		);

		expect(screen.getByText('Loading items...')).toBeInTheDocument();
	});

	it('should render select-all checkbox when selectable', () => {
		render(
			<Table
				data={mockData}
				columns={mockColumns}
				getItemId={item => item.id}
				selectable
				selectedIds={new Set()}
				onSelectionChange={() => {}}
			/>
		);

		const checkboxes = screen.getAllByRole('checkbox');
		expect(checkboxes.length).toBe(4); // 1 select-all + 3 rows
	});

	it('should render row checkboxes when selectable', () => {
		render(
			<Table
				data={mockData}
				columns={mockColumns}
				getItemId={item => item.id}
				selectable
				selectedIds={new Set()}
				onSelectionChange={() => {}}
			/>
		);

		const rowCheckboxes = screen.getAllByTestId('row-checkbox');
		expect(rowCheckboxes.length).toBe(3);
	});

	it('should call onSelectionChange when row checkbox is clicked', () => {
		const onSelectionChange = vi.fn();

		render(
			<Table
				data={mockData}
				columns={mockColumns}
				getItemId={item => item.id}
				selectable
				selectedIds={new Set()}
				onSelectionChange={onSelectionChange}
			/>
		);

		const firstCheckbox = screen.getAllByTestId('row-checkbox')[0];
		firstCheckbox!.click();

		expect(onSelectionChange).toHaveBeenCalledWith(new Set(['1']));
	});

	it('should select all when select-all checkbox is clicked', () => {
		const onSelectionChange = vi.fn();

		render(
			<Table
				data={mockData}
				columns={mockColumns}
				getItemId={item => item.id}
				selectable
				selectedIds={new Set()}
				onSelectionChange={onSelectionChange}
			/>
		);

		const selectAllCheckbox = screen.getAllByRole('checkbox')[0];
		selectAllCheckbox!.click();

		expect(onSelectionChange).toHaveBeenCalledWith(new Set(['1', '2', '3']));
	});

	it('should render actions column when renderActions is provided', () => {
		render(
			<Table
				data={mockData}
				columns={mockColumns}
				getItemId={item => item.id}
				renderActions={item => <button>Edit {item.name}</button>}
			/>
		);

		expect(screen.getByText('Actions')).toBeInTheDocument();
		expect(screen.getByText('Edit Item 1')).toBeInTheDocument();
	});

	it('should apply custom row className', () => {
		render(
			<Table
				data={mockData}
				columns={mockColumns}
				getItemId={item => item.id}
				getRowClassName={item => (item.value > 15 ? 'highlighted' : '')}
			/>
		);

		const rows = screen.getAllByTestId('table-row');
		expect(rows[0]).not.toHaveClass('highlighted'); // value: 10
		expect(rows[1]).toHaveClass('highlighted'); // value: 20
		expect(rows[2]).toHaveClass('highlighted'); // value: 30
	});

	it('should show editing state on row', () => {
		render(<Table data={mockData} columns={mockColumns} getItemId={item => item.id} editingId="2" />);

		const rows = screen.getAllByTestId('table-row');
		expect(rows[0]).not.toHaveClass('border-2', 'border-primary');
		expect(rows[1]).toHaveClass('border-2', 'border-primary'); // editing
		expect(rows[2]).not.toHaveClass('border-2', 'border-primary');
	});

	it('should pass isEditing to column render function', () => {
		const renderSpy = vi.fn((item: MockItem, isEditing: boolean) =>
			isEditing ? `Editing: ${item.name}` : item.name
		);

		const columnsWithSpy: TableColumn<MockItem>[] = [{ key: 'name', label: 'Name', render: renderSpy }];

		render(<Table data={mockData} columns={columnsWithSpy} getItemId={item => item.id} editingId="2" />);

		expect(screen.getByText('Item 1')).toBeInTheDocument();
		expect(screen.getByText('Editing: Item 2')).toBeInTheDocument();
		expect(screen.getByText('Item 3')).toBeInTheDocument();
	});

	describe('Pagination', () => {
		it('should render pagination with correct item range using pageSize', () => {
			const onPageChange = vi.fn();

			render(
				<Table
					data={mockData}
					columns={mockColumns}
					getItemId={item => item.id}
					pagination={{
						currentPage: 1,
						totalPages: 2,
						totalItems: 12,
						pageSize: 10,
						onPageChange,
					}}
				/>
			);

			// Should show "Showing 1 to 10 of 12 items" (using pageSize=10)
			// NOT "Showing 1 to 6 of 12 items" (using ceil(12/2)=6)
			expect(screen.getByText(/Showing 1 to 10 of 12 items/)).toBeInTheDocument();
		});

		it('should calculate correct item range for page 2', () => {
			const onPageChange = vi.fn();

			render(
				<Table
					data={mockData}
					columns={mockColumns}
					getItemId={item => item.id}
					pagination={{
						currentPage: 2,
						totalPages: 2,
						totalItems: 12,
						pageSize: 10,
						onPageChange,
					}}
				/>
			);

			// Page 2: should show items 11-12
			expect(screen.getByText(/Showing 11 to 12 of 12 items/)).toBeInTheDocument();
		});

		it('should fallback to calculated perPage when pageSize is undefined', () => {
			const onPageChange = vi.fn();

			render(
				<Table
					data={mockData}
					columns={mockColumns}
					getItemId={item => item.id}
					pagination={{
						currentPage: 1,
						totalPages: 2,
						totalItems: 12,
						onPageChange,
					}}
				/>
			);

			// Without pageSize, should fallback to ceil(12/2)=6
			expect(screen.getByText(/Showing 1 to 6 of 12 items/)).toBeInTheDocument();
		});

		it('should show 0 to 0 when no data', () => {
			const onPageChange = vi.fn();

			render(
				<Table
					data={[]}
					columns={mockColumns}
					getItemId={item => item.id}
					pagination={{
						currentPage: 1,
						totalPages: 1,
						totalItems: 0,
						pageSize: 10,
						onPageChange,
					}}
				/>
			);

			expect(screen.getByText(/Showing 0 to 0 of 0 items/)).toBeInTheDocument();
		});

		it('should handle edge case with more pages than items per page', () => {
			const onPageChange = vi.fn();

			render(
				<Table
					data={mockData}
					columns={mockColumns}
					getItemId={item => item.id}
					pagination={{
						currentPage: 3,
						totalPages: 5,
						totalItems: 23,
						pageSize: 5,
						onPageChange,
					}}
				/>
			);

			// Page 3 with pageSize=5: items 11-15
			expect(screen.getByText(/Showing 11 to 15 of 23 items/)).toBeInTheDocument();
		});

		it('should not exceed totalItems on last page', () => {
			const onPageChange = vi.fn();

			render(
				<Table
					data={mockData}
					columns={mockColumns}
					getItemId={item => item.id}
					pagination={{
						currentPage: 5,
						totalPages: 5,
						totalItems: 23,
						pageSize: 5,
						onPageChange,
					}}
				/>
			);

			// Last page: items 21-23 (not 21-25)
			expect(screen.getByText(/Showing 21 to 23 of 23 items/)).toBeInTheDocument();
		});
	});
});
