import { useState } from 'react';

import { Button } from '@framework/components/primitives/Button';
import { cn } from '@framework/lib/utils';
import { ChevronDown, ChevronRight } from 'lucide-react';

const collapsibleToggleCls =
	'flex flex-1 items-center justify-start gap-2 px-3 py-2 text-sm font-medium hover:bg-muted/50 rounded-tl-md rounded-bl-md';

interface CollapsibleSectionProps {
	title: string;
	defaultOpen?: boolean;
	/** Optional content rendered on the right side of the header (e.g., a link or button) */
	headerRight?: React.ReactNode;
	children: React.ReactNode;
	className?: string;
}

/**
 * Generic collapsible section with a chevron toggle, title, and optional right-side header content.
 *
 * Usage:
 *   <CollapsibleSection title="Reasoning" defaultOpen={false}>
 *     <p>...</p>
 *   </CollapsibleSection>
 */
export function CollapsibleSection({
	title,
	defaultOpen = true,
	headerRight,
	children,
	className,
}: CollapsibleSectionProps) {
	const [open, setOpen] = useState(defaultOpen);

	return (
		<div className={cn('rounded-md', className)}>
			<div className="flex items-center">
				<Button
					type="button"
					variant="ghost"
					onClick={() => setOpen(v => !v)}
					className={collapsibleToggleCls}
					aria-expanded={open}
				>
					{open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
					{title}
				</Button>
				{headerRight && <div className="px-3 py-2 flex items-center">{headerRight}</div>}
			</div>
			{open && <div className="px-3 py-3">{children}</div>}
		</div>
	);
}
