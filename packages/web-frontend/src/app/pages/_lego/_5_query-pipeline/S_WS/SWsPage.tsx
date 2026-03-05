import { useState } from 'react';

import { Badge } from '@framework/components/primitives/Badge';
import { SearchInput } from '@framework/components/search/SearchInput';
import { Table } from '@framework/components/table/Table';
import type { TableColumn } from '@framework/components/table/Table';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { useProductsWebSocket } from '@app/pages/_lego/_shared/api/useProductsWebSocket';

import { PageLayout } from '../_framework/PageLayout';
import { PipelineContent } from '../_framework/PipelineContent';

/**
 * ===========================================================================================
 * S_WS: REAL-TIME WEBSOCKET (Query-Pipeline Approach)
 * ===========================================================================================
 *
 * Real-time product table using WebSocket connection.
 * Products are streamed from backend and update automatically.
 *
 * Features:
 * - WebSocket connection with status indicator
 * - Real-time product updates (create, update, delete)
 * - Client-side search filtering
 * - No pagination (WS provides all products)
 * - Connection status badge: connecting/connected/disconnected/error
 *
 * Architecture:
 * - useProductsWebSocket hook manages WebSocket connection and state
 * - Products array rendered directly via Table component (no PipelineDataTable)
 * - Client-side filtering via local useState
 * - PipelineContent used for layout consistency only
 *
 * ===========================================================================================
 */

const columns: TableColumn<Product>[] = [
	{
		key: 'name',
		label: 'Name',
		render: (item: Product) => item.name,
	},
	{
		key: 'price',
		label: 'Price',
		render: (item: Product) => `$${item.price.toFixed(2)}`,
	},
	{
		key: 'category',
		label: 'Category',
		render: (item: Product) => {
			const categoryLabel = PRODUCT_CATEGORIES.find(cat => cat === item.category);
			return categoryLabel ? categoryLabel.charAt(0).toUpperCase() + categoryLabel.slice(1) : item.category;
		},
	},
	{
		key: 'status',
		label: 'Status',
		render: (item: Product) => {
			const statusLabel = PRODUCT_STATUSES.find(s => s === item.status);
			return statusLabel ? statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1) : item.status;
		},
	},
	{
		key: 'stock',
		label: 'Stock',
		render: (item: Product) => item.stock.toString(),
	},
];

export function SWsPage() {
	const { products, status, error } = useProductsWebSocket();
	const [searchQuery, setSearchQuery] = useState('');

	const filteredProducts = searchQuery
		? products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
		: products;

	const getStatusBadgeVariant = () => {
		switch (status) {
			case 'connected':
				return 'default';
			case 'connecting':
				return 'secondary';
			case 'disconnected':
				return 'outline';
			case 'error':
				return 'destructive';
			default:
				return 'secondary';
		}
	};

	const getStatusLabel = () => {
		switch (status) {
			case 'connected':
				return 'Connected';
			case 'connecting':
				return 'Connecting...';
			case 'disconnected':
				return 'Disconnected';
			case 'error':
				return 'Error';
			default:
				return status;
		}
	};

	return (
		<PageLayout>
			<PipelineContent>
				<div className="flex items-center justify-between">
					<Badge variant={getStatusBadgeVariant()}>{getStatusLabel()}</Badge>
					<span className="text-sm text-muted-foreground">{filteredProducts.length} products</span>
				</div>

				{error && <div className="text-sm text-destructive">Error: {error}</div>}

				<SearchInput
					value={searchQuery}
					onChange={setSearchQuery}
					onClear={() => setSearchQuery('')}
					placeholder="Search products..."
				/>

				<Table
					data={filteredProducts}
					columns={columns}
					getItemId={(item: Product) => item.id}
					loading={status === 'connecting'}
					emptyMessage="No products available"
				/>
			</PipelineContent>
		</PageLayout>
	);
}
