import type { Page } from '@playwright/test';

/**
 * API Helpers for creating test data via the API instead of the UI.
 * Used for test setup, NOT for testing the creation itself.
 */

/**
 * Creates an ingredient via the API.
 * @param page - Playwright Page
 * @param ingredient - Ingredient data
 * @returns The created ingredient with its ID
 */
export async function createIngredientViaAPI(
	page: Page,
	ingredient: {
		name: string;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		servingSize: number;
	}
) {
	const backendPort = (page as any).backendPort || 3000;
	const response = await page.request.post(`http://localhost:${backendPort}/api/ingredients`, {
		data: ingredient,
		headers: { 'Content-Type': 'application/json' },
		timeout: 10000,
	});

	if (!response.ok()) {
		throw new Error(`Failed to create ingredient via API: ${response.status()} ${await response.text()}`);
	}

	return response.json();
}

/**
 * Creates multiple ingredients via the API in parallel.
 * Faster than creating them one by one.
 * @param page - Playwright Page
 * @param ingredients - Array of ingredients to create
 * @returns The created ingredients with their IDs
 */
export async function createIngredientsViaAPI(
	page: Page,
	ingredients: Array<{
		name: string;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		servingSize: number;
	}>
) {
	const promises = ingredients.map(ingredient => createIngredientViaAPI(page, ingredient));
	return Promise.all(promises);
}

/**
 * Creates a recipe via the API.
 * @param page - Playwright Page
 * @param recipe - Recipe data
 * @returns The created recipe with its ID
 */
export async function createRecipeViaAPI(
	page: Page,
	recipe: {
		name: string;
		servings: number;
		ingredients: Array<{ name: string; quantity: number }>;
		instructions?: string;
	}
) {
	const backendPort = (page as any).backendPort || 3000;
	const response = await page.request.post(`http://localhost:${backendPort}/api/recipes`, {
		data: recipe,
		headers: { 'Content-Type': 'application/json' },
		timeout: 10000,
	});

	if (!response.ok()) {
		throw new Error(`Failed to create recipe via API: ${response.status()} ${await response.text()}`);
	}

	return response.json();
}

/**
 * Creates multiple recipes via the API in parallel.
 * @param page - Playwright Page
 * @param recipes - Array of recipes to create
 * @returns The created recipes with their IDs
 */
export async function createRecipesViaAPI(
	page: Page,
	recipes: Array<{
		name: string;
		servings: number;
		ingredients: Array<{ name: string; quantity: number }>;
		instructions?: string;
	}>
) {
	const promises = recipes.map(recipe => createRecipeViaAPI(page, recipe));
	return Promise.all(promises);
}

/**
 * Updates an ingredient via the API.
 * @param page - Playwright Page
 * @param id - Ingredient ID
 * @param updates - Data to update
 * @returns The updated ingredient
 */
export async function updateIngredientViaAPI(
	page: Page,
	id: string,
	updates: Partial<{
		name: string;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		servingSize: number;
	}>
) {
	const backendPort = (page as any).backendPort || 3000;
	const response = await page.request.put(`http://localhost:${backendPort}/api/ingredients/${id}`, {
		data: updates,
		headers: { 'Content-Type': 'application/json' },
		timeout: 10000,
	});

	if (!response.ok()) {
		throw new Error(`Failed to update ingredient via API: ${response.status()} ${await response.text()}`);
	}

	return response.json();
}

/**
 * Deletes an ingredient via the API.
 * @param page - Playwright Page
 * @param id - Ingredient ID
 */
export async function deleteIngredientViaAPI(page: Page, id: string) {
	const backendPort = (page as any).backendPort || 3000;
	const response = await page.request.delete(`http://localhost:${backendPort}/api/ingredients/${id}`, {
		timeout: 10000,
	});

	if (!response.ok()) {
		throw new Error(`Failed to delete ingredient via API: ${response.status()} ${await response.text()}`);
	}
}

/**
 * Deletes a recipe via the API.
 * @param page - Playwright Page
 * @param id - Recipe ID
 */
export async function deleteRecipeViaAPI(page: Page, id: string) {
	const backendPort = (page as any).backendPort || 3000;
	const response = await page.request.delete(`http://localhost:${backendPort}/api/recipes/${id}`, {
		timeout: 10000,
	});

	if (!response.ok()) {
		throw new Error(`Failed to delete recipe via API: ${response.status()} ${await response.text()}`);
	}
}

/**
 * Retrieves all ingredients via the API.
 * @param page - Playwright Page
 * @returns The list of ingredients
 */
export async function getIngredientsViaAPI(page: Page) {
	const backendPort = (page as any).backendPort || 3000;
	const response = await page.request.get(`http://localhost:${backendPort}/api/ingredients`, {
		timeout: 10000,
	});

	if (!response.ok()) {
		throw new Error(`Failed to get ingredients via API: ${response.status()} ${await response.text()}`);
	}

	return response.json();
}

/**
 * Retrieves all recipes via the API.
 * @param page - Playwright Page
 * @returns The list of recipes
 */
export async function getRecipesViaAPI(page: Page) {
	const backendPort = (page as any).backendPort || 3000;
	const response = await page.request.get(`http://localhost:${backendPort}/api/recipes`, {
		timeout: 10000,
	});

	if (!response.ok()) {
		throw new Error(`Failed to get recipes via API: ${response.status()} ${await response.text()}`);
	}

	return response.json();
}

