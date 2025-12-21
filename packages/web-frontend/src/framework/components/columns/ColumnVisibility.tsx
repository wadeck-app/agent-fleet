import { DndContext, type DragEndEvent, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Checkbox } from '@framework/components/forms/Checkbox';
import { Button } from '@framework/components/primitives/Button';
import { cn } from '@framework/lib/utils';
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';
import { Circle, Eye, EyeOff, RotateCcw, Settings, Undo2 } from 'lucide-react';

import { SortableColumnItem } from './SortableColumnItem';

// Radix UI content classes for consistent dropdown styling
const RADIX_CONTENT_CLASSES = cn(
	`
   z-50 rounded-md border bg-popover text-popover-foreground shadow-md
   outline-none
 `,
	`
   data-[state=closed]:animate-out
   data-[state=open]:animate-in
 `,
	`
   data-[state=closed]:fade-out-0
   data-[state=open]:fade-in-0
 `,
	`
   data-[state=closed]:zoom-out-95
   data-[state=open]:zoom-in-95
 `,
	'data-[side=bottom]:slide-in-from-top-2',
	'data-[side=left]:slide-in-from-right-2',
	'data-[side=right]:slide-in-from-left-2',
	'data-[side=top]:slide-in-from-bottom-2'
);

/**
 * ===========================================================================================
 * COLUMN VISIBILITY COMPONENT
 * ===========================================================================================
 *
 * Dropdown menu for toggling column visibility in tables.
 *
 * Features:
 * - Checkbox for each column
 * - Show/Hide all buttons
 * - Reset to default button
 * - Visual indicator of visible column count
 *
 * Usage:
 *   <ColumnVisibility
 *     columns={[
 *       { id: 'name', label: 'Name' },
 *       { id: 'email', label: 'Email' },
 *     ]}
 *     visibleColumns={visibleColumns}
 *     onToggle={toggleColumn}
 *     onReset={resetColumns}
 *     onShowAll={showAll}
 *     onHideAll={hideAll}
 *   />
 *
 * ===========================================================================================
 */

export interface ColumnDef {
	/** Unique column identifier */
	id: string;
	/** Display label for the column */
	label: string;
	/** Whether this column can be hidden (default: true) */
	canHide?: boolean;
}

export interface ColumnVisibilityProps {
	/** Column definitions */
	columns: ColumnDef[];
	/** Set of visible column IDs */
	visibleColumns: Set<string>;
	/** Set of default visible column IDs (for comparison to show badge) */
	defaultVisible?: Set<string>;
	/** Callback when a column is toggled */
	onToggle: (columnId: string) => void;
	/** Callback to reset to default columns */
	onReset: () => void;
	/** Callback to show all columns */
	onShowAll?: () => void;
	/** Callback to hide all columns */
	onHideAll?: () => void;
	/** Custom button label (default: "Columns") */
	label?: string;
	/** Additional CSS classes for the trigger button */
	className?: string;

	// ===== Phase 2 Enhancement: Hook functions (optional) =====
	/** Check if column visibility is modified (from visibility hook) */
	isColumnModified?: (columnId: string) => boolean;
	/** Reset single column visibility to default (from visibility hook) */
	onResetColumn?: (columnId: string) => void;

	// ===== Column Ordering (optional) =====
	/** Current column order (array of column IDs) - enables drag & drop */
	columnOrder?: string[];
	/** Default column order (for comparison to detect modifications) */
	defaultOrder?: string[];
	/** Callback when columns are reordered (swap activeId with overId) */
	onReorderColumns?: (activeId: string, overId: string) => void;
	/** Check if column order position is modified (from order hook) */
	isColumnModifiedOrder?: (columnId: string) => boolean;
	/** Reset single column order position to default (from order hook) */
	onResetColumnOrder?: (columnId: string) => void;
}

