import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import type { ColumnDef } from '@framework/lego/types/ColTypes';
import type { CarouselFeature } from '@framework/lego/types/FeatureTypes';
import { resolveFeature } from '@framework/lego/types/FeatureTypes';
import type { Product } from '@shared/api/products.contract';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';

import { useProductDomain } from './ProductDomainContext';

/**
 * ===========================================================================================
 * VIEW CAROUSEL
 * ===========================================================================================
 *
 * Carousel view component that reads from ProductDomainContext.
 * NO service prop, NO data prop - reads everything from context.
 *
 * Features:
 * - pagination: Manual navigation (prev/next)
 * - autoplay: Auto-advance with configurable interval
 * - field-visibility: Toggle which fields are shown
 *
 * Displays one item at a time with smooth transitions.
 *
 * ===========================================================================================
 */

export interface ViewCarouselProps<T = Product> {
	columns: ColumnDef<T>[];
	features: CarouselFeature[];
}

export function ViewCarousel<T extends Product = Product>({ columns, features }: ViewCarouselProps<T>) {
	const context = useProductDomain();
	const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set(columns.map(c => c.key as string)));

	const paginationConfig = useMemo(
		() =>
			features.find(f => {
				const resolved = resolveFeature(f, 'pagination');
				return resolved !== null;
			}),
		[features]
	);
	const autoplayConfig = useMemo(() => {
		const found = features.find(f => typeof f === 'object' && f.type === 'autoplay');
		return found && typeof found === 'object' && found.type === 'autoplay' ? found : null;
	}, [features]);
	const fieldVisibilityConfig = useMemo(
		() =>
			features.find(f => {
				const resolved = resolveFeature(f, 'field-visibility');
				return resolved !== null;
			}),
		[features]
	);

	const items = context.items as T[];

	const handlePrev = () => {
		if (context.pagination.page > 1) {
			context.actions.setQuery({ page: context.pagination.page - 1 });
		}
	};

	const handleNext = () => {
		if (context.pagination.page < context.pagination.totalPages) {
			context.actions.setQuery({ page: context.pagination.page + 1 });
		}
	};

	useEffect(() => {
		if (autoplayConfig) {
			const interval = setInterval(() => {
				if (context.pagination.page < context.pagination.totalPages) {
					context.actions.setQuery({ page: context.pagination.page + 1 });
				} else {
					context.actions.setQuery({ page: 1 });
				}
			}, autoplayConfig.interval || 3000);
			return () => clearInterval(interval);
		}
	}, [autoplayConfig, context.pagination.page, context.pagination.totalPages, context.actions]);

	/**
	 * Render a field value based on column definition
	 */
	const renderFieldValue = (item: T, col: ColumnDef<T>) => {
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

	const visibleColumnDefs = columns.filter(c => visibleFields.has(c.key as string));

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
				{context.loading ? (
					<div className="flex h-full items-center justify-center">Loading...</div>
				) : items.length === 0 ? (
					<div className="flex h-full items-center justify-center">No items found</div>
				) : (
					<div className="flex gap-4 overflow-x-auto">
						{items.map(item => (
							<div key={item.id} className="min-w-[300px] rounded-lg border border-border bg-card p-4">
								<div className="space-y-2">
									{visibleColumnDefs.map(col => (
										<div key={String(col.key)} className="text-sm">
											<span className="font-semibold">{col.label}: </span>
											{renderFieldValue(item, col)}
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
					<Button onClick={handlePrev} disabled={context.pagination.page === 1} size="sm">
						<ChevronLeft className="size-4" />
						Prev
					</Button>
					<div className="text-sm text-muted-foreground">
						Page {context.pagination.page} of {context.pagination.totalPages}
					</div>
					<Button
						onClick={handleNext}
						disabled={context.pagination.page === context.pagination.totalPages}
						size="sm"
					>
						Next
						<ChevronRight className="size-4" />
					</Button>
				</div>
			)}
		</div>
	);
}
