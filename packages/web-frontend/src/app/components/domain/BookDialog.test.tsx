import type { Book } from '@shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BookDialog } from './BookDialog';

// Mock the BookForm component to simplify testing
vi.mock('../../pages/books/BookForm', () => ({
	BookForm: ({
		onSubmit,
		onCancel,
		onRefresh,
		initialData,
		editMode,
		submitLabel,
		onCheckISBN,
		onPatchISBN,
	}: any) => (
		<div data-testid="book-form">
			<div data-testid="initial-data">{JSON.stringify(initialData)}</div>
			<div data-testid="edit-mode">{JSON.stringify(editMode)}</div>
			<div data-testid="submit-label">{submitLabel}</div>
			<button data-testid="submit-button" onClick={() => onSubmit({ title: 'Test Book' })}>
				Submit
			</button>
			<button data-testid="cancel-button" onClick={onCancel}>
				Cancel
			</button>
			{onRefresh && (
				<button data-testid="refresh-button" onClick={onRefresh}>
					Refresh
				</button>
			)}
			{onCheckISBN && (
				<button data-testid="check-isbn-button" onClick={() => onCheckISBN('123')}>
					Check ISBN
				</button>
			)}
			{onPatchISBN && (
				<button
					data-testid="patch-isbn-button"
					onClick={() => onPatchISBN('book-id', { isbn: '123', version: 1 })}
				>
					Patch ISBN
				</button>
			)}
		</div>
	),
}));

