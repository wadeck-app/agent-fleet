import React, { useMemo, useState } from 'react';

import { Input } from '@framework/components/forms/Input';
import { Popover, PopoverContent, PopoverTrigger } from '@framework/components/forms/Popover';
import { DynamicLucideIcon, type IconName } from '@framework/components/icons/DynamicLucideIcon';
import { Button } from '@framework/components/primitives/Button';
import { cn } from '@framework/lib/utils';
import { Check, Search } from 'lucide-react';

// 90 available icons organized by category
const AVAILABLE_ICONS: IconName[] = [
	// Development & Code
	'FolderKanban',
	'Code',
	'Terminal',
	'FileCode',
	'GitBranch',
	'Bug',
	'TestTube',
	'Binary',
	'Braces',
	'CodeSquare',
	// Devices & Hardware
	'Laptop',
	'Server',
	'Database',
	'Cloud',
	'Cpu',
	'HardDrive',
	'Wifi',
	'Smartphone',
	'Monitor',
	'Tablet',
	// Organization & Structure
	'Boxes',
	'Package',
	'Layers',
	'Grid3x3',
	'LayoutGrid',
	'Workflow',
	'Folder',
	'Archive',
	'Inbox',
	'FileStack',
	// Actions & Progress
	'Rocket',
	'Zap',
	'Target',
	'TrendingUp',
	'Activity',
	'BarChart',
	'PieChart',
	'LineChart',
	'Play',
	'FastForward',
	// Tools & Settings
	'Settings2',
	'Cog',
	'Hammer',
	'Wrench',
	'Sliders',
	'Filter',
	'Search',
	'ScanLine',
	'Gauge',
	// Communication & Social
	'MessageSquare',
	'Mail',
	'Bell',
	'Users',
	'User',
	'UserPlus',
	'Globe',
	'Share2',
	'Link',
	'Megaphone',
	// Business & Professional
	'Briefcase',
	'BookOpen',
	'GraduationCap',
	'Award',
	'Trophy',
	'Crown',
	'Building',
	'Store',
	'ShoppingCart',
	'CreditCard',
	// Creative & Design
	'Sparkles',
	'Palette',
	'Paintbrush',
	'Image',
	'Camera',
	'Video',
	'Music',
	'Lightbulb',
	'Feather',
	'Pen',
	// Status & Indicators
	'Star',
	'Heart',
	'Shield',
	'Lock',
	'Key',
	'Eye',
	'CheckCircle',
	'AlertCircle',
	'Info',
	'Flag',
];

interface IconPickerProps {
	value?: string;
	onChange: (iconName: string) => void;
	iconColor?: string;
	disabled?: boolean;
	className?: string;
}

export function IconPicker({ value, onChange, iconColor = '#6366F1', disabled, className }: IconPickerProps) {
	const [open, setOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');

	const filteredIcons = useMemo(() => {
		if (!searchQuery) return AVAILABLE_ICONS;
		const query = searchQuery.toLowerCase();
		return AVAILABLE_ICONS.filter(icon => icon.toLowerCase().includes(query));
	}, [searchQuery]);

	const handleIconSelect = (iconName: string) => {
		onChange(iconName);
		setOpen(false);
		setSearchQuery('');
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					disabled={disabled}
					className={cn(
						`
        flex h-8 w-full items-center gap-2 rounded-lg border border-input
        bg-transparent px-2.5 text-sm transition-colors outline-none
        hover:bg-accent hover:text-accent-foreground
        focus-visible:border-ring focus-visible:ring-[3px]
        focus-visible:ring-ring/50
        disabled:pointer-events-none disabled:cursor-not-allowed
        disabled:opacity-50
      `,
						className
					)}
				>
					{value ? (
						<>
							<DynamicLucideIcon name={value} color={iconColor} className="h-4 w-4" />
							<span className="flex-1 text-left">{value}</span>
						</>
					) : (
						<span className="flex-1 text-left text-muted-foreground">Select an icon...</span>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-96 p-3" align="start">
				<div className="space-y-3">
					{/* Search input */}
					<div className="relative">
						<Search
							className={`
         absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2
         text-muted-foreground
       `}
						/>
						<Input
							type="text"
							placeholder="Search icons..."
							value={searchQuery}
							onChange={e => setSearchQuery(e.target.value)}
							className="pl-9"
						/>
					</div>

					{/* Icon grid */}
					<div
						className="max-h-80 overflow-y-auto"
						onWheel={e => {
							// Prevent event from bubbling to parent Popover
							// This allows mouse wheel scroll to work inside the scrollable area
							e.stopPropagation();
						}}
					>
						{filteredIcons.length > 0 ? (
							<div className="grid grid-cols-8 gap-1">
								{filteredIcons.map(iconName => (
									<Button
										key={iconName}
										type="button"
										variant="ghost"
										onClick={() => handleIconSelect(iconName)}
										className={cn(
											`
             relative flex h-10 w-10 items-center justify-center rounded-md
             border border-transparent transition-colors
             hover:border-border hover:bg-accent
           `,
											value === iconName && 'border-border bg-accent'
										)}
										title={iconName}
									>
										<DynamicLucideIcon name={iconName} color={iconColor} className={`h-5 w-5`} />
										{value === iconName && (
											<Check className="absolute -top-0.5 -right-0.5 h-3 w-3 text-primary" />
										)}
									</Button>
								))}
							</div>
						) : (
							<div className="py-6 text-center text-sm text-muted-foreground">No icons found</div>
						)}
					</div>

					{/* Icon count */}
					<div className="text-center text-xs text-muted-foreground">
						{filteredIcons.length} icon{filteredIcons.length !== 1 ? 's' : ''}
						{searchQuery && ` matching "${searchQuery}"`}
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
