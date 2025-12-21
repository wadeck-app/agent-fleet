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

	describe('variants', () => {
		it('should apply primary variant by default', () => {
			render(<Button>Primary</Button>);
			const button = screen.getByRole('button');
			expect(button.className).toContain('bg-primary');
		});

		it('should apply secondary variant', () => {
			render(<Button variant="secondary">Secondary</Button>);
			const button = screen.getByRole('button');
			expect(button.className).toContain('bg-secondary');
		});

		it('should apply destructive variant', () => {
			render(<Button variant="destructive">Delete</Button>);
			const button = screen.getByRole('button');
			expect(button.className).toContain('bg-destructive');
		});

		it('should apply ghost variant', () => {
			render(<Button variant="ghost">Ghost</Button>);
			const button = screen.getByRole('button');
			expect(button.className).toContain('hover:bg-muted');
		});

		it('should apply outline variant', () => {
			render(<Button variant="outline">Outline</Button>);
			const button = screen.getByRole('button');
			expect(button.className).toContain('border');
			expect(button.className).toContain('border-input');
		});
	});

	describe('sizes', () => {
		it('should apply medium size by default', () => {
			render(<Button>Medium</Button>);
			const button = screen.getByRole('button');
			expect(button.className).toContain('h-8');
		});

		it('should apply small size', () => {
			render(<Button size="sm">Small</Button>);
			const button = screen.getByRole('button');
			expect(button.className).toContain('h-7');
		});

		it('should apply large size', () => {
			render(<Button size="lg">Large</Button>);
			const button = screen.getByRole('button');
			expect(button.className).toContain('h-9');
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

		it('should apply disabled styling', () => {
			render(<Button disabled>Disabled</Button>);
			const button = screen.getByRole('button');
			expect(button.className).toContain('disabled:opacity-50');
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

		it('should not be focusable when disabled', () => {
			render(<Button disabled>Disabled</Button>);
			const button = screen.getByRole('button');
			expect(button.className).toContain('disabled:pointer-events-none');
		});
	});
});
