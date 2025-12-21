import type { Meta, StoryObj } from '@storybook/react';

import { Page } from './Page';

const meta = {
	title: 'UI/Page',
	component: Page,
	parameters: {
		layout: 'fullscreen',
	},
	tags: ['autodocs'],
	argTypes: {
		className: {
			control: 'text',
			description: 'Additional CSS classes to apply',
		},
		children: {
			control: false,
			description: 'Content to render inside the page container',
		},
	},
} satisfies Meta<typeof Page>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default page with simple content
 */
export const Default: Story = {
	args: {
		children: (
			<div>
				<h1 className="mb-4 text-3xl font-bold">Page Title</h1>
				<p className="text-muted-foreground">
					This is a simple page with default container styling. The page provides responsive centering,
					max-width constraint, and consistent padding.
				</p>
			</div>
		),
	},
};

/**
 * Page with custom background color
 */
export const WithCustomBackground: Story = {
	args: {
		className: 'bg-accent',
		children: (
			<div>
				<h1 className="mb-4 text-3xl font-bold">Custom Styled Page</h1>
				<p className="text-muted-foreground">
					This page demonstrates using the className prop to add custom styling, in this case a background
					color.
				</p>
			</div>
		),
	},
};

/**
 * Page with multiple sections
 */
export const WithMultipleSections: Story = {
	args: {
		children: (
			<>
				<section className="mb-8">
					<h1 className="mb-4 text-3xl font-bold">Section 1</h1>
					<p className="text-muted-foreground">First section content</p>
				</section>
				<section className="mb-8">
					<h2 className="mb-4 text-2xl font-bold">Section 2</h2>
					<p className="text-muted-foreground">Second section content</p>
				</section>
				<section>
					<h2 className="mb-4 text-2xl font-bold">Section 3</h2>
					<p className="text-muted-foreground">Third section content</p>
				</section>
			</>
		),
	},
};

/**
 * Page with complex layout (cards)
 */
export const WithCards: Story = {
	args: {
		children: (
			<>
				<h1 className="mb-6 text-3xl font-bold">Dashboard</h1>
				<div
					className={`
      grid gap-4
      md:grid-cols-2
      lg:grid-cols-3
    `}
				>
					{[1, 2, 3, 4, 5, 6].map(i => (
						<div
							key={i}
							className={`
        rounded-lg border border-border bg-card p-6 shadow-sm
      `}
						>
							<h3 className="mb-2 text-xl font-semibold">Card {i}</h3>
							<p className="text-muted-foreground">Card content goes here</p>
						</div>
					))}
				</div>
			</>
		),
	},
};
