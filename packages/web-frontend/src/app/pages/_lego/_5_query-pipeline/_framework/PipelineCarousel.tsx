import { useState } from 'react';

import { Button } from '@framework/components/primitives/Button';
import { renderColumnValue } from '@framework/lego';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { usePipelineContext } from './PipelineContext';

/**
 * ===========================================================================================
 * PIPELINE CAROUSEL
 * ===========================================================================================
 *
 * Displays items horizontally with prev/next navigation.
 * Reads data from PipelineContext.
 *
 * Features:
 * - Horizontal scrollable layout
 * - Prev/Next navigation buttons
 * - Field visibility toggle
 * - Loading state
 *
 * ===========================================================================================
 */

export function PipelineCarousel<T extends { id: string }>() {
	const { items, loading, columns, pagination, setPage } = usePipelineContext<T>();
	const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set(columns.map(c => c.key as string)));

	const visibleColumnDefs = columns.filter(c => visibleFields.has(c.key as string));

	const renderCellValue = (item: T, colKey: keyof T) => {
		const col = columns.find(c => c.key === colKey);
		if (!col) {
			return null;
		}
		return renderColumnValue(col, item);
	};

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

	const toggleField = (key: string) => {
		const newSet = new Set(visibleFields);
		if (newSet.has(key)) {
			newSet.delete(key);
		} else {
			newSet.add(key);
		}
		setVisibleFields(newSet);
	};

	return (
		<div className="flex h-full flex-col gap-4">
			<div className="flex flex-wrap gap-2">
				{columns.map(col => (
					<Button
						key={col.key as string}
						size="sm"
						variant={visibleFields.has(col.key as string) ? 'default' : 'outline'}
						onClick={() => toggleField(col.key as string)}
					>
						{col.label}
					</Button>
				))}
			</div>

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
											{renderCellValue(item, col.key)}
										</div>
									))}
								</div>
							</div>
						))}
					</div>
				)}
			</div>

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
		</div>
	);
}
