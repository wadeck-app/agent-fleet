import { Button } from '@framework/components/primitives/Button';
import { cn } from '@framework/lib/utils';
import { Trash2 } from 'lucide-react';

/**
 * ===========================================================================================
 * REMOVE ITEM BUTTON - Reusable Remove Button Component
 * ===========================================================================================
 *
 * Specialized button component for removing items from lists.
 * Provides consistent styling and behavior across all list renderers.
 *
 * Features:
 * - Trash icon with destructive color
 * - Ghost variant for minimal visual weight
 * - Small size for compact layouts
 * - Disabled state support
 * - Accessible title attribute
 * - No-shrink behavior for consistent sizing
 *
 * Example usage:
 * ```typescript
 * <RemoveItemButton
 *   onRemove={() => actions.remove()}
 *   disabled={!canRemove}
 *   title="Remove this item"
 * />
 * ```
 *
 * ===========================================================================================
 */

export interface RemoveItemButtonProps {
	/** Callback function to handle item removal */
	onRemove: () => void;
	/** Whether the button is disabled */
	disabled?: boolean;
	/** Additional CSS classes */
	className?: string;
	/** Accessible title/tooltip text */
	title?: string;
}

export function RemoveItemButton({
	onRemove,
	disabled = false,
	className,
	title = 'Remove item',
}: RemoveItemButtonProps) {
	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-sm"
			onClick={onRemove}
			disabled={disabled}
			title={title}
			className={cn('shrink-0', className)}
		>
			<Trash2 className="size-4 text-destructive" />
		</Button>
	);
}
