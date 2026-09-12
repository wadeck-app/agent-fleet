import type { BrowserContext, Page } from '@playwright/test';

/**
 * Shared types for the runtime-only extensions the E2E suite relies on.
 * Declaring them here avoids `as any` casts at every access site.
 */

/** Toast payload published on `window` by the web app so E2E tests can assert on it. */
export interface ToastEvent {
	/** Narrowed to the app's toast kinds: a wider `string` conflicts with the existing
	 * `Window.__lastToast` declaration, which already constrains it. */
	type: 'success' | 'error' | 'info' | 'warning';
	message: string;
	timestamp: number;
}

/**
 * Fields the E2E suite reads from / writes to `window` inside browser-side callbacks
 * (`addInitScript`, `evaluate`, `waitForFunction`).
 */
export interface E2eWindow extends Window {
	__DISABLE_MSW__?: boolean;
	__toastEvents?: ToastEvent[];
	__lastToast?: ToastEvent;
}

/**
 * Playwright `Page` augmented at runtime by `playwright-hooks/hooks-web-server.ts`,
 * which attaches the backend port assigned to the current worker.
 */
export type PageWithBackendPort = Page & { backendPort?: number };

/**
 * Playwright `BrowserContext` exposing its internal resolved options.
 * `_options` is a Playwright internal: there is no public API to read the
 * effective `baseURL` of a context, so the field is declared explicitly here.
 */
export type BrowserContextWithOptions = BrowserContext & { _options?: { baseURL?: string } };
