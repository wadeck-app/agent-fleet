import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import type { ColumnDef } from '@framework/lego/types/ColTypes';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';

import { useProductDomain } from './ProductDomainContext';

/**
 * ===========================================================================================
 * VIEW DETAIL PANEL NAV - Detail Panel with Navigation
 * ===========================================================================================
 *
 * Displays detailed view of currently selected item from ProductDomainContext.
 * Provides prev/next navigation within current page items.
 *
 * Features:
 * - Reads selectedItem from context
 * - Prev/next navigation buttons
 * - Loading state
 * - Zero data props
 *
 * ===========================================================================================
 */

export interface ViewDetailPanelNavProps<T> {
	columns: ColumnDef<T>[];
}

export function ViewDetailPanelNav<T extends { id: string }>({ columns }: ViewDetailPanelNavProps<T>) {
	const context = useProductDomain();

	const item = context.selectedItem as T | null;
	const loading = context.selectedItemLoading;
	const items = context.items as unknown as T[];

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

	return (
		<div className="flex h-full flex-col gap-4 rounded-lg border border-border bg-card p-4">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold">Details</h2>
				<div className="flex gap-1">
					<Button
						size="sm"
						variant="ghost"
						onClick={() => context.actions.navigatePrev()}
						disabled={!canNavigatePrev}
					>
						<ChevronLeft className="size-4" />
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={() => context.actions.navigateNext()}
						disabled={!canNavigateNext}
					>
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
