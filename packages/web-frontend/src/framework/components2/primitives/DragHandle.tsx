import { cn } from '@framework/lib/utils';
import { GripVertical } from 'lucide-react';

/**
 * ===========================================================================================
 * DRAG HANDLE - Reusable Drag Handle Component
 * ===========================================================================================
 *
 * Generic drag handle button component for use with dnd-kit sortable items.
 * Provides consistent styling and behavior across the application.
 *
 * Features:
 * - Visual grab cursor feedback
 * - Touch-none for better drag experience
 * - Disabled state support with opacity
 * - Hover effects
 * - Active cursor change during drag
 *
 * Example usage:
 * ```typescript
 * <DragHandle
 *   {...attributes}
 *   {...listeners}
 *   disabled={false}
 * />
 * ```
 *
 * ===========================================================================================
 */

export interface DragHandleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	/** Whether the drag handle is disabled */
	disabled?: boolean;
}

export function DragHandle({ disabled = false, className, ...props }: DragHandleProps) {
	return (
		<button
			type="button"
			className={cn(
				'cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing',
				disabled && 'cursor-not-allowed opacity-50',
				className
			)}
			disabled={disabled}
			{...props}
		>
			<GripVertical className="size-4" />
		</button>
	);
}
