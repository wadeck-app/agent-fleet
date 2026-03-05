import { useState } from 'react';

import { Table2, type Table2Column } from '@framework/components2/table/Table2';
import { Badge } from '@framework/components/primitives/Badge';
import { SearchInput } from '@framework/components/search/SearchInput';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { useProductsWebSocket } from '@app/pages/_lego/_shared/api/useProductsWebSocket';

import { PageLayout } from '../_framework/PageLayout';

/**
 * ===========================================================================================
 * S_WS: REAL-TIME WEBSOCKET (Data2-Based Approach)
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
 * - Products array rendered directly via Table2 component (no Data2 needed)
 * - Client-side filtering via local useState
 * - Table2 receives data/loading/error directly
 *
 * ===========================================================================================
 */

const columns: Table2Column<Product>[] = [
	{
		key: 'name',
		label: 'Name',
		render: item => item.name,
	},
	{
		key: 'price',
		label: 'Price',
		render: item => `$${item.price.toFixed(2)}`,
	},
	{
		key: 'category',
		label: 'Category',
		render: item => {
			const categoryLabel = PRODUCT_CATEGORIES.find(cat => cat === item.category);
			return categoryLabel ? categoryLabel.charAt(0).toUpperCase() + categoryLabel.slice(1) : item.category;
		},
	},
	{
		key: 'status',
		label: 'Status',
		render: item => {
			const statusLabel = PRODUCT_STATUSES.find(s => s === item.status);
			return statusLabel ? statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1) : item.status;
		},
	},
	{
		key: 'stock',
		label: 'Stock',
		render: item => item.stock.toString(),
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
			<div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
				<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
					<Badge variant={getStatusBadgeVariant()}>{getStatusLabel()}</Badge>
					<span style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
						{filteredProducts.length} products
					</span>
				</div>

				{error && <div style={{ fontSize: '0.875rem', color: 'var(--destructive)' }}>Error: {error}</div>}

				<SearchInput
					value={searchQuery}
					onChange={setSearchQuery}
					onClear={() => setSearchQuery('')}
					placeholder="Search products..."
				/>

				<Table2
					data={filteredProducts}
					columns={columns}
					getItemId={item => item.id}
					isLoading={status === 'connecting'}
					error={error}
				/>
			</div>
		</PageLayout>
	);
}
