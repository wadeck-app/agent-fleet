import { useMemo, useState } from 'react';

import { Badge } from '@framework/components/primitives/Badge';
import { SearchInput } from '@framework/components/search/SearchInput';
import { Table } from '@framework/components/table/Table';
import type { TableColumn } from '@framework/components/table/Table';
import { col } from '@framework/lego/helpers/col';
import { renderColumnValue } from '@framework/lego/helpers/renderColumnValue';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { useProductsWebSocket } from '@app/pages/_lego/_shared/api/useProductsWebSocket';
import type { ProductWebSocketStatus } from '@app/pages/_lego/_shared/api/useProductsWebSocket';

import { PageLayout } from '../_framework/PageLayout';

/**
 * ===========================================================================================
 * S_WS: REAL-TIME WEBSOCKET
 * ===========================================================================================
 *
 * Demonstrates real-time data updates via WebSocket connection.
 * Products update automatically without page reload.
 *
 * Features:
 * - WebSocket connection with status indicator
 * - Live updates (create, update, delete)
 * - Client-side search (local filtering)
 * - No pagination (shows all products)
 *
 * Architecture:
 * - useProductsWebSocket hook manages connection and state
 * - Client-side filtering via useState
 * - Direct Table component rendering
 *
 * ===========================================================================================
 */

const columns = [
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
	const [searchValue, setSearchValue] = useState('');

	const filteredProducts = useMemo(() => {
		if (!searchValue) {
			return products;
		}
		const lowerSearch = searchValue.toLowerCase();
		return products.filter(
			p =>
				p.name.toLowerCase().includes(lowerSearch) ||
				p.category.toLowerCase().includes(lowerSearch) ||
				p.status.toLowerCase().includes(lowerSearch)
		);
	}, [products, searchValue]);

	const tableColumns: TableColumn<Product>[] = useMemo(
		() =>
			columns.map(col => ({
				key: col.key as string,
				label: col.label,
				render: (item: Product) => renderColumnValue(col, item),
			})),
		[]
	);

	return (
		<PageLayout>
			<div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
				<div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
					<Badge variant={STATUS_CONFIG[status].variant}>{STATUS_CONFIG[status].label}</Badge>
					{error && <span style={{ color: 'var(--destructive)', fontSize: '0.875rem' }}>{error}</span>}
				</div>

				<div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
					<SearchInput
						value={searchValue}
						onChange={setSearchValue}
						placeholder="Search products..."
						className="flex-1"
					/>
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
		</PageLayout>
	);
}
