import { Button } from '@framework/components/primitives/Button';
import { cn } from '@framework/lib/utils';
import type { AvailableScript } from '@shared/api/workspaceScripts.contract';
import { ArrowLeft } from 'lucide-react';

/**
 * ===========================================================================================
 * AVAILABLE SCRIPT ITEM COMPONENT
 * ===========================================================================================
 *
 * Non-configured script item with associate button.
 *
 * Features:
 * - Script name display (font-medium)
 * - Command display (text-xs text-muted-foreground)
 * - Arrow left button (←) to add the script
 * - Hover effect
 * - Loading state during API calls
 *
 * Usage:
 *   <AvailableScriptItem
 *     script={script}
 *     onAdd={handleAdd}
 *     isLoading={false}
 *   />
 *
 * ===========================================================================================
 */

export interface AvailableScriptItemProps {
	/** Available script to display */
	script: AvailableScript;
	/** Callback when add button is clicked */
	onAdd: (scriptName: string) => void;
	/** Whether this item is in a loading state */
	isLoading?: boolean;
	/** Whether this script is already added */
	isAdded?: boolean;
}

export function AvailableScriptItem({ script, onAdd, isLoading = false, isAdded = false }: AvailableScriptItemProps) {
	return (
		<div
			className={cn(
				'flex items-center gap-2 rounded-sm px-2 py-1.5 transition-colors',
				'hover:bg-accent',
				isLoading && 'pointer-events-none opacity-50'
			)}
		>
			{/* Add Button (Arrow Left) - Positioned on the left */}
			<Button
				variant="ghost"
				size="icon-xs"
				onClick={e => {
					e.stopPropagation();
					onAdd(script.name);
				}}
				disabled={isLoading || isAdded}
				className={`
      opacity-70
      hover:opacity-100
    `}
				aria-label={`Add ${script.name}`}
				title="Add script"
			>
				<ArrowLeft className="size-5" />
			</Button>

			{/* Script Details */}
			<div className="min-w-0 flex-1">
				{/* Script Name */}
				<div className="text-sm font-medium">{script.name}</div>
				{/* Command */}
				<div className="truncate font-mono text-xs text-muted-foreground">{script.command}</div>
			</div>
		</div>
	);
}
