import { useState } from 'react';

import { Button } from '@framework/components/primitives/Button';
import type { Meta, StoryObj } from '@storybook/react';

import { CrudDialog } from './CrudDialog';

/**
 * CrudDialog component stories demonstrating various CRUD operation dialogs.
 * Convenience wrapper for Dialog components with consistent structure.
 */
const meta = {
	title: 'UI/CrudDialog',
	component: CrudDialog,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {
		open: {
			control: 'boolean',
			description: 'Whether the dialog is open',
		},
		title: {
			control: 'text',
			description: 'Dialog title',
		},
		description: {
			control: 'text',
			description: 'Dialog description',
		},
		maxWidth: {
			control: 'select',
			options: ['sm', 'md', 'lg', 'xl', '2xl'],
			description: 'Maximum width of the dialog',
		},
		showCloseButton: {
			control: 'boolean',
			description: 'Show close button in top right corner',
		},
	},
} satisfies Meta<typeof CrudDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// Interactive wrapper component for stories
function DialogStoryWrapper({
	title,
	description,
	maxWidth,
	showCloseButton,
	children,
}: {
	title: string;
	description: string;
	maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
	showCloseButton?: boolean;
	children: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);

	return (
		<div>
			<Button onClick={() => setOpen(true)}>Open Dialog</Button>
			<CrudDialog
				open={open}
				onOpenChange={setOpen}
				title={title}
				description={description}
				maxWidth={maxWidth}
				showCloseButton={showCloseButton}
			>
				{children}
			</CrudDialog>
		</div>
	);
}

// Create mode - Ingredient
export const CreateIngredient: Story = {
	args: undefined as any,
	render: () => (
		<DialogStoryWrapper title="New Ingredient" description="Add a new ingredient to your database." maxWidth="2xl">
			<div className="space-y-4">
				<div>
					<label className="block text-sm font-medium">Name</label>
					<input
						type="text"
						className={`
        mt-1 w-full rounded-md border border-input bg-background px-3 py-2
      `}
						placeholder="Ingredient name"
					/>
				</div>
				<div>
					<label className="block text-sm font-medium">Category</label>
					<input
						type="text"
						className={`
        mt-1 w-full rounded-md border border-input bg-background px-3 py-2
      `}
						placeholder="Category"
					/>
				</div>
				<div className="flex justify-end gap-2">
					<Button variant="outline">Cancel</Button>
					<Button>Create Ingredient</Button>
				</div>
			</div>
		</DialogStoryWrapper>
	),
};

// Edit mode - Ingredient
export const EditIngredient: Story = {
	args: undefined as any,
	render: () => (
		<DialogStoryWrapper
			title="Edit Ingredient"
			description="Update the ingredient information below."
			maxWidth="2xl"
		>
			<div className="space-y-4">
				<div>
					<label className="block text-sm font-medium">Name</label>
					<input
						type="text"
						className={`
        mt-1 w-full rounded-md border border-input bg-background px-3 py-2
      `}
						defaultValue="Tomato"
					/>
				</div>
				<div>
					<label className="block text-sm font-medium">Category</label>
					<input
						type="text"
						className={`
        mt-1 w-full rounded-md border border-input bg-background px-3 py-2
      `}
						defaultValue="Vegetable"
					/>
				</div>
				<div className="flex justify-end gap-2">
					<Button variant="outline">Cancel</Button>
					<Button>Update Ingredient</Button>
				</div>
			</div>
		</DialogStoryWrapper>
	),
};

// Create mode - Book
export const CreateBook: Story = {
	args: undefined as any,
	render: () => (
		<DialogStoryWrapper title="New Book" description="Add a new book to your library." maxWidth="2xl">
			<div className="space-y-4">
				<div>
					<label className="block text-sm font-medium">Title</label>
					<input
						type="text"
						className={`
        mt-1 w-full rounded-md border border-input bg-background px-3 py-2
      `}
						placeholder="Book title"
					/>
				</div>
				<div>
					<label className="block text-sm font-medium">Author</label>
					<input
						type="text"
						className={`
        mt-1 w-full rounded-md border border-input bg-background px-3 py-2
      `}
						placeholder="Author name"
					/>
				</div>
				<div>
					<label className="block text-sm font-medium">ISBN</label>
					<input
						type="text"
						className={`
        mt-1 w-full rounded-md border border-input bg-background px-3 py-2
      `}
						placeholder="ISBN number"
					/>
				</div>
				<div className="flex justify-end gap-2">
					<Button variant="outline">Cancel</Button>
					<Button>Create Book</Button>
				</div>
			</div>
		</DialogStoryWrapper>
	),
};

