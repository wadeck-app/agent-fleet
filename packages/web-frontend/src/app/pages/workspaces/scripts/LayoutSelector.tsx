import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@framework/components/forms/Select';
import { Grid2x2, Maximize, SplitSquareHorizontal } from 'lucide-react';

import type { LayoutMode } from './usePanelLayout';

interface LayoutSelectorProps {
	mode: LayoutMode;
	onChange: (mode: LayoutMode) => void;
}

const LAYOUT_OPTIONS: Array<{
	value: LayoutMode;
	label: string;
	icon: React.ReactNode;
	description: string;
}> = [
	{
		value: 'full',
		label: 'Full Width',
		icon: <Maximize className="size-4" />,
		description: '1 panel, full width',
	},
	{
		value: 'split',
		label: 'Split',
		icon: <SplitSquareHorizontal className="size-4" />,
		description: '2 panels, 50/50',
	},
	{
		value: 'grid',
		label: 'Grid 2x2',
		icon: <Grid2x2 className="size-4" />,
		description: '4 panels in grid',
	},
];

/**
 * Dropdown to select layout mode for script panels
 *
 * Modes:
 * - Full Width: 1 panel
 * - Split: 2 panels (50/50)
 * - Grid 2x2: 4 panels in a 2x2 grid
 */
export function LayoutSelector({ mode, onChange }: LayoutSelectorProps) {
	const selectedLayout = LAYOUT_OPTIONS.find(opt => opt.value === mode);

	return (
		<Select value={mode} onValueChange={val => onChange(val as LayoutMode)}>
			<SelectTrigger className="w-40">
				<SelectValue>
					<div className="flex items-center gap-2">
						{selectedLayout?.icon}
						<span>{selectedLayout?.label}</span>
					</div>
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{LAYOUT_OPTIONS.map(option => (
					<SelectItem key={option.value} value={option.value}>
						<div className="flex items-center gap-2">
							{option.icon}
							<div className="flex flex-col">
								<span className="font-medium">{option.label}</span>
								<span className="text-xs text-muted-foreground">{option.description}</span>
							</div>
						</div>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
