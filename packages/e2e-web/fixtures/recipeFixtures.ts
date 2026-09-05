/**
 * Fixtures for recipe tests
 */

export const validRecipes = {
	chickenWithRice: {
		name: 'Chicken with Rice',
		servings: 2,
		ingredients: [
			{ name: 'Chicken', quantity: 200 },
			{ name: 'White rice', quantity: 150 },
			{ name: 'Broccoli', quantity: 100 },
		],
		instructions: 'Cook the rice. Grill the chicken. Steam the broccoli.',
	},
	salmonPasta: {
		name: 'Salmon Pasta',
		servings: 3,
		ingredients: [
			{ name: 'Salmon', quantity: 250 },
			{ name: 'Pasta', quantity: 300 },
			{ name: 'Tomato', quantity: 100 },
			{ name: 'Olive oil', quantity: 15 },
		],
		instructions: 'Cook the pasta. Grill the salmon. Prepare tomato sauce with olive oil.',
	},
	omeletteSimple: {
		name: 'Simple Omelette',
		servings: 1,
		ingredients: [
			{ name: 'Eggs', quantity: 150 },
			{ name: 'Tomato', quantity: 50 },
		],
		instructions: 'Beat the eggs. Cut the tomatoes. Cook the omelette.',
	},
	riceAndBroccoli: {
		name: 'Rice with Vegetables',
		servings: 2,
		ingredients: [
			{ name: 'White rice', quantity: 200 },
			{ name: 'Broccoli', quantity: 150 },
			{ name: 'Olive oil', quantity: 10 },
		],
		instructions: 'Cook the rice. Saute the broccoli with olive oil.',
	},
};

/**
 * Expected calculations for recipe macros
 * Based on fixture ingredients
 */
export const expectedMacros = {
	chickenWithRice: {
		// Chicken 200g: 330 cal, 62g protein, 0g carbs, 7.2g fat
		// Rice 150g: 195 cal, 4.05g protein, 42.3g carbs, 0.45g fat
		// Broccoli 100g: 34 cal, 2.8g protein, 7g carbs, 0.4g fat
		Calories: 559, // 330 + 195 + 34
		protein: 68.9, // 62 + 4.05 + 2.8 (rounded to 1 decimal)
		carbs: 49.3, // 0 + 42.3 + 7
		fat: 8.1, // 7.2 + 0.45 + 0.4 (rounded to 1 decimal)
	},
	salmonPasta: {
		// Salmon 250g: 520 cal, 50g protein, 0g carbs, 32.5g fat
		// Pasta 300g: 1113 cal, 39g protein, 225g carbs, 4.5g fat
		// Tomato 100g: 18 cal, 0.9g protein, 3.9g carbs, 0.2g fat
		// Olive oil 15g: 132.6 cal, 0g protein, 0g carbs, 15g fat
		Calories: 1784, // 520 + 1113 + 18 + 132.6 (rounded)
		protein: 89.9, // 50 + 39 + 0.9
		carbs: 228.9, // 0 + 225 + 3.9
		fat: 52.2, // 32.5 + 4.5 + 0.2 + 15
	},
};
