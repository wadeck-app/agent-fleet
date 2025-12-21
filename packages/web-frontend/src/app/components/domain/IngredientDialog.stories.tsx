import { useState } from 'react';

import { Button } from '@framework/components/primitives/Button';
import type { Ingredient } from '@shared';
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';

import { IngredientDialog } from './IngredientDialog';

/**
 * IngredientDialog component stories demonstrating create and edit modes.
 * Wraps IngredientForm in a CrudDialog with consistent structure.
 */
const meta = {
	title: 'Domain/IngredientDialog',
	component: IngredientDialog,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {
		open: {
			control: 'boolean',
			description: 'Whether the dialog is open',
		},
		ingredient: {
			control: 'object',
			description: 'Ingredient data for edit mode (null for create mode)',
		},
	},
} satisfies Meta<typeof IngredientDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// Sample ingredient data for stories
const sampleIngredient: Ingredient = {
	id: '1',
	name: 'Chicken Breast',
	calories: 165,
	protein: 31,
	carbs: 0,
	fat: 3.6,
	servingSize: 100,
	unit: 'g',
	category: 'Protein',
	version: 1,
	createdAt: '2024-01-01T00:00:00Z',
	updatedAt: '2024-01-01T00:00:00Z',
};

const anotherIngredient: Ingredient = {
	id: '2',
	name: 'Salmon Fillet',
	calories: 206,
	protein: 22,
	carbs: 0,
	fat: 12.5,
	servingSize: 85,
	unit: 'oz',
	category: 'Seafood',
	version: 2,
	createdAt: '2024-02-01T00:00:00Z',
	updatedAt: '2024-02-15T00:00:00Z',
};

