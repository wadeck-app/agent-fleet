import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Badge } from '@framework/components/primitives/Badge';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';
import { Check, X } from 'lucide-react';

import { col } from '@framework/lego/helpers/col';

import { DataTable } from '../_framework/DataTable';
import { useDataTable } from '../_framework/DataTableContext';
import { SplitLayout } from '../_framework/SplitLayout';

const detailColumns = [
	col.text<Product>('name', 'Name'),
	col.text<Product>('description', 'Description'),
	col.number<Product>('price', 'Price', { prefix: '$' }),
	col.number<Product>('stock', 'Stock'),
	col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
	col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true }),
	col.number<Product>('rating', 'Rating', { suffix: ' / 5' }),
	col.boolean<Product>('featured', 'Featured'),
	col.date<Product>('createdAt', 'Created'),
];

export function SBusContent() {
	const ctx = useDataTable<Product>();
	const [searchParams, setSearchParams] = useSearchParams();
	const containerRef = useRef<HTMLDivElement>(null);
	const prevSelectedIdRef = useRef<string | undefined>(ctx.selectedItemId);
	const [reloadKey, setReloadKey] = useState(0);

	useEffect(() => {
		const idFromUrl = searchParams.get('id');
		if (idFromUrl && idFromUrl !== ctx.selectedItemId) {
			ctx.setSelectedItemId(idFromUrl);
		}
	}, [searchParams, ctx]);

	useEffect(() => {
		if (ctx.selectedItemId && ctx.selectedItemId === prevSelectedIdRef.current) {
			setReloadKey(prev => prev + 1);
		}
		prevSelectedIdRef.current = ctx.selectedItemId;
	}, [ctx.selectedItemId]);

	useEffect(() => {
		if (ctx.selectedItemId) {
			setSearchParams({ id: ctx.selectedItemId });
		}
	}, [ctx.selectedItemId, setSearchParams]);

	const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (ctx.items.length === 0 || !ctx.selectedItemId) return;
		const currentIndex = ctx.items.findIndex(item => item.id === ctx.selectedItemId);
		if (e.key === 'ArrowUp' && currentIndex > 0) {
			e.preventDefault();
			ctx.setSelectedItemId(ctx.items[currentIndex - 1].id);
		} else if (e.key === 'ArrowDown' && currentIndex >= 0 && currentIndex < ctx.items.length - 1) {
			e.preventDefault();
			ctx.setSelectedItemId(ctx.items[currentIndex + 1].id);
		}
	};

	const renderFieldValue = (col: (typeof detailColumns)[number]) => {
		if (!ctx.selectedItem) return null;
		const value = ctx.selectedItem[col.key];
		if (col.type === 'boolean') {
			return value ? <Check className="size-4 text-primary" /> : <X className="size-4 text-muted-foreground" />;
		}
		if (col.type === 'number' && typeof value === 'number') {
			return <span>{col.prefix}{value.toFixed(2)}{col.suffix}</span>;
		}
		if (col.type === 'enum' && col.badge) {
			return <Badge variant="secondary">{String(value)}</Badge>;
		}
		if (col.type === 'date' && typeof value === 'string') {
			return new Date(value).toISOString().slice(0, 10);
		}
		return String(value || '');
	};

	return (
		<div ref={containerRef} tabIndex={0} onKeyDown={handleKeyDown} style={{ outline: 'none', height: '100%' }} onClick={() => containerRef.current?.focus()}>
			<SplitLayout
				left={
					<DataTable.Content>
						<DataTable.Body />
						<DataTable.Footer>
							<DataTable.Pagination defaultSize={10} />
						</DataTable.Footer>
					</DataTable.Content>
				}
				right={
					ctx.selectedItemLoading ? (
						<div className="flex h-full items-center justify-center">Loading...</div>
					) : ctx.selectedItem ? (
						<div className="flex h-full flex-col gap-4 rounded-lg border border-border bg-card p-4" key={reloadKey}>
							<h2 className="text-lg font-semibold">Details</h2>
							<div className="space-y-3">
								{detailColumns.map(col => (
									<div key={col.key as string} className="border-b border-border pb-2">
										<div className="text-sm font-semibold text-muted-foreground">{col.label}</div>
										<div className="mt-1">{renderFieldValue(col)}</div>
									</div>
								))}
							</div>
						</div>
					) : (
						<div className="flex h-full items-center justify-center text-muted-foreground">
							Select an item to view details
						</div>
					)
				}
				rightWidth="md"
			/>
		</div>
	);
}
