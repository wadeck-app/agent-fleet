import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { OptimisticDualListDialog } from './OptimisticDualListDialog';

/**
 * ===========================================================================================
 * LIGHTWEIGHT INTEGRATION TESTS FOR OptimisticDualListDialog
 * ===========================================================================================
 *
 * These tests only verify that the composition works:
 * - Hook (useDualListState) is called correctly
 * - View (DualListView) renders correctly
 * - Dialog wrapper works
 * - Props flow correctly
 *
 * Heavy logic testing → useDualListState.test.ts
 * Heavy visual testing → DualListView.test.tsx
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
];

describe('OptimisticDualListDialog - Composition', () => {
	it('should render dialog with title and close button', () => {
		render(
			<OptimisticDualListDialog
				open={true}
				onOpenChange={vi.fn()}
				title="My Custom Title"
				allItems={mockItems}
				associatedIds={new Set(['item-1'])}
				itemKey={item => item.id}
				leftTitle="Associated"
				rightTitle="Available"
				renderItem={(item, side) => <div data-testid={`${side}-${item.id}`}>{item.name}</div>}
				searchFilter={(item, query) => item.name.toLowerCase().includes(query.toLowerCase())}
				onAssociate={vi.fn()}
				onDissociate={vi.fn()}
			/>
		);

		expect(screen.getByText('My Custom Title')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
	});

	it('should render left and right panels correctly', () => {
		render(
			<OptimisticDualListDialog
				open={true}
				onOpenChange={vi.fn()}
				title="Test Dialog"
				allItems={mockItems}
				associatedIds={new Set(['item-1', 'item-2'])}
				itemKey={item => item.id}
				leftTitle="Associated Items"
				rightTitle="Available Items"
				renderItem={(item, _side) => <div data-testid={`${_side}-${item.id}`}>{item.name}</div>}
				searchFilter={(item, query) => item.name.toLowerCase().includes(query.toLowerCase())}
				onAssociate={vi.fn()}
				onDissociate={vi.fn()}
			/>
		);

		// Verify panels
		expect(screen.getByText('Associated Items')).toBeInTheDocument();
		expect(screen.getByText('Available Items')).toBeInTheDocument();

		// Verify items are in correct panels (hook calculates this)
		expect(screen.getByTestId('left-item-1')).toBeInTheDocument();
		expect(screen.getByTestId('left-item-2')).toBeInTheDocument();
		expect(screen.getByTestId('right-item-3')).toBeInTheDocument();
	});

	it('should render empty states', () => {
		render(
			<OptimisticDualListDialog
				open={true}
				onOpenChange={vi.fn()}
				title="Test Dialog"
				allItems={[]}
				associatedIds={new Set()}
				itemKey={(item: MockItem) => item.id}
				leftTitle="Associated"
				rightTitle="Available"
				leftEmptyState={<div data-testid="left-empty">No associated items</div>}
				rightEmptyState={<div data-testid="right-empty">No available items</div>}
				renderItem={(item: MockItem, _side) => <div>{item.name}</div>}
				searchFilter={(item: MockItem, query) => item.name.toLowerCase().includes(query.toLowerCase())}
				onAssociate={vi.fn()}
				onDissociate={vi.fn()}
			/>
		);

		expect(screen.getByTestId('left-empty')).toHaveTextContent('No associated items');
		expect(screen.getByTestId('right-empty')).toHaveTextContent('No available items');
	});

	it('should not render when closed', () => {
		render(
			<OptimisticDualListDialog
				open={false}
				onOpenChange={vi.fn()}
				title="Test Dialog"
				allItems={mockItems}
				associatedIds={new Set()}
				itemKey={item => item.id}
				leftTitle="Associated"
				rightTitle="Available"
				renderItem={(item, _side) => <div>{item.name}</div>}
				searchFilter={(item, query) => item.name.toLowerCase().includes(query.toLowerCase())}
				onAssociate={vi.fn()}
				onDissociate={vi.fn()}
			/>
		);

		// Dialog should not be visible
		expect(screen.queryByText('Test Dialog')).not.toBeInTheDocument();
	});

	it('should pass visual state flags to renderItem', () => {
		const renderItem = vi.fn((item, _side, _visualState) => (
			<div data-testid={`item-${item.id}`}>
				{item.name}
				{_visualState.isLoading && <span data-testid={`loading-${item.id}`}>Loading...</span>}
				{_visualState.isReordering && <span data-testid={`reordering-${item.id}`}>Reordering...</span>}
			</div>
		));

		render(
			<OptimisticDualListDialog
				open={true}
				onOpenChange={vi.fn()}
				title="Test Dialog"
				allItems={mockItems}
				associatedIds={new Set(['item-1'])}
				itemKey={item => item.id}
				leftTitle="Associated"
				rightTitle="Available"
				renderItem={renderItem}
				searchFilter={(item, query) => item.name.toLowerCase().includes(query.toLowerCase())}
				onAssociate={vi.fn()}
				onDissociate={vi.fn()}
			/>
		);

		// Verify renderItem was called with visualState object
		expect(renderItem).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'item-1' }),
			'left',
			expect.objectContaining({
				isLoading: expect.any(Boolean),
				isReordering: expect.any(Boolean),
			})
		);
	});
});
