import type { Page } from '@playwright/test';

/**
 * API Helpers pour creer des donnees via l'API au lieu de l'UI
 * Utilises pour le setup des tests, PAS pour tester la creation elle-meme
 */

/**
 * Creer un ingredient via l'API
 * @param page - Page Playwright
 * @param ingredient - Donnees de l'ingredient
 * @returns L'ingredient cree avec son ID
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
 * Creer plusieurs ingredients via l'API en parallele
 * Plus rapide que de les creer un par un
 * @param page - Page Playwright
 * @param ingredients - Tableau d'ingredients a creer
 * @returns Les ingredients crees avec leurs IDs
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
 * Creer une recette via l'API
 * @param page - Page Playwright
 * @param recipe - Donnees de la recette
 * @returns La recette creee avec son ID
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
 * Creer plusieurs recettes via l'API en parallele
 * @param page - Page Playwright
 * @param recipes - Tableau de recettes a creer
 * @returns Les recettes creees avec leurs IDs
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
 * Modifier un ingredient via l'API
 * @param page - Page Playwright
 * @param id - ID de l'ingredient
 * @param updates - Donnees a mettre a jour
 * @returns L'ingredient mis a jour
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
 * Supprimer un ingredient via l'API
 * @param page - Page Playwright
 * @param id - ID de l'ingredient
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
 * Supprimer une recette via l'API
 * @param page - Page Playwright
 * @param id - ID de la recette
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
 * Recuperer tous les ingredients via l'API
 * @param page - Page Playwright
 * @returns La liste des ingredients
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
 * Recuperer toutes les recettes via l'API
 * @param page - Page Playwright
 * @returns La liste des recettes
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
 * Envoyer un message de chat via l'API
 * @param page - Page Playwright
 * @param message - Message a envoyer
 * @param conversationId - ID de la conversation (optionnel)
 * @returns La reponse du chat avec conversationId et message
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
 * Recuperer toutes les conversations via l'API
 * @param page - Page Playwright
 * @returns La liste des conversations
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
 * Recuperer une conversation specifique via l'API
 * @param page - Page Playwright
 * @param conversationId - ID de la conversation
 * @returns La conversation avec ses messages
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
 * Supprimer une conversation via l'API
 * @param page - Page Playwright
 * @param conversationId - ID de la conversation
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
 * Creer une conversation via l'API
 * @param page - Page Playwright
 * @param title - Titre de la conversation (optionnel)
 * @param type - Type de conversation (optionnel)
 * @returns La conversation creee
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
 * Sauvegarder une memoire via l'API
 * @param page - Page Playwright
 * @param conversationId - ID de la conversation
 * @param key - Cle de la memoire
 * @param value - Valeur de la memoire
 * @param category - Categorie de la memoire
 * @returns La memoire creee
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
 * Recuperer toutes les memoires d'une conversation via l'API
 * @param page - Page Playwright
 * @param conversationId - ID de la conversation
 * @returns La liste des memoires
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
 * Supprimer une memoire via l'API
 * @param page - Page Playwright
 * @param memoryId - ID de la memoire
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
 * Supprimer toutes les memoires d'une conversation via l'API
 * @param page - Page Playwright
 * @param conversationId - ID de la conversation
 */
export async function deleteAllMemoriesViaAPI(page: Page, conversationId: string) {
	const memories = await getMemoriesViaAPI(page, conversationId);
	const promises = memories.map((memory: any) => deleteMemoryViaAPI(page, memory.id));
	await Promise.all(promises);
}
