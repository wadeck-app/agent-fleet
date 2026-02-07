import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AddButton } from './AddButton';

describe('AddButton', () => {
	describe('rendering', () => {
		it('should render button element', () => {
			render(<AddButton onClick={vi.fn()}>Add Item</AddButton>);

			const button = screen.getByRole('button');
			expect(button).toBeInTheDocument();
		});

		it('should render children text', () => {
			render(<AddButton onClick={vi.fn()}>Add Variable</AddButton>);

			expect(screen.getByText('Add Variable')).toBeInTheDocument();
		});

		it('should render Plus icon', () => {
			const { container } = render(<AddButton onClick={vi.fn()}>Add Item</AddButton>);

			const svg = container.querySelector('svg');
			expect(svg).toBeInTheDocument();
		});

		it('should have type="button"', () => {
			render(<AddButton onClick={vi.fn()}>Add Item</AddButton>);

			const button = screen.getByRole('button');
			expect(button).toHaveAttribute('type', 'button');
		});

		it('should render complex children', () => {
			render(
				<AddButton onClick={vi.fn()}>
					<span>Add</span> <strong>New</strong> Item
				</AddButton>
			);

			expect(screen.getByText('Add')).toBeInTheDocument();
			expect(screen.getByText('New')).toBeInTheDocument();
			expect(screen.getByText('Item')).toBeInTheDocument();
		});
	});

	describe('disabled state', () => {
		it('should not be disabled by default', () => {
			render(<AddButton onClick={vi.fn()}>Add Item</AddButton>);

			const button = screen.getByRole('button');
			expect(button).not.toBeDisabled();
		});

		it('should be disabled when disabled prop is true', () => {
			render(
				<AddButton onClick={vi.fn()} disabled={true}>
					Add Item
				</AddButton>
			);

			const button = screen.getByRole('button');
			expect(button).toBeDisabled();
		});
	});

	describe('styling', () => {
		it('should apply mt-3 class', () => {
			render(<AddButton onClick={vi.fn()}>Add Item</AddButton>);

			const button = screen.getByRole('button');
			expect(button).toHaveClass('mt-3');
		});

		it('should apply w-full class', () => {
			render(<AddButton onClick={vi.fn()}>Add Item</AddButton>);

			const button = screen.getByRole('button');
			expect(button).toHaveClass('w-full');
		});

		it('should apply justify-center class', () => {
			render(<AddButton onClick={vi.fn()}>Add Item</AddButton>);

			const button = screen.getByRole('button');
			expect(button).toHaveClass('justify-center');
		});

		it('should apply gap-2 class', () => {
			render(<AddButton onClick={vi.fn()}>Add Item</AddButton>);

			const button = screen.getByRole('button');
			expect(button).toHaveClass('gap-2');
		});

		it('should apply border-dashed class', () => {
			render(<AddButton onClick={vi.fn()}>Add Item</AddButton>);

			const button = screen.getByRole('button');
			expect(button).toHaveClass('border-dashed');
		});

		it('should merge custom className', () => {
			render(
				<AddButton onClick={vi.fn()} className="custom-class">
					Add Item
				</AddButton>
			);

			const button = screen.getByRole('button');
			expect(button).toHaveClass('custom-class');
			expect(button).toHaveClass('mt-3');
			expect(button).toHaveClass('w-full');
		});

		it('should apply size-4 to icon', () => {
			const { container } = render(<AddButton onClick={vi.fn()}>Add Item</AddButton>);

			const icon = container.querySelector('svg');
			expect(icon).toHaveClass('size-4');
		});
	});

	describe('click behavior', () => {
		it('should call onClick when clicked', async () => {
			const user = userEvent.setup();
			const handleClick = vi.fn();

			render(<AddButton onClick={handleClick}>Add Item</AddButton>);

			const button = screen.getByRole('button');
			await user.click(button);

			expect(handleClick).toHaveBeenCalledTimes(1);
		});

		it('should not call onClick when disabled', async () => {
			const user = userEvent.setup();
			const handleClick = vi.fn();

			render(
				<AddButton onClick={handleClick} disabled={true}>
					Add Item
				</AddButton>
			);

			const button = screen.getByRole('button');
			await user.click(button);

			expect(handleClick).not.toHaveBeenCalled();
		});

		it('should call onClick multiple times on multiple clicks', async () => {
			const user = userEvent.setup();
			const handleClick = vi.fn();

			render(<AddButton onClick={handleClick}>Add Item</AddButton>);

			const button = screen.getByRole('button');
			await user.click(button);
			await user.click(button);
			await user.click(button);

			expect(handleClick).toHaveBeenCalledTimes(3);
		});
	});

	describe('accessibility', () => {
		it('should be keyboard accessible', async () => {
			const user = userEvent.setup();
			const handleClick = vi.fn();

			render(<AddButton onClick={handleClick}>Add Item</AddButton>);

			const button = screen.getByRole('button');
			button.focus();

			expect(button).toHaveFocus();

			await user.keyboard('{Enter}');
			expect(handleClick).toHaveBeenCalledTimes(1);
		});

		it('should have accessible name from children', () => {
			render(<AddButton onClick={vi.fn()}>Add New Variable</AddButton>);

			const button = screen.getByRole('button');
			expect(button).toHaveAccessibleName('Add New Variable');
		});

		it('should be accessible with space key', async () => {
			const user = userEvent.setup();
			const handleClick = vi.fn();

			render(<AddButton onClick={handleClick}>Add Item</AddButton>);

			const button = screen.getByRole('button');
			button.focus();

			await user.keyboard('{ }');
			expect(handleClick).toHaveBeenCalledTimes(1);
		});
	});

	describe('visual layout', () => {
		it('should display icon before text', () => {
			const { container } = render(<AddButton onClick={vi.fn()}>Add Item</AddButton>);

			const button = container.querySelector('button');
			const children = button?.childNodes;

			// First child should be SVG (icon), second should be text
			expect(children?.[0].nodeName).toBe('svg');
			expect(children?.[1].textContent).toBe('Add Item');
		});
	});
});