// Interactive wrapper component for stories
function DialogStoryWrapper({
	ingredient,
	withRefresh = false,
}: {
	ingredient?: Ingredient | null;
	withRefresh?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async (data: any) => {
		console.log('Form submitted:', data);
		setIsSubmitting(true);
		// Simulate API call
		await new Promise(resolve => setTimeout(resolve, 1000));
		setIsSubmitting(false);
		setOpen(false);
	};

	const handleRefresh = withRefresh
		? async () => {
				console.log('Refresh clicked');
				// Simulate refresh
				await new Promise(resolve => setTimeout(resolve, 500));
			}
		: undefined;

	return (
		<div>
			<Button onClick={() => setOpen(true)} disabled={isSubmitting}>
				{ingredient ? 'Edit Ingredient' : 'New Ingredient'}
			</Button>
			<IngredientDialog
				open={open}
				onClose={() => setOpen(false)}
				ingredient={ingredient}
				onSubmit={handleSubmit}
				onRefresh={handleRefresh}
			/>
		</div>
	);
}

// Create mode - Default
export const CreateMode: Story = {
	args: undefined as any,
	render: () => <DialogStoryWrapper ingredient={null} />,
};

// Edit mode - Chicken Breast
export const EditMode: Story = {
	args: undefined as any,
	render: () => <DialogStoryWrapper ingredient={sampleIngredient} withRefresh={true} />,
};

// Edit mode - Salmon (different data)
export const EditModeSalmon: Story = {
	args: undefined as any,
	render: () => <DialogStoryWrapper ingredient={anotherIngredient} withRefresh={true} />,
};

// Edit mode - Without refresh
export const EditModeNoRefresh: Story = {
	args: undefined as any,
	render: () => <DialogStoryWrapper ingredient={sampleIngredient} withRefresh={false} />,
};

// Create mode with pre-opened dialog
export const CreateModeOpen: Story = {
	args: undefined as any,
	render: () => {
		const [open] = useState(true);
		return <IngredientDialog open={open} onClose={fn()} ingredient={null} onSubmit={fn()} onRefresh={undefined} />;
	},
};

// Edit mode with pre-opened dialog
export const EditModeOpen: Story = {
	args: undefined as any,
	render: () => {
		const [open] = useState(true);
		return (
			<IngredientDialog
				open={open}
				onClose={fn()}
				ingredient={sampleIngredient}
				onSubmit={fn()}
				onRefresh={fn()}
			/>
		);
	},
};

// Edge case - Ingredient with empty category
export const EmptyCategory: Story = {
	args: undefined as any,
	render: () => {
		const ingredientWithEmptyCategory: Ingredient = {
			...sampleIngredient,
			category: '',
		};
		return <DialogStoryWrapper ingredient={ingredientWithEmptyCategory} withRefresh={true} />;
	},
};

// Edge case - Ingredient with zero values
export const ZeroValues: Story = {
	args: undefined as any,
	render: () => {
		const ingredientWithZeros: Ingredient = {
			...sampleIngredient,
			name: 'Water',
			calories: 0,
			protein: 0,
			carbs: 0,
			fat: 0,
			category: 'Beverage',
		};
		return <DialogStoryWrapper ingredient={ingredientWithZeros} withRefresh={true} />;
	},
};

// Edge case - Ingredient with long name and category
export const LongText: Story = {
	args: undefined as any,
	render: () => {
		const ingredientWithLongText: Ingredient = {
			...sampleIngredient,
			name: 'Extra Virgin Cold-Pressed Organic Olive Oil from Mediterranean Region',
			category: 'Healthy Fats and Oils - Premium Quality',
		};
		return <DialogStoryWrapper ingredient={ingredientWithLongText} withRefresh={true} />;
	},
};

// Switching modes demonstration
export const ModeSwitching: Story = {
	args: undefined as any,
	render: () => {
		const [open, setOpen] = useState(false);
		const [ingredient, setIngredient] = useState<Ingredient | null>(null);

		return (
			<div className="space-y-4">
				<div className="flex gap-2">
					<Button
						onClick={() => {
							setIngredient(null);
							setOpen(true);
						}}
					>
						Create New
					</Button>
					<Button
						onClick={() => {
							setIngredient(sampleIngredient);
							setOpen(true);
						}}
					>
						Edit Chicken
					</Button>
					<Button
						onClick={() => {
							setIngredient(anotherIngredient);
							setOpen(true);
						}}
					>
						Edit Salmon
					</Button>
				</div>
				<IngredientDialog
					open={open}
					onClose={() => setOpen(false)}
					ingredient={ingredient}
					onSubmit={async data => {
						console.log('Submitted:', data);
						setOpen(false);
					}}
					onRefresh={
						ingredient
							? async () => {
									console.log('Refresh');
								}
							: undefined
					}
				/>
			</div>
		);
	},
};

// Callback demonstration
export const WithCallbacks: Story = {
	args: undefined as any,
	render: () => {
		const [open, setOpen] = useState(false);
		const [logs, setLogs] = useState<string[]>([]);

		const addLog = (message: string) => {
			setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
		};

		return (
			<div className="space-y-4">
				<Button
					onClick={() => {
						addLog('Opening dialog');
						setOpen(true);
					}}
				>
					Open Dialog
				</Button>
				<IngredientDialog
					open={open}
					onClose={() => {
						addLog('Dialog closed');
						setOpen(false);
					}}
					ingredient={sampleIngredient}
					onSubmit={async data => {
						addLog(`Form submitted with: ${JSON.stringify(data)}`);
						await new Promise(resolve => setTimeout(resolve, 1000));
						addLog('Submission completed');
						setOpen(false);
					}}
					onRefresh={async () => {
						addLog('Refresh triggered');
						await new Promise(resolve => setTimeout(resolve, 500));
						addLog('Refresh completed');
					}}
				/>
				<div className="rounded-lg border border-border bg-muted/50 p-4">
					<h4 className="mb-2 text-sm font-medium">Event Log:</h4>
					<div className="space-y-1 text-xs">
						{logs.length === 0 ? (
							<p className="text-muted-foreground">No events yet</p>
						) : (
							logs.map((log, i) => <div key={i}>{log}</div>)
						)}
					</div>
				</div>
			</div>
		);
	},
};
