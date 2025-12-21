import type { Meta, StoryObj } from '@storybook/react';

import { ThemeToggle } from './ThemeToggle';

/**
 * ThemeToggle component stories demonstrating light and dark mode states.
 * This UI component allows users to toggle between light and dark themes.
 */
const meta = {
	title: 'UI/ThemeToggle',
	component: ThemeToggle,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {
		theme: {
			control: 'select',
			options: ['light', 'dark'],
			description: 'Current theme',
		},
		onToggle: { action: 'toggled' },
	},
} satisfies Meta<typeof ThemeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

// Light mode (shows moon icon)
export const LightMode: Story = {
	args: {
		theme: 'light',
		onToggle: () => {},
	},
};

// Dark mode (shows sun icon)
export const DarkMode: Story = {
	args: {
		theme: 'dark',
		onToggle: () => {},
	},
};

// Both states showcase
export const BothStates: Story = {
	args: undefined as any,
	render: () => (
		<div className="flex gap-4">
			<div className="flex flex-col items-center gap-2">
				<ThemeToggle theme="light" onToggle={() => {}} />
				<span className="text-xs text-muted-foreground">Light Mode</span>
			</div>
			<div className="flex flex-col items-center gap-2">
				<ThemeToggle theme="dark" onToggle={() => {}} />
				<span className="text-xs text-muted-foreground">Dark Mode</span>
			</div>
		</div>
	),
};