/**
 * Sends a chat message via the API.
 * @param page - Playwright Page
 * @param message - Message to send
 * @param conversationId - Conversation ID (optional)
 * @returns The chat response with conversationId and message
 */
export async function sendChatMessageViaAPI(page: Page, message: string, conversationId?: string) {
	const backendPort = (page as any).backendPort || 3000;
	const response = await page.request.post(`http://localhost:${backendPort}/api/chat/message`, {
		data: { message, conversationId },
		headers: { 'Content-Type': 'application/json' },
		timeout: 30000,
	});

	if (!response.ok()) {
		throw new Error(`Failed to send chat message via API: ${response.status()} ${await response.text()}`);
	}

	return response.json();
}

/**
 * Retrieves all conversations via the API.
 * @param page - Playwright Page
 * @returns The list of conversations
 */
export async function getConversationsViaAPI(page: Page) {
	const backendPort = (page as any).backendPort || 3000;
	const response = await page.request.get(`http://localhost:${backendPort}/api/chat/conversations`, {
		timeout: 10000,
	});

	if (!response.ok()) {
		throw new Error(`Failed to get conversations via API: ${response.status()} ${await response.text()}`);
	}

	return response.json();
}

/**
 * Retrieves a specific conversation via the API.
 * @param page - Playwright Page
 * @param conversationId - Conversation ID
 * @returns The conversation with its messages
 */
export async function getConversationViaAPI(page: Page, conversationId: string) {
	const backendPort = (page as any).backendPort || 3000;
	const response = await page.request.get(
		`http://localhost:${backendPort}/api/chat/conversations/${conversationId}`,
		{
			timeout: 10000,
		}
	);

	if (!response.ok()) {
		throw new Error(`Failed to get conversation via API: ${response.status()} ${await response.text()}`);
	}

	return response.json();
}

/**
 * Deletes a conversation via the API.
 * @param page - Playwright Page
 * @param conversationId - Conversation ID
 */
export async function deleteConversationViaAPI(page: Page, conversationId: string) {
	const backendPort = (page as any).backendPort || 3000;
	const response = await page.request.delete(
		`http://localhost:${backendPort}/api/chat/conversations/${conversationId}`,
		{
			timeout: 10000,
		}
	);

	if (!response.ok()) {
		throw new Error(`Failed to delete conversation via API: ${response.status()} ${await response.text()}`);
	}
}

/**
 * Creates a conversation via the API.
 * @param page - Playwright Page
 * @param title - Conversation title (optional)
 * @param type - Conversation type (optional)
 * @returns The created conversation
 */
export async function createConversationViaAPI(page: Page, title?: string, type: 'general' | 'contextual' = 'general') {
	const backendPort = (page as any).backendPort || 3000;
	const response = await page.request.post(`http://localhost:${backendPort}/api/chat/conversations`, {
		data: { title, type },
		headers: { 'Content-Type': 'application/json' },
		timeout: 10000,
	});

	if (!response.ok()) {
		throw new Error(`Failed to create conversation via API: ${response.status()} ${await response.text()}`);
	}

	return response.json();
}

/**
 * Saves a memory via the API.
 * @param page - Playwright Page
 * @param conversationId - Conversation ID
 * @param key - Memory key
 * @param value - Memory value
 * @param category - Memory category
 * @returns The created memory
 */
export async function saveMemoryViaAPI(
	page: Page,
	conversationId: string,
	key: string,
	value: string,
	category: 'tool' | 'database' | 'preference' | 'fact' | 'custom' = 'custom'
) {
	const backendPort = (page as any).backendPort || 3000;
	const response = await page.request.post(
		`http://localhost:${backendPort}/api/chat/conversations/${conversationId}/memories`,
		{
			data: { key, value, category },
			headers: { 'Content-Type': 'application/json' },
			timeout: 10000,
		}
	);

	if (!response.ok()) {
		throw new Error(`Failed to save memory via API: ${response.status()} ${await response.text()}`);
	}

	return response.json();
}

/**
 * Retrieves all memories for a conversation via the API.
 * @param page - Playwright Page
 * @param conversationId - Conversation ID
 * @returns The list of memories
 */
export async function getMemoriesViaAPI(page: Page, conversationId: string) {
	const backendPort = (page as any).backendPort || 3000;
	const response = await page.request.get(
		`http://localhost:${backendPort}/api/chat/conversations/${conversationId}/memories`,
		{
			timeout: 10000,
		}
	);

	if (!response.ok()) {
		throw new Error(`Failed to get memories via API: ${response.status()} ${await response.text()}`);
	}

	const result = await response.json();
	return result.data || [];
}

/**
 * Deletes a memory via the API.
 * @param page - Playwright Page
 * @param memoryId - Memory ID
 */
export async function deleteMemoryViaAPI(page: Page, memoryId: string) {
	const backendPort = (page as any).backendPort || 3000;
	const response = await page.request.delete(`http://localhost:${backendPort}/api/chat/memories/${memoryId}`, {
		timeout: 10000,
	});

	if (!response.ok()) {
		throw new Error(`Failed to delete memory via API: ${response.status()} ${await response.text()}`);
	}
}

/**
 * Deletes all memories for a conversation via the API.
 * @param page - Playwright Page
 * @param conversationId - Conversation ID
 */
export async function deleteAllMemoriesViaAPI(page: Page, conversationId: string) {
	const memories = await getMemoriesViaAPI(page, conversationId);
	const promises = memories.map((memory: any) => deleteMemoryViaAPI(page, memory.id));
	await Promise.all(promises);
}
