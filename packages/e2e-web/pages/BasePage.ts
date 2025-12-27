import type { Locator, Page } from '@playwright/test';

import {
	clearToastEvents,
	waitForErrorToastEvent,
	waitForSuccessToastEvent,
	waitForToastEventWithMessage,
} from '../utils/testHelpers';

/**
 * Base class for all Page Objects
 * Contains common methods for all pages
 */
export abstract class BasePage {
	constructor(protected page: Page) {}

	/**
	 * Navigate to a URL
	 * Automatically clears toast events for a clean state
	 */
	async navigate(path: string): Promise<void> {
		await this.page.goto(path);
		// Clear toast events for clean state at the start of each page navigation
		await clearToastEvents(this.page);
	}

	/**
	 * Wait for an element to be visible
	 */
	async waitForElement(locator: Locator, timeout: number = 10000): Promise<void> {
		await locator.waitFor({ state: 'visible', timeout });
	}

	/**
	 * Wait for a toast to appear with a specific message
	 * Uses the toast event store instead of waiting for the ephemeral DOM element
	 */
	async waitForToast(message: string, timeout: number = 10000): Promise<void> {
		await waitForToastEventWithMessage(this.page, message, timeout);
	}

	/**
	 * Wait for a success toast to appear
	 * Uses the toast event store instead of waiting for the ephemeral DOM element
	 */
	async waitForSuccessToast(timeout: number = 10000): Promise<void> {
		await waitForSuccessToastEvent(this.page, timeout);
	}

	/**
	 * Wait for an error toast to appear
	 * Uses the toast event store instead of waiting for the ephemeral DOM element
	 */
	async waitForErrorToast(timeout: number = 10000): Promise<void> {
		await waitForErrorToastEvent(this.page, timeout);
	}

	/**
	 * Wait for the loading spinner to disappear
	 */
	async waitForLoadingToComplete(timeout: number = 15000): Promise<void> {
		const spinner = this.page.locator('.spinner');
		await spinner.waitFor({ state: 'detached', timeout }).catch(() => {
			// Ignore if spinner is not present
		});
	}

	/**
	 * Click on an element and wait for loading to complete
	 */
	async clickAndWaitForLoading(locator: Locator): Promise<void> {
		await locator.click();
		await this.waitForLoadingToComplete();
	}

	/**
	 * Fill a field and wait for loading to complete
	 */
	async fillAndWaitForLoading(locator: Locator, value: string): Promise<void> {
		await locator.fill(value);
		await this.waitForLoadingToComplete();
	}

	/**
	 * Verify that the current page matches a path
	 */
	async verifyCurrentPath(expectedPath: string): Promise<void> {
		await this.page.waitForURL(`**${expectedPath}`);
	}

	/**
	 * Get the text of an element
	 */
	async getText(locator: Locator): Promise<string> {
		return (await locator.textContent()) || '';
	}

	/**
	 * Wait for a specific delay (use sparingly)
	 */
	async wait(ms: number): Promise<void> {
		await this.page.waitForTimeout(ms);
	}
}
