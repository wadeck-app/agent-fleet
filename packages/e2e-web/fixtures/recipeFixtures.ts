/**
 * Fixtures for recipe tests
 */

export const validRecipes = {
	chickenWithRice: {
		name: 'Poulet avec Riz',
		servings: 2,
		ingredients: [
			{ name: 'Poulet', quantity: 200 },
			{ name: 'Riz blanc', quantity: 150 },
			{ name: 'Brocoli', quantity: 100 },
		],
		instructions: 'Faire cuire le riz. Griller le poulet. Cuire le brocoli à la vapeur.',
	},
	salmonPasta: {
		name: 'Pâtes au Saumon',
		servings: 3,
		ingredients: [
			{ name: 'Saumon', quantity: 250 },
			{ name: 'Pâtes', quantity: 300 },
			{ name: 'Tomate', quantity: 100 },
			{ name: "Huile d'olive", quantity: 15 },
		],
		instructions: "Cuire les pâtes. Griller le saumon. Préparer la sauce tomate avec l'huile d'olive.",
	},
	omeletteSimple: {
		name: 'Omelette Simple',
		servings: 1,
		ingredients: [
			{ name: 'Œufs', quantity: 150 },
			{ name: 'Tomate', quantity: 50 },
		],
		instructions: "Battre les œufs. Couper les tomates. Cuire l'omelette.",
	},
	riceAndBroccoli: {
		name: 'Riz aux Légumes',
		servings: 2,
		ingredients: [
			{ name: 'Riz blanc', quantity: 200 },
			{ name: 'Brocoli', quantity: 150 },
			{ name: "Huile d'olive", quantity: 10 },
		],
		instructions: "Cuire le riz. Faire sauter le brocoli avec l'huile d'olive.",
	},
};

/**
 * Expected calculations for recipe macros
 * Based on fixture ingredients
 */
export const expectedMacros = {
	chickenWithRice: {
		// Poulet 200g: 330 cal, 62g protein, 0g carbs, 7.2g fat
		// Riz 150g: 195 cal, 4.05g protein, 42.3g carbs, 0.45g fat
		// Brocoli 100g: 34 cal, 2.8g protein, 7g carbs, 0.4g fat
		calories: 559, // 330 + 195 + 34
		protein: 68.9, // 62 + 4.05 + 2.8 (arrondi à 1 décimale)
		carbs: 49.3, // 0 + 42.3 + 7
		fat: 8.1, // 7.2 + 0.45 + 0.4 (arrondi à 1 décimale)
	},
	salmonPasta: {
		// Saumon 250g: 520 cal, 50g protein, 0g carbs, 32.5g fat
		// Pâtes 300g: 1113 cal, 39g protein, 225g carbs, 4.5g fat
		// Tomate 100g: 18 cal, 0.9g protein, 3.9g carbs, 0.2g fat
		// Huile d'olive 15g: 132.6 cal, 0g protein, 0g carbs, 15g fat
		calories: 1784, // 520 + 1113 + 18 + 132.6 (arrondi)
		protein: 89.9, // 50 + 39 + 0.9
		carbs: 228.9, // 0 + 225 + 3.9
		fat: 52.2, // 32.5 + 4.5 + 0.2 + 15
	},
};
