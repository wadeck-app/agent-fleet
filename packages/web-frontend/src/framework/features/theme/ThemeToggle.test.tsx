import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ThemeToggle } from './ThemeToggle';

describe('ThemeToggle', () => {
	describe('rendering', () => {
		it('should render as button', () => {
			const onToggle = vi.fn();
			render(<ThemeToggle theme="light" onToggle={onToggle} />);
			expect(screen.getByRole('button')).toBeInTheDocument();
		});

		it('should show moon icon in light mode', () => {
			const onToggle = vi.fn();
			render(<ThemeToggle theme="light" onToggle={onToggle} />);
			const button = screen.getByRole('button');
			expect(button.querySelector('svg')).toBeInTheDocument();
		});

		it('should show sun icon in dark mode', () => {
			const onToggle = vi.fn();
			render(<ThemeToggle theme="dark" onToggle={onToggle} />);
			const button = screen.getByRole('button');
			expect(button.querySelector('svg')).toBeInTheDocument();
		});
	});

	describe('accessibility', () => {
		it('should have correct aria-label for dark mode', () => {
			const onToggle = vi.fn();
			render(<ThemeToggle theme="dark" onToggle={onToggle} />);
			expect(screen.getByLabelText('Switch to light mode')).toBeInTheDocument();
		});

		it('should have correct aria-label for light mode', () => {
			const onToggle = vi.fn();
			render(<ThemeToggle theme="light" onToggle={onToggle} />);
			expect(screen.getByLabelText('Switch to dark mode')).toBeInTheDocument();
		});

		it('should have title attribute for tooltip', () => {
			const onToggle = vi.fn();
			render(<ThemeToggle theme="dark" onToggle={onToggle} />);
			const button = screen.getByRole('button');
			expect(button).toHaveAttribute('title', 'Switch to light mode');
		});

		it('should be keyboard accessible (focusable)', () => {
			const onToggle = vi.fn();
			render(<ThemeToggle theme="light" onToggle={onToggle} />);
			const button = screen.getByRole('button');
			button.focus();
			expect(button).toHaveFocus();
		});
	});

	describe('interactions', () => {
		it('should call onToggle when clicked', () => {
			const onToggle = vi.fn();
			render(<ThemeToggle theme="light" onToggle={onToggle} />);
			const button = screen.getByRole('button');
			fireEvent.click(button);
			expect(onToggle).toHaveBeenCalledTimes(1);
		});

		it('should call onToggle multiple times for multiple clicks', () => {
			const onToggle = vi.fn();
			render(<ThemeToggle theme="light" onToggle={onToggle} />);
			const button = screen.getByRole('button');
			fireEvent.click(button);
			fireEvent.click(button);
			fireEvent.click(button);
			expect(onToggle).toHaveBeenCalledTimes(3);
		});
	});

	describe('styling', () => {
		it('should apply custom className', () => {
			const onToggle = vi.fn();
			render(
				<ThemeToggle
					theme="light"
					onToggle={onToggle}
					className={`
     custom-class
   `}
				/>
			);
			const button = screen.getByRole('button');
			expect(button).toHaveClass('custom-class');
		});

		it('should have default button styles', () => {
			const onToggle = vi.fn();
			render(<ThemeToggle theme="light" onToggle={onToggle} />);
			const button = screen.getByRole('button');
			expect(button).toHaveClass('inline-flex');
			expect(button).toHaveClass('items-center');
			expect(button).toHaveClass('justify-center');
		});
	});
});
