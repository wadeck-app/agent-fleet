import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

// @formatter:off
// Mock useMediaQuery to prevent matchMedia errors in tests
vi.mock('@framework/hooks/useMediaQuery');
// @formatter:on

describe('App - Theme Integration', () => {
	beforeEach(async () => {
		localStorage.clear();
		document.documentElement.classList.remove('dark');

		// @formatter:off
		// Mock useMediaQuery to return false (desktop mode) by default
		const { useMediaQuery } = await import('@framework/hooks/useMediaQuery');
		vi.mocked(useMediaQuery).mockReturnValue(false);
		// @formatter:on
	});

	it('should render user menu in navigation', () => {
		render(<App />);
		const userMenuButton = screen.getByText('User');
		expect(userMenuButton).toBeInTheDocument();
	});

	it('should restore theme from localStorage on mount', () => {
		localStorage.setItem('app_theme_preference', 'dark');

		render(<App />);

		expect(document.documentElement.classList.contains('dark')).toBe(true);
	});

	it('should render navigation links', () => {
		render(<App />);

		const ingredientsLink = screen.getByText('Ingredients');
		const booksLink = screen.getByText('Books');

		expect(ingredientsLink).toBeInTheDocument();
		expect(booksLink).toBeInTheDocument();
	});
});
