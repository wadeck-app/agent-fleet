import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import type { ColumnDef } from '@framework/lego/types/ColTypes';
import { type DetailPanelFeature, resolveFeature } from '@framework/lego/types/FeatureTypes';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';

import { useGlobalPageEventsOptional } from './GlobalEventContext';

/**
 * ===========================================================================================
 * WIDGET DETAIL PANEL - Single Item Detail View
 * ===========================================================================================
 *
 * Displays detailed view of a single item.
 * Listens for selection events from other widgets.
 * Supports inline editing.
 *
 * ===========================================================================================
 */

export interface WidgetDetailPanelProps<T> {
	service: {
		getProduct: (id: string) => Promise<T>;
	};
	columns: ColumnDef<T>[];
	features: DetailPanelFeature[];
	listens?: string[];
	defaultItem?: T;
}

export function WidgetDetailPanel<T extends { id: string }>({
	service,
	columns,
	features,
	defaultItem,
}: WidgetDetailPanelProps<T>) {
	const eventBus = useGlobalPageEventsOptional();
	const [searchParams, setSearchParams] = useSearchParams();

	const inlineEditConfig = features.map(f => resolveFeature(f, 'inline-edit')).find(Boolean);

	const [item, setItem] = useState<T | null>(defaultItem || null);
	const [loading, setLoading] = useState(false);
	const [items, setItems] = useState<T[]>([]);

	const loadItem = useCallback(
		async (id: string) => {
			setLoading(true);
			try {
				const data = await service.getProduct(id);
				setItem(data);
				setSearchParams({ id });
			} catch (error) {
				console.error('Failed to load item:', error);
			} finally {
				setLoading(false);
			}
		},
		[service, setSearchParams]
	);

	// intentional: read initial URL state once on mount
	useEffect(() => {
		const initialId = searchParams.get('id');
		if (initialId) {
			void loadItem(initialId);
		}
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		if (!eventBus) {
			return;
		}

		const unsubscribe = eventBus.on('product:selected', (payload: any) => {
			if (payload && typeof payload === 'object' && 'id' in payload) {
				void loadItem(payload.id as string);
			}

			if (payload && typeof payload === 'object' && 'items' in payload && Array.isArray(payload.items)) {
				setItems(payload.items as T[]);
			}
		});

		return unsubscribe;
	}, [eventBus, loadItem]);

	const handleNavigatePrev = () => {
		if (!item || items.length === 0) {
			return;
		}

		const currentIndex = items.findIndex(i => i.id === item.id);
		if (currentIndex > 0) {
			void loadItem(items[currentIndex - 1].id);
		}
	};

	const handleNavigateNext = () => {
		if (!item || items.length === 0) {
			return;
		}

		const currentIndex = items.findIndex(i => i.id === item.id);
		if (currentIndex < items.length - 1) {
			void loadItem(items[currentIndex + 1].id);
		}
	};

	const renderFieldValue = (col: ColumnDef<T>) => {
		if (!item) {
			return null;
		}

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

		if (col.type === 'date') {
			if (value instanceof Date) {
				return value.toISOString().slice(0, 10);
			}
			if (typeof value === 'string') {
				return new Date(value).toISOString().slice(0, 10);
			}
		}

		return String(value || '');
	};

	if (loading) {
		return <div className="flex h-full items-center justify-center">Loading...</div>;
	}

	if (!item) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground">
				Select an item to view details
			</div>
		);
	}

	const currentIndex = items.findIndex(i => i.id === item.id);
	const canNavigatePrev = currentIndex > 0;
	const canNavigateNext = currentIndex >= 0 && currentIndex < items.length - 1;

	return (
		<div className="flex h-full flex-col gap-4 rounded-lg border border-border bg-card p-4">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold">Details</h2>
				<div className="flex items-center gap-2">
					{items.length > 0 && (
						<div className="flex gap-1">
							<Button size="sm" variant="ghost" onClick={handleNavigatePrev} disabled={!canNavigatePrev}>
								<ChevronLeft className="size-4" />
							</Button>
							<Button size="sm" variant="ghost" onClick={handleNavigateNext} disabled={!canNavigateNext}>
								<ChevronRight className="size-4" />
							</Button>
						</div>
					)}
					{inlineEditConfig && <Button size="sm">Edit</Button>}
				</div>
			</div>
			<div className="space-y-3">
				{columns.map(col => (
					<div key={col.key as string} className="border-b border-border pb-2">
						<div className="text-sm font-semibold text-muted-foreground">{col.label}</div>
						<div className="mt-1">{renderFieldValue(col)}</div>
					</div>
				))}
			</div>
		</div>
	);
}
