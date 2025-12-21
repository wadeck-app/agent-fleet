import { useCallback, useEffect, useState } from 'react';

import { type Theme, themeService } from './ThemeService';

/**
 * ===========================================================================================
 * USE THEME HOOK - Theme State Management
 * ===========================================================================================
 *
 * Custom hook for managing application theme state.
 * - Initializes theme from service (localStorage > system > default)
 * - Applies theme to document element
 * - Subscribes to system preference changes
 * - Provides theme state and control functions
 *
 * ===========================================================================================
 */

export interface UseThemeResult {
	theme: Theme;
	toggleTheme: () => void;
	setTheme: (theme: Theme) => void;
}

export function useTheme(): UseThemeResult {
	// Lazy initialization - only run once on mount
	const [theme, setThemeState] = useState<Theme>(() => themeService.initializeTheme());

	// Apply .dark class to document.documentElement when theme changes
	useEffect(() => {
		if (theme === 'dark') {
			document.documentElement.classList.add('dark');
		} else {
			document.documentElement.classList.remove('dark');
		}
	}, [theme]);

	// Subscribe to system preference changes
	// Only update if user hasn't manually set a preference
	useEffect(() => {
		const unsubscribe = themeService.subscribeToSystemChanges(newTheme => {
			const stored = localStorage.getItem('app_theme_preference');
			if (!stored) {
				setThemeState(newTheme);
			}
		});

		return unsubscribe;
	}, []);

	// useCallback for stable references
	// IMPORTANT: React Compiler does NOT auto-stabilize these functions
	// (explicit note in useBooks.ts lines 47-51)
	const toggleTheme = useCallback(() => {
		setThemeState(currentTheme => themeService.toggleTheme(currentTheme));
	}, []);

	const setTheme = useCallback((newTheme: Theme) => {
		setThemeState(newTheme);
		localStorage.setItem('app_theme_preference', newTheme);
	}, []);

	return {
		theme,
		toggleTheme,
		setTheme,
	};
}
