/**
 * ===========================================================================================
 * TABLE2 STORYBOOK STORIES
 * ===========================================================================================
 *
 * Interactive documentation for the Table2 component.
 * Demonstrates usage patterns with Data2 shell integration.
 *
 * ===========================================================================================
 */
import { useState } from 'react';

import { Button } from '@framework/components/primitives/Button';
import type { QueryResultDisplayerProps } from '@framework/types/QueryResultDisplayerContract';
import type { Meta, StoryObj } from '@storybook/react';
import { Pencil, Trash2 } from 'lucide-react';

import { Table2, type Table2Column } from './Table2';

const meta: Meta<typeof Table2> = {
	title: 'Components2/Table2',
	component: Table2,
	tags: ['autodocs'],
	parameters: {
		layout: 'padded',
		docs: {
			description: {
				component:
					'Table2 is a pure presentation table component designed for use with the Data2 shell. It implements QueryResultDisplayerProps for seamless integration with headless features (pagination, sorting, search, filters).',
			},
		},
	},
};

export default meta;
type Story = StoryObj<typeof Table2>;

// Mock data type
interface MockProduct {
	id: string;
	name: string;
	category: string;
	price: number;
	stock: number;
	status: 'In Stock' | 'Low Stock' | 'Out of Stock';
}

// Mock data
const mockProducts: MockProduct[] = [
	{ id: '1', name: 'Laptop Pro', category: 'Electronics', price: 1299, stock: 15, status: 'In Stock' },
	{ id: '2', name: 'Wireless Mouse', category: 'Electronics', price: 29, stock: 150, status: 'In Stock' },
	{ id: '3', name: 'Desk Chair', category: 'Furniture', price: 299, stock: 5, status: 'Low Stock' },
	{ id: '4', name: 'Monitor 27"', category: 'Electronics', price: 399, stock: 0, status: 'Out of Stock' },
	{ id: '5', name: 'Keyboard Mechanical', category: 'Electronics', price: 149, stock: 45, status: 'In Stock' },
	{ id: '6', name: 'Standing Desk', category: 'Furniture', price: 599, stock: 8, status: 'In Stock' },
	{ id: '7', name: 'Webcam HD', category: 'Electronics', price: 79, stock: 2, status: 'Low Stock' },
	{ id: '8', name: 'USB-C Hub', category: 'Electronics', price: 49, stock: 100, status: 'In Stock' },
];

// Sample columns
const basicColumns: Table2Column<MockProduct>[] = [
	{
		key: 'name',
		label: 'Product Name',
		render: (item: MockProduct) => <span className="font-medium">{item.name}</span>,
	},
	{
		key: 'category',
		label: 'Category',
		render: (item: MockProduct) => <span className="text-muted-foreground">{item.category}</span>,
	},
	{
		key: 'price',
		label: 'Price',
		render: (item: MockProduct) => <span>${item.price.toFixed(2)}</span>,
		className: 'text-right',
	},
	{
		key: 'stock',
		label: 'Stock',
		render: (item: MockProduct) => <span>{item.stock}</span>,
		className: 'text-right',
	},
];

// Helper to create base props
const createBaseProps = (
	overrides?: Partial<QueryResultDisplayerProps<MockProduct>>
): QueryResultDisplayerProps<MockProduct> => ({
	data: mockProducts,
	isLoading: false,
	error: null,
	...overrides,
});

/**
 * Basic table with data display only
 */
export const Basic: Story = {
	// Using render function
	render: () => {
		const props = createBaseProps();

		return <Table2 {...props} columns={basicColumns} getItemId={item => item.id} />;
	},
};

/**
 * Table with pagination controls
 */
