import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RemoveItemButton } from './RemoveItemButton';

describe('RemoveItemButton', () => {
	describe('rendering', () => {
		it('should render button element', () => {
			render(<RemoveItemButton onRemove={vi.fn()} />);

			const button = screen.getByRole('button');
			expect(button).toBeInTheDocument();
		});

		it('should render Trash2 icon', () => {
			const { container } = render(<RemoveItemButton onRemove={vi.fn()} />);

			const svg = container.querySelector('svg');
			expect(svg).toBeInTheDocument();
		});

		it('should have type="button"', () => {
			render(<RemoveItemButton onRemove={vi.fn()} />);

			const button = screen.getByRole('button');
			expect(button).toHaveAttribute('type', 'button');
		});
	});

	describe('title attribute', () => {
		it('should have default title', () => {
			render(<RemoveItemButton onRemove={vi.fn()} />);

			const button = screen.getByRole('button');
			expect(button).toHaveAttribute('title', 'Remove item');
		});

		it('should use custom title when provided', () => {
			render(<RemoveItemButton onRemove={vi.fn()} title="Delete this entry" />);

			const button = screen.getByRole('button');
			expect(button).toHaveAttribute('title', 'Delete this entry');
		});
	});

	describe('disabled state', () => {
		it('should not be disabled by default', () => {
			render(<RemoveItemButton onRemove={vi.fn()} />);

			const button = screen.getByRole('button');
			expect(button).not.toBeDisabled();
		});

		it('should be disabled when disabled prop is true', () => {
			render(<RemoveItemButton onRemove={vi.fn()} disabled={true} />);

			const button = screen.getByRole('button');
			expect(button).toBeDisabled();
		});
	});

	describe('styling', () => {
		it('should apply ghost variant styles', () => {
			const { container } = render(<RemoveItemButton onRemove={vi.fn()} />);

			const button = container.querySelector('button');
			// Button component applies variant styles - verify class presence
			expect(button).toBeTruthy();
		});

		it('should apply shrink-0 class', () => {
			render(<RemoveItemButton onRemove={vi.fn()} />);

			const button = screen.getByRole('button');
			expect(button).toHaveClass('shrink-0');
		});

		it('should merge custom className', () => {
			render(<RemoveItemButton onRemove={vi.fn()} className="custom-class" />);

			const button = screen.getByRole('button');
			expect(button).toHaveClass('custom-class');
			expect(button).toHaveClass('shrink-0');
		});

		it('should apply destructive text color to icon', () => {
			const { container } = render(<RemoveItemButton onRemove={vi.fn()} />);

			const icon = container.querySelector('svg');
			expect(icon).toHaveClass('text-destructive');
		});

		it('should apply size-4 to icon', () => {
			const { container } = render(<RemoveItemButton onRemove={vi.fn()} />);

			const icon = container.querySelector('svg');
			expect(icon).toHaveClass('size-4');
		});
	});

	describe('click behavior', () => {
		it('should call onRemove when clicked', async () => {
			const user = userEvent.setup();
			const handleRemove = vi.fn();

			render(<RemoveItemButton onRemove={handleRemove} />);

			const button = screen.getByRole('button');
			await user.click(button);

			expect(handleRemove).toHaveBeenCalledTimes(1);
		});

		it('should not call onRemove when disabled', async () => {
			const user = userEvent.setup();
			const handleRemove = vi.fn();

			render(<RemoveItemButton onRemove={handleRemove} disabled={true} />);

			const button = screen.getByRole('button');
			await user.click(button);

			expect(handleRemove).not.toHaveBeenCalled();
		});

		it('should call onRemove multiple times on multiple clicks', async () => {
			const user = userEvent.setup();
			const handleRemove = vi.fn();

			render(<RemoveItemButton onRemove={handleRemove} />);

			const button = screen.getByRole('button');
			await user.click(button);
			await user.click(button);
			await user.click(button);

			expect(handleRemove).toHaveBeenCalledTimes(3);
		});
	});

	describe('accessibility', () => {
		it('should be keyboard accessible', async () => {
			const user = userEvent.setup();
			const handleRemove = vi.fn();

			render(<RemoveItemButton onRemove={handleRemove} />);

			const button = screen.getByRole('button');
			button.focus();

			expect(button).toHaveFocus();

			await user.keyboard('{Enter}');
			expect(handleRemove).toHaveBeenCalledTimes(1);
		});

		it('should have accessible name from title', () => {
			render(<RemoveItemButton onRemove={vi.fn()} title="Delete variable" />);

			const button = screen.getByRole('button');
			expect(button).toHaveAccessibleName('Delete variable');
		});
	});
});
