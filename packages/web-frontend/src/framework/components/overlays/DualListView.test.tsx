import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DualListView } from './DualListView';

/**
 * ===========================================================================================
 * VISUAL TESTS FOR DualListView
 * ===========================================================================================
 *
 * Pure UI tests without mocks - verify visual rendering and user interactions.
 *
 * Test categories:
 * 1. Rendering: Left/right items, empty states, titles
 * 2. Visual states: Loading (opacity-50), reordering (opacity-50)
 * 3. Search: Filter right items based on query
 * 4. Callbacks: Forward click events to callbacks
 *
 * These tests do NOT test business logic - they only test presentation.
 *
 * ===========================================================================================
 */

interface MockItem {
	id: string;
	name: string;
}

const mockItems: MockItem[] = [
	{ id: 'item-1', name: 'Item One' },
	{ id: 'item-2', name: 'Item Two' },
	{ id: 'item-3', name: 'Item Three' },
	{ id: 'item-4', name: 'Item Four' },
];

describe('DualListView - Rendering', () => {
	it('should render left and right items correctly', () => {
		const leftItems = [mockItems[0], mockItems[1]];
		const rightItems = [mockItems[2], mockItems[3]];

		render(
			<DualListView
				leftItems={leftItems}
				rightItems={rightItems}
				itemKey={item => item.id}
				loadingItems={new Set()}
				reorderingItems={new Set()}
				leftTitle="Associated"
				rightTitle="Available"
				renderItem={(item, side) => <div data-testid={`${side}-${item.id}`}>{item.name}</div>}
				searchFilter={(item, query) => item.name.toLowerCase().includes(query.toLowerCase())}
				onAssociate={vi.fn()}
				onDissociate={vi.fn()}
			/>
		);

		// Verify left items
		expect(screen.getByTestId('left-item-1')).toHaveTextContent('Item One');
		expect(screen.getByTestId('left-item-2')).toHaveTextContent('Item Two');

		// Verify right items
		expect(screen.getByTestId('right-item-3')).toHaveTextContent('Item Three');
		expect(screen.getByTestId('right-item-4')).toHaveTextContent('Item Four');
	});

	it('should render titles and help text', () => {
		render(
			<DualListView
				leftItems={[]}
				rightItems={[]}
				itemKey={(item: MockItem) => item.id}
				loadingItems={new Set()}
				reorderingItems={new Set()}
				leftTitle="Pinned Projects"
				rightTitle="Available Projects"
				leftHelpText="Drag to reorder"
				rightHelpText="Click to pin"
				renderItem={(item: MockItem, _side) => <div>{item.name}</div>}
				searchFilter={(item: MockItem, query) => item.name.toLowerCase().includes(query.toLowerCase())}
				onAssociate={vi.fn()}
				onDissociate={vi.fn()}
			/>
		);

		expect(screen.getByText('Pinned Projects')).toBeInTheDocument();
		expect(screen.getByText('Available Projects')).toBeInTheDocument();
		expect(screen.getByText('Drag to reorder')).toBeInTheDocument();
		expect(screen.getByText('Click to pin')).toBeInTheDocument();
	});

	it('should render empty state when no left items', () => {
		render(
			<DualListView
				leftItems={[]}
				rightItems={mockItems}
				itemKey={item => item.id}
				loadingItems={new Set()}
				reorderingItems={new Set()}
				leftTitle="Associated"
				rightTitle="Available"
				leftEmptyState={<div data-testid="custom-empty">No associated items</div>}
				renderItem={(item, _side) => <div>{item.name}</div>}
				searchFilter={(item, query) => item.name.toLowerCase().includes(query.toLowerCase())}
				onAssociate={vi.fn()}
				onDissociate={vi.fn()}
			/>
		);

		expect(screen.getByTestId('custom-empty')).toHaveTextContent('No associated items');
	});

	it('should render default empty state when no right items', () => {
		render(
			<DualListView
				leftItems={mockItems}
				rightItems={[]}
				itemKey={item => item.id}
				loadingItems={new Set()}
				reorderingItems={new Set()}
				leftTitle="Associated"
				rightTitle="Available"
				renderItem={(item, _side) => <div>{item.name}</div>}
				searchFilter={(item, query) => item.name.toLowerCase().includes(query.toLowerCase())}
				onAssociate={vi.fn()}
				onDissociate={vi.fn()}
			/>
		);

		expect(screen.getByText('No items')).toBeInTheDocument();
	});
});

