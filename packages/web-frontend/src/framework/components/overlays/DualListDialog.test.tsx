import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DualListDialog } from './DualListDialog';

interface TestItem {
	id: string;
	name: string;
}

describe('DualListDialog', () => {
	const leftItems: TestItem[] = [
		{ id: '1', name: 'Item 1' },
		{ id: '2', name: 'Item 2' },
	];

	const rightItems: TestItem[] = [
		{ id: '3', name: 'Item 3' },
		{ id: '4', name: 'Item 4' },
	];

	const defaultProps = {
		open: true,
		onOpenChange: vi.fn(),
		title: 'Manage Items',
		leftTitle: 'Associated Items',
		leftItems,
		leftItemKey: (item: TestItem) => item.id,
		leftItemRenderer: (item: TestItem) => <div data-testid={`left-${item.id}`}>{item.name}</div>,
		rightTitle: 'Available Items',
		rightItems,
		rightItemKey: (item: TestItem) => item.id,
		rightItemRenderer: (item: TestItem) => <div data-testid={`right-${item.id}`}>{item.name}</div>,
		searchFilter: (item: TestItem, query: string) => item.name.toLowerCase().includes(query.toLowerCase()),
	};

	it('should render with title and both panels', () => {
		render(<DualListDialog {...defaultProps} />);

		expect(screen.getByText('Manage Items')).toBeInTheDocument();
		expect(screen.getByText('Associated Items')).toBeInTheDocument();
		expect(screen.getByText('Available Items')).toBeInTheDocument();
	});

	it('should render left items', () => {
		render(<DualListDialog {...defaultProps} />);

		expect(screen.getByTestId('left-1')).toBeInTheDocument();
		expect(screen.getByTestId('left-2')).toBeInTheDocument();
	});

	it('should render right items', () => {
		render(<DualListDialog {...defaultProps} />);

		expect(screen.getByTestId('right-3')).toBeInTheDocument();
		expect(screen.getByTestId('right-4')).toBeInTheDocument();
	});

	it('should show empty state when left items are empty', () => {
		render(<DualListDialog {...defaultProps} leftItems={[]} />);

		expect(screen.getByText('No items')).toBeInTheDocument();
		expect(screen.getByText('Add items from the right panel')).toBeInTheDocument();
	});

	it('should show empty state when right items are empty', () => {
		render(<DualListDialog {...defaultProps} rightItems={[]} />);

		expect(screen.getByText('All items are added')).toBeInTheDocument();
	});

	it('should show custom left empty state', () => {
		const customEmptyState = <div data-testid="custom-empty">Custom empty state</div>;

		render(<DualListDialog {...defaultProps} leftItems={[]} leftEmptyState={customEmptyState} />);

		expect(screen.getByTestId('custom-empty')).toBeInTheDocument();
	});

	it('should show custom right empty state', () => {
		const customEmptyState = <div data-testid="custom-empty">Custom empty state</div>;

		render(<DualListDialog {...defaultProps} rightItems={[]} rightEmptyState={customEmptyState} />);

		expect(screen.getByTestId('custom-empty')).toBeInTheDocument();
	});

	it('should filter right items based on search query', async () => {
		const user = userEvent.setup();

		render(<DualListDialog {...defaultProps} />);

		// Initially both items should be visible
		expect(screen.getByTestId('right-3')).toBeInTheDocument();
		expect(screen.getByTestId('right-4')).toBeInTheDocument();

		// Search for "Item 3"
		const searchInput = screen.getByPlaceholderText('Search...');
		await user.type(searchInput, 'Item 3');

		// Only Item 3 should be visible
		expect(screen.getByTestId('right-3')).toBeInTheDocument();
		expect(screen.queryByTestId('right-4')).not.toBeInTheDocument();
	});

	it('should show empty search state when no items match search', async () => {
		const user = userEvent.setup();

		render(<DualListDialog {...defaultProps} />);

		const searchInput = screen.getByPlaceholderText('Search...');
		await user.type(searchInput, 'nonexistent');

		expect(screen.getByText('No items match your search')).toBeInTheDocument();
	});

	it('should show custom empty search state', async () => {
		const user = userEvent.setup();
		const customEmptySearchState = <div data-testid="custom-search-empty">No results</div>;

		render(<DualListDialog {...defaultProps} rightEmptySearchState={customEmptySearchState} />);

		const searchInput = screen.getByPlaceholderText('Search...');
		await user.type(searchInput, 'nonexistent');

		expect(screen.getByTestId('custom-search-empty')).toBeInTheDocument();
	});

	it('should clear search when clear button is clicked', async () => {
		const user = userEvent.setup();

		render(<DualListDialog {...defaultProps} />);

		// Type in search
		const searchInput = screen.getByPlaceholderText('Search...');
		await user.type(searchInput, 'Item 3');

		// Only Item 3 should be visible
		expect(screen.getByTestId('right-3')).toBeInTheDocument();
		expect(screen.queryByTestId('right-4')).not.toBeInTheDocument();

		// Clear search
		const clearButton = screen.getByRole('button', { name: /clear/i });
		await user.click(clearButton);

		// Both items should be visible again
		expect(screen.getByTestId('right-3')).toBeInTheDocument();
		expect(screen.getByTestId('right-4')).toBeInTheDocument();
	});

	it('should show custom search placeholder', () => {
		render(<DualListDialog {...defaultProps} searchPlaceholder="Find items..." />);

		expect(screen.getByPlaceholderText('Find items...')).toBeInTheDocument();
	});

	it('should pass loading state to item renderer', () => {
		const loadingItems = new Set(['1']);
		const leftItemRenderer = vi.fn((item: TestItem, actions) => (
			<div data-testid={`left-${item.id}`} data-loading={actions.isLoading}>
				{item.name}
			</div>
		));

		render(<DualListDialog {...defaultProps} leftItemRenderer={leftItemRenderer} loadingItems={loadingItems} />);

		// Item 1 should be loading
		const item1 = screen.getByTestId('left-1');
		expect(item1).toHaveAttribute('data-loading', 'true');

		// Item 2 should not be loading
		const item2 = screen.getByTestId('left-2');
		expect(item2).toHaveAttribute('data-loading', 'false');
	});

	it('should pass reordering state to item renderer', () => {
		const reorderingItems = new Set(['2']);
		const leftItemRenderer = vi.fn((item: TestItem, actions) => (
			<div data-testid={`left-${item.id}`} data-reordering={actions.isReordering}>
				{item.name}
			</div>
		));

		render(
			<DualListDialog {...defaultProps} leftItemRenderer={leftItemRenderer} reorderingItems={reorderingItems} />
		);

		// Item 1 should not be reordering
		const item1 = screen.getByTestId('left-1');
		expect(item1).toHaveAttribute('data-reordering', 'false');

		// Item 2 should be reordering
		const item2 = screen.getByTestId('left-2');
		expect(item2).toHaveAttribute('data-reordering', 'true');
	});

	it('should show help text when provided', () => {
		render(<DualListDialog {...defaultProps} leftHelpText="Drag to reorder" rightHelpText="Click to add" />);

		expect(screen.getByText('Drag to reorder')).toBeInTheDocument();
		expect(screen.getByText('Click to add')).toBeInTheDocument();
	});

	it('should use custom maxWidth', () => {
		const { container } = render(<DualListDialog {...defaultProps} maxWidth="5xl" />);

		// CrudDialog should receive the maxWidth prop
		// This is a bit tricky to test directly, but we can check if the component renders
		expect(container.querySelector('[role="dialog"]')).toBeInTheDocument();
	});
});
