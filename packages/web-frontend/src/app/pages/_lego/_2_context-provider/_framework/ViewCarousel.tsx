import { useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { Card } from '@framework/components/primitives/Card';
import type { ColumnDef } from '@framework/lego/types/ColTypes';
import type { CarouselFeature } from '@framework/lego/types/FeatureTypes';
import { resolveFeature } from '@framework/lego/types/FeatureTypes';
import type { Product } from '@shared/api/products.contract';
import { Check, ChevronLeft, ChevronRight, Minus } from 'lucide-react';

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
	const [currentIndex, setCurrentIndex] = useState(0);
	const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set(columns.map(col => String(col.key))));
	const autoplayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	/**
	 * Resolve features
	 */
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

	/**
	 * Navigation handlers
	 */
	const handlePrev = () => {
		setCurrentIndex(prev => (prev > 0 ? prev - 1 : items.length - 1));
	};

	const handleNext = () => {
		setCurrentIndex(prev => (prev < items.length - 1 ? prev + 1 : 0));
	};

	/**
	 * Autoplay effect
	 */
	useEffect(() => {
		if (autoplayConfig && items.length > 0) {
			const interval = autoplayConfig.interval ?? 3000;
			autoplayTimerRef.current = setInterval(() => {
				setCurrentIndex(prev => (prev < items.length - 1 ? prev + 1 : 0));
			}, interval);

			return () => {
				if (autoplayTimerRef.current) {
					clearInterval(autoplayTimerRef.current);
				}
			};
		}
	}, [autoplayConfig, items.length]);

	/**
	 * Toggle field visibility
	 */
	const toggleFieldVisibility = (key: string) => {
		setVisibleFields(prev => {
			const next = new Set(prev);
			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});
	};

	/**
	 * Render a field value based on column definition
	 */
	const renderFieldValue = (item: T, col: ColumnDef<T>) => {
		if (col.render) {
			return col.render(item);
		}

		const value = item[col.key];

		if (col.type === 'number') {
			const prefix = col.prefix ?? '';
			const suffix = col.suffix ?? '';
			return `${prefix}${Number(value).toLocaleString()}${suffix}`;
		}

		if (col.type === 'enum' && col.badge) {
			return <Badge variant="secondary">{String(value)}</Badge>;
		}

		if (col.type === 'boolean') {
			return value ? (
				<Check className="size-4 text-primary" />
			) : (
				<Minus className="size-4 text-muted-foreground" />
			);
		}

		if (col.type === 'date') {
			return value ? new Date(value as string | number | Date).toLocaleDateString() : '–';
		}

		return String(value ?? '');
	};

	const currentItem = items[currentIndex];

	if (context.loading) {
		return <div className="text-center text-muted-foreground">Loading...</div>;
	}

	if (items.length === 0) {
		return <div className="text-center text-muted-foreground">No items found</div>;
	}

	return (
		<div className="space-y-4">
			{fieldVisibilityConfig && (
				<div className="flex flex-wrap gap-2">
					{columns.map(col => (
						<Button
							key={String(col.key)}
							variant={visibleFields.has(String(col.key)) ? 'default' : 'outline'}
							size="sm"
							onClick={() => toggleFieldVisibility(String(col.key))}
						>
							{col.label}
						</Button>
					))}
				</div>
			)}

			<Card className="p-8">
				<div className="space-y-4">
					{columns
						.filter(col => visibleFields.has(String(col.key)))
						.map(col => (
							<div key={String(col.key)} className="flex justify-between">
								<span className="font-medium">{col.label}:</span>
								<span>{renderFieldValue(currentItem, col)}</span>
							</div>
						))}
				</div>
			</Card>

			{paginationConfig && (
				<div className="flex items-center justify-between">
					<Button variant="outline" size="icon" onClick={handlePrev} disabled={items.length <= 1}>
						<ChevronLeft className="size-4" />
					</Button>
					<span className="text-sm text-muted-foreground">
						{currentIndex + 1} / {items.length}
					</span>
					<Button variant="outline" size="icon" onClick={handleNext} disabled={items.length <= 1}>
						<ChevronRight className="size-4" />
					</Button>
				</div>
			)}
		</div>
	);
}
