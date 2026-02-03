import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { cn } from '@framework/lib/utils';
import type { WorkspaceScript } from '@shared/api/workspaceScripts.contract';
import { ArrowRight, GripVertical } from 'lucide-react';

/**
 * ===========================================================================================
 * SORTABLE CONFIGURED SCRIPT ITEM COMPONENT
 * ===========================================================================================
 *
 * Draggable configured script item with dissociate button.
 *
 * Features:
 * - Drag handle with visual feedback (GripVertical icon)
 * - Script name display (font-mono)
 * - Status badge (running/stopped)
 * - Arrow right button (→) to remove the script
 * - Visual feedback during drag (opacity, transform)
 * - Touch-friendly (supports dnd-kit touch sensors)
 *
 * Usage:
 *   <SortableConfiguredScriptItem
 *     script={script}
 *     onRemove={handleRemove}
 *     isLoading={false}
 *     status="running"
 *   />
 *
 * ===========================================================================================
 */

export interface SortableConfiguredScriptItemProps {
	/** Script to display */
	script: WorkspaceScript;
	/** Callback when remove button is clicked */
	onRemove: (scriptId: string) => void;
	/** Whether this item is in a loading state */
	isLoading?: boolean;
	/** Whether this item is being reordered */
	isReordering?: boolean;
	/** Script status (for badge display) */
	status?: 'running' | 'stopped' | 'error';
}

export function SortableConfiguredScriptItem({
	script,
	onRemove,
	isLoading = false,
	isReordering = false,
	status = 'stopped',
}: SortableConfiguredScriptItemProps) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: script.id,
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		// Only set opacity for dragging state - let CSS classes handle loading/reordering
		...(isDragging ? { opacity: 0.5 } : {}),
	};

	const displayName = script.displayName || script.scriptName;

	// Badge variant based on status
	const badgeVariant = status === 'running' ? 'default' : status === 'error' ? 'destructive' : 'secondary';
	const statusSymbol = status === 'running' ? '●' : status === 'error' ? '✕' : '○';

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn(
				'flex items-center gap-1 rounded-sm transition-colors',
				'hover:bg-accent',
				(isLoading || isReordering) && 'pointer-events-none opacity-50',
				isDragging && 'z-50'
			)}
		>
			{/* Drag Handle */}
			{/* eslint-disable-next-line no-restricted-syntax */}
			<button
				{...attributes}
				{...listeners}
				className={cn(
					'cursor-grab touch-none p-2 opacity-40 transition-opacity duration-150',
					'hover:opacity-70',
					'active:cursor-grabbing'
				)}
				aria-label={`Reorder ${displayName}`}
				title="Drag to reorder"
			>
				<GripVertical className="h-4 w-4" />
			</button>

			{/* Script Name */}
			<span className="flex-1 px-2 py-1.5 font-mono text-sm">{displayName}</span>

			{/* Status Badge */}
			<Badge variant={badgeVariant} className="text-xs" title={`Status: ${status}`}>
				{statusSymbol}
			</Badge>

			{/* Remove Button (Arrow Right) - Positioned on the right */}
			<Button
				variant="ghost"
				size="icon-xs"
				onClick={e => {
					e.stopPropagation();
					if (!isDragging) {
						onRemove(script.id);
					}
				}}
				disabled={isLoading}
				className={cn(
					`
       mr-1 opacity-70
       hover:opacity-100
     `,
					isDragging && 'pointer-events-none'
				)}
				aria-label={`Remove ${displayName}`}
				title="Remove script"
			>
				<ArrowRight className="size-5" />
			</Button>
		</div>
	);
}