export const WithPagination: Story = {
	// Using render function
	render: () => {
		const [currentPage, setCurrentPage] = useState(1);
		const [pageSize, setPageSize] = useState(5);

		const props = createBaseProps({
			data: mockProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize),
			pagination: {
				currentPage,
				totalPages: Math.ceil(mockProducts.length / pageSize),
				totalItems: mockProducts.length,
				pageSize,
				onPageChange: setCurrentPage,
				onPageSizeChange: (size: number) => {
					setPageSize(size);
					setCurrentPage(1);
				},
				pageSizeOptions: [5, 10, 20],
			},
		});

		return <Table2 {...props} columns={basicColumns} getItemId={item => item.id} />;
	},
};

/**
 * Table with sortable columns
 */
export const WithSorting: Story = {
	// Using render function
	render: () => {
		const [sortConfigs, setSortConfigs] = useState<Array<{ key: string; direction: 'asc' | 'desc' }>>([
			{ key: 'name', direction: 'asc' },
		]);

		const handleSort = (key: string, shiftKey: boolean) => {
			if (shiftKey) {
				// Multi-column sort
				const existingIndex = sortConfigs.findIndex(c => c.key === key);
				if (existingIndex >= 0) {
					// Toggle direction or remove
					const existing = sortConfigs[existingIndex];
					if (existing.direction === 'asc') {
						setSortConfigs([
							...sortConfigs.slice(0, existingIndex),
							{ key, direction: 'desc' },
							...sortConfigs.slice(existingIndex + 1),
						]);
					} else {
						setSortConfigs([
							...sortConfigs.slice(0, existingIndex),
							...sortConfigs.slice(existingIndex + 1),
						]);
					}
				} else {
					setSortConfigs([...sortConfigs, { key, direction: 'asc' }]);
				}
			} else {
				// Single column sort
				const existing = sortConfigs.find(c => c.key === key);
				if (existing) {
					setSortConfigs(existing.direction === 'asc' ? [{ key, direction: 'desc' }] : []);
				} else {
					setSortConfigs([{ key, direction: 'asc' }]);
				}
			}
		};

		const props = createBaseProps({
			sorting: {
				sortConfigs,
				onSortChange: handleSort,
			},
		});

		return (
			<div>
				<div className="mb-4 rounded bg-muted p-4 text-sm">
					<strong>Try:</strong> Click column headers to sort. Shift+Click to add secondary sorts.
				</div>
				<Table2 {...props} columns={basicColumns} getItemId={item => item.id} />
			</div>
		);
	},
};

/**
 * Table with row actions (edit, delete)
 */
export const WithActions: Story = {
	// Using render function
	render: () => {
		const [data, setData] = useState(mockProducts);

		const handleEdit = (product: MockProduct) => {
			alert(`Edit: ${product.name}`);
		};

		const handleDelete = (id: string) => {
			if (confirm('Delete this product?')) {
				setData(prev => prev.filter(p => p.id !== id));
			}
		};

		const props = createBaseProps({ data });

		return (
			<Table2
				{...props}
				columns={basicColumns}
				getItemId={item => item.id}
				renderActions={item => (
					<div className="flex items-center justify-center gap-2">
						<Button size="sm" variant="ghost" onClick={() => handleEdit(item)}>
							<Pencil className="h-4 w-4" />
						</Button>
						<Button size="sm" variant="destructive" onClick={() => handleDelete(item.id)}>
							<Trash2 className="h-4 w-4" />
						</Button>
					</div>
				)}
			/>
		);
	},
};

/**
 * Complete example with pagination, sorting, and actions
 */
