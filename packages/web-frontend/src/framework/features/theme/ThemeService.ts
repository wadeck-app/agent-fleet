/**
 * ===========================================================================================
 * THEME SERVICE - Centralized Theme Management Service
 * ===========================================================================================
 *
 * Provides centralized theme management with:
 * - System preference detection (prefers-color-scheme)
 * - Local storage persistence
 * - Theme toggle functionality
 * - System preference change subscription
 *
 * ===========================================================================================
 */

export type Theme = 'light' | 'dark';

class ThemeServiceClass {
	private readonly STORAGE_KEY = 'app_theme_preference';

	/**
	 * Initialize theme with priority: localStorage > system preference > dark default
	 */
	initializeTheme(): Theme {
		// 1. Check localStorage first
		const stored = this.getStoredTheme();
		if (stored) {
			return stored;
		}

		// 2. Detect system preference
		const systemPreference = this.detectSystemPreference();
		if (systemPreference) {
			this.setStoredTheme(systemPreference);
			return systemPreference;
		}

		// 3. Default to dark mode
		this.setStoredTheme('dark');
		return 'dark';
	}

	/**
	 * Detect system color scheme preference using matchMedia
	 */
	private detectSystemPreference(): Theme | null {
		if (typeof window === 'undefined' || !window.matchMedia) {
			return null;
		}

		if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
			return 'dark';
		}
		if (window.matchMedia('(prefers-color-scheme: light)').matches) {
			return 'light';
		}
		return null;
	}

	/**
	 * Get stored theme from localStorage with validation
	 */
	private getStoredTheme(): Theme | null {
		try {
			const stored = localStorage.getItem(this.STORAGE_KEY);
			if (stored === 'light' || stored === 'dark') {
				return stored;
			}
			return null;
		} catch (err) {
			console.warn('Failed to read theme from localStorage:', err);
			return null;
		}
	}

	/**
	 * Save theme to localStorage with error handling
	 */
	private setStoredTheme(theme: Theme): void {
		try {
			localStorage.setItem(this.STORAGE_KEY, theme);
		} catch (err) {
			console.warn('Failed to save theme to localStorage:', err);
		}
	}

	/**
	 * Toggle between light and dark themes
	 */
	toggleTheme(currentTheme: Theme): Theme {
		const newTheme = currentTheme === 'light' ? 'dark' : 'light';
		this.setStoredTheme(newTheme);
		return newTheme;
	}

	/**
	 * Subscribe to system preference changes
	 * @returns Unsubscribe function
	 */
	subscribeToSystemChanges(callback: (theme: Theme) => void): () => void {
		if (typeof window === 'undefined' || !window.matchMedia) {
			return () => {};
		}

		const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
		const handler = (e: MediaQueryListEvent) => {
			callback(e.matches ? 'dark' : 'light');
		};

		darkModeQuery.addEventListener('change', handler);
		return () => darkModeQuery.removeEventListener('change', handler);
	}
}

// Export singleton instance
export const themeService = new ThemeServiceClass();

// Export type for testing
export type { ThemeServiceClass };
