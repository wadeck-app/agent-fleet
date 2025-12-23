import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ErrorAlert } from './ErrorAlert';

describe('ErrorAlert', () => {
	describe('rendering', () => {
		it('should render error message', () => {
			render(<ErrorAlert message="Something went wrong" />);
			expect(screen.getByText('Something went wrong')).toBeInTheDocument();
		});

		it('should render with alert role', () => {
			render(<ErrorAlert message="Error message" />);
			expect(screen.getByRole('alert')).toBeInTheDocument();
		});

		it('should render error icon', () => {
			const { container } = render(<ErrorAlert message="Error" />);
			const icon = container.querySelector('svg');
			expect(icon).toBeInTheDocument();
		});
	});

	describe('dismissible behavior', () => {
		it('should render dismiss button when onDismiss is provided', () => {
			const handleDismiss = vi.fn();
			render(<ErrorAlert message="Error" onDismiss={handleDismiss} />);

			expect(screen.getByRole('button', { name: /dismiss error/i })).toBeInTheDocument();
		});

		it('should not render dismiss button when onDismiss is not provided', () => {
			render(<ErrorAlert message="Error" />);

			expect(screen.queryByRole('button', { name: /dismiss error/i })).not.toBeInTheDocument();
		});

		it('should call onDismiss when dismiss button is clicked', () => {
			const handleDismiss = vi.fn();
			render(<ErrorAlert message="Error" onDismiss={handleDismiss} />);

			fireEvent.click(screen.getByRole('button', { name: /dismiss error/i }));

			expect(handleDismiss).toHaveBeenCalledOnce();
		});
	});

	describe('styling', () => {
		it('should apply default error styling', () => {
			const { container } = render(<ErrorAlert message="Error" />);
			const alert = container.firstChild as HTMLElement;

			expect(alert.className).toContain('border-destructive');
			expect(alert.className).toContain('bg-destructive/10');
		});

		it('should apply custom className', () => {
			const { container } = render(<ErrorAlert message="Error" className={`custom-class`} />);
			const alert = container.firstChild as HTMLElement;

			expect(alert.className).toContain('custom-class');
		});

		it('should have proper text color for error message', () => {
			render(<ErrorAlert message="Error message" />);
			const message = screen.getByText('Error message');

			expect(message.className).toContain('text-destructive');
		});
	});

	describe('accessibility', () => {
		it('should have proper aria-label for dismiss button', () => {
			const handleDismiss = vi.fn();
			render(<ErrorAlert message="Error" onDismiss={handleDismiss} />);

			const dismissButton = screen.getByRole('button', { name: /dismiss error/i });
			expect(dismissButton).toHaveAttribute('aria-label', 'Dismiss error');
		});

		it('should render with role="alert" for screen readers', () => {
			render(<ErrorAlert message="Important error" />);
			const alert = screen.getByRole('alert');

			expect(alert).toBeInTheDocument();
		});
	});

	describe('layout', () => {
		it('should display icon and message in a flex layout', () => {
			const { container } = render(<ErrorAlert message="Error" />);
			const alert = container.firstChild as HTMLElement;
			const flexContainer = alert.querySelector('.flex.items-start.justify-between');

			expect(flexContainer).toBeInTheDocument();
		});

		it('should have proper spacing between elements', () => {
			const { container } = render(<ErrorAlert message="Error" onDismiss={vi.fn()} />);
			const alert = container.firstChild as HTMLElement;
			const flexContainer = alert.querySelector('.flex.items-start.justify-between');

			expect(flexContainer?.className).toContain('gap-4');
		});
	});

	describe('message variations', () => {
		it('should render short error messages', () => {
			render(<ErrorAlert message="Error" />);
			expect(screen.getByText('Error')).toBeInTheDocument();
		});

		it('should render long error messages', () => {
			const longMessage =
				'This is a very long error message that contains a lot of details about what went wrong and how to fix it.';
			render(<ErrorAlert message={longMessage} />);
			expect(screen.getByText(longMessage)).toBeInTheDocument();
		});

		it('should render error messages with special characters', () => {
			const message = 'Error: File "test.txt" not found!';
			render(<ErrorAlert message={message} />);
			expect(screen.getByText(message)).toBeInTheDocument();
		});
	});
});