export const Complete: Story = {
	// Using render function
	render: () => {
		const [data, setData] = useState(mockProducts);
		const [currentPage, setCurrentPage] = useState(1);
		const [pageSize, setPageSize] = useState(5);
		const [sortConfigs, setSortConfigs] = useState<Array<{ key: string; direction: 'asc' | 'desc' }>>([]);

		const handleSort = (key: string, shiftKey: boolean) => {
			if (shiftKey) {
				const existingIndex = sortConfigs.findIndex(c => c.key === key);
				if (existingIndex >= 0) {
					const existing = sortConfigs[existingIndex];
					if (existing.direction === 'asc') {
						setSortConfigs([
							...sortConfigs.slice(0, existingIndex),
							{ key, direction: 'desc' },
							...sortConfigs.slice(existingIndex + 1),
						]);
					} else {
						setSortConfigs([
							...sortConfigs.slice(0, existingIndex),
							...sortConfigs.slice(existingIndex + 1),
						]);
					}
				} else {
					setSortConfigs([...sortConfigs, { key, direction: 'asc' }]);
				}
			} else {
				const existing = sortConfigs.find(c => c.key === key);
				if (existing) {
					setSortConfigs(existing.direction === 'asc' ? [{ key, direction: 'desc' }] : []);
				} else {
					setSortConfigs([{ key, direction: 'asc' }]);
				}
			}
		};

		const handleDelete = (id: string) => {
			if (confirm('Delete this product?')) {
				setData(prev => prev.filter(p => p.id !== id));
			}
		};

		const props = createBaseProps({
			data: data.slice((currentPage - 1) * pageSize, currentPage * pageSize),
			pagination: {
				currentPage,
				totalPages: Math.ceil(data.length / pageSize),
				totalItems: data.length,
				pageSize,
				onPageChange: setCurrentPage,
				onPageSizeChange: (size: number) => {
					setPageSize(size);
					setCurrentPage(1);
				},
			},
			sorting: {
				sortConfigs,
				onSortChange: handleSort,
			},
		});

		return (
			<Table2
				{...props}
				columns={basicColumns}
				getItemId={item => item.id}
				renderActions={item => (
					<div className="flex items-center justify-center gap-2">
						<Button size="sm" variant="ghost" onClick={() => alert(`Edit: ${item.name}`)}>
							<Pencil className="h-4 w-4" />
						</Button>
						<Button size="sm" variant="destructive" onClick={() => handleDelete(item.id)}>
							<Trash2 className="h-4 w-4" />
						</Button>
					</div>
				)}
			/>
		);
	},
};

/**
 * Loading state
 */
export const Loading: Story = {
	// Using render function
	render: () => {
		const props = createBaseProps({
			data: [],
			isLoading: true,
		});

		return <Table2 {...props} columns={basicColumns} getItemId={item => item.id} />;
	},
};

/**
 * Empty state (no data)
 */
export const Empty: Story = {
	// Using render function
	render: () => {
		const props = createBaseProps({
			data: [],
			isLoading: false,
		});

		return (
			<Table2 {...props} columns={basicColumns} getItemId={item => item.id} emptyMessage="No products found" />
		);
	},
};

/**
 * Error state
 */
export const Error: Story = {
	// Using render function
	render: () => {
		const props = createBaseProps({
			error: 'Failed to fetch products. Please try again later.',
			isLoading: false,
		});

		return <Table2 {...props} columns={basicColumns} getItemId={item => item.id} />;
	},
};

/**
 * Table with non-sortable columns
 */
export const MixedSortable: Story = {
	// Using render function
	render: () => {
		const columnsWithMixedSortable: Table2Column<MockProduct>[] = [
			{
				key: 'name',
				label: 'Product Name',
				render: (item: MockProduct) => <span className="font-medium">{item.name}</span>,
				sortable: true,
			},
			{
				key: 'category',
				label: 'Category',
				render: (item: MockProduct) => item.category,
				sortable: true,
			},
			{
				key: 'price',
				label: 'Price',
				render: (item: MockProduct) => `$${item.price.toFixed(2)}`,
				sortable: true,
			},
			{
				key: 'status',
				label: 'Status',
				render: (item: MockProduct) => item.status,
				sortable: false, // Not sortable
			},
		];

		const props = createBaseProps({
			sorting: {
				sortConfigs: [],
				onSortChange: () => {},
			},
		});

		return (
			<div>
				<div className="mb-4 rounded bg-muted p-4 text-sm">
					<strong>Note:</strong> The Status column is not sortable (no sort icon).
				</div>
				<Table2 {...props} columns={columnsWithMixedSortable} getItemId={item => item.id} />
			</div>
		);
	},
};
