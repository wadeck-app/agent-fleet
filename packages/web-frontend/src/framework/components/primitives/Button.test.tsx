import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './Button';

describe('Button', () => {
	describe('rendering', () => {
		it('should render with children', () => {
			render(<Button>Click Me</Button>);
			expect(screen.getByText('Click Me')).toBeInTheDocument();
		});

		it('should render as a button element', () => {
			render(<Button>Click Me</Button>);
			expect(screen.getByRole('button')).toBeInTheDocument();
		});
	});

	describe('interactions', () => {
		it('should call onClick when clicked', () => {
			const handleClick = vi.fn();
			render(<Button onClick={handleClick}>Click Me</Button>);

			fireEvent.click(screen.getByRole('button'));

			expect(handleClick).toHaveBeenCalledOnce();
		});

		it('should not call onClick when disabled', () => {
			const handleClick = vi.fn();
			render(
				<Button onClick={handleClick} disabled>
					Disabled
				</Button>
			);

			fireEvent.click(screen.getByRole('button'));

			expect(handleClick).not.toHaveBeenCalled();
		});
	});

	describe('disabled state', () => {
		it('should apply disabled attribute', () => {
			render(<Button disabled>Disabled</Button>);
			const button = screen.getByRole('button');
			expect(button).toBeDisabled();
		});
	});

	describe('custom props', () => {
		it('should apply custom className', () => {
			render(<Button className="custom-class">Custom</Button>);
			const button = screen.getByRole('button');
			expect(button.className).toContain('custom-class');
		});

		it('should forward button type attribute', () => {
			render(<Button type="submit">Submit</Button>);
			const button = screen.getByRole('button');
			expect(button).toHaveAttribute('type', 'submit');
		});

		it('should forward aria-label attribute', () => {
			render(<Button aria-label="Close dialog">X</Button>);
			const button = screen.getByRole('button');
			expect(button).toHaveAttribute('aria-label', 'Close dialog');
		});
	});

	describe('focus handling', () => {
		it('should be focusable', () => {
			render(<Button>Focus Me</Button>);
			const button = screen.getByRole('button');
			button.focus();
			expect(button).toHaveFocus();
		});
	});
});
