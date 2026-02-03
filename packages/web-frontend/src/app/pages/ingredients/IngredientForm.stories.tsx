import { CrudDialog } from '@framework/components/overlays/CrudDialog';
import type { CreateIngredient } from '@shared/api/ingredients.contract';
import type { Meta, StoryObj } from '@storybook/react';

import { IngredientForm } from './IngredientForm';

/**
 * IngredientForm component stories demonstrating ingredient creation/editing patterns.
 * Feature component for ingredient form with validation.
 *
 * Note: Forms are wrapped in CrudDialog to provide proper DialogBody/DialogFooter context.
 */

// Wrapper component for Storybook to provide dialog context
function IngredientFormWrapper(props: React.ComponentProps<typeof IngredientForm>) {
	return (
		<CrudDialog open={true} onOpenChange={() => {}} title="Ingredient Form Demo" showCloseButton={false}>
			<IngredientForm {...props} />
		</CrudDialog>
	);
}

const meta = {
	title: 'Features/IngredientForm',
	component: IngredientFormWrapper,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
	argTypes: {
		onSubmit: { action: 'submitted' },
		onCancel: { action: 'cancelled' },
	},
} satisfies Meta<typeof IngredientFormWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default empty form
export const Default: Story = {
	args: {
		onSubmit: async (data: CreateIngredient) => {
			console.log('Form submitted:', data);
			// Simulate API delay
			await new Promise(resolve => setTimeout(resolve, 1000));
		},
		onCancel: () => console.log('Form cancelled'),
	},
};

// Custom submit label
export const CustomLabel: Story = {
	args: {
		onSubmit: async (data: CreateIngredient) => {
			console.log('Form submitted:', data);
			await new Promise(resolve => setTimeout(resolve, 1000));
		},
		onCancel: () => console.log('Form cancelled'),
		submitLabel: 'Save Ingredient',
	},
};

// Edit mode with initial data
export const EditMode: Story = {
	args: {
		onSubmit: async (data: CreateIngredient) => {
			console.log('Form submitted:', data);
			await new Promise(resolve => setTimeout(resolve, 1000));
		},
		onCancel: () => console.log('Form cancelled'),
		submitLabel: 'Update Ingredient',
		initialData: {
			name: 'Chicken Breast',
			calories: 165,
			protein: 31,
			carbs: 0,
			fat: 3.6,
			servingSize: 100,
			unit: 'g',
			category: 'Protein',
		},
	},
};

// High protein food
export const HighProteinFood: Story = {
	args: {
		onSubmit: async (data: CreateIngredient) => {
			console.log('Form submitted:', data);
			await new Promise(resolve => setTimeout(resolve, 1000));
		},
		onCancel: () => console.log('Form cancelled'),
		initialData: {
			name: 'Greek Yogurt',
			calories: 100,
			protein: 10,
			carbs: 3.6,
			fat: 5,
			servingSize: 100,
			unit: 'g',
			category: 'Dairy',
		},
	},
};

// Vegetable
export const Vegetable: Story = {
	args: {
		onSubmit: async (data: CreateIngredient) => {
			console.log('Form submitted:', data);
			await new Promise(resolve => setTimeout(resolve, 1000));
		},
		onCancel: () => console.log('Form cancelled'),
		initialData: {
			name: 'Broccoli',
			calories: 34,
			protein: 2.8,
			carbs: 7,
			fat: 0.4,
			servingSize: 100,
			unit: 'g',
			category: 'Vegetables',
		},
	},
};

// With validation errors (interaction required)
export const ValidationDemo: Story = {
	args: undefined as any,
	render: () => (
		<div className="space-y-4">
			<div className="rounded-lg border border-border bg-muted/50 p-4">
				<h3 className="mb-2 font-semibold">Validation Demo</h3>
				<p className="text-sm text-muted-foreground">
					Try submitting the form with invalid data to see validation errors:
				</p>
				<ul className="mt-2 list-inside list-disc text-sm text-muted-foreground">
					<li>Name is required</li>
					<li>Calories must be non-negative</li>
					<li>Protein, carbs, and fat must be non-negative</li>
					<li>Serving size must be positive</li>
				</ul>
			</div>
			<CrudDialog open={true} onOpenChange={() => {}} title="Validation Demo" showCloseButton={false}>
				<IngredientForm
					onSubmit={async data => {
						console.log('Submitted:', data);
						await new Promise(resolve => setTimeout(resolve, 1000));
					}}
					onCancel={() => console.log('Cancelled')}
				/>
			</CrudDialog>
		</div>
	),
};

// In context with header
export const InContext: Story = {
	args: undefined as any,
	render: () => (
		<div className="mx-auto max-w-4xl space-y-6">
			<div>
				<h1 className="text-2xl font-bold">Add New Ingredient</h1>
				<p className="text-muted-foreground">Enter nutritional information for the ingredient</p>
			</div>
			<CrudDialog open={true} onOpenChange={() => {}} title="Add Ingredient" showCloseButton={false}>
				<IngredientForm
					onSubmit={async data => {
						console.log('Submitted:', data);
						await new Promise(resolve => setTimeout(resolve, 1000));
						alert('Ingredient added successfully!');
					}}
					onCancel={() => {
						console.log('Cancelled');
						alert('Form cancelled');
					}}
				/>
			</CrudDialog>
		</div>
	),
};

// Side by side comparison
export const Comparison: Story = {
	args: undefined as any,
	render: () => (
		<div
			className={`
     grid gap-6
     lg:grid-cols-2
   `}
		>
			<div>
				<h3 className="mb-4 text-lg font-semibold">Create New Ingredient</h3>
				<CrudDialog open={true} onOpenChange={() => {}} title="Create Ingredient" showCloseButton={false}>
					<IngredientForm
						onSubmit={async data => console.log('Create:', data)}
						onCancel={() => console.log('Cancel create')}
						submitLabel="Create Ingredient"
					/>
				</CrudDialog>
			</div>
			<div>
				<h3 className="mb-4 text-lg font-semibold">Edit Existing Ingredient</h3>
				<CrudDialog open={true} onOpenChange={() => {}} title="Edit Ingredient" showCloseButton={false}>
					<IngredientForm
						onSubmit={async data => console.log('Update:', data)}
						onCancel={() => console.log('Cancel update')}
						submitLabel="Update Ingredient"
						initialData={{
							name: 'Salmon',
							calories: 208,
							protein: 20,
							carbs: 0,
							fat: 13,
							servingSize: 100,
							unit: 'g',
							category: 'Protein',
						}}
					/>
				</CrudDialog>
			</div>
		</div>
	),
};

// Liquid ingredient (ml units)
export const LiquidIngredient: Story = {
	args: {
		onSubmit: async (data: CreateIngredient) => {
			console.log('Form submitted:', data);
			await new Promise(resolve => setTimeout(resolve, 1000));
		},
		onCancel: () => console.log('Form cancelled'),
		initialData: {
			name: 'Almond Milk',
			calories: 15,
			protein: 0.6,
			carbs: 0.6,
			fat: 1.1,
			servingSize: 100,
			unit: 'ml',
			category: 'Dairy Alternatives',
		},
	},
};
