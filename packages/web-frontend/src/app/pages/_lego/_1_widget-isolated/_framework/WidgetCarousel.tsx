import { useEffect, useState } from 'react';

import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import type { ColumnDef } from '@framework/lego/types/ColTypes';
import type {
	AutoplayConfig,
	CarouselFeature,
	FieldVisibilityConfig,
	PaginationConfig,
} from '@framework/lego/types/FeatureTypes';
import { resolveFeature } from '@framework/lego/types/FeatureTypes';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';

import { useWidgetDataFetch } from './useWidgetDataFetch';
import { useWidgetQuery } from './useWidgetQuery';

/**
 * ===========================================================================================
 * WIDGET CAROUSEL - Horizontal Carousel Widget
 * ===========================================================================================
 *
 * Displays items in a horizontal carousel with navigation controls.
 * Supports pagination, field visibility toggle, and autoplay.
 *
 * ===========================================================================================
 */

export interface WidgetCarouselProps<T> {
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
	features: CarouselFeature[];
}

export function WidgetCarousel<T extends { id: string }>({ service, columns, features }: WidgetCarouselProps<T>) {
	const { query, setPage } = useWidgetQuery(features as unknown[]);

	const paginationConfig = features
		.map(f => resolveFeature<PaginationConfig>(f as string | PaginationConfig, 'pagination'))
		.find(Boolean);
	const autoplayConfig = features
		.map(f => resolveFeature<AutoplayConfig>(f as string | AutoplayConfig, 'autoplay'))
		.find(Boolean);
	const fieldVisibilityConfig = features
		.map(f => resolveFeature<FieldVisibilityConfig>(f as string | FieldVisibilityConfig, 'field-visibility'))
		.find(Boolean);

	const { items, loading, pagination } = useWidgetDataFetch({
		fetchFn: async q => {
			const params: { page?: number; pageSize?: number } = {};
			if (paginationConfig) {
				params.page = q.page;
				params.pageSize = q.pageSize;
			}
			return await service.getProducts(params);
		},
		query,
	});

	const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set(columns.map(c => c.key as string)));

	const visibleColumnDefs = columns.filter(c => visibleFields.has(c.key as string));

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

	useEffect(() => {
		if (autoplayConfig) {
			const interval = setInterval(() => {
				if (pagination.page < pagination.totalPages) {
					setPage(pagination.page + 1);
				} else {
					setPage(1);
				}
			}, autoplayConfig.interval || 3000);
			return () => clearInterval(interval);
		}
	}, [autoplayConfig, pagination.page, pagination.totalPages, setPage]);

	const handlePrev = () => {
		if (pagination.page > 1) {
			setPage(pagination.page - 1);
		}
	};

	const handleNext = () => {
		if (pagination.page < pagination.totalPages) {
			setPage(pagination.page + 1);
		}
	};

	return (
		<div className="flex h-full flex-col gap-4">
			{fieldVisibilityConfig && (
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
			)}

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

			{paginationConfig && (
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
