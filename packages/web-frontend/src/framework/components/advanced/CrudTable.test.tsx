import type { TableColumn } from '@framework/components/table/Table';
import { withMetadata } from '@framework/tests/withMetadata';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CrudTable, type CrudTableConfig } from './CrudTable';

interface TestItem {
	id: string;
	name: string;
	value: number;
	createdAt: string;
	updatedAt: string;
	version: number;
}

const mockData: TestItem[] = [
	withMetadata({
		id: '1',
		name: 'Item One',
		value: 100,
	}),
	withMetadata({
		id: '2',
		name: 'Item Two',
		value: 200,
	}),
];

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
		key: 'value',
		label: 'Value',
		render: item => item.value,
	},
];

const mockConfig: CrudTableConfig<TestItem> = {
	getItemDisplayName: item => item.name,
	emptyMessage: 'No items found.',
	itemTypeName: 'item',
};

const defaultProps = {
	storageId: 'test-storage',
	data: mockData,
	columns: mockColumns,
	config: mockConfig,
	onDelete: vi.fn<(id: string) => void>(),
};

describe('CrudTable', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('rendering', () => {
		it('should render table headers', () => {
			render(<CrudTable {...defaultProps} />);

			expect(screen.getByText('ID')).toBeInTheDocument();
			expect(screen.getByText('Name')).toBeInTheDocument();
			expect(screen.getByText('Value')).toBeInTheDocument();
			expect(screen.getByText('Actions')).toBeInTheDocument();
		});

		it('should render all data items', () => {
			render(<CrudTable {...defaultProps} />);

			expect(screen.getByText('Item One')).toBeInTheDocument();
			expect(screen.getByText('Item Two')).toBeInTheDocument();
		});

		it('should render delete button for each item', () => {
			render(<CrudTable {...defaultProps} />);

			const deleteButtons = screen.getAllByRole('button', { name: /delete item/i });
			expect(deleteButtons).toHaveLength(mockData.length);
		});

		it('should render edit button when onEdit is provided', () => {
			const onEdit = vi.fn<(item: TestItem) => void>();
			render(<CrudTable {...defaultProps} onEdit={onEdit} />);

			const editButtons = screen.getAllByRole('button', { name: /edit item/i });
			expect(editButtons).toHaveLength(mockData.length);
		});

		it('should not render edit button when onEdit is not provided', () => {
			render(<CrudTable {...defaultProps} />);

			const editButtons = screen.queryAllByRole('button', { name: /edit item/i });
			expect(editButtons).toHaveLength(0);
		});

		it('should render with custom edit button variant', () => {
			const onEdit = vi.fn<(item: TestItem) => void>();
			const config: CrudTableConfig<TestItem> = {
				...mockConfig,
				editButtonVariant: 'ghost',
			};

			render(<CrudTable {...defaultProps} config={config} onEdit={onEdit} />);

			const editButtons = screen.getAllByRole('button', { name: /edit item/i });
			expect(editButtons[0]).toHaveAttribute('data-variant', 'ghost');
		});
	});

	describe('empty state', () => {
		it('should render empty message when no data', () => {
			render(<CrudTable {...defaultProps} data={[]} />);

			expect(screen.getByText('No items found.')).toBeInTheDocument();
		});

		it('should render table structure even with empty data', () => {
			render(<CrudTable {...defaultProps} data={[]} />);

			expect(screen.getByText('ID')).toBeInTheDocument();
			expect(screen.getByText('Name')).toBeInTheDocument();
			expect(screen.getByText('Value')).toBeInTheDocument();
		});
	});

	describe('delete confirmation', () => {
		it('should show confirmation dialog when delete is clicked', async () => {
			const onDelete = vi.fn<(id: string) => void>();
			render(<CrudTable {...defaultProps} onDelete={onDelete} />);

			const deleteButtons = screen.getAllByRole('button', { name: /delete item/i });
			fireEvent.click(deleteButtons[0]!);

			await waitFor(() => {
				expect(screen.getByRole('heading', { name: /Delete "Item One"\?/ })).toBeInTheDocument();
			});
		});

		it('should show default delete description', async () => {
			const onDelete = vi.fn<(id: string) => void>();
			render(<CrudTable {...defaultProps} onDelete={onDelete} />);

			const deleteButtons = screen.getAllByRole('button', { name: /delete item/i });
			fireEvent.click(deleteButtons[0]!);

			await waitFor(() => {
				expect(
					screen.getByText(/This action cannot be undone. The item will be permanently deleted./)
				).toBeInTheDocument();
			});
		});

		it('should show custom delete description when provided', async () => {
			const onDelete = vi.fn<(id: string) => void>();
			const config: CrudTableConfig<TestItem> = {
				...mockConfig,
				deleteDescription: item => `Are you sure you want to delete ${item.name}?`,
			};

			render(<CrudTable {...defaultProps} config={config} onDelete={onDelete} />);

			const deleteButtons = screen.getAllByRole('button', { name: /delete item/i });
			fireEvent.click(deleteButtons[0]!);

			await waitFor(() => {
				expect(screen.getByText('Are you sure you want to delete Item One?')).toBeInTheDocument();
			});
		});

		it('should call onDelete when user confirms', async () => {
			const onDelete = vi.fn<(id: string) => void>();
			render(<CrudTable {...defaultProps} onDelete={onDelete} />);

			const deleteButtons = screen.getAllByRole('button', { name: /delete item/i });
			fireEvent.click(deleteButtons[0]!);

			await waitFor(() => {
				expect(screen.getByRole('heading', { name: /Delete "Item One"\?/ })).toBeInTheDocument();
			});

			const confirmButton = screen.getByRole('button', { name: /^delete$/i });
			fireEvent.click(confirmButton);

			await waitFor(() => {
				expect(onDelete).toHaveBeenCalledWith('1');
			});
		});

		it('should not call onDelete when user cancels', async () => {
			const onDelete = vi.fn<(id: string) => void>();
			render(<CrudTable {...defaultProps} onDelete={onDelete} />);

			const deleteButtons = screen.getAllByRole('button', { name: /delete item/i });
			fireEvent.click(deleteButtons[0]!);

			await waitFor(() => {
				expect(screen.getByRole('heading', { name: /Delete "Item One"\?/ })).toBeInTheDocument();
			});

			const cancelButton = screen.getByRole('button', { name: /cancel/i });
			fireEvent.click(cancelButton);

			await waitFor(() => {
				expect(screen.queryByRole('heading', { name: /Delete "Item One"\?/ })).not.toBeInTheDocument();
			});

			expect(onDelete).not.toHaveBeenCalled();
		});

		it('should close dialog after confirming delete', async () => {
			const onDelete = vi.fn<(id: string) => void>();
			render(<CrudTable {...defaultProps} onDelete={onDelete} />);

			const deleteButtons = screen.getAllByRole('button', { name: /delete item/i });
			fireEvent.click(deleteButtons[0]!);

			await waitFor(() => {
				expect(screen.getByRole('heading', { name: /Delete "Item One"\?/ })).toBeInTheDocument();
			});

			const confirmButton = screen.getByRole('button', { name: /^delete$/i });
			fireEvent.click(confirmButton);

			await waitFor(() => {
				expect(screen.queryByRole('heading', { name: /Delete "Item One"\?/ })).not.toBeInTheDocument();
			});
		});
	});

	describe('edit action', () => {
		it('should call onEdit with correct item', () => {
			const onEdit = vi.fn<(item: TestItem) => void>();
			render(<CrudTable {...defaultProps} onEdit={onEdit} />);

			const editButtons = screen.getAllByRole('button', { name: /edit item/i });
			fireEvent.click(editButtons[0]!);

			expect(onEdit).toHaveBeenCalledWith(mockData[0]);
		});

		it('should call onEdit for correct item when multiple items exist', () => {
			const onEdit = vi.fn<(item: TestItem) => void>();
			render(<CrudTable {...defaultProps} onEdit={onEdit} />);

			const editButtons = screen.getAllByRole('button', { name: /edit item/i });
			fireEvent.click(editButtons[1]!);

			expect(onEdit).toHaveBeenCalledWith(mockData[1]);
		});
	});

	describe('column ordering and visibility', () => {
		it('should apply column order when provided', () => {
			const columnOrder = ['value', 'name', 'id'];
			render(<CrudTable {...defaultProps} columnOrder={columnOrder} />);

			const headers = screen.getAllByRole('columnheader');
			// Note: headers include selection and actions columns, so we check content
			expect(headers[0]!.textContent).toBe('Value');
			expect(headers[1]!.textContent).toBe('Name');
			expect(headers[2]!.textContent).toBe('ID');
		});

		it('should filter columns based on visibility', () => {
			const visibleColumns = new Set(['name', 'value']);
			render(<CrudTable {...defaultProps} visibleColumns={visibleColumns} />);

			expect(screen.getByText('Name')).toBeInTheDocument();
			expect(screen.getByText('Value')).toBeInTheDocument();
			expect(screen.queryByText('ID')).not.toBeInTheDocument();
		});

		it('should apply both ordering and visibility correctly', () => {
			const columnOrder = ['value', 'name'];
			const visibleColumns = new Set(['name', 'value']);
			render(<CrudTable {...defaultProps} columnOrder={columnOrder} visibleColumns={visibleColumns} />);

			const headers = screen.getAllByRole('columnheader');
			expect(headers[0]!.textContent).toBe('Value');
			expect(headers[1]!.textContent).toBe('Name');
			expect(screen.queryByText('ID')).not.toBeInTheDocument();
		});
	});

	describe('props pass-through', () => {
		it('should pass pagination props to Table component', () => {
			const pagination = {
				currentPage: 1,
				totalPages: 5,
				totalItems: 50,
				onPageChange: vi.fn(),
				pageSize: 10,
				onPageSizeChange: vi.fn(),
			};

			render(<CrudTable {...defaultProps} pagination={pagination} />);

			expect(screen.getByText(/Page 1 of 5/)).toBeInTheDocument();
		});

		it('should pass selectable props to Table component', () => {
			const selectedIds = new Set<string>();
			const onSelectionChange = vi.fn();

			render(
				<CrudTable
					{...defaultProps}
					selectable={true}
					selectedIds={selectedIds}
					onSelectionChange={onSelectionChange}
				/>
			);

			// Check for select all checkbox
			const checkboxes = screen.getAllByRole('checkbox');
			expect(checkboxes.length).toBeGreaterThan(0);
		});
	});
});
