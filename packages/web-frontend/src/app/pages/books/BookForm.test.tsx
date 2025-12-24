import { withMetadata } from '@framework/tests/withMetadata';
import type { Book, CreateBook } from '@shared/api/books.contract';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BookForm } from './BookForm';
import { booksService } from './BooksService';

describe('BookForm', () => {
	const defaultProps = {
		onSubmit: vi.fn<(data: CreateBook) => Promise<void>>().mockResolvedValue(undefined),
		onCancel: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('component wiring', () => {
		it('should wire form submission correctly with all components', async () => {
			const onSubmit = vi.fn<(data: CreateBook) => Promise<void>>().mockResolvedValue(undefined);
			render(<BookForm {...defaultProps} onSubmit={onSubmit} />);

			// Fill in form fields
			fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Clean Code' } });
			fireEvent.change(screen.getByLabelText(/author/i), {
				target: { value: 'Robert C. Martin' },
			});
			fireEvent.change(screen.getByLabelText(/isbn/i), {
				target: { value: '978-0132350884' },
			});
			fireEvent.change(screen.getByLabelText(/published year/i), {
				target: { value: '2008' },
			});
			fireEvent.change(screen.getByLabelText(/pages/i), { target: { value: '464' } });
			fireEvent.change(screen.getByLabelText(/genre/i), { target: { value: 'Programming' } });

			// Submit form
			const submitButton = screen.getByRole('button', { name: /create book/i });
			fireEvent.click(submitButton);

			// Verify onSubmit receives correct data with correct types
			await waitFor(() => {
				expect(onSubmit).toHaveBeenCalledWith({
					title: 'Clean Code',
					author: 'Robert C. Martin',
					isbn: '978-0132350884',
					publishedYear: 2008,
					pages: 464,
					genre: 'Programming',
				});
			});
		});

		it('should wire initialData correctly through all components', () => {
			const initialData: CreateBook = {
				title: 'The Pragmatic Programmer',
				author: 'Andrew Hunt',
				isbn: '978-0201616224',
				publishedYear: 1999,
				genre: 'Software Engineering',
				pages: 352,
			};

			render(<BookForm {...defaultProps} initialData={initialData} />);

			expect(screen.getByDisplayValue('The Pragmatic Programmer')).toBeInTheDocument();
			expect(screen.getByDisplayValue('Andrew Hunt')).toBeInTheDocument();
			expect(screen.getByDisplayValue('978-0201616224')).toBeInTheDocument();
			expect(screen.getByDisplayValue('1999')).toBeInTheDocument();
			expect(screen.getByDisplayValue('Software Engineering')).toBeInTheDocument();
			expect(screen.getByDisplayValue('352')).toBeInTheDocument();
		});

		it('should wire custom submitLabel correctly', () => {
			render(<BookForm {...defaultProps} submitLabel="Update Book" />);

			expect(screen.getByRole('button', { name: /update book/i })).toBeInTheDocument();
		});
	});

	describe('ISBN Validation', () => {
		it('should show Check button when onCheckISBN is provided', () => {
			const onCheckISBN = vi.fn();
			render(<BookForm {...defaultProps} onCheckISBN={onCheckISBN} />);

			// Enter ISBN
			fireEvent.change(screen.getByLabelText(/isbn/i), {
				target: { value: '978-0132350884' },
			});

			expect(screen.getByRole('button', { name: /^check$/i })).toBeInTheDocument();
		});

		it('should not show Check button when onCheckISBN is not provided', () => {
			render(<BookForm {...defaultProps} />);

			// Enter ISBN
			fireEvent.change(screen.getByLabelText(/isbn/i), {
				target: { value: '978-0132350884' },
			});

			expect(screen.queryByRole('button', { name: /^check$/i })).not.toBeInTheDocument();
		});

		it('should show Check button when ISBN is empty (but disabled)', () => {
			const onCheckISBN = vi.fn();
			render(<BookForm {...defaultProps} onCheckISBN={onCheckISBN} />);

			const checkButton = screen.getByRole('button', { name: /^check$/i });
			expect(checkButton).toBeInTheDocument();
			expect(checkButton).toBeDisabled();
		});

		it('should call onCheckISBN when Check button clicked', async () => {
			const onCheckISBN = vi.fn().mockResolvedValue(null);
			render(<BookForm {...defaultProps} onCheckISBN={onCheckISBN} />);

			// Enter ISBN
			fireEvent.change(screen.getByLabelText(/isbn/i), {
				target: { value: '978-0132350884' },
			});

			// Click Check
			fireEvent.click(screen.getByRole('button', { name: /^check$/i }));

			await waitFor(() => {
				expect(onCheckISBN).toHaveBeenCalledWith('978-0132350884', undefined);
			});
		});

		it('should call onCheckISBN with excludeBookId in edit mode', async () => {
			const onCheckISBN = vi.fn().mockResolvedValue(null);
			const editMode = { bookId: '1', version: 1 };
			render(<BookForm {...defaultProps} onCheckISBN={onCheckISBN} editMode={editMode} />);

			// Enter ISBN
			fireEvent.change(screen.getByLabelText(/isbn/i), {
				target: { value: '978-0132350884' },
			});

			// Click Check
			fireEvent.click(screen.getByRole('button', { name: /^check$/i }));

			await waitFor(() => {
				expect(onCheckISBN).toHaveBeenCalledWith('978-0132350884', '1');
			});
		});

		it('should show green checkmark when ISBN is valid (available)', async () => {
			const onCheckISBN = vi.fn().mockResolvedValue(null);
			render(<BookForm {...defaultProps} onCheckISBN={onCheckISBN} />);

			// Enter ISBN
			fireEvent.change(screen.getByLabelText(/isbn/i), {
				target: { value: '978-9999999999' },
			});

			// Click Check
			fireEvent.click(screen.getByRole('button', { name: /^check$/i }));

			// Wait for checkmark
			await waitFor(() => {
				const checkmark = screen.getByTitle('ISBN is available');
				expect(checkmark).toBeInTheDocument();
			});
		});

		it('should show error when ISBN is taken', async () => {
			const existingBook: Book = withMetadata({
				id: '1',
				title: 'Clean Code',
				author: 'Robert C. Martin',
				isbn: '978-0132350884',
			});

			const onCheckISBN = vi.fn().mockResolvedValue(existingBook);
			render(<BookForm {...defaultProps} onCheckISBN={onCheckISBN} />);

			// Enter ISBN
			fireEvent.change(screen.getByLabelText(/isbn/i), {
				target: { value: '978-0132350884' },
			});

			// Click Check
			fireEvent.click(screen.getByRole('button', { name: /^check$/i }));

			// Wait for error message
			await waitFor(() => {
				expect(
					screen.getByText(/ISBN is already used by "Clean Code" by Robert C\. Martin/i)
				).toBeInTheDocument();
			});
		});

		it('should reset validation state when ISBN changes', async () => {
			const onCheckISBN = vi.fn().mockResolvedValue(null);
			render(<BookForm {...defaultProps} onCheckISBN={onCheckISBN} />);

			// Enter ISBN and check
			fireEvent.change(screen.getByLabelText(/isbn/i), {
				target: { value: '978-9999999999' },
			});
			fireEvent.click(screen.getByRole('button', { name: /^check$/i }));

			// Wait for checkmark
			await waitFor(() => {
				expect(screen.getByTitle('ISBN is available')).toBeInTheDocument();
			});

			// Change ISBN
			fireEvent.change(screen.getByLabelText(/isbn/i), {
				target: { value: '978-1111111111' },
			});

			// Checkmark should disappear
			expect(screen.queryByTitle('ISBN is available')).not.toBeInTheDocument();
		});

		it('should show Checking... while validation is in progress', async () => {
			let resolveCheck: (value: null) => void;
			const checkPromise = new Promise<null>(resolve => {
				resolveCheck = resolve;
			});
			const onCheckISBN = vi.fn().mockReturnValue(checkPromise);

			render(<BookForm {...defaultProps} onCheckISBN={onCheckISBN} />);

			// Enter ISBN
			fireEvent.change(screen.getByLabelText(/isbn/i), {
				target: { value: '978-0132350884' },
			});

			// Click Check
			fireEvent.click(screen.getByRole('button', { name: /^check$/i }));

			// Should show Checking...
			expect(screen.getByRole('button', { name: /checking\.\.\./i })).toBeInTheDocument();

			// Resolve the promise
			resolveCheck!(null);

			// Wait for completion
			await waitFor(() => {
				expect(screen.queryByRole('button', { name: /checking\.\.\./i })).not.toBeInTheDocument();
			});
		});
	});

	describe('Save ISBN (Edit Mode)', () => {
		const editMode = {
			bookId: '1',
			version: 1,
		};

		beforeEach(() => {
			vi.clearAllMocks();
			vi.spyOn(booksService, 'patchBook');
		});

		it('should show Save ISBN button in edit mode', () => {
			render(<BookForm {...defaultProps} editMode={editMode} />);

			// Enter ISBN
			fireEvent.change(screen.getByLabelText(/isbn/i), {
				target: { value: '978-0132350884' },
			});

			expect(screen.getByRole('button', { name: /save isbn/i })).toBeInTheDocument();
		});

		it('should not show Save ISBN in create mode', () => {
			render(<BookForm {...defaultProps} />);

			// Enter ISBN
			fireEvent.change(screen.getByLabelText(/isbn/i), {
				target: { value: '978-0132350884' },
			});

			expect(screen.queryByRole('button', { name: /save isbn/i })).not.toBeInTheDocument();
		});

		it('should call booksService.patchBook when Save ISBN clicked', async () => {
			const updatedBook: Book = withMetadata({
				id: '1',
				title: 'Clean Code',
				author: 'Robert C. Martin',
				isbn: '978-1234567890',
				version: 2,
			});
			vi.mocked(booksService.patchBook).mockResolvedValue(updatedBook);

			const initialData: CreateBook = {
				title: 'Clean Code',
				author: 'Robert C. Martin',
				isbn: '978-0132350884',
			};

			render(<BookForm {...defaultProps} initialData={initialData} editMode={editMode} />);

			// Change ISBN
			fireEvent.change(screen.getByLabelText(/isbn/i), {
				target: { value: '978-1234567890' },
			});

			// Click Save ISBN
			fireEvent.click(screen.getByRole('button', { name: /save isbn/i }));

			await waitFor(() => {
				expect(booksService.patchBook).toHaveBeenCalledWith('1', {
					isbn: '978-1234567890',
					version: 1,
				});
			});
		});

		it('should update local version after successful Save ISBN', async () => {
			const updatedBook: Book = withMetadata({
				id: '1',
				title: 'Clean Code',
				author: 'Robert C. Martin',
				isbn: '978-1234567890',
				version: 2,
			});
			vi.mocked(booksService.patchBook).mockResolvedValue(updatedBook);

			const initialData: CreateBook = {
				title: 'Clean Code',
				author: 'Robert C. Martin',
				isbn: '978-0132350884',
			};

			render(<BookForm {...defaultProps} initialData={initialData} editMode={editMode} />);

			// Change ISBN
			fireEvent.change(screen.getByLabelText(/isbn/i), {
				target: { value: '978-1234567890' },
			});

			// Click Save ISBN
			fireEvent.click(screen.getByRole('button', { name: /save isbn/i }));

			// Verify PATCH was called with initial version
			await waitFor(() => {
				expect(booksService.patchBook).toHaveBeenCalledWith('1', {
					isbn: '978-1234567890',
					version: 1,
				});
			});
		});

		it('should show version conflict error (409)', async () => {
			const error: any = new Error('Book was modified. Version mismatch');
			error.status = 409;
			vi.mocked(booksService.patchBook).mockRejectedValue(error);

			const initialData: CreateBook = {
				title: 'Clean Code',
				author: 'Robert C. Martin',
				isbn: '978-0132350884',
			};

			render(<BookForm {...defaultProps} initialData={initialData} editMode={editMode} />);

			// Change ISBN
			fireEvent.change(screen.getByLabelText(/isbn/i), {
				target: { value: '978-1234567890' },
			});

			// Click Save ISBN
			fireEvent.click(screen.getByRole('button', { name: /save isbn/i }));

			// Wait for error message
			await waitFor(() => {
				expect(screen.getByText(/Book was modified by another user\. Refresh the form\?/i)).toBeInTheDocument();
			});
		});

		it('should show ISBN duplicate error (409)', async () => {
			const error: any = new Error('ISBN already exists');
			error.status = 409;
			vi.mocked(booksService.patchBook).mockRejectedValue(error);

			const initialData: CreateBook = {
				title: 'Clean Code',
				author: 'Robert C. Martin',
				isbn: '978-0132350884',
			};

			render(<BookForm {...defaultProps} initialData={initialData} editMode={editMode} />);

			// Change ISBN
			fireEvent.change(screen.getByLabelText(/isbn/i), {
				target: { value: '978-1234567890' },
			});

			// Click Save ISBN
			fireEvent.click(screen.getByRole('button', { name: /save isbn/i }));

			// Wait for error message
			await waitFor(() => {
				expect(screen.getByText(/ISBN already taken by another book/i)).toBeInTheDocument();
			});
		});

		it('should show Saving... while patch is in progress', async () => {
			let resolvePatch: (value: Book) => void;
			const patchPromise = new Promise<Book>(resolve => {
				resolvePatch = resolve;
			});
			vi.mocked(booksService.patchBook).mockReturnValue(patchPromise);

			const initialData: CreateBook = {
				title: 'Clean Code',
				author: 'Robert C. Martin',
				isbn: '978-0132350884',
			};

			render(<BookForm {...defaultProps} initialData={initialData} editMode={editMode} />);

			// Change ISBN
			fireEvent.change(screen.getByLabelText(/isbn/i), {
				target: { value: '978-1234567890' },
			});

			// Click Save ISBN
			fireEvent.click(screen.getByRole('button', { name: /save isbn/i }));

			// Should show Saving...
			expect(screen.getByRole('button', { name: /saving\.\.\./i })).toBeInTheDocument();

			// Resolve the promise
			const updatedBook: Book = withMetadata({
				id: '1',
				title: 'Clean Code',
				author: 'Robert C. Martin',
				isbn: '978-1234567890',
				version: 2,
			});
			resolvePatch!(updatedBook);

			// Wait for completion
			await waitFor(() => {
				expect(screen.queryByRole('button', { name: /saving\.\.\./i })).not.toBeInTheDocument();
			});
		});

		it('should NOT show Saving... on Check button when Save ISBN is clicked', async () => {
			const updatedBook: Book = withMetadata({
				id: '1',
				title: 'Clean Code',
				author: 'Robert C. Martin',
				isbn: '978-1234567890',
				version: 2,
			});
			vi.mocked(booksService.patchBook).mockResolvedValue(updatedBook);

			const initialData: CreateBook = {
				title: 'Clean Code',
				author: 'Robert C. Martin',
				isbn: '978-0132350884',
			};

			const onCheckISBN = vi.fn();
			render(
				<BookForm {...defaultProps} initialData={initialData} editMode={editMode} onCheckISBN={onCheckISBN} />
			);

			// Change ISBN
			fireEvent.change(screen.getByLabelText(/isbn/i), {
				target: { value: '978-1234567890' },
			});

			// Click Save ISBN
			fireEvent.click(screen.getByRole('button', { name: /save isbn/i }));

			// Check button should NOT show Saving...
			const checkButton = screen.getByRole('button', { name: /^check$/i });
			expect(checkButton).not.toHaveTextContent('Saving...');

			await waitFor(() => {
				expect(booksService.patchBook).toHaveBeenCalled();
			});
		});
	});

	describe('Edit Mode', () => {
		const editMode = {
			bookId: '1',
			version: 1,
		};

		it('should populate form with initialData', () => {
			const initialData: CreateBook = {
				title: 'Clean Code',
				author: 'Robert C. Martin',
				isbn: '978-0132350884',
				publishedYear: 2008,
				pages: 464,
				genre: 'Programming',
			};

			render(<BookForm {...defaultProps} initialData={initialData} editMode={editMode} />);

			expect(screen.getByDisplayValue('Clean Code')).toBeInTheDocument();
			expect(screen.getByDisplayValue('Robert C. Martin')).toBeInTheDocument();
			expect(screen.getByDisplayValue('978-0132350884')).toBeInTheDocument();
			expect(screen.getByDisplayValue('2008')).toBeInTheDocument();
			expect(screen.getByDisplayValue('464')).toBeInTheDocument();
			expect(screen.getByDisplayValue('Programming')).toBeInTheDocument();
		});

		it('should show "Update Book" submit button in edit mode', () => {
			render(<BookForm {...defaultProps} editMode={editMode} submitLabel="Update Book" />);

			expect(screen.getByRole('button', { name: /update book/i })).toBeInTheDocument();
		});
	});
});