describe('DualListView - Visual States', () => {
	it('should pass isLoading=true to renderItem for loading items', () => {
		const loadingItems = new Set(['item-1']);
		const renderItem = vi.fn((item, side, visualState) => (
			<div data-testid={`item-${item.id}`} className={visualState.isLoading ? 'loading' : ''}>
				{item.name}
			</div>
		));

		render(
			<DualListView
				leftItems={[mockItems[0], mockItems[1]]}
				rightItems={[mockItems[2]]}
				itemKey={item => item.id}
				loadingItems={loadingItems}
				reorderingItems={new Set()}
				leftTitle="Associated"
				rightTitle="Available"
				renderItem={renderItem}
				searchFilter={(item, query) => item.name.toLowerCase().includes(query.toLowerCase())}
				onAssociate={vi.fn()}
				onDissociate={vi.fn()}
			/>
		);

		// Verify renderItem was called with correct isLoading flag
		expect(renderItem).toHaveBeenCalledWith(mockItems[0], 'left', expect.objectContaining({ isLoading: true }));
		expect(renderItem).toHaveBeenCalledWith(mockItems[1], 'left', expect.objectContaining({ isLoading: false }));

		// Verify visual state is applied
		const item1 = screen.getByTestId('item-item-1');
		expect(item1.className).toContain('loading');

		const item2 = screen.getByTestId('item-item-2');
		expect(item2.className).not.toContain('loading');
	});

	it('should pass isReordering=true to renderItem for reordering items', () => {
		const reorderingItems = new Set(['item-1', 'item-2']);
		const renderItem = vi.fn((item, side, visualState) => (
			<div data-testid={`item-${item.id}`} className={visualState.isReordering ? 'reordering' : ''}>
				{item.name}
			</div>
		));

		render(
			<DualListView
				leftItems={[mockItems[0], mockItems[1]]}
				rightItems={[mockItems[2]]}
				itemKey={item => item.id}
				loadingItems={new Set()}
				reorderingItems={reorderingItems}
				leftTitle="Associated"
				rightTitle="Available"
				renderItem={renderItem}
				searchFilter={(item, query) => item.name.toLowerCase().includes(query.toLowerCase())}
				onAssociate={vi.fn()}
				onDissociate={vi.fn()}
			/>
		);

		// Verify renderItem was called with correct isReordering flag
		expect(renderItem).toHaveBeenCalledWith(mockItems[0], 'left', expect.objectContaining({ isReordering: true }));
		expect(renderItem).toHaveBeenCalledWith(mockItems[1], 'left', expect.objectContaining({ isReordering: true }));

		// Right panel items should never have isReordering=true
		expect(renderItem).toHaveBeenCalledWith(
			mockItems[2],
			'right',
			expect.objectContaining({ isReordering: false })
		);

		// Verify visual state is applied
		const item1 = screen.getByTestId('item-item-1');
		const item2 = screen.getByTestId('item-item-2');
		expect(item1.className).toContain('reordering');
		expect(item2.className).toContain('reordering');
	});

	it('should apply both loading and reordering states simultaneously', () => {
		const loadingItems = new Set(['item-1']);
		const reorderingItems = new Set(['item-1', 'item-2']);
		const renderItem = vi.fn((item, side, visualState) => (
			<div
				data-testid={`item-${item.id}`}
				className={`${visualState.isLoading ? 'loading' : ''} ${visualState.isReordering ? 'reordering' : ''}`}
			>
				{item.name}
			</div>
		));

		render(
			<DualListView
				leftItems={[mockItems[0], mockItems[1]]}
				rightItems={[]}
				itemKey={item => item.id}
				loadingItems={loadingItems}
				reorderingItems={reorderingItems}
				leftTitle="Associated"
				rightTitle="Available"
				renderItem={renderItem}
				searchFilter={(item, query) => item.name.toLowerCase().includes(query.toLowerCase())}
				onAssociate={vi.fn()}
				onDissociate={vi.fn()}
			/>
		);

		// item-1 should have BOTH states
		expect(renderItem).toHaveBeenCalledWith(
			mockItems[0],
			'left',
			expect.objectContaining({ isLoading: true, isReordering: true })
		);

		const item1 = screen.getByTestId('item-item-1');
		expect(item1.className).toContain('loading');
		expect(item1.className).toContain('reordering');
	});
});

