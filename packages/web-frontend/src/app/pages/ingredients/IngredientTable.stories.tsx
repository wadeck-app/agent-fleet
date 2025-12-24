import { withMetadata } from '@framework/tests/withMetadata';
import type { Ingredient } from '@shared/api/ingredients.contract';
import type { Meta, StoryObj } from '@storybook/react';

import { IngredientTable } from './IngredientTable';

/**
 * IngredientTable component stories demonstrating ingredient list display patterns.
 * Feature component for presenting ingredients in a table format with actions.
 */
const meta = {
	title: 'Features/IngredientTable',
	component: IngredientTable,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
	argTypes: {
		onDelete: { action: 'deleted' },
		onEdit: { action: 'edited' },
	},
} satisfies Meta<typeof IngredientTable>;

export default meta;
type Story = StoryObj<typeof meta>;

// Sample ingredient data
const sampleIngredients: Ingredient[] = [
	withMetadata({
		id: '1',
		name: 'Chicken Breast',
		calories: 165,
		protein: 31,
		carbs: 0,
		fat: 3.6,
		servingSize: 100,
		unit: 'g',
		category: 'Protein',
	}),
	withMetadata({
		id: '2',
		name: 'Brown Rice',
		calories: 370,
		protein: 7.9,
		carbs: 77,
		fat: 2.9,
		servingSize: 100,
		unit: 'g',
		category: 'Grains',
	}),
	withMetadata({
		id: '3',
		name: 'Broccoli',
		calories: 34,
		protein: 2.8,
		carbs: 7,
		fat: 0.4,
		servingSize: 100,
		unit: 'g',
		category: 'Vegetables',
	}),
	withMetadata({
		id: '4',
		name: 'Salmon',
		calories: 208,
		protein: 20,
		carbs: 0,
		fat: 13,
		servingSize: 100,
		unit: 'g',
		category: 'Protein',
	}),
	withMetadata({
		id: '5',
		name: 'Almonds',
		calories: 579,
		protein: 21,
		carbs: 22,
		fat: 50,
		servingSize: 100,
		unit: 'g',
		category: 'Nuts',
	}),
];

// Default table with ingredients
export const Default: Story = {
	args: {
		storageId: 'story-ingredients',
		ingredients: sampleIngredients,
		onDelete: (id: string) => console.log('Delete ingredient:', id),
	},
};

// With edit functionality
export const WithEdit: Story = {
	args: {
		storageId: 'story-ingredients',
		ingredients: sampleIngredients,
		onDelete: (id: string) => console.log('Delete ingredient:', id),
		onEdit: (ingredient: Ingredient) => console.log('Edit ingredient:', ingredient),
	},
};

// Empty table
export const Empty: Story = {
	args: {
		storageId: 'story-ingredients',
		ingredients: [],
		onDelete: (id: string) => console.log('Delete ingredient:', id),
	},
	render: args => (
		<div>
			<IngredientTable {...args} />
			<p className="mt-4 text-center text-sm text-muted-foreground">
				Empty state - typically handled by parent component
			</p>
		</div>
	),
};

// Single ingredient
export const SingleIngredient: Story = {
	args: {
		storageId: 'story-ingredients',
		ingredients: sampleIngredients[0] ? [sampleIngredients[0]] : [],
		onDelete: (id: string) => console.log('Delete ingredient:', id),
		onEdit: (ingredient: Ingredient) => console.log('Edit ingredient:', ingredient),
	},
};

// High protein ingredients
export const HighProtein: Story = {
	args: {
		storageId: 'story-ingredients',
		ingredients: [
			withMetadata({
				id: '10',
				name: 'Greek Yogurt',
				calories: 100,
				protein: 10,
				carbs: 3.6,
				fat: 5,
				servingSize: 100,
				unit: 'g',
				category: 'Dairy',
			}),
			withMetadata({
				id: '11',
				name: 'Tuna',
				calories: 132,
				protein: 28,
				carbs: 0,
				fat: 1.3,
				servingSize: 100,
				unit: 'g',
				category: 'Protein',
			}),
			withMetadata({
				id: '12',
				name: 'Eggs',
				calories: 155,
				protein: 13,
				carbs: 1.1,
				fat: 11,
				servingSize: 100,
				unit: 'g',
				category: 'Protein',
			}),
		],
		onDelete: (id: string) => console.log('Delete ingredient:', id),
		onEdit: (ingredient: Ingredient) => console.log('Edit ingredient:', ingredient),
	},
};

// Ingredients without category
export const NoCategory: Story = {
	args: {
		storageId: 'story-ingredients',
		ingredients: [
			withMetadata({
				id: '20',
				name: 'Water',
				calories: 0,
				protein: 0,
				carbs: 0,
				fat: 0,
				servingSize: 250,
				unit: 'ml',
			}),
			withMetadata({
				id: '21',
				name: 'Salt',
				calories: 0,
				protein: 0,
				carbs: 0,
				fat: 0,
				servingSize: 1,
				unit: 'g',
			}),
		],
		onDelete: (id: string) => console.log('Delete ingredient:', id),
		onEdit: (ingredient: Ingredient) => console.log('Edit ingredient:', ingredient),
	},
};

// Large dataset - MUST be deterministic for visual regression tests
export const LargeDataset: Story = {
	args: {
		storageId: 'story-ingredients',
		ingredients: Array.from({ length: 20 }, (_, i) =>
			withMetadata({
				id: `${i + 1}`,
				name: `Ingredient ${i + 1}`,
				calories: 50 + ((i * 23) % 450),
				protein: (i * 7) % 30,
				carbs: (i * 11) % 50,
				fat: (i * 5) % 20,
				servingSize: 100,
				unit: 'g',
				category: ['Protein', 'Vegetables', 'Grains', 'Dairy', 'Fruits'][i % 5],
			})
		),
		onDelete: (id: string) => console.log('Delete ingredient:', id),
		onEdit: (ingredient: Ingredient) => console.log('Edit ingredient:', ingredient),
	},
};

// In context with header
export const InContext: Story = {
	args: {
		storageId: 'story-ingredients',
		ingredients: sampleIngredients,
		onDelete: (id: string) => console.log('Delete:', id),
		onEdit: (ingredient: Ingredient) => console.log('Edit:', ingredient),
	},
	render: args => (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold">Ingredient Database</h1>
					<p className="text-muted-foreground">Manage nutritional information</p>
				</div>
				<button
					className={`
       rounded-md bg-primary px-4 py-2 text-sm font-medium
       text-primary-foreground
     `}
				>
					Add Ingredient
				</button>
			</div>
			<IngredientTable
				storageId={args.storageId}
				ingredients={args.ingredients}
				onDelete={id => console.log('Delete:', id)}
				onEdit={ingredient => console.log('Edit:', ingredient)}
			/>
			<div className="text-sm text-muted-foreground">Total ingredients: {sampleIngredients.length}</div>
		</div>
	),
};
