/**
 * Test fixtures for Memory System
 * Provides consistent test data for E2E tests
 */

export const testMemories = {
	favoriteFood: {
		key: 'favorite_food',
		value: 'Pizza Margherita',
		category: 'preference' as const,
	},
	allergies: {
		key: 'allergies',
		value: 'Lactose intolerant, allergic to nuts',
		category: 'fact' as const,
	},
	dailyCalorieTarget: {
		key: 'daily_calorie_target',
		value: '2000 calories per day',
		category: 'preference' as const,
	},
	dietaryRestriction: {
		key: 'dietary_restriction',
		value: 'Vegetarian diet',
		category: 'preference' as const,
	},
	mealTiming: {
		key: 'meal_timing',
		value: 'Breakfast at 8am, Lunch at 12pm, Dinner at 7pm',
		category: 'custom' as const,
	},
	exerciseRoutine: {
		key: 'exercise_routine',
		value: 'Running 3 times per week',
		category: 'fact' as const,
	},
	favoriteCuisine: {
		key: 'favorite_cuisine',
		value: 'Italian and Japanese',
		category: 'preference' as const,
	},
	databaseIngredient: {
		key: 'common_ingredient',
		value: 'Chicken breast stored in database',
		category: 'database' as const,
	},
	toolUsage: {
		key: 'tool_preference',
		value: 'Uses calculator for macro calculations',
		category: 'tool' as const,
	},
};

/**
 * Messages that should trigger memory saving
 * These are test messages that simulate user asking AI to remember something
 */
export const memoryTriggerMessages = {
	rememberFood: 'Please remember that my favorite food is Pizza Margherita',
	rememberAllergies: 'I need you to remember that I am lactose intolerant and allergic to nuts',
	rememberCalories: 'Remember that my daily calorie target is 2000 calories',
	rememberDiet: 'Please keep in mind that I follow a vegetarian diet',
	rememberMealTiming: 'Remember that I have breakfast at 8am, lunch at 12pm, and dinner at 7pm',
};

/**
 * Messages that should recall memories
 * These are test messages where AI should use previously saved memories
 */
export const memoryRecallMessages = {
	askAboutFood: 'What is my favorite food?',
	askAboutAllergies: 'Do I have any food allergies?',
	askAboutCalories: 'What is my daily calorie target?',
	askAboutDiet: 'What type of diet do I follow?',
	askAboutMealTiming: 'When do I usually eat my meals?',
	askForMealSuggestion: 'Can you suggest a meal for me based on what you know about me?',
};
