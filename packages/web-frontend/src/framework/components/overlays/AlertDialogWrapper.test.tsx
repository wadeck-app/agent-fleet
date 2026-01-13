import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Trash2 } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { AlertDialogWrapper } from './AlertDialogWrapper';

describe('AlertDialogWrapper', () => {
	const defaultProps = {
		open: true,
		onOpenChange: vi.fn(),
		title: 'Test Title',
		description: 'Test Description',
		onConfirm: vi.fn(),
	};

	describe('Rendering', () => {
		it('renders title and description', () => {
			render(<AlertDialogWrapper {...defaultProps} />);

			expect(screen.getByText('Test Title')).toBeInTheDocument();
			expect(screen.getByText('Test Description')).toBeInTheDocument();
		});

		it('renders custom button labels', () => {
			render(<AlertDialogWrapper {...defaultProps} confirmLabel="Delete" cancelLabel="Go Back" />);

			expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument();
		});

		it('does not render when open is false', () => {
			render(<AlertDialogWrapper {...defaultProps} open={false} />);

			expect(screen.queryByText('Test Title')).not.toBeInTheDocument();
		});
	});

	describe('Icon Support', () => {
		it('renders icon when provided', () => {
			render(<AlertDialogWrapper {...defaultProps} icon={<Trash2 data-testid="trash-icon" />} />);

			expect(screen.getByTestId('trash-icon')).toBeInTheDocument();
		});

		it('does not render AlertDialogMedia when icon not provided', () => {
			const { container } = render(<AlertDialogWrapper {...defaultProps} />);

			const mediaSlot = container.querySelector('[data-slot="alert-dialog-media"]');
			expect(mediaSlot).not.toBeInTheDocument();
		});

		it('applies correct className based on variant', () => {
			render(<AlertDialogWrapper {...defaultProps} icon={<Trash2 />} variant="danger" />);

			// Radix UI renders in a portal, so query document.body
			const mediaElement = document.body.querySelector('[data-slot="alert-dialog-media"]');
			expect(mediaElement).toHaveClass('text-destructive');
		});
	});

	describe('Size Prop', () => {
		it('passes default size to AlertDialogContent', () => {
			render(<AlertDialogWrapper {...defaultProps} />);

			const contentElement = document.body.querySelector('[data-slot="alert-dialog-content"]');
			expect(contentElement).toHaveAttribute('data-size', 'default');
		});

		it('passes sm size to AlertDialogContent', () => {
			render(<AlertDialogWrapper {...defaultProps} size="sm" />);

			const contentElement = document.body.querySelector('[data-slot="alert-dialog-content"]');
			expect(contentElement).toHaveAttribute('data-size', 'sm');
		});
	});

	describe('Callbacks', () => {
		it('calls onConfirm and closes dialog when confirm clicked', async () => {
			const user = userEvent.setup();
			const onConfirm = vi.fn();
			const onOpenChange = vi.fn();

			render(<AlertDialogWrapper {...defaultProps} onConfirm={onConfirm} onOpenChange={onOpenChange} />);

			const confirmButton = screen.getByRole('button', { name: /confirm/i });
			await user.click(confirmButton);

			expect(onConfirm).toHaveBeenCalledOnce();
			expect(onOpenChange).toHaveBeenCalledWith(false);
		});

		it('calls onCancel and closes dialog when cancel clicked', async () => {
			const user = userEvent.setup();
			const onCancel = vi.fn();
			const onOpenChange = vi.fn();

			render(<AlertDialogWrapper {...defaultProps} onCancel={onCancel} onOpenChange={onOpenChange} />);

			const cancelButton = screen.getByRole('button', { name: /cancel/i });
			await user.click(cancelButton);

			expect(onCancel).toHaveBeenCalledOnce();
			expect(onOpenChange).toHaveBeenCalledWith(false);
		});

		it('closes dialog without calling onCancel when onCancel not provided', async () => {
			const user = userEvent.setup();
			const onOpenChange = vi.fn();

			render(<AlertDialogWrapper {...defaultProps} onOpenChange={onOpenChange} />);

			const cancelButton = screen.getByRole('button', { name: /cancel/i });
			await user.click(cancelButton);

			expect(onOpenChange).toHaveBeenCalledWith(false);
		});
	});
});