describe('DualListView - Search', () => {
	it('should filter right items based on search query', async () => {
		const user = userEvent.setup();

		render(
			<DualListView
				leftItems={[]}
				rightItems={mockItems}
				itemKey={item => item.id}
				loadingItems={new Set()}
				reorderingItems={new Set()}
				leftTitle="Associated"
				rightTitle="Available"
				searchPlaceholder="Search items..."
				renderItem={(item, _side) => <div data-testid={`item-${item.id}`}>{item.name}</div>}
				searchFilter={(item, query) => item.name.toLowerCase().includes(query.toLowerCase())}
				onAssociate={vi.fn()}
				onDissociate={vi.fn()}
			/>
		);

		// Initially all items visible
		expect(screen.getByTestId('item-item-1')).toBeInTheDocument();
		expect(screen.getByTestId('item-item-2')).toBeInTheDocument();
		expect(screen.getByTestId('item-item-3')).toBeInTheDocument();
		expect(screen.getByTestId('item-item-4')).toBeInTheDocument();

		// Search for "One"
		const searchInput = screen.getByPlaceholderText('Search items...');
		await user.type(searchInput, 'One');

		// Only item-1 should be visible
		expect(screen.getByTestId('item-item-1')).toBeInTheDocument();
		expect(screen.queryByTestId('item-item-2')).not.toBeInTheDocument();
		expect(screen.queryByTestId('item-item-3')).not.toBeInTheDocument();
		expect(screen.queryByTestId('item-item-4')).not.toBeInTheDocument();
	});

	it('should show "No results" when search has no matches', async () => {
		const user = userEvent.setup();

		render(
			<DualListView
				leftItems={[]}
				rightItems={mockItems}
				itemKey={item => item.id}
				loadingItems={new Set()}
				reorderingItems={new Set()}
				leftTitle="Associated"
				rightTitle="Available"
				renderItem={(item, _side) => <div data-testid={`item-${item.id}`}>{item.name}</div>}
				searchFilter={(item, query) => item.name.toLowerCase().includes(query.toLowerCase())}
				onAssociate={vi.fn()}
				onDissociate={vi.fn()}
			/>
		);

		// Search for non-existent item
		const searchInput = screen.getByPlaceholderText('Search...');
		await user.type(searchInput, 'NonExistent');

		// Should show "No results"
		expect(screen.getByText('No results')).toBeInTheDocument();
	});

	it('should NOT filter left items (search only applies to right panel)', async () => {
		const user = userEvent.setup();

		render(
			<DualListView
				leftItems={[mockItems[0], mockItems[1]]}
				rightItems={[mockItems[2], mockItems[3]]}
				itemKey={item => item.id}
				loadingItems={new Set()}
				reorderingItems={new Set()}
				leftTitle="Associated"
				rightTitle="Available"
				renderItem={(item, side) => <div data-testid={`${side}-${item.id}`}>{item.name}</div>}
				searchFilter={(item, query) => item.name.toLowerCase().includes(query.toLowerCase())}
				onAssociate={vi.fn()}
				onDissociate={vi.fn()}
			/>
		);

		// Search for "Three" (only in right panel)
		const searchInput = screen.getByPlaceholderText('Search...');
		await user.type(searchInput, 'Three');

		// Left items should still be visible (NOT filtered)
		expect(screen.getByTestId('left-item-1')).toBeInTheDocument();
		expect(screen.getByTestId('left-item-2')).toBeInTheDocument();

		// Right panel should be filtered
		expect(screen.getByTestId('right-item-3')).toBeInTheDocument();
		expect(screen.queryByTestId('right-item-4')).not.toBeInTheDocument();
	});
});

describe('DualListView - Callbacks', () => {
	it('should forward callbacks to renderItem (renderItem calls them)', async () => {
		const onAssociate = vi.fn();
		const onDissociate = vi.fn();
		const user = userEvent.setup();

		render(
			<DualListView
				leftItems={[mockItems[0]]}
				rightItems={[mockItems[1]]}
				itemKey={item => item.id}
				loadingItems={new Set()}
				reorderingItems={new Set()}
				leftTitle="Associated"
				rightTitle="Available"
				renderItem={(item, side, _visualState) => (
					<div data-testid={`item-${item.id}`}>
						<span>{item.name}</span>
						<button
							onClick={() => {
								// Consumer decides when to call callbacks
								if (side === 'left') {
									onDissociate(item.id);
								} else {
									onAssociate(item.id);
								}
							}}
						>
							{side === 'left' ? 'Remove' : 'Add'}
						</button>
					</div>
				)}
				searchFilter={(item, query) => item.name.toLowerCase().includes(query.toLowerCase())}
				onAssociate={onAssociate}
				onDissociate={onDissociate}
			/>
		);

		// Click "Remove" on left item
		const leftItem = screen.getByTestId('item-item-1');
		const removeButton = within(leftItem).getByText('Remove');
		await user.click(removeButton);
		expect(onDissociate).toHaveBeenCalledWith('item-1');

		// Click "Add" on right item
		const rightItem = screen.getByTestId('item-item-2');
		const addButton = within(rightItem).getByText('Add');
		await user.click(addButton);
		expect(onAssociate).toHaveBeenCalledWith('item-2');
	});
});