export function ColumnVisibility({
	columns,
	visibleColumns,
	defaultVisible,
	onToggle,
	onReset,
	onShowAll,
	onHideAll,
	label = 'Columns',
	className,
	// Phase 2: Hook functions (optional)
	isColumnModified: isColumnModifiedFromHook,
	onResetColumn,
	// Column ordering (optional)
	columnOrder,
	defaultOrder,
	onReorderColumns,
	isColumnModifiedOrder,
	onResetColumnOrder,
}: ColumnVisibilityProps) {
	const visibleCount = columns.filter(col => visibleColumns.has(col.id)).length;
	const totalCount = columns.length;

	// Check if current visibility differs from default
	const isDifferentFromDefault = defaultVisible
		? visibleColumns.size !== defaultVisible.size || Array.from(visibleColumns).some(id => !defaultVisible.has(id))
		: visibleCount < totalCount;

	const handleToggle = (columnId: string) => {
		// Validation is now handled in the hook
		// The hook will prevent hiding columns that have canHide: false
		onToggle(columnId);
	};

	// @formatter:off
	// Détermine si une colonne est modifiée par rapport à la configuration par défaut
	const isColumnModified = (columnId: string): boolean => {
		// Check visibility modification (use hook if provided, otherwise fallback)
		let visibilityModified = false;
		if (isColumnModifiedFromHook) {
			visibilityModified = isColumnModifiedFromHook(columnId);
		} else if (defaultVisible) {
			const isCurrentlyVisible = visibleColumns.has(columnId);
			const isDefaultVisible = defaultVisible.has(columnId);
			visibilityModified = isCurrentlyVisible !== isDefaultVisible;
		}

		// Check order modification (use hook if provided, otherwise fallback)
		let orderModified = false;
		if (isColumnModifiedOrder) {
			orderModified = isColumnModifiedOrder(columnId);
		} else if (columnOrder && defaultOrder) {
			const currentIndex = columnOrder.indexOf(columnId);
			const defaultIndex = defaultOrder.indexOf(columnId);
			orderModified = currentIndex !== defaultIndex;
		}

		// Column is modified if EITHER visibility OR order is modified
		return visibilityModified || orderModified;
	};

	// Réinitialise une colonne individuelle à sa valeur par défaut
	const handleResetColumn = (columnId: string) => {
		// Reset visibility (use hook if provided, otherwise fallback)
		if (onResetColumn) {
			onResetColumn(columnId);
		} else if (defaultVisible) {
			const shouldBeVisible = defaultVisible.has(columnId);
			if (shouldBeVisible !== visibleColumns.has(columnId)) {
				onToggle(columnId);
			}
		}

		// Reset order position (use hook if provided, otherwise fallback)
		if (onResetColumnOrder) {
			onResetColumnOrder(columnId);
		}
		// Note: No fallback for order reset - requires hook function
	};

	// Handle drag end event from dnd-kit
	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;

		if (over && active.id !== over.id && onReorderColumns) {
			onReorderColumns(active.id as string, over.id as string);
		}
	};

	// Reorder columns according to columnOrder (for display in dropdown)
	const orderedColumns = columnOrder
		? columnOrder.map(id => columns.find(col => col.id === id)).filter((col): col is ColumnDef => col !== undefined)
		: columns;
	// @formatter:on

	return (
		<RadixDropdownMenu.Root>
			<RadixDropdownMenu.Trigger asChild>
				<Button variant="outline" className={cn('gap-2', className)} aria-label="Toggle column visibility">
					<Settings className="h-4 w-4" />
					{label}
					{isDifferentFromDefault && (
						<span
							className={`
        ml-1 rounded-md bg-primary px-1.5 py-0.5 text-xs text-primary-foreground
      `}
						>
							{visibleCount}/{totalCount}
						</span>
					)}
				</Button>
			</RadixDropdownMenu.Trigger>

			<RadixDropdownMenu.Portal>
				<RadixDropdownMenu.Content
					className={cn(
						RADIX_CONTENT_CLASSES,
						'w-56 p-2',
						'transition-all duration-150 ease-out',
						`
        data-[state=closed]:animate-out
        data-[state=open]:animate-in
      `,
						`
        data-[state=closed]:fade-out-0
        data-[state=open]:fade-in-0
      `,
						`
        data-[state=closed]:zoom-out-95
        data-[state=open]:zoom-in-95
      `,
						'data-[side=bottom]:slide-in-from-top-2',
						'data-[side=left]:slide-in-from-right-2',
						'data-[side=right]:slide-in-from-left-2',
						'data-[side=top]:slide-in-from-bottom-2'
					)}
					align="end"
					sideOffset={4}
					collisionPadding={8}
					avoidCollisions={true}
				>
					{/* Content wrapper with min-height to prevent jump */}
					<div className="min-h-[200px]">
						{/* Action buttons */}
						<div className="mb-2 flex gap-1">
							{onShowAll && (
								<Button
									variant="ghost"
									size="sm"
									onClick={onShowAll}
									className="h-7 flex-1 gap-1 text-xs"
								>
									<Eye className="h-3 w-3" />
									Show All
								</Button>
							)}
							{onHideAll && (
								<Button
									variant="ghost"
									size="sm"
									onClick={onHideAll}
									className="h-7 flex-1 gap-1 text-xs"
								>
									<EyeOff className="h-3 w-3" />
									Hide All
								</Button>
							)}
						</div>

						<div className="mb-2 border-t" />

						{/* Column checkboxes (with or without drag & drop) */}
						<div className="max-h-64 space-y-1 overflow-y-auto">
							{columnOrder && onReorderColumns ? (
								// Render with drag & drop enabled
								<DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
									<SortableContext
										items={orderedColumns.map(col => col.id)}
										strategy={verticalListSortingStrategy}
									>
										{orderedColumns.map(column => {
											const isVisible = visibleColumns.has(column.id);
											const canHide = column.canHide !== false;
											const isModified = isColumnModified(column.id);

											return (
												<SortableColumnItem
													key={column.id}
													column={column}
													isVisible={isVisible}
													isModified={isModified}
													canHide={canHide}
													onToggle={() => handleToggle(column.id)}
													onResetColumn={() => handleResetColumn(column.id)}
												/>
											);
										})}
									</SortableContext>
								</DndContext>
							) : (
								// Fallback: render without drag & drop (backward compatible)
								<>
									{columns.map(column => {
										const isVisible = visibleColumns.has(column.id);
										const canHide = column.canHide !== false;
										const isDisabled = !canHide && isVisible;
										const isModified = isColumnModified(column.id);

										return (
											<div
												key={column.id}
												className={cn(
													`
               flex items-center gap-1 rounded-sm
               hover:bg-accent
             `,
													isDisabled && 'opacity-50'
												)}
											>
												{/* eslint-disable-next-line no-restricted-syntax */}
												<label
													className={cn(
														`
                flex flex-1 cursor-pointer items-center gap-2 px-2 py-1.5
                text-sm
              `,
														isDisabled && 'cursor-not-allowed'
													)}
													title={
														isDisabled
															? 'This column cannot be hidden'
															: isVisible
																? `Hide ${column.label}`
																: `Show ${column.label}`
													}
												>
													<Checkbox
														checked={isVisible}
														onCheckedChange={() => handleToggle(column.id)}
														disabled={isDisabled}
													/>
													<span className="flex-1">{column.label}</span>
													{isModified && (
														<span
															className="inline-flex items-center"
															title="Not default value"
															aria-label="Modified from default"
														>
															<Circle className="h-1.5 w-1.5 fill-primary text-primary" />
														</span>
													)}
												</label>
												{isModified && (
													<Button
														variant="ghost"
														size="icon-xs"
														onClick={e => {
															e.stopPropagation();
															handleResetColumn(column.id);
														}}
														className={`
                mr-1 opacity-70
                hover:opacity-100
              `}
														aria-label={`Reset ${column.label} to default`}
														title="Reset to default"
													>
														<Undo2 className="h-3 w-3" />
													</Button>
												)}
											</div>
										);
									})}
								</>
							)}
						</div>

						<div className="mt-2 border-t pt-2">
							<Button
								variant="ghost"
								size="sm"
								onClick={onReset}
								className={`
         h-7 w-full gap-1 text-xs
       `}
							>
								<RotateCcw className="h-3 w-3" />
								Reset to Default
							</Button>
						</div>
					</div>
				</RadixDropdownMenu.Content>
			</RadixDropdownMenu.Portal>
		</RadixDropdownMenu.Root>
	);
}
