import { type MutableRefObject, useEffect, useMemo, useState } from 'react';

import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import type { ColumnDef } from '@framework/lego/types/ColTypes';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';

import { useWidgetDataFetch } from '@app/pages/_lego/_1_widget-isolated/_framework/useWidgetDataFetch';

import type { PaginationFeatureHook } from './usePaginationFeature';

/**
 * ===========================================================================================
 * HOOK CAROUSEL - Hook-Based Carousel Widget
 * ===========================================================================================
 *
 * Carousel widget that accepts feature hooks from the page.
 * Displays ALL items in a horizontal scrolling layout with page-based navigation.
 * Matches WidgetCarousel's behavior exactly.
 *
 * ===========================================================================================
 */

export type CarouselFeatureHook = PaginationFeatureHook;

export interface HookCarouselProps<T> {
	service: {
		getProducts: (query: { page?: number; pageSize?: number }) => Promise<{
			items: T[];
			total?: number;
			page?: number;
			pageSize?: number;
			pagination?: { total: number; page: number; pageSize: number; totalPages: number };
		}>;
	};
	columns: ColumnDef<T>[];
	features: CarouselFeatureHook[];
	onRefreshRef?: MutableRefObject<(() => void) | undefined>;
}

export function HookCarousel<T extends { id: string }>({
	service,
	columns,
	features,
	onRefreshRef,
}: HookCarouselProps<T>) {
	// Extract feature hooks by type
	const paginationFeature = features.find(f => f.type === 'pagination') as PaginationFeatureHook | undefined;

	// Build query from feature hooks
	const query = useMemo(
		() => ({
			search: '',
			page: paginationFeature?.page ?? 1,
			pageSize: paginationFeature?.pageSize ?? 10,
			sortBy: undefined,
			sortOrder: undefined,
		}),
		[paginationFeature?.page, paginationFeature?.pageSize]
	);

	const { items, loading, pagination, refresh } = useWidgetDataFetch({
		fetchFn: async q => {
			const params: {
				page?: number;
				pageSize?: number;
			} = {};
			if (paginationFeature) {
				params.page = q.page;
				params.pageSize = q.pageSize;
			}
			return await service.getProducts(params);
		},
		query,
	});

	const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set(columns.map(c => c.key as string)));

	const visibleColumnDefs = columns.filter(c => visibleFields.has(c.key as string));

	useEffect(() => {
		if (onRefreshRef) {
			onRefreshRef.current = refresh;
		}
	}, [refresh, onRefreshRef]);

	const renderCellValue = (item: T, col: ColumnDef<T>) => {
		if (col.render) {
			return col.render(item);
		}

		const value = item[col.key];

		if (col.type === 'boolean') {
			return value ? <Check className="size-4 text-primary" /> : <X className="size-4 text-muted-foreground" />;
		}

		if (col.type === 'number' && typeof value === 'number') {
			return (
				<span>
					{col.prefix}
					{value.toFixed(2)}
					{col.suffix}
				</span>
			);
		}

		if (col.type === 'enum' && col.badge) {
			return <Badge variant="secondary">{String(value)}</Badge>;
		}

		return String(value || '');
	};

	const handlePrev = () => {
		if (pagination.page > 1) {
			paginationFeature?.setPage(pagination.page - 1);
		}
	};

	const handleNext = () => {
		if (pagination.page < pagination.totalPages) {
			paginationFeature?.setPage(pagination.page + 1);
		}
	};

	return (
		<div className="flex h-full flex-col gap-4">
			<div className="flex flex-wrap gap-2">
				{columns.map(col => (
					<Button
						key={col.key as string}
						size="sm"
						variant={visibleFields.has(col.key as string) ? 'default' : 'outline'}
						onClick={() => {
							const newSet = new Set(visibleFields);
							if (newSet.has(col.key as string)) {
								newSet.delete(col.key as string);
							} else {
								newSet.add(col.key as string);
							}
							setVisibleFields(newSet);
						}}
					>
						{col.label}
					</Button>
				))}
			</div>

			<div className="relative flex-1">
				{loading ? (
					<div className="flex h-full items-center justify-center">Loading...</div>
				) : items.length === 0 ? (
					<div className="flex h-full items-center justify-center">No items found</div>
				) : (
					<div className="flex gap-4 overflow-x-auto">
						{items.map(item => (
							<div key={item.id} className="min-w-[300px] rounded-lg border border-border bg-card p-4">
								<div className="space-y-2">
									{visibleColumnDefs.map(col => (
										<div key={col.key as string} className="text-sm">
											<span className="font-semibold">{col.label}: </span>
											{renderCellValue(item, col)}
										</div>
									))}
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			{paginationFeature && (
				<div className="flex items-center justify-between">
					<Button onClick={handlePrev} disabled={pagination.page === 1} size="sm">
						<ChevronLeft className="size-4" />
						Prev
					</Button>
					<div className="text-sm text-muted-foreground">
						Page {pagination.page} of {pagination.totalPages}
					</div>
					<Button onClick={handleNext} disabled={pagination.page === pagination.totalPages} size="sm">
						Next
						<ChevronRight className="size-4" />
					</Button>
				</div>
			)}
		</div>
	);
}
