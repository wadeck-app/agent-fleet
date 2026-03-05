import { type ReactNode, useEffect, useState } from 'react';

import { LoadingDots } from '@framework/components/loading/LoadingDots';
import { Card, CardContent, CardHeader, CardTitle } from '@framework/components/primitives/Card';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';

/**
 * ===========================================================================================
 * DATA2 DETAIL PANEL - Standalone Detail Display Component
 * ===========================================================================================
 *
 * Fetches and displays a single item by ID.
 * Used in master-detail scenarios (S6, S7).
 *
 * Features:
 * - Loads item when selectedId changes
 * - Shows loading state while fetching
 * - Displays fields using column definitions
 * - Empty state when no item selected
 *
 * ===========================================================================================
 */

export interface Data2DetailPanelProps<T> {
	service: {
		getProduct: (id: string) => Promise<T>;
	};
	columns: Array<{
		key: string;
		label: string;
		render?: (item: T) => ReactNode;
	}>;
	selectedId?: string;
	title?: string;
}

export function Data2DetailPanel<T>({
	service,
	columns,
	selectedId,
	title = 'Item Details',
}: Data2DetailPanelProps<T>) {
	const [item, setItem] = useState<T | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!selectedId) {
			setItem(null);
			setError(null);
			return;
		}

		const loadItem = async () => {
			setIsLoading(true);
			setError(null);

			try {
				const data = await service.getProduct(selectedId);
				setItem(data);
			} catch (err) {
				setError(getErrorMessage(err));
				setItem(null);
			} finally {
				setIsLoading(false);
			}
		};

		void loadItem();
	}, [selectedId, service]);

	return (
		<Card>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
			</CardHeader>
			<CardContent>
				{isLoading && (
					<div className="flex justify-center py-8">
						<LoadingDots size="medium" />
					</div>
				)}

				{error && !isLoading && (
					<div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
						<strong>Error:</strong> {error}
					</div>
				)}

				{!selectedId && !isLoading && (
					<div className="py-8 text-center text-sm text-muted-foreground">Select an item to view details</div>
				)}

				{item && !isLoading && (
					<div className="space-y-3">
						{columns.map(column => {
							const value = column.render ? column.render(item) : String((item as any)[column.key] ?? '');

							return (
								<div key={column.key} className="flex flex-col gap-1">
									<div className="text-xs font-medium text-muted-foreground">{column.label}</div>
									<div className="text-sm">{value}</div>
								</div>
							);
						})}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
