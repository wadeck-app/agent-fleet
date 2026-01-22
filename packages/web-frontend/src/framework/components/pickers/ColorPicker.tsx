import { Check } from 'lucide-react';

import { Button } from '../primitives/Button';

export interface ColorPickerProps {
	value?: string;
	onChange: (color: string) => void;
	/**
	 * Default color if none selected
	 * @default "#6366F1"
	 */
	defaultColor?: string;
}

// Predefined color palette - vibrant colors that stand out well
const COLORS = [
	{ name: 'Indigo', value: '#6366F1' },
	{ name: 'Violet', value: '#A855F7' },
	{ name: 'Pink', value: '#EC4899' },
	{ name: 'Red', value: '#EF4444' },
	{ name: 'Orange', value: '#F97316' },
	{ name: 'Amber', value: '#F59E0B' },
	{ name: 'Yellow', value: '#EAB308' },
	{ name: 'Lime', value: '#84CC16' },
	{ name: 'Green', value: '#22C55E' },
	{ name: 'Emerald', value: '#10B981' },
	{ name: 'Teal', value: '#14B8A6' },
	{ name: 'Cyan', value: '#06B6D4' },
	{ name: 'Sky', value: '#0EA5E9' },
	{ name: 'Blue', value: '#3B82F6' },
	{ name: 'Slate', value: '#64748B' },
	{ name: 'Gray', value: '#6B7280' },
];

/**
 * ColorPicker - Select from a predefined palette of colors
 *
 * Displays a grid of color swatches for easy visual selection.
 * Much better UX than entering hex codes manually.
 *
 * @example
 * ```tsx
 * <ColorPicker
 *   value={iconColor}
 *   onChange={setIconColor}
 * />
 * ```
 */
export function ColorPicker({ value, onChange, defaultColor = '#6366F1' }: ColorPickerProps) {
	const selectedColor = value || defaultColor;

	return (
		<div className="space-y-2">
			<div className="grid grid-cols-8 gap-2">
				{COLORS.map(color => {
					const isSelected = selectedColor.toUpperCase() === color.value.toUpperCase();

					return (
						<Button
							key={color.value}
							variant="ghost"
							size="icon"
							onClick={() => onChange(color.value)}
							className={`
         relative h-10 w-10 cursor-pointer rounded-md border-2 transition-all
         hover:scale-110
         focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:outline-none
         ${
				isSelected
					? 'border-foreground ring-2 ring-primary'
					: `
           border-border
         `
			}
       `}
							style={{ backgroundColor: color.value }}
							title={color.name}
							aria-label={`Select ${color.name} color`}
						>
							{isSelected && (
								<div className="absolute inset-0 flex items-center justify-center">
									<Check className="h-5 w-5 text-white drop-shadow-lg" strokeWidth={3} />
								</div>
							)}
						</Button>
					);
				})}
			</div>
			<div className="flex items-center gap-2 text-xs text-muted-foreground">
				<span>Selected:</span>
				<div className="flex items-center gap-1.5">
					<div className="h-3 w-3 rounded border border-border" style={{ backgroundColor: selectedColor }} />
					<span className="font-mono">{selectedColor.toUpperCase()}</span>
				</div>
			</div>
		</div>
	);
}
