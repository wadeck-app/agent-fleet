import type { LogEntry } from '@shared/api/tasks.contract';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useLogSelection } from './useLogSelection';

// Helper to create test log entries
function createLog(id: string, timestamp: number, stepId: string = 's1'): LogEntry {
	return {
		id,
		timestamp,
		level: 'info',
		message: `Log ${id}`,
		stepId,
		stepName: stepId,
		stepType: 'script',
	};
}

describe('useLogSelection', () => {
	let mockHistoryReplaceState: ReturnType<typeof vi.fn>;
	let mockScrollIntoView: ReturnType<typeof vi.fn>;
	let mockQuerySelector: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		// Mock window.history.replaceState
		mockHistoryReplaceState = vi.fn();
		Object.defineProperty(window, 'history', {
			value: { replaceState: mockHistoryReplaceState },
			writable: true,
		});

		// Mock document.querySelector
		mockScrollIntoView = vi.fn();
		mockQuerySelector = vi.fn();
		Object.defineProperty(document, 'querySelector', {
			value: mockQuerySelector,
			writable: true,
			configurable: true,
		});

		// Mock window.location
		Object.defineProperty(window, 'location', {
			value: {
				hash: '',
				pathname: '/tasks/task-123',
				search: '',
			},
			writable: true,
			configurable: true,
		});

		vi.clearAllMocks();
	});

	describe('initial state', () => {
		it('should initialize with empty selection', () => {
			const logs = [createLog('log-1', 100), createLog('log-2', 200)];
			const { result } = renderHook(() => useLogSelection(logs));

			expect(result.current.selectedLogIds.size).toBe(0);
			expect(result.current.anchorLogId).toBe(null);
		});

		it('should handle empty logs array', () => {
			const { result } = renderHook(() => useLogSelection([]));

			expect(result.current.selectedLogIds.size).toBe(0);
			expect(result.current.anchorLogId).toBe(null);
		});
	});

	describe('single click selection', () => {
		it('should select a log entry on click', () => {
			const logs = [createLog('log-1', 100), createLog('log-2', 200)];
			const { result } = renderHook(() => useLogSelection(logs));

			act(() => {
				result.current.handleLogClick('log-1', false);
			});

			expect(result.current.selectedLogIds.has('log-1')).toBe(true);
			expect(result.current.selectedLogIds.size).toBe(1);
			expect(result.current.anchorLogId).toBe('log-1');
		});

		it('should update URL hash when selecting a single entry', () => {
			const logs = [createLog('log-1', 100), createLog('log-2', 200)];
			const { result } = renderHook(() => useLogSelection(logs));

			act(() => {
				result.current.handleLogClick('log-1', false);
			});

			expect(mockHistoryReplaceState).toHaveBeenCalledWith(null, '', '#log-log-1');
		});

		it('should switch selection to different entry when clicking another log', () => {
			const logs = [createLog('log-1', 100), createLog('log-2', 200)];
			const { result } = renderHook(() => useLogSelection(logs));

			act(() => {
				result.current.handleLogClick('log-1', false);
			});

			act(() => {
				result.current.handleLogClick('log-2', false);
			});

			expect(result.current.selectedLogIds.has('log-1')).toBe(false);
			expect(result.current.selectedLogIds.has('log-2')).toBe(true);
			expect(result.current.selectedLogIds.size).toBe(1);
			expect(result.current.anchorLogId).toBe('log-2');
			expect(mockHistoryReplaceState).toHaveBeenCalledWith(null, '', '#log-log-2');
		});
	});

	describe('toggle off (deselection)', () => {
		it('should deselect when clicking an already-selected single entry', () => {
			const logs = [createLog('log-1', 100), createLog('log-2', 200)];
			const { result } = renderHook(() => useLogSelection(logs));

			// Select log-1
			act(() => {
				result.current.handleLogClick('log-1', false);
			});

			expect(result.current.selectedLogIds.has('log-1')).toBe(true);

			// Click log-1 again to deselect
			act(() => {
				result.current.handleLogClick('log-1', false);
			});

			expect(result.current.selectedLogIds.size).toBe(0);
			expect(result.current.anchorLogId).toBe(null);
		});

		it('should remove URL hash when deselecting', () => {
			const logs = [createLog('log-1', 100), createLog('log-2', 200)];
			const { result } = renderHook(() => useLogSelection(logs));

			// Select log-1
			act(() => {
				result.current.handleLogClick('log-1', false);
			});

			mockHistoryReplaceState.mockClear();

			// Deselect log-1
			act(() => {
				result.current.handleLogClick('log-1', false);
			});

			expect(mockHistoryReplaceState).toHaveBeenCalledWith(null, '', '/tasks/task-123');
		});

		it('should NOT deselect when clicking a different entry', () => {
			const logs = [createLog('log-1', 100), createLog('log-2', 200)];
			const { result } = renderHook(() => useLogSelection(logs));

			act(() => {
				result.current.handleLogClick('log-1', false);
			});

			act(() => {
				result.current.handleLogClick('log-2', false);
			});

			// Should select log-2, not deselect
			expect(result.current.selectedLogIds.has('log-2')).toBe(true);
			expect(result.current.selectedLogIds.size).toBe(1);
		});

		it('should NOT deselect when clicking a selected entry within a range', () => {
			const logs = [createLog('log-1', 100), createLog('log-2', 200), createLog('log-3', 300)];
			const { result } = renderHook(() => useLogSelection(logs));

			// Select log-1
			act(() => {
				result.current.handleLogClick('log-1', false);
			});

			// Shift-click log-3 to create range
			act(() => {
				result.current.handleLogClick('log-3', true);
			});

			expect(result.current.selectedLogIds.size).toBe(3);

			// Click log-2 (which is selected as part of range)
			act(() => {
				result.current.handleLogClick('log-2', false);
			});

			// Should collapse to single selection of log-2, not deselect
			expect(result.current.selectedLogIds.has('log-2')).toBe(true);
			expect(result.current.selectedLogIds.size).toBe(1);
			expect(result.current.anchorLogId).toBe('log-2');
		});
	});

	describe('shift-click range selection', () => {
		it('should select a range from anchor to clicked entry', () => {
			const logs = [
				createLog('log-1', 100),
				createLog('log-2', 200),
				createLog('log-3', 300),
				createLog('log-4', 400),
			];
			const { result } = renderHook(() => useLogSelection(logs));

			// Select log-1 as anchor
			act(() => {
				result.current.handleLogClick('log-1', false);
			});

			// Shift-click log-3 to select range
			act(() => {
				result.current.handleLogClick('log-3', true);
			});

			expect(result.current.selectedLogIds.has('log-1')).toBe(true);
			expect(result.current.selectedLogIds.has('log-2')).toBe(true);
			expect(result.current.selectedLogIds.has('log-3')).toBe(true);
			expect(result.current.selectedLogIds.has('log-4')).toBe(false);
			expect(result.current.selectedLogIds.size).toBe(3);
			expect(result.current.anchorLogId).toBe('log-1');
		});

		it('should update URL hash with range format', () => {
			const logs = [createLog('log-1', 100), createLog('log-2', 200), createLog('log-3', 300)];
			const { result } = renderHook(() => useLogSelection(logs));

			act(() => {
				result.current.handleLogClick('log-1', false);
			});

			act(() => {
				result.current.handleLogClick('log-3', true);
			});

			expect(mockHistoryReplaceState).toHaveBeenCalledWith(null, '', '#log-log-1:log-3');
		});

		it('should select range in reverse direction (bottom to top)', () => {
			const logs = [createLog('log-1', 100), createLog('log-2', 200), createLog('log-3', 300)];
			const { result } = renderHook(() => useLogSelection(logs));

			// Select log-3 as anchor
			act(() => {
				result.current.handleLogClick('log-3', false);
			});

			// Shift-click log-1 (upwards)
			act(() => {
				result.current.handleLogClick('log-1', true);
			});

			expect(result.current.selectedLogIds.has('log-1')).toBe(true);
			expect(result.current.selectedLogIds.has('log-2')).toBe(true);
			expect(result.current.selectedLogIds.has('log-3')).toBe(true);
			expect(result.current.selectedLogIds.size).toBe(3);
		});

		it('should update URL hash in correct order when selecting reverse range', () => {
			const logs = [createLog('log-1', 100), createLog('log-2', 200), createLog('log-3', 300)];
			const { result } = renderHook(() => useLogSelection(logs));

			act(() => {
				result.current.handleLogClick('log-3', false);
			});

			act(() => {
				result.current.handleLogClick('log-1', true);
			});

			// Hash should maintain start:end format (log-1:log-3, not log-3:log-1)
			expect(mockHistoryReplaceState).toHaveBeenCalledWith(null, '', '#log-log-1:log-3');
		});

		it('should extend range when shift-clicking a new entry', () => {
			const logs = [
				createLog('log-1', 100),
				createLog('log-2', 200),
				createLog('log-3', 300),
				createLog('log-4', 400),
			];
			const { result } = renderHook(() => useLogSelection(logs));

			act(() => {
				result.current.handleLogClick('log-2', false);
			});

			act(() => {
				result.current.handleLogClick('log-3', true);
			});

			// Extend to log-4
			act(() => {
				result.current.handleLogClick('log-4', true);
			});

			expect(result.current.selectedLogIds.size).toBe(3);
			expect(result.current.selectedLogIds.has('log-2')).toBe(true);
			expect(result.current.selectedLogIds.has('log-3')).toBe(true);
			expect(result.current.selectedLogIds.has('log-4')).toBe(true);
			expect(result.current.selectedLogIds.has('log-1')).toBe(false);
		});

		it('should handle shift-click with no anchor (falls through to single selection)', () => {
			const logs = [createLog('log-1', 100), createLog('log-2', 200)];
			const { result } = renderHook(() => useLogSelection(logs));

			// Shift-click without anchor: anchorLogId is null, so shift condition fails,
			// falls through to single selection
			act(() => {
				result.current.handleLogClick('log-1', true);
			});

			expect(result.current.selectedLogIds.size).toBe(1);
			expect(result.current.selectedLogIds.has('log-1')).toBe(true);
		});

		it('should handle shift-click on anchor itself (toggle off since already selected)', () => {
			const logs = [createLog('log-1', 100), createLog('log-2', 200)];
			const { result } = renderHook(() => useLogSelection(logs));

			act(() => {
				result.current.handleLogClick('log-1', false);
			});

			// Shift-click same log: anchorLogId === logId so shift condition fails,
			// then toggle-off condition matches (single selected entry clicked again)
			act(() => {
				result.current.handleLogClick('log-1', true);
			});

			expect(result.current.selectedLogIds.size).toBe(0);
			expect(result.current.anchorLogId).toBe(null);
		});
	});

	describe('URL hash initialization', () => {
		it('should restore single selection from hash on mount', () => {
			window.location.hash = '#log-log-2';
			const logs = [createLog('log-1', 100), createLog('log-2', 200), createLog('log-3', 300)];

			const { result } = renderHook(() => useLogSelection(logs));

			expect(result.current.selectedLogIds.has('log-2')).toBe(true);
			expect(result.current.selectedLogIds.size).toBe(1);
			expect(result.current.anchorLogId).toBe('log-2');
		});

		it('should restore range selection from hash on mount', () => {
			window.location.hash = '#log-log-1:log-3';
			const logs = [createLog('log-1', 100), createLog('log-2', 200), createLog('log-3', 300)];

			const { result } = renderHook(() => useLogSelection(logs));

			expect(result.current.selectedLogIds.has('log-1')).toBe(true);
			expect(result.current.selectedLogIds.has('log-2')).toBe(true);
			expect(result.current.selectedLogIds.has('log-3')).toBe(true);
			expect(result.current.selectedLogIds.size).toBe(3);
			expect(result.current.anchorLogId).toBe('log-1');
		});

		it('should handle reverse range in hash (end:start)', () => {
			window.location.hash = '#log-log-3:log-1';
			const logs = [createLog('log-1', 100), createLog('log-2', 200), createLog('log-3', 300)];

			const { result } = renderHook(() => useLogSelection(logs));

			// Should still select all entries in between
			expect(result.current.selectedLogIds.has('log-1')).toBe(true);
			expect(result.current.selectedLogIds.has('log-2')).toBe(true);
			expect(result.current.selectedLogIds.has('log-3')).toBe(true);
			expect(result.current.selectedLogIds.size).toBe(3);
		});

		it('should ignore invalid hash format', () => {
			window.location.hash = '#invalid-format';
			const logs = [createLog('log-1', 100), createLog('log-2', 200)];

			const { result } = renderHook(() => useLogSelection(logs));

			expect(result.current.selectedLogIds.size).toBe(0);
			expect(result.current.anchorLogId).toBe(null);
		});

		it('should ignore hash with non-existent log ID', () => {
			window.location.hash = '#log-nonexistent';
			const logs = [createLog('log-1', 100), createLog('log-2', 200)];

			const { result } = renderHook(() => useLogSelection(logs));

			expect(result.current.selectedLogIds.size).toBe(0);
			expect(result.current.anchorLogId).toBe(null);
		});

		it('should ignore hash range with invalid start or end ID', () => {
			window.location.hash = '#log-log-1:nonexistent';
			const logs = [createLog('log-1', 100), createLog('log-2', 200)];

			const { result } = renderHook(() => useLogSelection(logs));

			expect(result.current.selectedLogIds.size).toBe(0);
		});

		it('should not re-initialize from hash when logs change', () => {
			window.location.hash = '#log-log-2';
			const { result, rerender } = renderHook(({ logs }) => useLogSelection(logs), {
				initialProps: {
					logs: [createLog('log-1', 100), createLog('log-2', 200)],
				},
			});

			expect(result.current.selectedLogIds.has('log-2')).toBe(true);

			// User selects different log
			act(() => {
				result.current.handleLogClick('log-1', false);
			});

			expect(result.current.selectedLogIds.has('log-1')).toBe(true);
			expect(result.current.selectedLogIds.has('log-2')).toBe(false);

			// Logs change (e.g., new logs arrive)
			rerender({ logs: [createLog('log-1', 100), createLog('log-2', 200), createLog('log-3', 300)] });

			// Should NOT re-initialize from hash
			expect(result.current.selectedLogIds.has('log-1')).toBe(true);
			expect(result.current.selectedLogIds.has('log-2')).toBe(false);
		});

		it('should handle empty logs array on mount with hash', () => {
			window.location.hash = '#log-log-1';
			const { result, rerender } = renderHook(({ logs }: { logs: LogEntry[] }) => useLogSelection(logs), {
				initialProps: { logs: [] as LogEntry[] },
			});

			// No selection until logs arrive
			expect(result.current.selectedLogIds.size).toBe(0);

			// Logs arrive
			rerender({ logs: [createLog('log-1', 100), createLog('log-2', 200)] });

			// Should initialize from hash now
			expect(result.current.selectedLogIds.has('log-1')).toBe(true);
			expect(result.current.selectedLogIds.size).toBe(1);
		});
	});

	describe('scrollToSelection', () => {
		it('should scroll to first selected element', () => {
			const mockElement = { scrollIntoView: mockScrollIntoView };
			mockQuerySelector.mockReturnValue(mockElement);

			const logs = [createLog('log-1', 100), createLog('log-2', 200)];
			window.location.hash = '#log-log-1';

			const { result } = renderHook(() => useLogSelection(logs));

			act(() => {
				result.current.scrollToSelection();
			});

			expect(mockQuerySelector).toHaveBeenCalledWith('[data-log-id="log-1"]');
			expect(mockScrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
		});

		it('should not scroll if no selection', () => {
			const logs = [createLog('log-1', 100), createLog('log-2', 200)];
			const { result } = renderHook(() => useLogSelection(logs));

			act(() => {
				result.current.scrollToSelection();
			});

			expect(mockQuerySelector).not.toHaveBeenCalled();
		});

		it('should not scroll if element not found', () => {
			mockQuerySelector.mockReturnValue(null);

			window.location.hash = '#log-log-1';
			const logs = [createLog('log-1', 100), createLog('log-2', 200)];
			const { result } = renderHook(() => useLogSelection(logs));

			act(() => {
				result.current.scrollToSelection();
			});

			expect(mockQuerySelector).toHaveBeenCalled();
			expect(mockScrollIntoView).not.toHaveBeenCalled();
		});

		it('should scroll on hash initialization', () => {
			const mockElement = { scrollIntoView: mockScrollIntoView };
			mockQuerySelector.mockReturnValue(mockElement);

			window.location.hash = '#log-log-2';
			const logs = [createLog('log-1', 100), createLog('log-2', 200)];
			const { result } = renderHook(() => useLogSelection(logs));

			// Scroll should be triggered after hash initialization
			act(() => {
				result.current.scrollToSelection();
			});

			expect(mockScrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
		});

		it('should not scroll multiple times', () => {
			const mockElement = { scrollIntoView: mockScrollIntoView };
			mockQuerySelector.mockReturnValue(mockElement);

			window.location.hash = '#log-log-1';
			const logs = [createLog('log-1', 100), createLog('log-2', 200)];
			const { result } = renderHook(() => useLogSelection(logs));

			act(() => {
				result.current.scrollToSelection();
			});

			expect(mockScrollIntoView).toHaveBeenCalledTimes(1);

			// Call again - should not scroll
			act(() => {
				result.current.scrollToSelection();
			});

			expect(mockScrollIntoView).toHaveBeenCalledTimes(1);
		});
	});

	describe('edge cases', () => {
		it('should handle rapid clicks on different entries', () => {
			const logs = [createLog('log-1', 100), createLog('log-2', 200), createLog('log-3', 300)];
			const { result } = renderHook(() => useLogSelection(logs));

			act(() => {
				result.current.handleLogClick('log-1', false);
				result.current.handleLogClick('log-2', false);
				result.current.handleLogClick('log-3', false);
			});

			expect(result.current.selectedLogIds.has('log-3')).toBe(true);
			expect(result.current.selectedLogIds.size).toBe(1);
		});

		it('should handle logs with special characters in IDs', () => {
			const logs = [createLog('log-1:special', 100), createLog('log-2:special', 200)];
			const { result } = renderHook(() => useLogSelection(logs));

			act(() => {
				result.current.handleLogClick('log-1:special', false);
			});

			expect(result.current.selectedLogIds.has('log-1:special')).toBe(true);
		});

		it('should preserve selection state across re-renders', () => {
			const { result, rerender } = renderHook(({ logs }) => useLogSelection(logs), {
				initialProps: {
					logs: [createLog('log-1', 100), createLog('log-2', 200)],
				},
			});

			act(() => {
				result.current.handleLogClick('log-1', false);
			});

			expect(result.current.selectedLogIds.has('log-1')).toBe(true);

			// Re-render with same logs
			rerender({ logs: [createLog('log-1', 100), createLog('log-2', 200)] });

			expect(result.current.selectedLogIds.has('log-1')).toBe(true);
		});

		it('should handle window.location with search params', () => {
			Object.defineProperty(window, 'location', {
				value: {
					hash: '',
					pathname: '/tasks/task-123',
					search: '?filter=error',
				},
				writable: true,
				configurable: true,
			});

			const logs = [createLog('log-1', 100), createLog('log-2', 200)];
			const { result } = renderHook(() => useLogSelection(logs));

			act(() => {
				result.current.handleLogClick('log-1', false);
			});

			// Deselect
			act(() => {
				result.current.handleLogClick('log-1', false);
			});

			// Should preserve search params
			expect(mockHistoryReplaceState).toHaveBeenCalledWith(null, '', '/tasks/task-123?filter=error');
		});

		it('should handle very large log arrays efficiently', () => {
			const logs = Array.from({ length: 1000 }, (_, i) => createLog(`log-${i}`, i * 100));
			const { result } = renderHook(() => useLogSelection(logs));

			// Select range across many entries
			act(() => {
				result.current.handleLogClick('log-0', false);
			});

			act(() => {
				result.current.handleLogClick('log-999', true);
			});

			expect(result.current.selectedLogIds.size).toBe(1000);
		});
	});
});
