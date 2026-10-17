import { cn } from '@framework/lib/utils';
import { type VariantProps, cva } from 'class-variance-authority';

import { useWorkspaceId } from './useWorkspaceId';

/**
 * ===========================================================================================
 * WORKSPACE INDICATOR - UI Component
 * ===========================================================================================
 *
 * Displays a colored badge with the current WORKSPACE_ID
 * Only shown when WORKSPACE_ID != 0 (hidden for main/production workspace)
 *
 * - Uses CVA for variant management (Radix Nova style)
 * - Uses theme colors instead of hardcoded colors
 * - Cycles through variants for different workspace IDs
 *
 * ===========================================================================================
 */

const workspaceBadgeVariants = cva(
	`
  flex items-center gap-1 rounded px-2 py-1 text-xs font-bold
`,
	{
		variants: {
			workspace: {
				1: 'bg-primary text-primary-foreground',
				2: 'bg-secondary text-secondary-foreground',
				3: 'bg-accent text-accent-foreground',
				4: 'border border-destructive/20 bg-destructive/10 text-destructive',
				5: 'border border-border bg-muted text-muted-foreground',
			},
		},
		defaultVariants: {
			workspace: 1,
		},
	}
);

type WorkspaceVariant = VariantProps<typeof workspaceBadgeVariants>['workspace'];

export interface WorkspaceIndicatorProps {
	/** Override workspace ID for testing/stories */
	workspaceId?: number;
}

export function WorkspaceIndicator({ workspaceId: overrideId }: WorkspaceIndicatorProps = {}) {
	const hookWorkspaceId = useWorkspaceId();
	const workspaceId = overrideId ?? hookWorkspaceId;

	// Don't render anything for main workspace (ID = 0)
	if (workspaceId === 0) {
		return null;
	}

	// Map workspace ID to variant (cycle through 1-5)
	const getWorkspaceVariant = (id: number): WorkspaceVariant => {
		const variant = ((id - 1) % 5) + 1;
		return variant as WorkspaceVariant;
	};

	const variant = getWorkspaceVariant(workspaceId);

	return (
		<div className={cn(workspaceBadgeVariants({ workspace: variant }))}>
			<span>WS</span>
			<span>{workspaceId}</span>
		</div>
	);
}
