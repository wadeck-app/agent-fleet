import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';

// Extend Vitest expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
	cleanup();
});

// Polyfills for Radix UI components in jsdom
// Radix UI uses modern browser APIs that jsdom doesn't fully support
if (typeof Element.prototype.hasPointerCapture === 'undefined') {
	Element.prototype.hasPointerCapture = function () {
		return false;
	};
}

if (typeof Element.prototype.setPointerCapture === 'undefined') {
	Element.prototype.setPointerCapture = function () {
		// noop
	};
}

if (typeof Element.prototype.releasePointerCapture === 'undefined') {
	Element.prototype.releasePointerCapture = function () {
		// noop
	};
}

// Mock ResizeObserver if not available
if (typeof globalThis.ResizeObserver === 'undefined') {
	globalThis.ResizeObserver = class ResizeObserver {
		observe() {
			// noop
		}
		unobserve() {
			// noop
		}
		disconnect() {
			// noop
		}
	};
}

// Polyfill queueMicrotask for jsdom
// queueMicrotask is a standard API in Node.js and browsers but not in jsdom
if (typeof globalThis.queueMicrotask === 'undefined') {
	globalThis.queueMicrotask = (callback: () => void) => {
		Promise.resolve().then(callback);
	};
}
