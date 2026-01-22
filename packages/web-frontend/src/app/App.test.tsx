import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

// @formatter:off
// Mock useMediaQuery to prevent matchMedia errors in tests
vi.mock('@framework/hooks/useMediaQuery');
// Mock useAuth to provide authenticated state
vi.mock('@app/hooks/useAuth');
// @formatter:on

describe('App - Theme Integration', () => {
	beforeEach(async () => {
		localStorage.clear();
		document.documentElement.classList.remove('dark');

		// @formatter:off
		// Mock useMediaQuery to return false (desktop mode) by default
		const { useMediaQuery } = await import('@framework/hooks/useMediaQuery');
		vi.mocked(useMediaQuery).mockReturnValue(false);

		// Mock useAuth to return authenticated state
		const { useAuth } = await import('@app/hooks/useAuth');
		vi.mocked(useAuth).mockReturnValue({
			state: {
				authenticated: true,
				userId: 'test-user',
				expiresAt: Date.now() + 3600000,
				loading: false,
			},
			login: vi.fn(),
			logout: vi.fn(),
			checkSession: vi.fn(),
		});
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

		// Check for navigation links that exist in navigationConfig
		const dashboardLink = screen.getByText('Dashboard');
		const booksLink = screen.getByText('Books');

		expect(dashboardLink).toBeInTheDocument();
		expect(booksLink).toBeInTheDocument();
	});
});
