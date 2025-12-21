import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { themeService } from './ThemeService';
import { useTheme } from './useTheme';

// Mock the service layer
vi.mock('./ThemeService', () => ({
	themeService: {
		initializeTheme: vi.fn(),
		toggleTheme: vi.fn(),
		subscribeToSystemChanges: vi.fn(),
	},
}));

describe('useTheme', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.clear();
		document.documentElement.classList.remove('dark');
	});

	describe('initialization', () => {
		it('should initialize theme from service', () => {
			(themeService.initializeTheme as any).mockReturnValue('dark');
			const { result } = renderHook(() => useTheme());
			expect(result.current.theme).toBe('dark');
		});

		it('should apply dark class to document.documentElement', () => {
			(themeService.initializeTheme as any).mockReturnValue('dark');
			renderHook(() => useTheme());
			expect(document.documentElement.classList.contains('dark')).toBe(true);
		});

		it('should remove dark class for light theme', () => {
			(themeService.initializeTheme as any).mockReturnValue('light');
			renderHook(() => useTheme());
			expect(document.documentElement.classList.contains('dark')).toBe(false);
		});
	});

	describe('toggleTheme', () => {
		it('should toggle theme via service', () => {
			(themeService.initializeTheme as any).mockReturnValue('light');
			(themeService.toggleTheme as any).mockReturnValue('dark');
			const { result } = renderHook(() => useTheme());

			act(() => {
				result.current.toggleTheme();
			});

			expect(themeService.toggleTheme).toHaveBeenCalledWith('light');
		});

		it('should update document class after toggle', () => {
			(themeService.initializeTheme as any).mockReturnValue('light');
			(themeService.toggleTheme as any).mockReturnValue('dark');
			const { result } = renderHook(() => useTheme());

			expect(document.documentElement.classList.contains('dark')).toBe(false);

			act(() => {
				result.current.toggleTheme();
			});

			expect(document.documentElement.classList.contains('dark')).toBe(true);
		});
	});

	describe('setTheme', () => {
		it('should set theme directly', () => {
			(themeService.initializeTheme as any).mockReturnValue('light');
			const { result } = renderHook(() => useTheme());

			act(() => {
				result.current.setTheme('dark');
			});

			expect(result.current.theme).toBe('dark');
		});

		it('should update document class', () => {
			(themeService.initializeTheme as any).mockReturnValue('light');
			const { result } = renderHook(() => useTheme());

			act(() => {
				result.current.setTheme('dark');
			});

			expect(document.documentElement.classList.contains('dark')).toBe(true);
		});

		it('should persist to localStorage', () => {
			(themeService.initializeTheme as any).mockReturnValue('light');
			const { result } = renderHook(() => useTheme());

			act(() => {
				result.current.setTheme('dark');
			});

			expect(localStorage.getItem('app_theme_preference')).toBe('dark');
		});
	});

	describe('system preference changes', () => {
		it('should subscribe to system changes on mount', () => {
			(themeService.initializeTheme as any).mockReturnValue('light');
			(themeService.subscribeToSystemChanges as any).mockReturnValue(() => {});

			renderHook(() => useTheme());

			expect(themeService.subscribeToSystemChanges).toHaveBeenCalled();
		});

		it('should unsubscribe on unmount', () => {
			const unsubscribe = vi.fn();
			(themeService.initializeTheme as any).mockReturnValue('light');
			(themeService.subscribeToSystemChanges as any).mockReturnValue(unsubscribe);

			const { unmount } = renderHook(() => useTheme());

			unmount();

			expect(unsubscribe).toHaveBeenCalled();
		});

		it('should not override user preference when system changes', () => {
			(themeService.initializeTheme as any).mockReturnValue('light');
			let systemCallback: (theme: any) => void = () => {};
			(themeService.subscribeToSystemChanges as any).mockImplementation((cb: any) => {
				systemCallback = cb;
				return () => {};
			});

			const { result } = renderHook(() => useTheme());

			localStorage.setItem('app_theme_preference', 'light');

			act(() => {
				systemCallback('dark');
			});

			expect(result.current.theme).toBe('light');
		});
	});

	describe('document class management', () => {
		it('should add dark class for dark theme', () => {
			(themeService.initializeTheme as any).mockReturnValue('dark');
			renderHook(() => useTheme());

			expect(document.documentElement.classList.contains('dark')).toBe(true);
		});

		it('should remove dark class for light theme', () => {
			(themeService.initializeTheme as any).mockReturnValue('light');
			renderHook(() => useTheme());

			expect(document.documentElement.classList.contains('dark')).toBe(false);
		});

		it('should update class when theme changes', () => {
			(themeService.initializeTheme as any).mockReturnValue('light');
			const { result } = renderHook(() => useTheme());

			expect(document.documentElement.classList.contains('dark')).toBe(false);

			act(() => {
				result.current.setTheme('dark');
			});

			expect(document.documentElement.classList.contains('dark')).toBe(true);
		});
	});
});