// Small size
export const SmallSize: Story = {
	args: undefined as any,
	render: () => (
		<DialogStoryWrapper title="Confirm Action" description="Are you sure you want to proceed?" maxWidth="sm">
			<div className="flex justify-end gap-2">
				<Button variant="outline">Cancel</Button>
				<Button>Confirm</Button>
			</div>
		</DialogStoryWrapper>
	),
};

// Medium size
export const MediumSize: Story = {
	args: undefined as any,
	render: () => (
		<DialogStoryWrapper title="Quick Add" description="Add a new item quickly." maxWidth="md">
			<div className="space-y-4">
				<div>
					<label className="block text-sm font-medium">Name</label>
					<input
						type="text"
						className={`
        mt-1 w-full rounded-md border border-input bg-background px-3 py-2
      `}
					/>
				</div>
				<div className="flex justify-end gap-2">
					<Button variant="outline">Cancel</Button>
					<Button>Add</Button>
				</div>
			</div>
		</DialogStoryWrapper>
	),
};

// Large size
export const LargeSize: Story = {
	args: undefined as any,
	render: () => (
		<DialogStoryWrapper title="Detailed Form" description="Fill in all the details." maxWidth="lg">
			<div className="space-y-4">
				<div>
					<label className="block text-sm font-medium">Field 1</label>
					<input
						type="text"
						className={`
        mt-1 w-full rounded-md border border-input bg-background px-3 py-2
      `}
					/>
				</div>
				<div>
					<label className="block text-sm font-medium">Field 2</label>
					<input
						type="text"
						className={`
        mt-1 w-full rounded-md border border-input bg-background px-3 py-2
      `}
					/>
				</div>
				<div className="flex justify-end gap-2">
					<Button variant="outline">Cancel</Button>
					<Button>Submit</Button>
				</div>
			</div>
		</DialogStoryWrapper>
	),
};

// With close button
export const WithCloseButton: Story = {
	args: undefined as any,
	render: () => (
		<DialogStoryWrapper
			title="Dialog with Close Button"
			description="This dialog has a close button in the top right corner."
			maxWidth="md"
			showCloseButton={true}
		>
			<div className="space-y-4">
				<p className="text-sm">You can close this dialog using the X button above.</p>
				<div className="flex justify-end gap-2">
					<Button variant="outline">Cancel</Button>
					<Button>Save</Button>
				</div>
			</div>
		</DialogStoryWrapper>
	),
};

// Complex content
export const ComplexContent: Story = {
	args: undefined as any,
	render: () => (
		<DialogStoryWrapper
			title="Advanced Settings"
			description="Configure advanced options for your item."
			maxWidth="2xl"
		>
			<div className="space-y-6">
				<div className="space-y-4">
					<div>
						<label className="block text-sm font-medium">Name</label>
						<input
							type="text"
							className={`
         mt-1 w-full rounded-md border border-input bg-background px-3 py-2
       `}
						/>
					</div>
					<div>
						<label className="block text-sm font-medium">Description</label>
						<textarea
							className={`
         mt-1 w-full rounded-md border border-input bg-background px-3 py-2
       `}
							rows={3}
						/>
					</div>
				</div>
				<div className="rounded-lg border border-border bg-muted/50 p-4">
					<h4 className="mb-2 text-sm font-medium">Advanced Options</h4>
					<div className="space-y-2">
						<label className="flex items-center gap-2">
							<input type="checkbox" />
							<span className="text-sm">Enable option 1</span>
						</label>
						<label className="flex items-center gap-2">
							<input type="checkbox" />
							<span className="text-sm">Enable option 2</span>
						</label>
					</div>
				</div>
				<div className="flex justify-end gap-2">
					<Button variant="outline">Cancel</Button>
					<Button>Save Settings</Button>
				</div>
			</div>
		</DialogStoryWrapper>
	),
};
