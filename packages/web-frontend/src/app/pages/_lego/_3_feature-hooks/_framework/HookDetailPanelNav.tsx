import { useEffect, useState } from 'react';

import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import type { ColumnDef } from '@framework/lego';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';

/**
 * ===========================================================================================
 * HOOK DETAIL PANEL NAV - Detail Panel with Navigation for Hook Architecture
 * ===========================================================================================
 *
 * Detail panel that accepts selectedId and loads item data.
 * Provides prev/next navigation buttons.
 *
 * Features:
 * - Loads item by ID from service
 * - Prev/next navigation
 * - Loading state
 *
 * ===========================================================================================
 */

export interface HookDetailPanelNavProps<T> {
	service: {
		getProduct: (id: string) => Promise<T>;
	};
	columns: ColumnDef<T>[];
	selectedId: string | null;
	items: Array<{ id: string }>;
	onNavigate: (id: string) => void;
}

export function HookDetailPanelNav<T extends { id: string }>({
	service,
	columns,
	selectedId,
	items,
	onNavigate,
}: HookDetailPanelNavProps<T>) {
	const [item, setItem] = useState<T | null>(null);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!selectedId) {
			setItem(null);
			return;
		}

		const loadItem = async () => {
			setLoading(true);
			try {
				const data = await service.getProduct(selectedId);
				setItem(data);
			} catch (error) {
				console.error('Failed to load item:', error);
				setItem(null);
			} finally {
				setLoading(false);
			}
		};

		void loadItem();
	}, [selectedId, service]);

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
				return value.toLocaleDateString();
			}
			if (typeof value === 'string') {
				return new Date(value).toLocaleDateString();
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

	const handlePrev = () => {
		if (canNavigatePrev) {
			onNavigate(items[currentIndex - 1].id);
		}
	};

	const handleNext = () => {
		if (canNavigateNext) {
			onNavigate(items[currentIndex + 1].id);
		}
	};

	return (
		<div className="flex h-full flex-col gap-4 rounded-lg border border-border bg-card p-4">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold">Details</h2>
				<div className="flex gap-1">
					<Button size="sm" variant="ghost" onClick={handlePrev} disabled={!canNavigatePrev}>
						<ChevronLeft className="size-4" />
					</Button>
					<Button size="sm" variant="ghost" onClick={handleNext} disabled={!canNavigateNext}>
						<ChevronRight className="size-4" />
					</Button>
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
