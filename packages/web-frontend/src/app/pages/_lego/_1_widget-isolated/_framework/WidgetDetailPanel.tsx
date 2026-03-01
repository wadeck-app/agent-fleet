import { useState } from 'react';

import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import type { ColumnDef, DetailPanelFeature } from '@framework/lego';
import { resolveFeature } from '@framework/lego';
import { Check, X } from 'lucide-react';

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
	const inlineEditConfig = features.map(f => resolveFeature(f, 'inline-edit')).find(Boolean);

	const [item, setItem] = useState<T | null>(defaultItem || null);
	const [loading, setLoading] = useState(false);

	const _loadItem = async (id: string) => {
		setLoading(true);
		try {
			const data = await service.getProduct(id);
			setItem(data);
		} catch (error) {
			console.error('Failed to load item:', error);
		} finally {
			setLoading(false);
		}
	};

	const renderFieldValue = (col: ColumnDef<T>) => {
		if (!item) return null;

		if (col.render) return col.render(item);

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

	return (
		<div className="flex h-full flex-col gap-4 rounded-lg border border-border bg-card p-4">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold">Details</h2>
				{inlineEditConfig && <Button size="sm">Edit</Button>}
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
