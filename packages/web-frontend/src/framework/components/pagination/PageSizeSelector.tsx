/**
 * ===========================================================================================
 * PAGE SIZE SELECTOR
 * ===========================================================================================
 *
 * Generic component for selecting the number of items per page.
 * Fully decoupled from tables and pagination - can be used anywhere.
 *
 * Features:
 * - Customizable page size options
 * - Optional label with show/hide control
 * - Small and default size variants
 * - Full accessibility support
 * - Keyboard navigation via Radix UI Select
 *
 * Usage:
 *   ```tsx
 *   const [pageSize, setPageSize] = useState(10);
 *
 *   <PageSizeSelector
 *     value={pageSize}
 *     onChange={setPageSize}
 *     options={[5, 10, 20, 50]}
 *   />
 *   ```
 *
 * ===========================================================================================
 */
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@framework/components/forms/Select';
import { cn } from '@framework/lib/utils';

export interface PageSizeSelectorProps {
	/** Current page size value */
	value: number;
	/** Callback when page size changes */
	onChange: (pageSize: number) => void;
	/** Available page size options (default: [5, 10, 20, 50]) */
	options?: number[];
	/** Disabled state */
	disabled?: boolean;
	/** Label text (default: "Items per page:") */
	label?: string;
	/** Show label (default: true) */
	showLabel?: boolean;
	/** Size variant (default: 'sm') */
	size?: 'sm' | 'default';
	/** Additional CSS classes */
	className?: string;
	/** Accessibility label (used when label is hidden) */
	'aria-label'?: string;
}

const DEFAULT_OPTIONS = [5, 10, 20, 50];

export function PageSizeSelector({
	value,
	onChange,
	options = DEFAULT_OPTIONS,
	disabled = false,
	label = 'Items per page:',
	showLabel = true,
	size = 'sm',
	className,
	'aria-label': ariaLabel,
}: PageSizeSelectorProps) {
	const handleValueChange = (newValue: string) => {
		const numValue = parseInt(newValue, 10);
		if (!isNaN(numValue)) {
			onChange(numValue);
		}
	};

	return (
		<div className={cn('flex items-center gap-2', className)}>
			{showLabel && (
				<span
					className={`
     text-sm whitespace-nowrap text-muted-foreground
   `}
				>
					{label}
				</span>
			)}
			<Select value={String(value)} onValueChange={handleValueChange} disabled={disabled}>
				<SelectTrigger
					size={size}
					className="w-[70px]"
					aria-label={ariaLabel || (showLabel ? undefined : label)}
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{options.map(option => (
						<SelectItem key={option} value={String(option)}>
							{option}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