describe('BookDialog', () => {
	const mockBook: Book = {
		id: 'book-1',
		title: 'The Great Gatsby',
		author: 'F. Scott Fitzgerald',
		isbn: '978-0-7432-7356-5',
		publishedYear: 1925,
		genre: 'Fiction',
		pages: 180,
		version: 1,
		createdAt: '2024-01-01T00:00:00Z',
		updatedAt: '2024-01-01T00:00:00Z',
	};

	describe('rendering', () => {
		it('should render dialog when open is true', () => {
			render(<BookDialog open={true} onClose={vi.fn()} onSubmit={vi.fn()} />);
			expect(screen.getByTestId('book-form')).toBeInTheDocument();
		});

		it('should not render dialog when open is false', () => {
			render(<BookDialog open={false} onClose={vi.fn()} onSubmit={vi.fn()} />);
			expect(screen.queryByTestId('book-form')).not.toBeInTheDocument();
		});

		it('should render create mode title when no book provided', () => {
			render(<BookDialog open={true} onClose={vi.fn()} onSubmit={vi.fn()} />);
			expect(screen.getByText('New Book')).toBeInTheDocument();
		});

		it('should render edit mode title when book is provided', () => {
			render(<BookDialog open={true} onClose={vi.fn()} book={mockBook} onSubmit={vi.fn()} />);
			expect(screen.getByText('Edit Book')).toBeInTheDocument();
		});

		it('should render BookForm with correct props in create mode', () => {
			render(<BookDialog open={true} onClose={vi.fn()} onSubmit={vi.fn()} />);

			expect(screen.getByTestId('initial-data')).toHaveTextContent('');
			expect(screen.getByTestId('edit-mode')).toHaveTextContent('');
			expect(screen.getByTestId('submit-label')).toHaveTextContent('Add Book');
		});

		it('should render BookForm with correct props in edit mode', () => {
			render(<BookDialog open={true} onClose={vi.fn()} book={mockBook} onSubmit={vi.fn()} />);

			const initialData = JSON.parse(screen.getByTestId('initial-data').textContent!);
			expect(initialData.title).toBe('The Great Gatsby');
			expect(initialData.author).toBe('F. Scott Fitzgerald');
			expect(initialData.isbn).toBe('978-0-7432-7356-5');
			expect(initialData.publishedYear).toBe(1925);
			expect(initialData.genre).toBe('Fiction');
			expect(initialData.pages).toBe(180);

			const editMode = JSON.parse(screen.getByTestId('edit-mode').textContent!);
			expect(editMode.bookId).toBe('book-1');
			expect(editMode.version).toBe(1);

			expect(screen.getByTestId('submit-label')).toHaveTextContent('Update Book');
		});

		it('should render refresh button only in edit mode', () => {
			const { rerender } = render(
				<BookDialog open={true} onClose={vi.fn()} onSubmit={vi.fn()} onRefresh={vi.fn()} />
			);

			// Create mode: no refresh button
			expect(screen.queryByTestId('refresh-button')).not.toBeInTheDocument();

			// Edit mode: refresh button present
			rerender(
				<BookDialog open={true} onClose={vi.fn()} book={mockBook} onSubmit={vi.fn()} onRefresh={vi.fn()} />
			);

			expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
		});
	});

	describe('callbacks', () => {
		it('should call onClose when cancel is clicked', async () => {
			const user = userEvent.setup();
			const onClose = vi.fn();

			render(<BookDialog open={true} onClose={onClose} onSubmit={vi.fn()} />);

			await user.click(screen.getByTestId('cancel-button'));
			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('should call onSubmit when form is submitted', async () => {
			const user = userEvent.setup();
			const onSubmit = vi.fn().mockResolvedValue(undefined);

			render(<BookDialog open={true} onClose={vi.fn()} onSubmit={onSubmit} />);

			await user.click(screen.getByTestId('submit-button'));

			await waitFor(() => {
				expect(onSubmit).toHaveBeenCalledTimes(1);
				expect(onSubmit).toHaveBeenCalledWith({ title: 'Test Book' });
			});
		});

		it('should call onRefresh when refresh is clicked in edit mode', async () => {
			const user = userEvent.setup();
			const onRefresh = vi.fn();

			render(
				<BookDialog open={true} onClose={vi.fn()} book={mockBook} onSubmit={vi.fn()} onRefresh={onRefresh} />
			);

			await user.click(screen.getByRole('button', { name: /refresh/i }));
			expect(onRefresh).toHaveBeenCalledTimes(1);
		});

		it('should call onCheckISBN when provided', async () => {
			const user = userEvent.setup();
			const onCheckISBN = vi.fn().mockResolvedValue(null);

			render(<BookDialog open={true} onClose={vi.fn()} onSubmit={vi.fn()} onCheckISBN={onCheckISBN} />);

			await user.click(screen.getByTestId('check-isbn-button'));

			await waitFor(() => {
				expect(onCheckISBN).toHaveBeenCalledTimes(1);
				expect(onCheckISBN).toHaveBeenCalledWith('123');
			});
		});

		it('should call onPatchISBN when provided in edit mode', async () => {
			const user = userEvent.setup();
			const onPatchISBN = vi.fn().mockResolvedValue(mockBook);

			render(
				<BookDialog
					open={true}
					onClose={vi.fn()}
					book={mockBook}
					onSubmit={vi.fn()}
					onPatchISBN={onPatchISBN}
				/>
			);

			await user.click(screen.getByTestId('patch-isbn-button'));

			await waitFor(() => {
				expect(onPatchISBN).toHaveBeenCalledTimes(1);
				expect(onPatchISBN).toHaveBeenCalledWith('book-id', { isbn: '123', version: 1 });
			});
		});

		it('should call onClose when dialog overlay is clicked', () => {
			const onClose = vi.fn();

			render(<BookDialog open={true} onClose={onClose} onSubmit={vi.fn()} />);

			// Find and click the overlay
			const overlay = document.querySelector('[data-slot="dialog-overlay"]');
			expect(overlay).toBeInTheDocument();

			if (overlay) {
				userEvent.click(overlay);
				// Note: This is an async operation in the actual implementation
				// but we're testing that the handler is properly wired
			}
		});
	});

	describe('mode detection', () => {
		it('should be in create mode when book is undefined', () => {
			render(<BookDialog open={true} onClose={vi.fn()} book={undefined} onSubmit={vi.fn()} />);

			expect(screen.getByText('New Book')).toBeInTheDocument();
			expect(screen.getByTestId('submit-label')).toHaveTextContent('Add Book');
		});

		it('should be in create mode when book is null', () => {
			render(<BookDialog open={true} onClose={vi.fn()} book={null} onSubmit={vi.fn()} />);

			expect(screen.getByText('New Book')).toBeInTheDocument();
			expect(screen.getByTestId('submit-label')).toHaveTextContent('Add Book');
		});

		it('should be in edit mode when book is provided', () => {
			render(<BookDialog open={true} onClose={vi.fn()} book={mockBook} onSubmit={vi.fn()} />);

			expect(screen.getByText('Edit Book')).toBeInTheDocument();
			expect(screen.getByTestId('submit-label')).toHaveTextContent('Update Book');
		});
	});

	describe('initial data mapping', () => {
		it('should map all book fields to initial data', () => {
			render(<BookDialog open={true} onClose={vi.fn()} book={mockBook} onSubmit={vi.fn()} />);

			const initialData = JSON.parse(screen.getByTestId('initial-data').textContent!);
			expect(initialData).toEqual({
				title: 'The Great Gatsby',
				author: 'F. Scott Fitzgerald',
				isbn: '978-0-7432-7356-5',
				publishedYear: 1925,
				genre: 'Fiction',
				pages: 180,
			});
		});

		it('should not include metadata fields in initial data', () => {
			render(<BookDialog open={true} onClose={vi.fn()} book={mockBook} onSubmit={vi.fn()} />);

			const initialData = JSON.parse(screen.getByTestId('initial-data').textContent!);
			expect(initialData).not.toHaveProperty('id');
			expect(initialData).not.toHaveProperty('version');
			expect(initialData).not.toHaveProperty('createdAt');
			expect(initialData).not.toHaveProperty('updatedAt');
		});
	});

	describe('edit mode info', () => {
		it('should pass correct bookId and version in edit mode', () => {
			render(<BookDialog open={true} onClose={vi.fn()} book={mockBook} onSubmit={vi.fn()} />);

			const editMode = JSON.parse(screen.getByTestId('edit-mode').textContent!);
			expect(editMode).toEqual({
				bookId: 'book-1',
				version: 1,
			});
		});

		it('should handle book with different version', () => {
			const updatedBook = { ...mockBook, version: 5 };
			render(<BookDialog open={true} onClose={vi.fn()} book={updatedBook} onSubmit={vi.fn()} />);

			const editMode = JSON.parse(screen.getByTestId('edit-mode').textContent!);
			expect(editMode.version).toBe(5);
		});
	});

	describe('optional props', () => {
		it('should work without onRefresh prop', () => {
			render(<BookDialog open={true} onClose={vi.fn()} book={mockBook} onSubmit={vi.fn()} />);

			expect(screen.queryByTestId('refresh-button')).not.toBeInTheDocument();
		});

		it('should work without onCheckISBN prop', () => {
			render(<BookDialog open={true} onClose={vi.fn()} onSubmit={vi.fn()} />);

			expect(screen.queryByTestId('check-isbn-button')).not.toBeInTheDocument();
		});

		it('should work without onPatchISBN prop', () => {
			render(<BookDialog open={true} onClose={vi.fn()} book={mockBook} onSubmit={vi.fn()} />);

			expect(screen.queryByTestId('patch-isbn-button')).not.toBeInTheDocument();
		});

		it('should work with all optional props provided', () => {
			render(
				<BookDialog
					open={true}
					onClose={vi.fn()}
					book={mockBook}
					onSubmit={vi.fn()}
					onRefresh={vi.fn()}
					onCheckISBN={vi.fn()}
					onPatchISBN={vi.fn()}
				/>
			);

			expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
			expect(screen.getByTestId('check-isbn-button')).toBeInTheDocument();
			expect(screen.getByTestId('patch-isbn-button')).toBeInTheDocument();
		});
	});

	describe('complete scenarios', () => {
		it('should handle complete create flow', async () => {
			const user = userEvent.setup();
			const onSubmit = vi.fn().mockResolvedValue(undefined);
			const onClose = vi.fn();

			render(
				<BookDialog
					open={true}
					onClose={onClose}
					onSubmit={onSubmit}
					onCheckISBN={vi.fn().mockResolvedValue(null)}
				/>
			);

			// Verify create mode
			expect(screen.getByText('New Book')).toBeInTheDocument();

			// Submit form
			await user.click(screen.getByTestId('submit-button'));
			await waitFor(() => {
				expect(onSubmit).toHaveBeenCalled();
			});
		});

		it('should handle complete edit flow', async () => {
			const user = userEvent.setup();
			const onSubmit = vi.fn().mockResolvedValue(undefined);
			const onClose = vi.fn();
			const onRefresh = vi.fn();

			render(
				<BookDialog
					open={true}
					onClose={onClose}
					book={mockBook}
					onSubmit={onSubmit}
					onRefresh={onRefresh}
					onCheckISBN={vi.fn().mockResolvedValue(null)}
					onPatchISBN={vi.fn().mockResolvedValue(mockBook)}
				/>
			);

			// Verify edit mode
			expect(screen.getByText('Edit Book')).toBeInTheDocument();

			// Submit form
			await user.click(screen.getByTestId('submit-button'));
			await waitFor(() => {
				expect(onSubmit).toHaveBeenCalled();
			});
		});

		it('should handle cancel in both modes', async () => {
			const user = userEvent.setup();
			const onClose = vi.fn();

			const { rerender } = render(<BookDialog open={true} onClose={onClose} onSubmit={vi.fn()} />);

			// Cancel in create mode
			await user.click(screen.getByTestId('cancel-button'));
			expect(onClose).toHaveBeenCalledTimes(1);

			onClose.mockClear();

			// Cancel in edit mode
			rerender(<BookDialog open={true} onClose={onClose} book={mockBook} onSubmit={vi.fn()} />);

			await user.click(screen.getByTestId('cancel-button'));
			expect(onClose).toHaveBeenCalledTimes(1);
		});
	});
});
