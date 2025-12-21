import { beforeEach, describe, expect, it, vi } from 'vitest';

import { themeService } from './ThemeService';

// Mock window.matchMedia
const mockMatchMedia = vi.fn();

describe('ThemeService', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
		vi.restoreAllMocks();

		// Setup matchMedia mock
		mockMatchMedia.mockImplementation((query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		}));

		Object.defineProperty(window, 'matchMedia', {
			writable: true,
			value: mockMatchMedia,
		});
	});

	describe('initializeTheme', () => {
		it('should return stored theme if exists', () => {
			localStorage.setItem('app_theme_preference', 'light');
			const theme = themeService.initializeTheme();
			expect(theme).toBe('light');
		});

		it('should detect system dark mode preference', () => {
			mockMatchMedia.mockImplementation((query: string) => ({
				matches: query === '(prefers-color-scheme: dark)',
				media: query,
				onchange: null,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				dispatchEvent: vi.fn(),
			}));

			const theme = themeService.initializeTheme();
			expect(theme).toBe('dark');
			expect(localStorage.getItem('app_theme_preference')).toBe('dark');
		});

		it('should detect system light mode preference', () => {
			mockMatchMedia.mockImplementation((query: string) => ({
				matches: query === '(prefers-color-scheme: light)',
				media: query,
				onchange: null,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				dispatchEvent: vi.fn(),
			}));

			const theme = themeService.initializeTheme();
			expect(theme).toBe('light');
			expect(localStorage.getItem('app_theme_preference')).toBe('light');
		});

		it('should default to dark when no preference', () => {
			const theme = themeService.initializeTheme();
			expect(theme).toBe('dark');
			expect(localStorage.getItem('app_theme_preference')).toBe('dark');
		});

		it('should save initialized theme to localStorage', () => {
			themeService.initializeTheme();
			const stored = localStorage.getItem('app_theme_preference');
			expect(stored).toBeTruthy();
		});

		it('should handle localStorage errors gracefully', () => {
			const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
				throw new Error('QuotaExceededError');
			});

			const theme = themeService.initializeTheme();
			expect(theme).toBe('dark');
			expect(consoleWarnSpy).toHaveBeenCalled();

			consoleWarnSpy.mockRestore();
		});

		it('should ignore invalid stored values', () => {
			localStorage.setItem('app_theme_preference', 'invalid');
			const theme = themeService.initializeTheme();
			expect(theme).toBe('dark');
		});
	});

	describe('toggleTheme', () => {
		it('should toggle from light to dark', () => {
			const newTheme = themeService.toggleTheme('light');
			expect(newTheme).toBe('dark');
		});

		it('should toggle from dark to light', () => {
			const newTheme = themeService.toggleTheme('dark');
			expect(newTheme).toBe('light');
		});

		it('should persist toggle to localStorage', () => {
			themeService.toggleTheme('light');
			expect(localStorage.getItem('app_theme_preference')).toBe('dark');
		});

		it('should handle localStorage quota exceeded', () => {
			const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
				throw new Error('QuotaExceededError');
			});

			const newTheme = themeService.toggleTheme('light');
			expect(newTheme).toBe('dark');
			expect(consoleWarnSpy).toHaveBeenCalled();

			consoleWarnSpy.mockRestore();
		});
	});

	describe('subscribeToSystemChanges', () => {
		it('should call callback when system preference changes', () => {
			const callback = vi.fn();
			const listeners: Array<(e: MediaQueryListEvent) => void> = [];

			mockMatchMedia.mockImplementation(() => ({
				matches: false,
				media: '(prefers-color-scheme: dark)',
				onchange: null,
				addEventListener: (_: string, handler: (e: MediaQueryListEvent) => void) => {
					listeners.push(handler);
				},
				removeEventListener: vi.fn(),
				dispatchEvent: vi.fn(),
			}));

			themeService.subscribeToSystemChanges(callback);

			listeners[0]!({ matches: true } as MediaQueryListEvent);
			expect(callback).toHaveBeenCalledWith('dark');
		});

		it('should return unsubscribe function', () => {
			const callback = vi.fn();
			const removeEventListener = vi.fn();

			mockMatchMedia.mockImplementation(() => ({
				matches: false,
				media: '(prefers-color-scheme: dark)',
				onchange: null,
				addEventListener: vi.fn(),
				removeEventListener,
				dispatchEvent: vi.fn(),
			}));

			const unsubscribe = themeService.subscribeToSystemChanges(callback);
			unsubscribe();

			expect(removeEventListener).toHaveBeenCalled();
		});

		it('should not call callback after unsubscribe', () => {
			const callback = vi.fn();
			const listeners: Array<(e: MediaQueryListEvent) => void> = [];
			const removeEventListener = vi.fn((_, handler) => {
				const index = listeners.indexOf(handler);
				if (index > -1) {
					listeners.splice(index, 1);
				}
			});

			mockMatchMedia.mockImplementation(() => ({
				matches: false,
				media: '(prefers-color-scheme: dark)',
				onchange: null,
				addEventListener: (_: string, handler: (e: MediaQueryListEvent) => void) => {
					listeners.push(handler);
				},
				removeEventListener,
				dispatchEvent: vi.fn(),
			}));

			const unsubscribe = themeService.subscribeToSystemChanges(callback);
			unsubscribe();

			if (listeners.length > 0) {
				listeners[0]!({ matches: true } as MediaQueryListEvent);
			}

			expect(callback).not.toHaveBeenCalled();
		});
	});

	describe('localStorage interaction', () => {
		it('should handle disabled localStorage', () => {
			const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
				throw new Error('localStorage is disabled');
			});

			const theme = themeService.initializeTheme();
			expect(theme).toBe('dark');

			consoleWarnSpy.mockRestore();
		});
	});
});
