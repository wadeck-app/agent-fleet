import { beforeEach, describe, expect, it } from 'vitest';

import { MultiSelectManager } from './MultiSelectManager';

interface TestItem {
	id: string;
	name: string;
}

describe('MultiSelectManager', () => {
	let items: TestItem[];
	let manager: MultiSelectManager<TestItem>;

	beforeEach(() => {
		items = [
			{ id: '1', name: 'Item 1' },
			{ id: '2', name: 'Item 2' },
			{ id: '3', name: 'Item 3' },
			{ id: '4', name: 'Item 4' },
			{ id: '5', name: 'Item 5' },
			{ id: '6', name: 'Item 6' },
			{ id: '7', name: 'Item 7' },
			{ id: '8', name: 'Item 8' },
		];
		manager = new MultiSelectManager(items, item => item.id);
	});

	describe('Basic Functionality', () => {
		it('should initialize with no selections', () => {
			expect(manager.getSelectedIds().size).toBe(0);
			expect(manager.isAllSelected()).toBe(false);
			expect(manager.isSomeSelected()).toBe(false);
		});

		it('should toggle selection on', () => {
			const result = manager.toggleSelection('2', 1);
			expect(result).toEqual(new Set(['2']));
			expect(manager.isSelected('2')).toBe(true);
		});

		it('should toggle selection off', () => {
			manager.toggleSelection('2', 1);
			const result = manager.toggleSelection('2', 1);
			expect(result).toEqual(new Set());
			expect(manager.isSelected('2')).toBe(false);
		});

		it('should select all', () => {
			const result = manager.selectAll();
			expect(result.size).toBe(8);
			expect(manager.isAllSelected()).toBe(true);
		});

		it('should deselect all', () => {
			manager.selectAll();
			const result = manager.deselectAll();
			expect(result.size).toBe(0);
		});
	});

	describe('Gmail-like Shift+Click Behavior', () => {
		interface Scenario {
			name: string;
			initial: number[]; // Index array, e.g., [2, 3, 4] = items at index 2, 3, 4
			clicks: Array<{ index: number; shift?: boolean }>;
			expected: number[]; // Index array, e.g., [2, 3] = items at index 2, 3
		}

		const runScenario = (scenario: Scenario) => {
			// Convert index arrays to ID sets
			const initialIds = scenario.initial.map(i => items[i]!.id);
			const expectedIds = scenario.expected.map(i => items[i]!.id);

			// Set initial selection
			manager.setSelectedIds(new Set(initialIds));

			// Execute clicks
			let result: Set<string> = new Set();
			for (const click of scenario.clicks) {
				result = manager.toggleSelection(items[click.index]!.id, click.index, {
					shiftKey: click.shift,
				});
			}

			// Check final selection
			expect(Array.from(result).sort()).toEqual(expectedIds.sort());
		};

		it('Example 1: Pre-selected 3-4-5-6, click 7, shift+click 4 → keeps 3', () => {
			runScenario({
				name: 'Gmail Example 1',
				initial: [2, 3, 4, 5], // Items at index 2-5 = '3', '4', '5', '6'
				clicks: [
					{ index: 6 }, // Click 7
					{ index: 3, shift: true }, // Shift+click 4
				],
				expected: [2], // Item at index 2 = '3'
			});
		});

		it('Example 2: Click 3, shift+click 8, shift+click 5 → keeps 3-4', () => {
			runScenario({
				name: 'Gmail Example 2',
				initial: [],
				clicks: [
					{ index: 2 }, // Click 3
					{ index: 7, shift: true }, // Shift+click 8
					{ index: 4, shift: true }, // Shift+click 5
				],
				expected: [2, 3], // Items at index 2-3 = '3', '4'
			});
		});

		it('should extend selection forward', () => {
			runScenario({
				name: 'Forward extension',
				initial: [],
				clicks: [
					{ index: 2 }, // Click 3
					{ index: 5, shift: true }, // Shift+click 6
				],
				expected: [2, 3, 4, 5], // Index 2-5 = '3', '4', '5', '6'
			});
		});

		it('should extend selection backward', () => {
			runScenario({
				name: 'Backward extension',
				initial: [],
				clicks: [
					{ index: 5 }, // Click 6
					{ index: 2, shift: true }, // Shift+click 3
				],
				expected: [2, 3, 4, 5], // Index 2-5 = '3', '4', '5', '6'
			});
		});

		it('should shrink forward range from end', () => {
			runScenario({
				name: 'Shrink forward range',
				initial: [],
				clicks: [
					{ index: 1 }, // Click 2
					{ index: 6, shift: true }, // Shift+click 7
					{ index: 4, shift: true }, // Shift+click 5
				],
				expected: [1, 2, 3], // Index 1-3 = '2', '3', '4'
			});
		});

		it('should shrink backward range from end', () => {
			runScenario({
				name: 'Shrink backward range',
				initial: [],
				clicks: [
					{ index: 6 }, // Click 7
					{ index: 1, shift: true }, // Shift+click 2
					{ index: 4, shift: true }, // Shift+click 5
				],
				expected: [4, 5, 6], // Index 4-6 = '5', '6', '7'
			});
		});

		it('should extend again after shrinking', () => {
			runScenario({
				name: 'Extend after shrink',
				initial: [],
				clicks: [
					{ index: 2 }, // Click 3
					{ index: 6, shift: true }, // Shift+click 7
					{ index: 4, shift: true }, // Shift+click 5 (shrink to 3-4)
					{ index: 7, shift: true }, // Shift+click 8 (extend to 3-8)
				],
				expected: [2, 3, 4, 5, 6, 7], // Index 2-7 = '3', '4', '5', '6', '7', '8'
			});
		});

		it('should reset anchor and range on normal click', () => {
			runScenario({
				name: 'Normal click resets',
				initial: [],
				clicks: [
					{ index: 1 }, // Click 2 (selects 2)
					{ index: 4, shift: true }, // Shift+click 5 (selects 2-5)
					{ index: 1 }, // Click 2 again (deselects 2, resets anchor)
					{ index: 6 }, // Click 7 (selects 7, new anchor)
					{ index: 4, shift: true }, // Shift+click 5 (selects 5-7)
				],
				expected: [2, 3, 4, 5, 6], // Index 2-6 = '3', '4', '5', '6', '7' (2 was deselected)
			});
		});

		it('should handle multiple shrinks in succession', () => {
			runScenario({
				name: 'Multiple shrinks',
				initial: [],
				clicks: [
					{ index: 0 }, // Click 1
					{ index: 7, shift: true }, // Shift+click 8
					{ index: 5, shift: true }, // Shift+click 6 (shrink)
					{ index: 3, shift: true }, // Shift+click 4 (shrink)
					{ index: 1, shift: true }, // Shift+click 2 (shrink)
				],
				expected: [0], // Index 0 = '1'
			});
		});

		it('should deselect entire range when no previous range end', () => {
			runScenario({
				name: 'Deselect whole range',
				initial: [1, 2, 3, 4], // Index 1-4 = '2', '3', '4', '5'
				clicks: [
					{ index: 1 }, // Click 2 (already selected, so deselects it)
					{ index: 1 }, // Click 2 again (selects it, sets anchor)
					{ index: 4, shift: true }, // Shift+click 5 (all [2-5] selected, deselect range)
				],
				expected: [],
			});
		});

		it('should shrink forward then backward', () => {
			runScenario({
				name: 'Shrink forward range from larger selection',
				initial: [],
				clicks: [
					{ index: 2 }, // Click 3 (select 3)
					{ index: 6, shift: true }, // Shift+click 7 (select 3-7)
					{ index: 4, shift: true }, // Shift+click 5 (shrink to 3-4)
				],
				expected: [2, 3], // Index 2-3 = '3', '4'
			});
		});

		it('should extend range progressively', () => {
			runScenario({
				name: 'Progressive range extension',
				initial: [],
				clicks: [
					{ index: 2 }, // Click 3 (select 3)
					{ index: 4, shift: true }, // Shift+click 5 (select 3-5)
					{ index: 6, shift: true }, // Shift+click 7 (extend to 3-7)
				],
				expected: [2, 3, 4, 5, 6], // Index 2-6 = '3', '4', '5', '6', '7'
			});
		});

		it('should handle shift+click after multiple normal clicks', () => {
			runScenario({
				name: 'Shift+click after multiple selections',
				initial: [],
				clicks: [
					{ index: 2 }, // Click 3 (select 3, anchor = 2)
					{ index: 4 }, // Click 5 (select 5, anchor = 4)
					{ index: 6 }, // Click 7 (select 7, anchor = 6)
					{ index: 3, shift: true }, // Shift+click 4 (range from last anchor 6 to 3)
				],
				expected: [2, 3, 4, 5, 6], // Index 2-6 = '3', '4', '5', '6', '7'
			});
		});

		it('should handle normal click mid-range then shift+click', () => {
			runScenario({
				name: 'Reset anchor with normal click mid-range',
				initial: [],
				clicks: [
					{ index: 2 }, // Click 3 (select 3)
					{ index: 6, shift: true }, // Shift+click 7 (select 3-7)
					{ index: 3 }, // Click 4 (toggle 4 off, sets anchor = 3)
					{ index: 5, shift: true }, // Shift+click 6 (range from 3 to 5 = select 4-6)
				],
				expected: [2, 3, 4, 5, 6], // Index 2-6 = '3','4','5','6','7' (4 was toggled off, then 4-6 reselected by shift+click)
			});
		});

		it('should handle deselect then shift+click from that anchor', () => {
			runScenario({
				name: 'Deselect sets anchor for shift+click',
				initial: [],
				clicks: [
					{ index: 3 }, // Click 4 (select 4)
					{ index: 6, shift: true }, // Shift+click 7 (select 4-7)
					{ index: 7 }, // Click 8 (select 8)
					{ index: 7 }, // Click 8 again (deselect 8, but anchor = 7)
					{ index: 1, shift: true }, // Shift+click 2 (range from 7 to 1 = select 2-8)
				],
				expected: [1, 2, 3, 4, 5, 6, 7], // Index 1-7 = '2','3','4','5','6','7','8'
			});
		});

		it('should handle multiple selections then shift+click', () => {
			runScenario({
				name: 'Multiple selections then shift range',
				initial: [],
				clicks: [
					{ index: 2 }, // Click 3 (select 3, anchor = 2)
					{ index: 6 }, // Click 7 (select 7, anchor = 6)
					{ index: 4 }, // Click 5 (select 5, anchor = 4)
					{ index: 7, shift: true }, // Shift+click 8 (range from 4 to 7 = select 5-8)
				],
				expected: [2, 4, 5, 6, 7], // Index 2,4,5,6,7 = '3','5','6','7','8'
			});
		});
	});

	describe('Single Mode', () => {
		beforeEach(() => {
			manager = new MultiSelectManager(items, item => item.id, 'single');
		});

		it('should only allow one selection', () => {
			manager.toggleSelection('2', 1);
			const result = manager.toggleSelection('4', 3);
			expect(result).toEqual(new Set(['4']));
		});

		it('should deselect when clicking selected item', () => {
			manager.toggleSelection('2', 1);
			const result = manager.toggleSelection('2', 1);
			expect(result.size).toBe(0);
		});

		it('should not do range selection in single mode', () => {
			manager.toggleSelection('2', 1);
			const result = manager.toggleSelection('4', 3, { shiftKey: true });
			expect(result).toEqual(new Set(['4']));
		});
	});
});
