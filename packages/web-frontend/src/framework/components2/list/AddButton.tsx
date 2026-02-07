import { Button } from '@framework/components/primitives/Button';
import { cn } from '@framework/lib/utils';
import { Plus } from 'lucide-react';

/**
 * ===========================================================================================
 * ADD BUTTON - Reusable Add Item Button Component
 * ===========================================================================================
 *
 * Specialized button component for adding new items to lists.
 * Provides consistent styling and behavior across all editable list fields.
 *
 * Features:
 * - Plus icon for visual consistency
 * - Outline variant with dashed border
 * - Full width with centered content
 * - Disabled state support
 * - Gap spacing for icon and text
 * - Top margin for separation from list
 *
 * Example usage:
 * ```typescript
 * <AddButton
 *   onClick={() => actions.add(createDefault())}
 *   disabled={!canAdd}
 * >
 *   Add Variable
 * </AddButton>
 * ```
 *
 * ===========================================================================================
 */

export interface AddButtonProps {
	/** Button label text */
	children: React.ReactNode;
	/** Callback function to handle item addition */
	onClick: () => void;
	/** Whether the button is disabled */
	disabled?: boolean;
	/** Additional CSS classes */
	className?: string;
}

export function AddButton({ children, onClick, disabled = false, className }: AddButtonProps) {
	return (
		<Button
			type="button"
			variant="outline"
			size="sm"
			onClick={onClick}
			disabled={disabled}
			className={cn('mt-3 w-full justify-center gap-2 border-dashed', className)}
		>
			<Plus className="size-4" />
			{children}
		</Button>
	);
}
