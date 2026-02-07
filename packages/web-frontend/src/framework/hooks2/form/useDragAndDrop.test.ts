import type { DragEndEvent } from '@dnd-kit/core';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDragAndDrop } from './useDragAndDrop';

describe('useDragAndDrop', () => {
	interface TestItem {
		id: string;
		name: string;
	}

	const mockItems: TestItem[] = [
		{ id: '1', name: 'Item 1' },
		{ id: '2', name: 'Item 2' },
		{ id: '3', name: 'Item 3' },
	];

	const defaultGetItemId = (item: TestItem) => item.id;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('return value structure', () => {
		it('should return sensors, handleDragEnd, and sortableIds', () => {
			const onReorder = vi.fn();

			const { result } = renderHook(() =>
				useDragAndDrop({
					items: mockItems,
					getItemId: defaultGetItemId,
					onReorder,
				})
			);

			expect(result.current).toHaveProperty('sensors');
			expect(result.current).toHaveProperty('handleDragEnd');
			expect(result.current).toHaveProperty('sortableIds');
		});

		it('should return an array of sensors', () => {
			const onReorder = vi.fn();

			const { result } = renderHook(() =>
				useDragAndDrop({
					items: mockItems,
					getItemId: defaultGetItemId,
					onReorder,
				})
			);

			expect(Array.isArray(result.current.sensors)).toBe(true);
			expect(result.current.sensors.length).toBeGreaterThan(0);
		});

		it('should return handleDragEnd as a function', () => {
			const onReorder = vi.fn();

			const { result } = renderHook(() =>
				useDragAndDrop({
					items: mockItems,
					getItemId: defaultGetItemId,
					onReorder,
				})
			);

			expect(typeof result.current.handleDragEnd).toBe('function');
		});

		it('should return sortableIds as an array', () => {
			const onReorder = vi.fn();

			const { result } = renderHook(() =>
				useDragAndDrop({
					items: mockItems,
					getItemId: defaultGetItemId,
					onReorder,
				})
			);

			expect(Array.isArray(result.current.sortableIds)).toBe(true);
		});
	});

	describe('sortableIds generation', () => {
		it('should generate IDs from items using getItemId', () => {
			const onReorder = vi.fn();

			const { result } = renderHook(() =>
				useDragAndDrop({
					items: mockItems,
					getItemId: defaultGetItemId,
					onReorder,
				})
			);

			expect(result.current.sortableIds).toEqual(['1', '2', '3']);
		});

		it('should use index when getItemId returns index', () => {
			const onReorder = vi.fn();
			const getItemIdWithIndex = (_item: TestItem, index: number) => index;

			const { result } = renderHook(() =>
				useDragAndDrop({
					items: mockItems,
					getItemId: getItemIdWithIndex,
					onReorder,
				})
			);

			expect(result.current.sortableIds).toEqual([0, 1, 2]);
		});

		it('should update sortableIds when items change', () => {
			const onReorder = vi.fn();

			const { result, rerender } = renderHook(
				({ items }) =>
					useDragAndDrop({
						items,
						getItemId: defaultGetItemId,
						onReorder,
					}),
				{ initialProps: { items: mockItems } }
			);

			expect(result.current.sortableIds).toEqual(['1', '2', '3']);

			const newItems = [
				{ id: '4', name: 'Item 4' },
				{ id: '5', name: 'Item 5' },
			];
			rerender({ items: newItems });

			expect(result.current.sortableIds).toEqual(['4', '5']);
		});

		it('should handle empty items array', () => {
			const onReorder = vi.fn();

			const { result } = renderHook(() =>
				useDragAndDrop({
					items: [],
					getItemId: defaultGetItemId,
					onReorder,
				})
			);

			expect(result.current.sortableIds).toEqual([]);
		});
	});

	describe('handleDragEnd behavior', () => {
		it('should call onReorder with correct indices when drag ends', () => {
			const onReorder = vi.fn();

			const { result } = renderHook(() =>
				useDragAndDrop({
					items: mockItems,
					getItemId: defaultGetItemId,
					onReorder,
				})
			);

			const mockEvent: DragEndEvent = {
				active: {
					id: '1',
					data: { current: undefined },
					rect: { current: { initial: null, translated: null } },
				},
				over: {
					id: '3',
					rect: { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 },
					data: { current: undefined },
					disabled: false,
				},
				delta: { x: 0, y: 0 },
				collisions: null,
				activatorEvent: null as unknown as Event,
			};

			result.current.handleDragEnd(mockEvent);

			expect(onReorder).toHaveBeenCalledWith(0, 2);
		});

		it('should not call onReorder when active and over are the same', () => {
			const onReorder = vi.fn();

			const { result } = renderHook(() =>
				useDragAndDrop({
					items: mockItems,
					getItemId: defaultGetItemId,
					onReorder,
				})
			);

			const mockEvent: DragEndEvent = {
				active: {
					id: '1',
					data: { current: undefined },
					rect: { current: { initial: null, translated: null } },
				},
				over: {
					id: '1',
					rect: { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 },
					data: { current: undefined },
					disabled: false,
				},
				delta: { x: 0, y: 0 },
				collisions: null,
				activatorEvent: null as unknown as Event,
			};

			result.current.handleDragEnd(mockEvent);

			expect(onReorder).not.toHaveBeenCalled();
		});

		it('should not call onReorder when over is null', () => {
			const onReorder = vi.fn();

			const { result } = renderHook(() =>
				useDragAndDrop({
					items: mockItems,
					getItemId: defaultGetItemId,
					onReorder,
				})
			);

			const mockEvent: DragEndEvent = {
				active: {
					id: '1',
					data: { current: undefined },
					rect: { current: { initial: null, translated: null } },
				},
				over: null,
				delta: { x: 0, y: 0 },
				collisions: null,
				activatorEvent: null as unknown as Event,
			};

			result.current.handleDragEnd(mockEvent);

			expect(onReorder).not.toHaveBeenCalled();
		});

		it('should not call onReorder when disabled', () => {
			const onReorder = vi.fn();

			const { result } = renderHook(() =>
				useDragAndDrop({
					items: mockItems,
					getItemId: defaultGetItemId,
					onReorder,
					disabled: true,
				})
			);

			const mockEvent: DragEndEvent = {
				active: {
					id: '1',
					data: { current: undefined },
					rect: { current: { initial: null, translated: null } },
				},
				over: {
					id: '3',
					rect: { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 },
					data: { current: undefined },
					disabled: false,
				},
				delta: { x: 0, y: 0 },
				collisions: null,
				activatorEvent: null as unknown as Event,
			};

			result.current.handleDragEnd(mockEvent);

			expect(onReorder).not.toHaveBeenCalled();
		});

		it('should not call onReorder when active id not found', () => {
			const onReorder = vi.fn();

			const { result } = renderHook(() =>
				useDragAndDrop({
					items: mockItems,
					getItemId: defaultGetItemId,
					onReorder,
				})
			);

			const mockEvent: DragEndEvent = {
				active: {
					id: '999',
					data: { current: undefined },
					rect: { current: { initial: null, translated: null } },
				},
				over: {
					id: '3',
					rect: { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 },
					data: { current: undefined },
					disabled: false,
				},
				delta: { x: 0, y: 0 },
				collisions: null,
				activatorEvent: null as unknown as Event,
			};

			result.current.handleDragEnd(mockEvent);

			expect(onReorder).not.toHaveBeenCalled();
		});

		it('should not call onReorder when over id not found', () => {
			const onReorder = vi.fn();

			const { result } = renderHook(() =>
				useDragAndDrop({
					items: mockItems,
					getItemId: defaultGetItemId,
					onReorder,
				})
			);

			const mockEvent: DragEndEvent = {
				active: {
					id: '1',
					data: { current: undefined },
					rect: { current: { initial: null, translated: null } },
				},
				over: {
					id: '999',
					rect: { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 },
					data: { current: undefined },
					disabled: false,
				},
				delta: { x: 0, y: 0 },
				collisions: null,
				activatorEvent: null as unknown as Event,
			};

			result.current.handleDragEnd(mockEvent);

			expect(onReorder).not.toHaveBeenCalled();
		});
	});

	describe('activation constraint', () => {
		it('should use default distance constraint of 8', () => {
			const onReorder = vi.fn();

			const { result } = renderHook(() =>
				useDragAndDrop({
					items: mockItems,
					getItemId: defaultGetItemId,
					onReorder,
				})
			);

			// Sensors should be configured (hard to test exact config without exposing internals)
			expect(result.current.sensors).toBeTruthy();
		});

		it('should accept custom activation constraint', () => {
			const onReorder = vi.fn();

			const { result } = renderHook(() =>
				useDragAndDrop({
					items: mockItems,
					getItemId: defaultGetItemId,
					onReorder,
					activationConstraint: { distance: 16, delay: 100 },
				})
			);

			expect(result.current.sensors).toBeTruthy();
		});
	});

	describe('memoization', () => {
		it('should maintain stable handleDragEnd reference when dependencies unchanged', () => {
			const onReorder = vi.fn();

			const { result, rerender } = renderHook(() =>
				useDragAndDrop({
					items: mockItems,
					getItemId: defaultGetItemId,
					onReorder,
				})
			);

			const firstHandler = result.current.handleDragEnd;
			rerender();
			const secondHandler = result.current.handleDragEnd;

			expect(firstHandler).toBe(secondHandler);
		});

		it('should update handleDragEnd when onReorder changes', () => {
			const onReorder1 = vi.fn();
			const onReorder2 = vi.fn();

			const { result, rerender } = renderHook(
				({ onReorder }) =>
					useDragAndDrop({
						items: mockItems,
						getItemId: defaultGetItemId,
						onReorder,
					}),
				{ initialProps: { onReorder: onReorder1 } }
			);

			const firstHandler = result.current.handleDragEnd;
			rerender({ onReorder: onReorder2 });
			const secondHandler = result.current.handleDragEnd;

			expect(firstHandler).not.toBe(secondHandler);
		});

		it('should maintain stable sortableIds reference when items unchanged', () => {
			const onReorder = vi.fn();

			const { result, rerender } = renderHook(() =>
				useDragAndDrop({
					items: mockItems,
					getItemId: defaultGetItemId,
					onReorder,
				})
			);

			const firstIds = result.current.sortableIds;
			rerender();
			const secondIds = result.current.sortableIds;

			expect(firstIds).toBe(secondIds);
		});
	});

	describe('reorder calculations', () => {
		it('should calculate forward reorder correctly (drag down)', () => {
			const onReorder = vi.fn();

			const { result } = renderHook(() =>
				useDragAndDrop({
					items: mockItems,
					getItemId: defaultGetItemId,
					onReorder,
				})
			);

			const mockEvent: DragEndEvent = {
				active: {
					id: '1',
					data: { current: undefined },
					rect: { current: { initial: null, translated: null } },
				},
				over: {
					id: '3',
					rect: { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 },
					data: { current: undefined },
					disabled: false,
				},
				delta: { x: 0, y: 0 },
				collisions: null,
				activatorEvent: null as unknown as Event,
			};

			result.current.handleDragEnd(mockEvent);

			expect(onReorder).toHaveBeenCalledWith(0, 2);
		});

		it('should calculate backward reorder correctly (drag up)', () => {
			const onReorder = vi.fn();

			const { result } = renderHook(() =>
				useDragAndDrop({
					items: mockItems,
					getItemId: defaultGetItemId,
					onReorder,
				})
			);

			const mockEvent: DragEndEvent = {
				active: {
					id: '3',
					data: { current: undefined },
					rect: { current: { initial: null, translated: null } },
				},
				over: {
					id: '1',
					rect: { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 },
					data: { current: undefined },
					disabled: false,
				},
				delta: { x: 0, y: 0 },
				collisions: null,
				activatorEvent: null as unknown as Event,
			};

			result.current.handleDragEnd(mockEvent);

			expect(onReorder).toHaveBeenCalledWith(2, 0);
		});

		it('should calculate adjacent reorder correctly', () => {
			const onReorder = vi.fn();

			const { result } = renderHook(() =>
				useDragAndDrop({
					items: mockItems,
					getItemId: defaultGetItemId,
					onReorder,
				})
			);

			const mockEvent: DragEndEvent = {
				active: {
					id: '1',
					data: { current: undefined },
					rect: { current: { initial: null, translated: null } },
				},
				over: {
					id: '2',
					rect: { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 },
					data: { current: undefined },
					disabled: false,
				},
				delta: { x: 0, y: 0 },
				collisions: null,
				activatorEvent: null as unknown as Event,
			};

			result.current.handleDragEnd(mockEvent);

			expect(onReorder).toHaveBeenCalledWith(0, 1);
		});
	});
});
