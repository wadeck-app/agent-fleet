import type { Meta, StoryObj } from '@storybook/react';

import { WorkspaceIndicator } from './WorkspaceIndicator';

/**
 * WorkspaceIndicator displays a colored badge with the current WORKSPACE_ID.
 *
 * ## Features
 * - Only shown when WORKSPACE_ID != 0 (hidden for main/production workspace)
 * - Uses CVA for variant management (Radix Nova style)
 * - Uses theme colors instead of hardcoded colors
 * - Cycles through 5 variants for different workspace IDs
 *
 * ## Variants
 * - Workspace 1: bg-primary
 * - Workspace 2: bg-secondary
 * - Workspace 3: bg-accent
 * - Workspace 4: bg-destructive/10
 * - Workspace 5: bg-muted
 * - Workspace 6-10: Cycles through variants again
 */
const meta = {
	title: 'UI/WorkspaceIndicator',
	component: WorkspaceIndicator,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	decorators: [
		Story => (
			<div className="p-8">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof WorkspaceIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Workspace 0 (main/production) - Should not render anything
 */
export const MainWorkspace: Story = {
	args: {} as never,
	render: () => (
		<div className="text-sm text-muted-foreground">
			<p>Main workspace (ID=0) does not show indicator</p>
			<WorkspaceIndicator workspaceId={0} />
		</div>
	),
};

/**
 * Show all 5 variants (workspaces 1-5)
 */
export const AllVariants: Story = {
	args: {} as never,
	render: () => {
		const WorkspaceCard = ({ id }: { id: number }) => (
			<div
				className={`
      flex flex-col items-center gap-2 rounded-lg border border-border p-4
    `}
			>
				<WorkspaceIndicator workspaceId={id} />
				<span className="text-xs text-muted-foreground">Workspace {id}</span>
				<span className="text-[10px] text-muted-foreground">
					{id === 1 && 'primary'}
					{id === 2 && 'secondary'}
					{id === 3 && 'accent'}
					{id === 4 && 'destructive/10'}
					{id === 5 && 'muted'}
				</span>
			</div>
		);

		return (
			<div className="flex flex-wrap gap-4">
				{[1, 2, 3, 4, 5].map(id => (
					<WorkspaceCard key={id} id={id} />
				))}
			</div>
		);
	},
};

/**
 * Show cycling pattern (workspaces 6-10 cycle through variants)
 */
export const CyclingPattern: Story = {
	args: {} as never,
	render: () => {
		const WorkspaceCard = ({ id }: { id: number }) => {
			const variantIndex = ((id - 1) % 5) + 1;
			const variantNames = ['primary', 'secondary', 'accent', 'destructive/10', 'muted'];

			return (
				<div
					className={`
       flex flex-col items-center gap-2 rounded-lg border border-border p-4
     `}
				>
					<WorkspaceIndicator workspaceId={id} />
					<span className="text-xs text-muted-foreground">Workspace {id}</span>
					<span className="text-[10px] text-muted-foreground">
						variant {variantIndex} ({variantNames[variantIndex - 1]})
					</span>
				</div>
			);
		};

		return (
			<div>
				<p className="mb-4 text-sm text-muted-foreground">Workspaces 6-10 cycle through the same 5 variants</p>
				<div className="flex flex-wrap gap-4">
					{[6, 7, 8, 9, 10].map(id => (
						<WorkspaceCard key={id} id={id} />
					))}
				</div>
			</div>
		);
	},
};
