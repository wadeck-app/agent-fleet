import { useCallback, useEffect, useState } from 'react';

import { Badge } from '@framework/components/primitives/Badge';
import type { ColumnDef } from '@framework/lego';
import { Check, X } from 'lucide-react';

import type { PipelineService } from './usePipeline';

/**
 * ===========================================================================================
 * PIPELINE DETAIL PANEL
 * ===========================================================================================
 *
 * Detail panel for displaying a single item.
 * Used in S6_ItemDetail for master-detail layout.
 *
 * Features:
 * - Loads item by ID using service
 * - Renders fields using column definitions
 * - Shows loading/empty states
 *
 * ===========================================================================================
 */

export interface PipelineDetailPanelProps<T> {
	service: PipelineService & {
		getProduct: (id: string) => Promise<T>;
	};
	columns: ColumnDef<T>[];
	selectedId?: string;
}

export function PipelineDetailPanel<T>({ service, columns, selectedId }: PipelineDetailPanelProps<T>) {
	const [item, setItem] = useState<T | null>(null);
	const [loading, setLoading] = useState(false);

	const loadItem = useCallback(
		async (id: string) => {
			setLoading(true);
			try {
				const data = await service.getProduct(id);
				setItem(data);
			} catch (error) {
				console.error('Failed to load item:', error);
			} finally {
				setLoading(false);
			}
		},
		[service]
	);

	useEffect(() => {
		if (selectedId) {
			void loadItem(selectedId);
		} else {
			setItem(null);
		}
	}, [selectedId, loadItem]);

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

	return (
		<div className="flex h-full flex-col gap-4 rounded-lg border border-border bg-card p-4">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold">Details</h2>
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
