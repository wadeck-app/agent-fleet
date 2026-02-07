import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DragHandle } from './DragHandle';

describe('DragHandle', () => {
	describe('rendering', () => {
		it('should render button element', () => {
			render(<DragHandle />);

			const button = screen.getByRole('button');
			expect(button).toBeInTheDocument();
		});

		it('should render GripVertical icon', () => {
			const { container } = render(<DragHandle />);

			const svg = container.querySelector('svg');
			expect(svg).toBeInTheDocument();
		});

		it('should have type="button"', () => {
			render(<DragHandle />);

			const button = screen.getByRole('button');
			expect(button).toHaveAttribute('type', 'button');
		});
	});

	describe('disabled state', () => {
		it('should not be disabled by default', () => {
			render(<DragHandle />);

			const button = screen.getByRole('button');
			expect(button).not.toBeDisabled();
		});

		it('should be disabled when disabled prop is true', () => {
			render(<DragHandle disabled={true} />);

			const button = screen.getByRole('button');
			expect(button).toBeDisabled();
		});

		it('should apply disabled styles when disabled', () => {
			render(<DragHandle disabled={true} />);

			const button = screen.getByRole('button');
			expect(button).toHaveClass('cursor-not-allowed');
			expect(button).toHaveClass('opacity-50');
		});
	});

	describe('styling', () => {
		it('should apply default cursor-grab class', () => {
			render(<DragHandle />);

			const button = screen.getByRole('button');
			expect(button).toHaveClass('cursor-grab');
		});

		it('should apply touch-none class', () => {
			render(<DragHandle />);

			const button = screen.getByRole('button');
			expect(button).toHaveClass('touch-none');
		});

		it('should apply text color classes', () => {
			render(<DragHandle />);

			const button = screen.getByRole('button');
			expect(button).toHaveClass('text-muted-foreground');
			expect(button).toHaveClass('hover:text-foreground');
		});

		it('should apply active cursor class', () => {
			render(<DragHandle />);

			const button = screen.getByRole('button');
			expect(button).toHaveClass('active:cursor-grabbing');
		});

		it('should merge custom className', () => {
			render(<DragHandle className="custom-class" />);

			const button = screen.getByRole('button');
			expect(button).toHaveClass('custom-class');
			expect(button).toHaveClass('cursor-grab');
		});
	});

	describe('event handling', () => {
		it('should forward onClick handler', () => {
			const handleClick = vi.fn();
			render(<DragHandle onClick={handleClick} />);

			const button = screen.getByRole('button');
			button.click();

			expect(handleClick).toHaveBeenCalledTimes(1);
		});

		it('should not trigger onClick when disabled', () => {
			const handleClick = vi.fn();
			render(<DragHandle disabled={true} onClick={handleClick} />);

			const button = screen.getByRole('button');
			button.click();

			expect(handleClick).not.toHaveBeenCalled();
		});

		it('should forward other HTML button attributes', () => {
			render(<DragHandle data-testid="drag-handle" title="Drag to reorder" />);

			const button = screen.getByRole('button');
			expect(button).toHaveAttribute('data-testid', 'drag-handle');
			expect(button).toHaveAttribute('title', 'Drag to reorder');
		});
	});

	describe('dnd-kit integration', () => {
		it('should accept and spread dnd-kit attributes', () => {
			const mockAttributes = {
				role: 'button',
				'aria-pressed': false,
				'aria-roledescription': 'sortable',
			};

			render(<DragHandle {...mockAttributes} />);

			const button = screen.getByRole('button');
			expect(button).toHaveAttribute('aria-roledescription', 'sortable');
		});

		it('should accept and spread dnd-kit listeners', () => {
			const mockListeners = {
				onPointerDown: vi.fn(),
				onKeyDown: vi.fn(),
			};

			render(<DragHandle {...mockListeners} />);

			const button = screen.getByRole('button');

			// Simulate pointer down
			fireEvent.pointerDown(button);
			expect(mockListeners.onPointerDown).toHaveBeenCalled();

			// Simulate key down
			fireEvent.keyDown(button);
			expect(mockListeners.onKeyDown).toHaveBeenCalled();
		});
	});
});
