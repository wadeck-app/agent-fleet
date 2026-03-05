/**
 * ===========================================================================================
 * S_WS: REAL-TIME WEBSOCKET
 * ===========================================================================================
 *
 * Real-time table showing live product updates via WebSocket.
 * Shows connection status badge at top.
 * Live updates: rows added/updated/removed without page reload.
 *
 * Features:
 * - Real-time product updates via WebSocket
 * - Connection status badge (green=connected, yellow=connecting, red=error, gray=disconnected)
 * - Live updates without page reload
 * - No pagination (WS provides all products)
 * - Client-side filtering/search
 *
 * ===========================================================================================
 */
import { useMemo, useState } from 'react';

import { Badge } from '@framework/components/primitives/Badge';
import { SearchInput } from '@framework/components/search/SearchInput';
import { Table, type TableColumn } from '@framework/components/table/Table';
import { col } from '@framework/lego';
import { renderColumnValue } from '@framework/lego';
import type { ColumnDef } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { useProductsWebSocket } from '@app/pages/_lego/_shared/api/useProductsWebSocket';
import type { ProductWebSocketStatus } from '@app/pages/_lego/_shared/api/useProductsWebSocket';

const columns: ColumnDef<Product>[] = [
	col.text<Product>('name', 'Name'),
	col.number<Product>('price', 'Price', { prefix: '$' }),
	col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
	col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true }),
	col.number<Product>('stock', 'Stock'),
];

const STATUS_CONFIG: Record<
	ProductWebSocketStatus,
	{ variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }
> = {
	connecting: { variant: 'outline', label: 'Connecting...' },
	connected: { variant: 'default', label: 'Connected' },
	disconnected: { variant: 'secondary', label: 'Disconnected' },
	error: { variant: 'destructive', label: 'Error' },
};

export function SWsPage() {
	const { products, status, error } = useProductsWebSocket();
	const [search, setSearch] = useState('');

	const filteredProducts = useMemo(() => {
		if (!search) {
			return products;
		}
		const searchLower = search.toLowerCase();
		return products.filter(
			p =>
				p.name.toLowerCase().includes(searchLower) ||
				p.category.toLowerCase().includes(searchLower) ||
				p.status.toLowerCase().includes(searchLower)
		);
	}, [products, search]);

	const tableColumns: TableColumn<Product>[] = useMemo(() => {
		return columns.map(col => ({
			key: col.key as string,
			label: col.label,
			sortable: false,
			render: (item: Product, _isEditing: boolean) => renderColumnValue(col, item),
		}));
	}, []);

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
				<Badge variant={STATUS_CONFIG[status].variant}>{STATUS_CONFIG[status].label}</Badge>
				{error && <span style={{ color: 'var(--destructive)', fontSize: '0.875rem' }}>{error}</span>}
			</div>

			<div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
				<SearchInput value={search} onChange={setSearch} placeholder="Search products..." className="flex-1" />
				<span style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
					{filteredProducts.length} of {products.length} products
				</span>
			</div>

			<Table
				data={filteredProducts}
				columns={tableColumns}
				getItemId={item => item.id}
				emptyMessage="No products found"
				loading={status === 'connecting'}
			/>
		</div>
	);
}
