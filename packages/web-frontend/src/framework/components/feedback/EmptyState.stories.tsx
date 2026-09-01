import type { Meta, StoryObj } from '@storybook/react';

import { EmptyState } from './EmptyState';

/**
 * EmptyState component stories demonstrating various empty state patterns.
 * Pure presentation component for showing empty states with optional actions.
 */
const meta = {
	title: 'UI/EmptyState',
	component: EmptyState,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
	argTypes: {
		title: {
			control: 'text',
			description: 'Main heading for the empty state',
		},
		description: {
			control: 'text',
			description: 'Optional description text',
		},
		action: {
			description: 'Optional action button with label and callback',
		},
	},
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

// Icon component for stories
const BoxIcon = () => (
	// violations-suppress: react/no-inline-svg story fixture
	<svg className="size-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
		<path
			strokeLinecap="round"
			strokeLinejoin="round"
			d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
		/>
	</svg>
);

const BookIcon = () => (
	// violations-suppress: react/no-inline-svg story fixture
	<svg className="size-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
		<path
			strokeLinecap="round"
			strokeLinejoin="round"
			d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
		/>
	</svg>
);

const SearchIcon = () => (
	// violations-suppress: react/no-inline-svg story fixture
	<svg className="size-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
		<path
			strokeLinecap="round"
			strokeLinejoin="round"
			d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
		/>
	</svg>
);

// Basic empty state
export const Default: Story = {
	args: {
		title: 'No items found',
		description: 'There are no items to display at this time.',
	},
};

// With icon
export const WithIcon: Story = {
	args: {
		icon: <BoxIcon />,
		title: 'No items found',
		description: 'There are no items to display at this time.',
	},
};

// With action
export const WithAction: Story = {
	args: {
		icon: <BoxIcon />,
		title: 'No items found',
		description: 'Get started by creating your first item.',
		action: {
			label: 'Create Item',
			onClick: () => console.log('Create clicked'),
		},
	},
};

// No books scenario
export const NoBooks: Story = {
	args: {
		icon: <BookIcon />,
		title: 'No books in your library',
		description: 'Start building your collection by adding your first book.',
		action: {
			label: 'Add Book',
			onClick: () => console.log('Add book clicked'),
		},
	},
};

// Search results empty
export const NoSearchResults: Story = {
	args: {
		icon: <SearchIcon />,
		title: 'No results found',
		description: "Try adjusting your search terms or filters to find what you're looking for.",
	},
};

// Minimal - title only
export const TitleOnly: Story = {
	args: {
		title: 'Nothing to show',
	},
};

// In card context
export const InCard: Story = {
	args: undefined as any,
	render: () => (
		<div className="w-full max-w-2xl rounded-lg border border-border bg-card">
			<div className="border-b border-border p-4">
				<h2 className="text-xl font-semibold">Recent Activity</h2>
			</div>
			<EmptyState
				icon={<BoxIcon />}
				title="No recent activity"
				description="Your recent activity will appear here once you start using the application."
			/>
		</div>
	),
};

// Multiple empty states
export const Comparison: Story = {
	args: undefined as any,
	render: () => (
		<div
			className={`
     grid gap-6
     md:grid-cols-2
   `}
		>
			<div className="rounded-lg border border-border bg-card">
				<div className="border-b border-border p-4">
					<h3 className="font-semibold">Messages</h3>
				</div>
				<EmptyState
					title="No messages"
					description="You don't have any messages yet."
					action={{
						label: 'Send Message',
						onClick: () => {},
					}}
				/>
			</div>
			<div className="rounded-lg border border-border bg-card">
				<div className="border-b border-border p-4">
					<h3 className="font-semibold">Notifications</h3>
				</div>
				<EmptyState title="All caught up!" description="You have no new notifications." />
			</div>
		</div>
	),
};
