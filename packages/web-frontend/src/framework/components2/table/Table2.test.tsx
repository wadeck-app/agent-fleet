/**
 * ===========================================================================================
 * TABLE2 TESTS
 * ===========================================================================================
 *
 * Comprehensive test suite for Table2 component.
 * Tests cover all features: data display, sorting, pagination, loading, error states.
 *
 * ===========================================================================================
 */
import type { QueryResultDisplayerProps } from '@framework/types/QueryResultDisplayerContract';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Table2, type Table2Column } from './Table2';

// Test data type
interface TestItem {
	id: string;
	name: string;
	value: number;
	category: string;
}

// Sample test data
const mockData: TestItem[] = [
	{ id: '1', name: 'Item 1', value: 100, category: 'A' },
	{ id: '2', name: 'Item 2', value: 200, category: 'B' },
	{ id: '3', name: 'Item 3', value: 300, category: 'A' },
];

// Sample columns
const mockColumns: Table2Column<TestItem>[] = [
	{ key: 'name', label: 'Name', render: (item: TestItem) => item.name },
	{ key: 'value', label: 'Value', render: (item: TestItem) => item.value },
	{ key: 'category', label: 'Category', render: (item: TestItem) => item.category },
];

// Helper to create base props
const createBaseProps = (
	overrides?: Partial<QueryResultDisplayerProps<TestItem>>
): QueryResultDisplayerProps<TestItem> => ({
	data: mockData,
	isLoading: false,
	error: null,
	...overrides,
});

