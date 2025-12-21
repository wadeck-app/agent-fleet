import { withMetadata } from '@framework/tests/withMetadata';
import { ColumnHelpers } from '@framework/utils/table/ColumnHelpers';
import { defineColumns } from '@framework/utils/table/ColumnHelpers';
import type { Meta, StoryObj } from '@storybook/react';

import { CrudTable, type CrudTableConfig } from './CrudTable';

/**
 * CrudTable component stories demonstrating generic CRUD operations table.
 * Generic feature component for presenting entities with CRUD operations.
 */

interface Product {
	id: string;
	name: string;
	price: number;
	stock: number;
	category: string;
	createdAt: string;
	updatedAt: string;
	version: number;
}

// Sample product data
const sampleProducts: Product[] = [
	withMetadata({
		id: '1',
		name: 'Laptop',
		price: 999.99,
		stock: 15,
		category: 'Electronics',
	}),
	withMetadata({
		id: '2',
		name: 'Desk Chair',
		price: 299.99,
		stock: 8,
		category: 'Furniture',
	}),
	withMetadata({
		id: '3',
		name: 'Coffee Maker',
		price: 79.99,
		stock: 25,
		category: 'Appliances',
	}),
	withMetadata({
		id: '4',
		name: 'Notebook',
		price: 4.99,
		stock: 150,
		category: 'Stationery',
	}),
	withMetadata({
		id: '5',
		name: 'Monitor',
		price: 349.99,
		stock: 12,
		category: 'Electronics',
	}),
];

const productColumns = defineColumns<Product>([
	...ColumnHelpers.metadata(),
	ColumnHelpers.string('name', 'Product Name', { fontWeight: 'semibold', defaultVisible: true }),
	ColumnHelpers.numeric('price', 'Price', {
		suffix: ' USD',
		align: 'right',
		defaultVisible: true,
	}),
	ColumnHelpers.numeric('stock', 'Stock', { align: 'center', defaultVisible: true }),
	ColumnHelpers.string('category', 'Category', {
		textColor: 'text-muted-foreground',
		defaultVisible: true,
	}),
]);

const productConfig: CrudTableConfig<Product> = {
	getItemDisplayName: product => product.name,
	emptyMessage: 'No products found. Add your first product to get started.',
	itemTypeName: 'product',
};

const meta = {
	title: 'Features/CrudTable',
	component: CrudTable<Product>,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
	argTypes: {
		onDelete: { action: 'deleted' },
		onEdit: { action: 'edited' },
	},
} satisfies Meta<typeof CrudTable<Product>>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default table with products
export const Default: Story = {
	args: {
		storageId: 'story-products',
		data: sampleProducts,
		columns: productColumns,
		config: productConfig,
		onDelete: (id: string) => console.log('Delete product:', id),
	},
};

// With edit functionality
export const WithEdit: Story = {
	args: {
		storageId: 'story-products-edit',
		data: sampleProducts,
		columns: productColumns,
		config: productConfig,
		onDelete: (id: string) => console.log('Delete product:', id),
		onEdit: product => console.log('Edit product:', product),
	},
};

// Empty state
export const Empty: Story = {
	args: {
		storageId: 'story-products-empty',
		data: [],
		columns: productColumns,
		config: productConfig,
		onDelete: (id: string) => console.log('Delete product:', id),
	},
};

// With pagination
export const WithPagination: Story = {
	args: {
		storageId: 'story-products-pagination',
		data: sampleProducts,
		columns: productColumns,
		config: productConfig,
		onDelete: (id: string) => console.log('Delete product:', id),
		onEdit: product => console.log('Edit product:', product),
		pagination: {
			currentPage: 2,
			totalPages: 10,
			totalItems: 100,
			onPageChange: page => console.log('Page changed to:', page),
			pageSize: 10,
			onPageSizeChange: size => console.log('Page size changed to:', size),
		},
	},
};

// With selection
export const WithSelection: Story = {
	args: {
		storageId: 'story-products-selection',
		data: sampleProducts,
		columns: productColumns,
		config: productConfig,
		onDelete: (id: string) => console.log('Delete product:', id),
		onEdit: product => console.log('Edit product:', product),
		selectable: true,
		selectedIds: new Set(['1', '3']),
		onSelectionChange: ids => console.log('Selection changed:', ids),
	},
};

// Custom edit button variant
export const GhostEditButton: Story = {
	args: {
		storageId: 'story-products-ghost',
		data: sampleProducts,
		columns: productColumns,
		config: {
			...productConfig,
			editButtonVariant: 'ghost',
		},
		onDelete: (id: string) => console.log('Delete product:', id),
		onEdit: product => console.log('Edit product:', product),
	},
};

// Custom delete description
export const CustomDeleteDescription: Story = {
	args: {
		storageId: 'story-products-custom-delete',
		data: sampleProducts,
		columns: productColumns,
		config: {
			...productConfig,
			deleteDescription: product =>
				`Warning: Deleting ${product.name} will remove it from inventory. ${product.stock > 0 ? `${product.stock} units in stock will be lost.` : 'This item is out of stock.'}`,
		},
		onDelete: (id: string) => console.log('Delete product:', id),
		onEdit: product => console.log('Edit product:', product),
	},
};

// With column visibility
export const WithColumnVisibility: Story = {
	args: {
		storageId: 'story-products-visibility',
		data: sampleProducts,
		columns: productColumns,
		config: productConfig,
		onDelete: (id: string) => console.log('Delete product:', id),
		onEdit: product => console.log('Edit product:', product),
		visibleColumns: new Set(['name', 'price', 'stock']),
	},
};

// With column ordering
export const WithColumnOrdering: Story = {
	args: {
		storageId: 'story-products-ordering',
		data: sampleProducts,
		columns: productColumns,
		config: productConfig,
		onDelete: (id: string) => console.log('Delete product:', id),
		onEdit: product => console.log('Edit product:', product),
		columnOrder: ['category', 'name', 'stock', 'price'],
	},
};

// Refreshing state
export const Refreshing: Story = {
	args: {
		storageId: 'story-products-refreshing',
		data: sampleProducts,
		columns: productColumns,
		config: productConfig,
		onDelete: (id: string) => console.log('Delete product:', id),
		onEdit: product => console.log('Edit product:', product),
		refreshing: true,
	},
};
