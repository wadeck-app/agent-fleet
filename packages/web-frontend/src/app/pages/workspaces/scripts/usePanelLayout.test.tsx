import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import { act, renderHook, waitFor } from '@testing-library/react';

import { usePanelLayout } from './usePanelLayout';

/**
 * Tests for usePanelLayout hook - URL state management
 *
 * Verifies:
 * - URL encoding/decoding of script IDs
 * - Layout modes (full, split, grid)
 * - Panel IDs are preserved (not regenerated)
 * - URL sync bidirectional
 */

// Helper to get current URL search params
let currentLocation: ReturnType<typeof useLocation> | null = null;

// Helper to wrap hook with router context
const wrapper = ({ children, initialUrl = '/' }: { children: ReactNode; initialUrl?: string }) => {
	const LocationTracker = () => {
		currentLocation = useLocation();
		return null;
	};

	return (
		<MemoryRouter initialEntries={[initialUrl]}>
			<LocationTracker />
			<Routes>
				<Route path="/" element={<div>{children}</div>} />
			</Routes>
		</MemoryRouter>
	);
};

// Helper to get search params from router
const getSearchParams = () => {
	if (!currentLocation) return new URLSearchParams();
	return new URLSearchParams(currentLocation.search);
};

describe('usePanelLayout - URL State Management', () => {
	const workspaceId = 'test-workspace';

	beforeEach(() => {
		// Clear localStorage before each test
		localStorage.clear();
		// Clear location
		window.history.replaceState({}, '', '/');
	});

	describe('Critical: Script Names in URL (not IDs)', () => {
		it('should use script NAMES in URL, not generated IDs', async () => {
			const { result } = renderHook(() => usePanelLayout({ workspaceId }), {
				wrapper: ({ children }) => wrapper({ children, initialUrl: '/' }),
			});

			// Set a script with a recognizable NAME
			act(() => {
				result.current.setScriptForPanel(result.current.panels[0].id, 'dev:backend');
			});

			// Wait for URL to update
			await waitFor(() => {
				const panels = getSearchParams().get('panels');
				expect(panels).toBe('dev%3Abackend');
			});

			const panels = getSearchParams().get('panels');
			// Verify it's the script name, not an ID like "script-abc-123"
			expect(panels).not.toMatch(/^[a-f0-9-]{36}$/); // Not a UUID
			expect(panels).not.toMatch(/^script-[0-9]+/); // Not a generated ID
		});

		it('CRITICAL: URL should NOT lose scripts on page refresh (split layout)', async () => {
			// Simulate initial page load with 2 scripts in split layout
			const { result: result1, unmount } = renderHook(() => usePanelLayout({ workspaceId }), {
				wrapper: ({ children }) =>
					wrapper({ children, initialUrl: '/?layout=split&panels=dev%3Abackend,dev%3Afrontend' }),
			});

			// Wait for effects to complete and verify initial load
			await waitFor(() => {
				expect(result1.current.mode).toBe('split');
				expect(result1.current.panels).toHaveLength(2);
			});
			expect(result1.current.panels[0].scriptName).toBe('dev:backend');
			expect(result1.current.panels[1].scriptName).toBe('dev:frontend');

			// Get URL after initial load
			const panelsAfterLoad = getSearchParams().get('panels');

			// Unmount (simulate page close)
			unmount();

			// Simulate page refresh with same URL
			const { result: result2 } = renderHook(() => usePanelLayout({ workspaceId }), {
				wrapper: ({ children }) =>
					wrapper({ children, initialUrl: `/?layout=split&panels=${panelsAfterLoad}` }),
			});

			// Wait for effects to complete - CRITICAL: Both scripts should still be there!
			await waitFor(() => {
				expect(result2.current.mode).toBe('split');
				expect(result2.current.panels).toHaveLength(2);
			});
			expect(result2.current.panels[0].scriptName).toBe('dev:backend');
			expect(result2.current.panels[1].scriptName).toBe('dev:frontend');

			// URL should be identical
			const panelsAfterRefresh = getSearchParams().get('panels');
			expect(panelsAfterRefresh).toBe(panelsAfterLoad);
		});
	});

	describe('URL Encoding/Decoding', () => {
		it('should encode special characters in script IDs', async () => {
			const { result } = renderHook(() => usePanelLayout({ workspaceId }), {
				wrapper: ({ children }) => wrapper({ children, initialUrl: '/' }),
			});

			act(() => {
				result.current.setScriptForPanel(result.current.panels[0].id, 'npm:dev:backend');
			});

			// Check URL contains encoded colon
			await waitFor(() => {
				const panels = getSearchParams().get('panels');
				expect(panels).toBe('npm%3Adev%3Abackend');
			});
		});

		it('should decode URL-encoded script IDs', () => {
			const { result } = renderHook(() => usePanelLayout({ workspaceId }), {
				wrapper: ({ children }) => wrapper({ children, initialUrl: '/?panels=npm%3Adev%3Abackend' }),
			});

			expect(result.current.panels[0].scriptName).toBe('npm:dev:backend');
		});

		it('should handle multiple scripts with encoding', async () => {
			const { result } = renderHook(() => usePanelLayout({ workspaceId }), {
				wrapper: ({ children }) =>
					wrapper({ children, initialUrl: '/?layout=split&panels=npm%3Adev,npm%3Atest' }),
			});

			await waitFor(() => {
				expect(result.current.mode).toBe('split');
				expect(result.current.panels).toHaveLength(2);
			});
			expect(result.current.panels[0].scriptName).toBe('npm:dev');
			expect(result.current.panels[1].scriptName).toBe('npm:test');
		});
	});

	describe('Layout Modes', () => {
		it('should initialize with full layout from URL', () => {
			const { result } = renderHook(() => usePanelLayout({ workspaceId }), {
				wrapper: ({ children }) => wrapper({ children, initialUrl: '/?layout=full&panels=script-1' }),
			});

			expect(result.current.mode).toBe('full');
			expect(result.current.panels).toHaveLength(1);
		});

		it('should initialize with split layout from URL', async () => {
			const { result } = renderHook(() => usePanelLayout({ workspaceId }), {
				wrapper: ({ children }) => wrapper({ children, initialUrl: '/?layout=split&panels=script-1,script-2' }),
			});

			await waitFor(() => {
				expect(result.current.mode).toBe('split');
				expect(result.current.panels).toHaveLength(2);
			});
			expect(result.current.panels[0].scriptName).toBe('script-1');
			expect(result.current.panels[1].scriptName).toBe('script-2');
		});

		it('should initialize with grid layout from URL', async () => {
			const { result } = renderHook(() => usePanelLayout({ workspaceId }), {
				wrapper: ({ children }) =>
					wrapper({ children, initialUrl: '/?layout=grid&panels=script-1,script-2,script-3,script-4' }),
			});

			await waitFor(() => {
				expect(result.current.mode).toBe('grid');
				expect(result.current.panels).toHaveLength(4);
			});
		});

		it('should update URL when layout mode changes', async () => {
			const { result } = renderHook(() => usePanelLayout({ workspaceId }), {
				wrapper: ({ children }) => wrapper({ children, initialUrl: '/?layout=full' }),
			});

			act(() => {
				result.current.setLayoutMode('split');
			});

			await waitFor(() => {
				const layout = getSearchParams().get('layout');
				expect(layout).toBe('split');
			});
		});
	});

	describe('Panel ID Preservation', () => {
		it('should preserve panel IDs when updating scriptNames from URL', () => {
			const { result, rerender } = renderHook(() => usePanelLayout({ workspaceId }), {
				wrapper: ({ children }) => wrapper({ children, initialUrl: '/?panels=script-1' }),
			});

			const originalPanelId = result.current.panels[0].id;

			// Simulate URL change
			act(() => {
				result.current.setScriptForPanel(result.current.panels[0].id, 'script-2');
			});

			rerender();

			// Panel ID should be the same
			expect(result.current.panels[0].id).toBe(originalPanelId);
			expect(result.current.panels[0].scriptName).toBe('script-2');
		});

		it('should not regenerate panel IDs when reading from URL', () => {
			// First render with script-1
			const { result, rerender } = renderHook(() => usePanelLayout({ workspaceId }), {
				wrapper: ({ children }) => wrapper({ children, initialUrl: '/?panels=script-1' }),
			});

			const originalPanelId = result.current.panels[0].id;

			// Rerender (simulating URL change in browser)
			rerender();

			// Panel ID should still be the same
			expect(result.current.panels[0].id).toBe(originalPanelId);
		});
	});

	describe('Bidirectional URL Sync', () => {
		it('should write script selection to URL', async () => {
			const { result } = renderHook(() => usePanelLayout({ workspaceId }), {
				wrapper: ({ children }) => wrapper({ children, initialUrl: '/' }),
			});

			act(() => {
				result.current.setScriptForPanel(result.current.panels[0].id, 'my-script');
			});

			await waitFor(() => {
				const panels = getSearchParams().get('panels');
				expect(panels).toBe('my-script');
			});
		});

		it('should read script selection from URL and update state', () => {
			const { result } = renderHook(() => usePanelLayout({ workspaceId }), {
				wrapper: ({ children }) => wrapper({ children, initialUrl: '/?panels=url-script' }),
			});

			expect(result.current.panels[0].scriptName).toBe('url-script');
		});

		it('should handle empty panels in URL', async () => {
			const { result } = renderHook(() => usePanelLayout({ workspaceId }), {
				wrapper: ({ children }) => wrapper({ children, initialUrl: '/?layout=split&panels=script-1,' }),
			});

			await waitFor(() => {
				expect(result.current.panels).toHaveLength(2);
			});
			expect(result.current.panels[0].scriptName).toBe('script-1');
			expect(result.current.panels[1].scriptName).toBeNull();
		});
	});

	describe('Edge Cases', () => {
		it('should handle script IDs with slashes', async () => {
			const { result } = renderHook(() => usePanelLayout({ workspaceId }), {
				wrapper: ({ children }) => wrapper({ children, initialUrl: '/' }),
			});

			act(() => {
				result.current.setScriptForPanel(result.current.panels[0].id, 'packages/web-backend/dev');
			});

			await waitFor(() => {
				const panels = getSearchParams().get('panels');
				expect(panels).toContain('%2F'); // slash encoded
			});
		});

		it('should handle script IDs with spaces', async () => {
			const { result } = renderHook(() => usePanelLayout({ workspaceId }), {
				wrapper: ({ children }) => wrapper({ children, initialUrl: '/' }),
			});

			act(() => {
				result.current.setScriptForPanel(result.current.panels[0].id, 'my script');
			});

			await waitFor(() => {
				const panels = getSearchParams().get('panels');
				expect(panels).toBe('my%20script');
			});
		});
	});
});
