import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useUrlState } from './useUrlState';

// Mock react-router-dom
const mockUseSearchParams = vi.hoisted(() => vi.fn());
const mockSetSearchParams = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', () => ({
	useSearchParams: mockUseSearchParams,
}));

// Mock localStorage
const mockLocalStorage = (() => {
	let store: Record<string, string> = {};

	return {
		getItem: vi.fn((key: string) => store[key] || null),
		setItem: vi.fn((key: string, value: string) => {
			store[key] = value;
		}),
		removeItem: vi.fn((key: string) => {
			delete store[key];
		}),
		clear: () => {
			store = {};
		},
	};
})();

Object.defineProperty(window, 'localStorage', {
	value: mockLocalStorage,
});

describe('useUrlState', () => {
	let searchParams: URLSearchParams;

	beforeEach(() => {
		searchParams = new URLSearchParams();
		mockSetSearchParams.mockClear();
		mockUseSearchParams.mockReturnValue([searchParams, mockSetSearchParams]);
		mockLocalStorage.clear();
		vi.clearAllMocks();

		// Mock window.location.search
		Object.defineProperty(window, 'location', {
			value: {
				search: '',
			},
			writable: true,
		});
	});

	describe('Scenario 1: Simple independent groups (project, workspace, view)', () => {
		it('should manage simple independent parameters', () => {
			const { result: projectResult } = renderHook(() =>
				useUrlState({
					key: 'projectId',
					defaultValue: null as string | null,
				})
			);

			const { result: viewResult } = renderHook(() =>
				useUrlState({
					key: 'view',
					defaultValue: 'tasks',
				})
			);

			expect(projectResult.current[0]).toBe(null);
			expect(viewResult.current[0]).toBe('tasks');
		});

		it('should update independent parameters without affecting each other', () => {
			const { result: projectResult } = renderHook(() =>
				useUrlState({
					key: 'projectId',
					defaultValue: null as string | null,
				})
			);

			const { result: viewResult } = renderHook(() =>
				useUrlState({
					key: 'view',
					defaultValue: 'tasks',
				})
			);

			act(() => {
				projectResult.current[1]('p1');
			});

			expect(projectResult.current[0]).toBe('p1');
			expect(viewResult.current[0]).toBe('tasks');
		});

		it('should clean up URL params that equal defaultValue', () => {
			searchParams.set('view', 'tasks');
			window.location.search = '?view=tasks';

			renderHook(() =>
				useUrlState({
					key: 'view',
					defaultValue: 'tasks',
					cleanupDefault: true,
				})
			);

			// Wait for effect to run and clean up
			waitFor(() => {
				expect(mockSetSearchParams).toHaveBeenCalled();
				const lastCall = mockSetSearchParams.mock.calls[mockSetSearchParams.mock.calls.length - 1];
				const newParams = lastCall[0];
				expect(newParams.has('view')).toBe(false);
			});
		});

		it('should not clean up URL params when cleanupDefault is false', () => {
			searchParams.set('view', 'tasks');

			const { result } = renderHook(() =>
				useUrlState({
					key: 'view',
					defaultValue: 'tasks',
					cleanupDefault: false,
				})
			);

			expect(result.current[0]).toBe('tasks');
			// Should not remove param even though it equals default
		});
	});

	describe('Scenario 2: Isolated groups with namespaces', () => {
		it('should create namespaced parameters', () => {
			const { result: projectIdResult } = renderHook(() =>
				useUrlState({
					key: 'id',
					groupId: 'project',
					defaultValue: null as string | null,
				})
			);

			const { result: workspaceIdResult } = renderHook(() =>
				useUrlState({
					key: 'id',
					groupId: 'workspace',
					defaultValue: null as string | null,
				})
			);

			act(() => {
				projectIdResult.current[1]('p1');
			});

			act(() => {
				workspaceIdResult.current[1]('w1');
			});

			expect(projectIdResult.current[0]).toBe('p1');
			expect(workspaceIdResult.current[0]).toBe('w1');
		});

		it('should read namespaced parameters from URL', () => {
			searchParams.set('project.id', 'p1');
			searchParams.set('workspace.id', 'w1');

			const { result: projectIdResult } = renderHook(() =>
				useUrlState({
					key: 'id',
					groupId: 'project',
					defaultValue: null as string | null,
				})
			);

			const { result: workspaceIdResult } = renderHook(() =>
				useUrlState({
					key: 'id',
					groupId: 'workspace',
					defaultValue: null as string | null,
				})
			);

			expect(projectIdResult.current[0]).toBe('p1');
			expect(workspaceIdResult.current[0]).toBe('w1');
		});

		it('should not confuse parameters with same key but different groups', () => {
			const { result: projectIdResult } = renderHook(() =>
				useUrlState({
					key: 'id',
					groupId: 'project',
					defaultValue: null as string | null,
				})
			);

			const { result: workspaceIdResult } = renderHook(() =>
				useUrlState({
					key: 'id',
					groupId: 'workspace',
					defaultValue: null as string | null,
				})
			);

			act(() => {
				projectIdResult.current[1]('p1');
			});

			expect(projectIdResult.current[0]).toBe('p1');
			expect(workspaceIdResult.current[0]).toBe(null);
		});
	});

	describe('Scenario 3: Nested groups with parent-child reset', () => {
		it('should reset child when parent changes', () => {
			let parentValue: string | null = 'p1';

			renderHook(() =>
				useUrlState({
					key: 'id',
					groupId: 'project',
					defaultValue: null as string | null,
				})
			);

			const { result: childResult, rerender } = renderHook(() =>
				useUrlState({
					key: 'id',
					groupId: 'workspace',
					parentGroupId: 'project',
					parentValue: parentValue,
					defaultValue: null as string | null,
				})
			);

			// Set child value
			act(() => {
				childResult.current[1]('w1');
			});

			expect(childResult.current[0]).toBe('w1');

			// Change parent value and rerender
			parentValue = 'p2';
			rerender();

			// Child should reset to default
			waitFor(() => {
				expect(childResult.current[0]).toBe(null);
			});
		});

		it('should not reset child when parent value stays the same', () => {
			const parentValue: string | null = 'p1';

			const { result: childResult, rerender } = renderHook(() =>
				useUrlState({
					key: 'id',
					groupId: 'workspace',
					parentGroupId: 'project',
					parentValue: parentValue,
					defaultValue: null as string | null,
				})
			);

			// Set child value
			act(() => {
				childResult.current[1]('w1');
			});

			expect(childResult.current[0]).toBe('w1');

			// Rerender without changing parent
			rerender();

			// Child should not reset
			expect(childResult.current[0]).toBe('w1');
		});

		it('should handle multi-level nesting', () => {
			let projectId: string | null = 'p1';
			let workspaceId: string | null = 'w1';

			const { result: projectResult } = renderHook(() =>
				useUrlState({
					key: 'id',
					groupId: 'project',
					defaultValue: null as string | null,
				})
			);

			const { result: workspaceResult, rerender: rerenderWorkspace } = renderHook(() =>
				useUrlState({
					key: 'id',
					groupId: 'workspace',
					parentGroupId: 'project',
					parentValue: projectId,
					defaultValue: null as string | null,
				})
			);

			const { result: taskResult, rerender: rerenderTask } = renderHook(() =>
				useUrlState({
					key: 'id',
					groupId: 'task',
					parentGroupId: 'workspace',
					parentValue: workspaceId,
					defaultValue: null as string | null,
				})
			);

			// Set all values
			act(() => {
				projectResult.current[1]('p1');
			});
			act(() => {
				workspaceResult.current[1]('w1');
			});
			act(() => {
				taskResult.current[1]('t1');
			});

			expect(taskResult.current[0]).toBe('t1');

			// Change project, should reset workspace and task
			projectId = 'p2';
			rerenderWorkspace();

			waitFor(() => {
				expect(workspaceResult.current[0]).toBe(null);
			});

			// Task should also reset when workspace resets
			workspaceId = null;
			rerenderTask();

			waitFor(() => {
				expect(taskResult.current[0]).toBe(null);
			});
		});
	});

	describe('Scenario 4: Complex types with custom serialization', () => {
		it('should serialize and deserialize objects', () => {
			interface Filters {
				status: string[];
				priority: string[];
			}

			const { result } = renderHook(() =>
				useUrlState<Filters>({
					key: 'filters',
					defaultValue: { status: [], priority: [] },
					serialize: value => JSON.stringify(value),
					deserialize: str => JSON.parse(str),
				})
			);

			act(() => {
				result.current[1]({ status: ['open', 'in-progress'], priority: ['high'] });
			});

			expect(result.current[0]).toEqual({
				status: ['open', 'in-progress'],
				priority: ['high'],
			});
		});

		it('should serialize and deserialize arrays', () => {
			const { result } = renderHook(() =>
				useUrlState<string[]>({
					key: 'tags',
					defaultValue: [],
					serialize: value => value.join(','),
					deserialize: str => str.split(',').filter(Boolean),
				})
			);

			act(() => {
				result.current[1](['react', 'typescript', 'testing']);
			});

			expect(result.current[0]).toEqual(['react', 'typescript', 'testing']);
		});

		it('should handle serialization errors gracefully', () => {
			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const { result } = renderHook(() =>
				useUrlState({
					key: 'data',
					defaultValue: 'default',
					serialize: () => {
						throw new Error('Serialization failed');
					},
				})
			);

			act(() => {
				result.current[1]('new value');
			});

			expect(consoleErrorSpy).toHaveBeenCalled();
			consoleErrorSpy.mockRestore();
		});

		it('should handle deserialization errors gracefully', () => {
			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			searchParams.set('data', 'invalid-json');

			const { result } = renderHook(() =>
				useUrlState({
					key: 'data',
					defaultValue: { value: 'default' },
					deserialize: str => JSON.parse(str),
				})
			);

			// Should fall back to default value
			expect(result.current[0]).toEqual({ value: 'default' });
			expect(consoleErrorSpy).toHaveBeenCalled();
			consoleErrorSpy.mockRestore();
		});
	});

	describe('Scenario 5: Rapid state updates', () => {
		it('should handle rapid state updates without debouncing', async () => {
			const { result } = renderHook(() =>
				useUrlState({
					key: 'search',
					defaultValue: '',
				})
			);

			// Rapid updates
			act(() => {
				result.current[1]('a');
			});
			act(() => {
				result.current[1]('ab');
			});
			act(() => {
				result.current[1]('abc');
			});

			// State should update immediately
			expect(result.current[0]).toBe('abc');

			// URL should update immediately (no debouncing)
			await waitFor(
				() => {
					expect(mockSetSearchParams).toHaveBeenCalled();
				},
				{ timeout: 200 }
			);

			// Verify URL was updated with final value
			const lastCall = mockSetSearchParams.mock.calls[mockSetSearchParams.mock.calls.length - 1];
			const params = lastCall[0] as URLSearchParams;
			expect(params.get('search')).toBe('abc');
		});

		it('should update URL immediately with each state change', async () => {
			const { result } = renderHook(() =>
				useUrlState({
					key: 'search',
					defaultValue: '',
				})
			);

			act(() => {
				result.current[1]('test');
			});

			// State updates immediately
			expect(result.current[0]).toBe('test');

			// URL should update in next effect cycle
			await waitFor(() => {
				expect(mockSetSearchParams).toHaveBeenCalled();
			});
		});

		it('should handle function setters correctly', async () => {
			const { result } = renderHook(() =>
				useUrlState({
					key: 'counter',
					defaultValue: 0,
				})
			);

			// Update using function setter
			act(() => {
				result.current[1](prev => prev + 1);
			});

			expect(result.current[0]).toBe(1);

			await waitFor(() => {
				expect(mockSetSearchParams).toHaveBeenCalled();
			});

			// Verify URL was updated
			const lastCall = mockSetSearchParams.mock.calls[mockSetSearchParams.mock.calls.length - 1];
			const params = lastCall[0] as URLSearchParams;
			expect(params.get('counter')).toBe('1');
		});
	});

	describe('Edge cases and browser history', () => {
		it('should handle browser back/forward navigation', () => {
			searchParams.set('view', 'tasks');

			const { result, rerender } = renderHook(() =>
				useUrlState({
					key: 'view',
					defaultValue: 'tasks',
				})
			);

			expect(result.current[0]).toBe('tasks');

			// Simulate browser back changing URL
			searchParams.set('view', 'scripts');
			mockUseSearchParams.mockReturnValue([searchParams, mockSetSearchParams]);

			rerender();

			waitFor(() => {
				expect(result.current[0]).toBe('scripts');
			});
		});

		it('should handle special characters in values', () => {
			const { result } = renderHook(() =>
				useUrlState({
					key: 'search',
					defaultValue: '',
				})
			);

			const specialValue = 'test & value = special?';
			act(() => {
				result.current[1](specialValue);
			});

			expect(result.current[0]).toBe(specialValue);
		});

		it('should handle empty strings vs null', () => {
			const { result } = renderHook(() =>
				useUrlState({
					key: 'value',
					defaultValue: null as string | null,
				})
			);

			act(() => {
				result.current[1]('');
			});

			expect(result.current[0]).toBe('');
			expect(result.current[0]).not.toBe(null);
		});

		it('should handle very long values', () => {
			const longValue = 'a'.repeat(1000);

			const { result } = renderHook(() =>
				useUrlState({
					key: 'data',
					defaultValue: '',
				})
			);

			act(() => {
				result.current[1](longValue);
			});

			expect(result.current[0]).toBe(longValue);
		});

		it('should handle unicode characters', () => {
			const unicodeValue = '你好 世界 🌍';

			const { result } = renderHook(() =>
				useUrlState({
					key: 'text',
					defaultValue: '',
				})
			);

			act(() => {
				result.current[1](unicodeValue);
			});

			expect(result.current[0]).toBe(unicodeValue);
		});

		it('should clean up nested children when parent group is reset', () => {
			const { result } = renderHook(() =>
				useUrlState({
					key: 'id',
					groupId: 'project',
					defaultValue: null as string | null,
				})
			);

			// Set up URL with nested params
			searchParams.set('project.id', 'p1');
			searchParams.set('project.workspace.id', 'w1');
			searchParams.set('project.workspace.task.id', 't1');
			window.location.search = '?project.id=p1&project.workspace.id=w1&project.workspace.task.id=t1';

			// Reset project to default
			act(() => {
				result.current[1](null as string | null);
			});

			// Should clean up all nested children
			waitFor(() => {
				const lastCall = mockSetSearchParams.mock.calls[mockSetSearchParams.mock.calls.length - 1];
				const newParams = lastCall[0];
				expect(newParams.has('project.id')).toBe(false);
				expect(newParams.has('project.workspace.id')).toBe(false);
				expect(newParams.has('project.workspace.task.id')).toBe(false);
			});
		});
	});
});
