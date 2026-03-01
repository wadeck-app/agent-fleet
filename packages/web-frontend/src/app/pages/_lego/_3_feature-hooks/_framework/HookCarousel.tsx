import { type MutableRefObject, useEffect, useMemo, useState } from 'react';

import { PageSizeSelector } from '@framework/components/pagination/PageSizeSelector';
import { Pagination } from '@framework/components/pagination/Pagination';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import type { ColumnDef } from '@framework/lego';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { useWidgetDataFetch } from '@app/pages/_lego/_1_widget-isolated/_framework/useWidgetDataFetch';

import type { PaginationFeatureHook } from './usePaginationFeature';

/**
 * ===========================================================================================
 * HOOK CAROUSEL - Hook-Based Carousel Widget
 * ===========================================================================================
 *
 * Carousel widget that accepts feature hooks from the page.
 * Displays items in a carousel layout with navigation controls.
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

	const [currentIndex, setCurrentIndex] = useState(0);

	useEffect(() => {
		if (onRefreshRef) {
			onRefreshRef.current = refresh;
		}
	}, [refresh, onRefreshRef]);

	// Reset index when items change
	useEffect(() => {
		setCurrentIndex(0);
	}, [items]);

	const currentItem = items[currentIndex];

	const handlePrevious = () => {
		setCurrentIndex(prev => (prev > 0 ? prev - 1 : items.length - 1));
	};

	const handleNext = () => {
		setCurrentIndex(prev => (prev < items.length - 1 ? prev + 1 : 0));
	};

	const getFieldValue = (item: T, key: string | number | symbol): any => {
		return item[key as keyof T];
	};

	return (
		<div className="flex h-full flex-col gap-4">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold">Product Carousel</h2>
			</div>

			{loading && <div className="p-8 text-center">Loading...</div>}

			{!loading && items.length === 0 && <div className="p-8 text-center">No items found</div>}

			{!loading && items.length > 0 && currentItem && (
				<div className="flex-1 rounded-lg border border-border bg-card p-8">
					<div className="flex h-full items-center justify-between gap-4">
						<Button onClick={handlePrevious} variant="outline" size="icon">
							<ChevronLeft className="size-6" />
						</Button>

						<div className="flex-1 space-y-4">
							{columns.slice(0, 6).map(col => {
								const value = getFieldValue(currentItem, col.key);
								return (
									<div key={col.key as string}>
										<div className="text-sm font-semibold text-muted-foreground">{col.label}</div>
										<div className="text-lg">
											{col.type === 'enum' && col.badge ? (
												<Badge variant="secondary">{String(value)}</Badge>
											) : (
												<span>{String(value || '')}</span>
											)}
										</div>
									</div>
								);
							})}
							<div className="mt-4 text-center text-sm text-muted-foreground">
								{currentIndex + 1} of {items.length}
							</div>
						</div>

						<Button onClick={handleNext} variant="outline" size="icon">
							<ChevronRight className="size-6" />
						</Button>
					</div>
				</div>
			)}

			{paginationFeature && (
				<div className="flex items-center justify-between">
					<div className="text-sm text-muted-foreground">
						Showing {items.length} of {pagination.total} items
					</div>
					<div className="flex items-center gap-4">
						<PageSizeSelector
							value={paginationFeature.pageSize}
							onChange={paginationFeature.setPageSize}
							options={paginationFeature.pageSizes || [5, 10, 20]}
						/>
						<Pagination
							currentPage={pagination.page}
							totalPages={pagination.totalPages}
							onPageChange={paginationFeature.setPage}
						/>
					</div>
				</div>
			)}
		</div>
	);
}
