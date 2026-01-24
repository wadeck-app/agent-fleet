import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { DualListItem } from './DualListItem';

describe('DualListItem', () => {
	describe('available variant', () => {
		it('should render with label and action button', () => {
			const handleAction = vi.fn();

			render(
				<DualListItem
					itemId="item-1"
					variant="available"
					label="Test Item"
					onAction={handleAction}
					actionIcon={ArrowLeft}
					actionLabel="Add item"
				/>
			);

			expect(screen.getByText('Test Item')).toBeInTheDocument();
			expect(screen.getByLabelText('Add item')).toBeInTheDocument();
		});

		it('should call onAction when action button is clicked', async () => {
			const user = userEvent.setup();
			const handleAction = vi.fn();

			render(
				<DualListItem
					itemId="item-1"
					variant="available"
					label="Test Item"
					onAction={handleAction}
					actionIcon={ArrowLeft}
					actionLabel="Add item"
				/>
			);

			await user.click(screen.getByLabelText('Add item'));

			expect(handleAction).toHaveBeenCalledWith('item-1');
		});

		it('should render with optional icon', () => {
			const handleAction = vi.fn();
			const icon = <div data-testid="custom-icon">Icon</div>;

			render(
				<DualListItem
					itemId="item-1"
					variant="available"
					label="Test Item"
					icon={icon}
					onAction={handleAction}
					actionIcon={ArrowLeft}
					actionLabel="Add item"
				/>
			);

			expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
		});

		it('should render with optional badge', () => {
			const handleAction = vi.fn();
			const badge = <div data-testid="custom-badge">5</div>;

			render(
				<DualListItem
					itemId="item-1"
					variant="available"
					label="Test Item"
					badge={badge}
					onAction={handleAction}
					actionIcon={ArrowLeft}
					actionLabel="Add item"
				/>
			);

			expect(screen.getByTestId('custom-badge')).toBeInTheDocument();
		});

		it('should disable action button when isLoading is true', () => {
			const handleAction = vi.fn();

			render(
				<DualListItem
					itemId="item-1"
					variant="available"
					label="Test Item"
					onAction={handleAction}
					actionIcon={ArrowLeft}
					actionLabel="Add item"
					isLoading={true}
				/>
			);

			const button = screen.getByLabelText('Add item');
			expect(button).toBeDisabled();
		});
	});

	describe('sortable variant', () => {
		it('should render with label, drag handle, and action button', () => {
			const handleAction = vi.fn();

			render(
				<DualListItem
					itemId="item-1"
					variant="sortable"
					label="Test Item"
					onAction={handleAction}
					actionIcon={ArrowRight}
					actionLabel="Remove item"
				/>
			);

			expect(screen.getByText('Test Item')).toBeInTheDocument();
			expect(screen.getByLabelText('Remove item')).toBeInTheDocument();
			expect(screen.getByLabelText('Reorder Test Item')).toBeInTheDocument();
		});

		it('should call onAction when action button is clicked', async () => {
			const user = userEvent.setup();
			const handleAction = vi.fn();

			render(
				<DualListItem
					itemId="item-1"
					variant="sortable"
					label="Test Item"
					onAction={handleAction}
					actionIcon={ArrowRight}
					actionLabel="Remove item"
				/>
			);

			await user.click(screen.getByLabelText('Remove item'));

			expect(handleAction).toHaveBeenCalledWith('item-1');
		});

		it('should render with optional icon and badge', () => {
			const handleAction = vi.fn();
			const icon = <div data-testid="custom-icon">Icon</div>;
			const badge = <div data-testid="custom-badge">5</div>;

			render(
				<DualListItem
					itemId="item-1"
					variant="sortable"
					label="Test Item"
					icon={icon}
					badge={badge}
					onAction={handleAction}
					actionIcon={ArrowRight}
					actionLabel="Remove item"
				/>
			);

			expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
			expect(screen.getByTestId('custom-badge')).toBeInTheDocument();
		});

		it('should disable action button when isLoading is true', () => {
			const handleAction = vi.fn();

			render(
				<DualListItem
					itemId="item-1"
					variant="sortable"
					label="Test Item"
					onAction={handleAction}
					actionIcon={ArrowRight}
					actionLabel="Remove item"
					isLoading={true}
				/>
			);

			const button = screen.getByLabelText('Remove item');
			expect(button).toBeDisabled();
		});
	});

	describe('state handling', () => {
		it('should apply loading styles when isLoading is true', () => {
			const handleAction = vi.fn();

			const { container } = render(
				<DualListItem
					itemId="item-1"
					variant="available"
					label="Test Item"
					onAction={handleAction}
					actionIcon={ArrowLeft}
					actionLabel="Add item"
					isLoading={true}
				/>
			);

			const itemContainer = container.firstChild as HTMLElement;
			expect(itemContainer).toHaveClass('pointer-events-none');
			expect(itemContainer).toHaveClass('opacity-50');
		});

		it('should apply reordering styles when isReordering is true (sortable only)', () => {
			const handleAction = vi.fn();

			const { container } = render(
				<DualListItem
					itemId="item-1"
					variant="sortable"
					label="Test Item"
					onAction={handleAction}
					actionIcon={ArrowRight}
					actionLabel="Remove item"
					isReordering={true}
				/>
			);

			const itemContainer = container.firstChild as HTMLElement;
			expect(itemContainer).toHaveClass('pointer-events-none');
			expect(itemContainer).toHaveClass('opacity-50');
		});
	});
});