describe('Table2', () => {
	describe('Basic Rendering', () => {
		it('renders table with data', () => {
			const props = createBaseProps();

			render(<Table2 {...props} columns={mockColumns} getItemId={item => item.id} />);

			// Check headers
			expect(screen.getByText('Name')).toBeInTheDocument();
			expect(screen.getByText('Value')).toBeInTheDocument();
			expect(screen.getByText('Category')).toBeInTheDocument();

			// Check data
			expect(screen.getByText('Item 1')).toBeInTheDocument();
			expect(screen.getByText('Item 2')).toBeInTheDocument();
			expect(screen.getByText('Item 3')).toBeInTheDocument();
		});

		it('renders empty state when no data', () => {
			const props = createBaseProps({ data: [] });

			render(
				<Table2 {...props} columns={mockColumns} getItemId={item => item.id} emptyMessage="No items found" />
			);

			expect(screen.getByText('No items found')).toBeInTheDocument();
		});

		it('uses default empty message', () => {
			const props = createBaseProps({ data: [] });

			render(<Table2 {...props} columns={mockColumns} getItemId={item => item.id} />);

			expect(screen.getByText('No data available')).toBeInTheDocument();
		});

		it('renders custom empty message', () => {
			const props = createBaseProps({ data: [] });

			render(
				<Table2
					{...props}
					columns={mockColumns}
					getItemId={item => item.id}
					emptyMessage="Custom empty message"
				/>
			);

			expect(screen.getByText('Custom empty message')).toBeInTheDocument();
		});
	});

	describe('Loading State', () => {
		it('shows loading state', () => {
			const props = createBaseProps({ isLoading: true, data: [] });

			const { container } = render(<Table2 {...props} columns={mockColumns} getItemId={item => item.id} />);

			// Check for skeleton rows (animate-pulse class is used for skeleton loading)
			const skeletonElements = container.querySelectorAll('.animate-pulse');
			expect(skeletonElements.length).toBeGreaterThan(0);
		});

		it('does not show data when loading initially', () => {
			const props = createBaseProps({ isLoading: true, data: [] });

			render(<Table2 {...props} columns={mockColumns} getItemId={item => item.id} />);

			expect(screen.queryByText('Item 1')).not.toBeInTheDocument();
		});
	});

	describe('Error State', () => {
		it('displays error message', () => {
			const props = createBaseProps({ error: 'Failed to fetch data', isLoading: false });

			render(<Table2 {...props} columns={mockColumns} getItemId={item => item.id} />);

			expect(screen.getByText(/Failed to fetch data/)).toBeInTheDocument();
		});

		it('does not show error when loading', () => {
			const props = createBaseProps({ error: 'Some error', isLoading: true });

			render(<Table2 {...props} columns={mockColumns} getItemId={item => item.id} />);

			// Error should not be shown when loading
			expect(screen.queryByText(/Some error/)).not.toBeInTheDocument();
		});

		it('shows both error and data', () => {
			const props = createBaseProps({ error: 'Partial error', isLoading: false });

			render(<Table2 {...props} columns={mockColumns} getItemId={item => item.id} />);

			// Both error and data should be visible
			expect(screen.getByText(/Partial error/)).toBeInTheDocument();
			expect(screen.getByText('Item 1')).toBeInTheDocument();
		});
	});

	describe('Pagination', () => {
		it('renders pagination controls when pagination prop provided', () => {
			const props = createBaseProps({
				pagination: {
					currentPage: 1,
					totalPages: 5,
					totalItems: 50,
					pageSize: 10,
					onPageChange: vi.fn(),
					onPageSizeChange: vi.fn(),
				},
			});

			render(<Table2 {...props} columns={mockColumns} getItemId={item => item.id} />);

			expect(screen.getByText('Showing 1 to 3 of 50 items')).toBeInTheDocument();
			expect(screen.getByText('Page 1 of 5')).toBeInTheDocument();
		});

		it('does not render pagination when pagination prop absent', () => {
			const props = createBaseProps();

			render(<Table2 {...props} columns={mockColumns} getItemId={item => item.id} />);

			expect(screen.queryByText(/Page/)).not.toBeInTheDocument();
		});

		it('calls onPageChange when page changed', async () => {
			const onPageChange = vi.fn();
			const props = createBaseProps({
				pagination: {
					currentPage: 1,
					totalPages: 5,
					totalItems: 50,
					pageSize: 10,
					onPageChange,
					onPageSizeChange: vi.fn(),
				},
			});

			render(<Table2 {...props} columns={mockColumns} getItemId={item => item.id} />);

			// Click next page button
			const nextButton = screen.getByLabelText('Go to next page');
			await userEvent.click(nextButton);

			expect(onPageChange).toHaveBeenCalledWith(2);
		});

		it('calls onPageSizeChange when page size changed', async () => {
			const onPageSizeChange = vi.fn();
			const props = createBaseProps({
				pagination: {
					currentPage: 1,
					totalPages: 5,
					totalItems: 50,
					pageSize: 10,
					onPageChange: vi.fn(),
					onPageSizeChange,
					pageSizeOptions: [5, 10, 20, 50],
				},
			});

			render(<Table2 {...props} columns={mockColumns} getItemId={item => item.id} />);

			// Find and open page size selector
			const pageSizeSelect = screen.getByRole('combobox', { name: /Items per page/ });
			await userEvent.click(pageSizeSelect);

			// Select 20
			const option20 = screen.getByRole('option', { name: '20' });
			await userEvent.click(option20);

			expect(onPageSizeChange).toHaveBeenCalledWith(20);
		});

		it('shows "No items" when data empty with pagination', () => {
			const props = createBaseProps({
				data: [],
				pagination: {
					currentPage: 1,
					totalPages: 0,
					totalItems: 0,
					pageSize: 10,
					onPageChange: vi.fn(),
					onPageSizeChange: vi.fn(),
				},
			});

			render(<Table2 {...props} columns={mockColumns} getItemId={item => item.id} />);

			expect(screen.getByText('No items')).toBeInTheDocument();
		});
	});

	describe('Sorting', () => {
		it('renders sortable headers when sorting prop provided', () => {
			const props = createBaseProps({
				sorting: {
					sortConfigs: [{ key: 'name', direction: 'asc' }],
					onSortChange: vi.fn(),
				},
			});

			render(<Table2 {...props} columns={mockColumns} getItemId={item => item.id} />);

			// SortableColumnHeader should be rendered (check for sort button)
			const nameHeader = screen.getByRole('button', { name: /Sort by Name/ });
			expect(nameHeader).toBeInTheDocument();
		});

		it('does not render sortable headers when sorting prop absent', () => {
			const props = createBaseProps();

			render(<Table2 {...props} columns={mockColumns} getItemId={item => item.id} />);

			// No sort buttons should exist
			expect(screen.queryByRole('button', { name: /Sort by/ })).not.toBeInTheDocument();
		});

		it('calls onSortChange when column header clicked', async () => {
			const onSortChange = vi.fn();
			const props = createBaseProps({
				sorting: {
					sortConfigs: [],
					onSortChange,
				},
			});

			render(<Table2 {...props} columns={mockColumns} getItemId={item => item.id} />);

			// Click name column header
			const nameHeader = screen.getByRole('button', { name: /Sort by Name/ });
			await userEvent.click(nameHeader);

			expect(onSortChange).toHaveBeenCalledWith('name', false);
		});

		it('passes shiftKey to onSortChange for multi-column sort', async () => {
			const onSortChange = vi.fn();
			const props = createBaseProps({
				sorting: {
					sortConfigs: [{ key: 'name', direction: 'asc' }],
					onSortChange,
				},
			});

			render(<Table2 {...props} columns={mockColumns} getItemId={item => item.id} />);

			// Shift+click value column header
			const valueHeader = screen.getByRole('button', { name: /Sort by Value/ });
			const user = userEvent.setup();
			await user.keyboard('{Shift>}');
			await user.click(valueHeader);
			await user.keyboard('{/Shift}');

			expect(onSortChange).toHaveBeenCalledWith('value', true);
		});

		it('shows sort priority for multi-column sort', () => {
			const props = createBaseProps({
				sorting: {
					sortConfigs: [
						{ key: 'name', direction: 'asc' },
						{ key: 'value', direction: 'desc' },
					],
					onSortChange: vi.fn(),
				},
			});

			render(<Table2 {...props} columns={mockColumns} getItemId={item => item.id} />);

			// Priority numbers should be visible in headers
			const nameHeader = screen.getByRole('button', { name: /Sort by Name/ });
			expect(nameHeader).toHaveTextContent('1');

			const valueHeader = screen.getByRole('button', { name: /Sort by Value/ });
			expect(valueHeader).toHaveTextContent('2');
		});

		it('respects sortable: false on columns', () => {
			const columnsWithNonSortable: Table2Column<TestItem>[] = [
				{ key: 'name', label: 'Name', render: (item: TestItem) => item.name, sortable: true },
				{ key: 'value', label: 'Value', render: (item: TestItem) => item.value, sortable: false },
			];

			const props = createBaseProps({
				sorting: {
					sortConfigs: [],
					onSortChange: vi.fn(),
				},
			});

			render(<Table2 {...props} columns={columnsWithNonSortable} getItemId={item => item.id} />);

			// Name should be sortable
			expect(screen.getByRole('button', { name: /Sort by Name/ })).toBeInTheDocument();

			// Value should NOT be sortable (just text, no button)
			expect(screen.queryByRole('button', { name: /Sort by Value/ })).not.toBeInTheDocument();
			expect(screen.getByText('Value')).toBeInTheDocument();
		});
	});

	describe('Actions', () => {
		it('renders action column when renderActions provided', () => {
			const props = createBaseProps();
			const renderActions = vi.fn(() => <button type="button">Edit</button>);

			render(
				<Table2 {...props} columns={mockColumns} getItemId={item => item.id} renderActions={renderActions} />
			);

			// Actions header should be present
			expect(screen.getByText('Actions')).toBeInTheDocument();

			// Actions should be rendered for each row
			expect(renderActions).toHaveBeenCalledTimes(3);
			expect(screen.getAllByText('Edit')).toHaveLength(3);
		});

		it('does not render action column when renderActions absent', () => {
			const props = createBaseProps();

			render(<Table2 {...props} columns={mockColumns} getItemId={item => item.id} />);

			// Actions header should NOT be present
			expect(screen.queryByText('Actions')).not.toBeInTheDocument();
		});

		it('calls renderActions with correct item', () => {
			const props = createBaseProps();
			const renderActions = vi.fn((item: TestItem) => <span>{item.name} Actions</span>);

			render(
				<Table2 {...props} columns={mockColumns} getItemId={item => item.id} renderActions={renderActions} />
			);

			// Check that renderActions was called with each item
			expect(renderActions).toHaveBeenCalledWith(mockData[0]);
			expect(renderActions).toHaveBeenCalledWith(mockData[1]);
			expect(renderActions).toHaveBeenCalledWith(mockData[2]);

			// Check rendered output
			expect(screen.getByText('Item 1 Actions')).toBeInTheDocument();
			expect(screen.getByText('Item 2 Actions')).toBeInTheDocument();
			expect(screen.getByText('Item 3 Actions')).toBeInTheDocument();
		});
	});

	describe('Custom Styling', () => {
		it('applies custom className to container', () => {
			const props = createBaseProps();

			const { container } = render(
				<Table2
					{...props}
					columns={mockColumns}
					getItemId={item => item.id}
					className={`
      custom-table-class
    `}
				/>
			);

			const tableContainer = container.querySelector('.custom-table-class');
			expect(tableContainer).toBeInTheDocument();
		});

		it('applies column className', () => {
			const columnsWithClass: Table2Column<TestItem>[] = [
				{ key: 'name', label: 'Name', render: (item: TestItem) => item.name, className: 'text-primary' },
			];

			const props = createBaseProps();

			render(<Table2 {...props} columns={columnsWithClass} getItemId={item => item.id} />);

			// Check that className is applied to header
			const header = screen.getByText('Name').closest('th');
			expect(header).toHaveClass('text-primary');
		});
	});

	describe('Edge Cases', () => {
		it('handles single item', () => {
			const props = createBaseProps({ data: [mockData[0]] });

			render(<Table2 {...props} columns={mockColumns} getItemId={item => item.id} />);

			expect(screen.getByText('Item 1')).toBeInTheDocument();
			expect(screen.queryByText('Item 2')).not.toBeInTheDocument();
		});

		it('handles large dataset', () => {
			const largeData = Array.from({ length: 100 }, (_, i) => ({
				id: `${i}`,
				name: `Item ${i}`,
				value: i * 10,
				category: i % 2 === 0 ? 'A' : 'B',
			}));

			const props = createBaseProps({ data: largeData });

			render(<Table2 {...props} columns={mockColumns} getItemId={item => item.id} />);

			// Should render all items
			expect(screen.getByText('Item 0')).toBeInTheDocument();
			expect(screen.getByText('Item 99')).toBeInTheDocument();
		});

		it('handles column with undefined render result', () => {
			const columnsWithUndefined: Table2Column<TestItem>[] = [
				{ key: 'name', label: 'Name', render: () => undefined },
			];

			const props = createBaseProps();

			// Should not throw
			expect(() => {
				render(<Table2 {...props} columns={columnsWithUndefined} getItemId={item => item.id} />);
			}).not.toThrow();
		});

		it('handles empty columns array', () => {
			const props = createBaseProps();

			render(<Table2 {...props} columns={[]} getItemId={item => item.id} />);

			// Should not crash, but no headers or data cells
			expect(screen.queryByRole('columnheader')).not.toBeInTheDocument();
		});
	});
});
