import type { Meta, StoryObj } from '@storybook/react';

import { PageContent } from './PageContent';

const meta = {
	title: 'UI/PageContent',
	component: PageContent,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
	argTypes: {
		className: {
			control: 'text',
			description: 'Additional CSS classes',
		},
		children: {
			control: false,
			description: 'Content to render',
		},
	},
} satisfies Meta<typeof PageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Simple content wrapper
 */
export const Default: Story = {
	args: {
		children: (
			<div>
				<p className="text-muted-foreground">
					This is a simple semantic wrapper for page content. It provides minimal styling and mainly serves to
					organize page structure.
				</p>
			</div>
		),
	},
};

/**
 * Content with custom background
 */
export const WithCustomBackground: Story = {
	args: {
		className: 'rounded-lg bg-muted p-4',
		children: (
			<div>
				<p className="text-foreground">PageContent with custom styling applied via className prop.</p>
			</div>
		),
	},
};

/**
 * Multiple sections
 */
export const WithMultipleSections: Story = {
	args: {
		children: (
			<>
				<section className="mb-6">
					<h3 className="mb-2 text-lg font-semibold">Section 1</h3>
					<p className="text-muted-foreground">First section content</p>
				</section>
				<section className="mb-6">
					<h3 className="mb-2 text-lg font-semibold">Section 2</h3>
					<p className="text-muted-foreground">Second section content</p>
				</section>
				<section>
					<h3 className="mb-2 text-lg font-semibold">Section 3</h3>
					<p className="text-muted-foreground">Third section content</p>
				</section>
			</>
		),
	},
};

/**
 * With form content
 */
export const WithForm: Story = {
	args: {
		className: 'space-y-4',
		children: (
			<form>
				<div>
					<label className="mb-2 block text-sm font-medium">Name</label>
					<input
						type="text"
						className="w-full rounded-md border border-input bg-background px-3 py-2"
						placeholder="Enter name"
					/>
				</div>
				<div>
					<label className="mb-2 block text-sm font-medium">Email</label>
					<input
						type="email"
						className="w-full rounded-md border border-input bg-background px-3 py-2"
						placeholder="Enter email"
					/>
				</div>
				<button
					type="submit"
					className={`
      rounded-md bg-primary px-4 py-2 text-primary-foreground
    `}
				>
					Submit
				</button>
			</form>
		),
	},
};

/**
 * With grid layout
 */
export const WithGrid: Story = {
	args: {
		className: 'grid gap-4 md:grid-cols-2 lg:grid-cols-3',
		children: (
			<>
				{[1, 2, 3, 4, 5, 6].map(i => (
					<div key={i} className="rounded-lg border border-border bg-card p-4">
						<h4 className="mb-2 font-semibold">Item {i}</h4>
						<p className="text-sm text-muted-foreground">Item description</p>
					</div>
				))}
			</>
		),
	},
};
