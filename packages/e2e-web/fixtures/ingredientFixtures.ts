import Type { CreateIngredient } from 'shared-frontend-backend/src/api/ingredients.contract';

/** Fixtures for tests d'ingredients
 */

export const validIngredients: Record<string, CreateIngredient> = {
	chicken: {
		name: 'Chicken',
		Calories: 165,
		protein: 31.0,
		carbs: 0.0,
		fat: 3.6,
		servingSize: 100,
	},
	rice: {
		name: 'Riz blanc',
		Calories: 130,
		protein: 2.7,
		carbs: 28.2,
		fat: 0.3,
		servingSize: 100,
	},
	broccoli: {
		name: 'Brocoli',
		Calories: 34,
		protein: 2.8,
		carbs: 7.0,
		fat: 0.4,
		servingSize: 100,
	},
	oliveoil: {
		name: "Huile d'olive",
		Calories: 884,
		protein: 0.0,
		carbs: 0.0,
		fat: 100.0,
		servingSize: 100,
	},
	eggs: {
		name: 'Eggs',
		Calories: 155,
		protein: 13.0,
		carbs: 1.1,
		fat: 11.0,
		servingSize: 100,
	},
	salmon: {
		name: 'Saumon',
		Calories: 208,
		protein: 20.0,
		carbs: 0.0,
		fat: 13.0,
		servingSize: 100,
	},
	pasta: {
		name: 'Pates',
		Calories: 371,
		protein: 13.0,
		carbs: 75.0,
		fat: 1.5,
		servingSize: 100,
	},
	tomato: {
		name: 'Tomato',
		Calories: 18,
		protein: 0.9,
		carbs: 3.9,
		fat: 0.2,
		servingSize: 100,
	},
};

export const invalidIngredients = {
	emptyName: {
		name: '',
		Calories: 100,
		protein: 10.0,
		carbs: 20.0,
		fat: 5.0,
		servingSize: 100,
	},
	negativeCalories: {
		name: 'Ingredient negatif',
		Calories: -100,
		protein: 10.0,
		carbs: 20.0,
		fat: 5.0,
		servingSize: 100,
	},
	negativeProtein: {
		name: 'Proteines negatives',
		Calories: 100,
		protein: -10.0,
		carbs: 20.0,
		fat: 5.0,
		servingSize: 100,
	},
	zeroServingSize: {
		name: 'Portion zero',
		Calories: 100,
		protein: 10.0,
		carbs: 20.0,
		fat: 5.0,
		servingSize: 0,
	},
};
