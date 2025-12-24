import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { withMetadata } from '@framework/tests/withMetadata';
import type { Book } from '@shared/api/books.contract';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BooksPage } from './BooksPage';
import { useBooks } from './useBooks';

// Mock the useBooks hook
vi.mock('./useBooks');

// Mock the useToast hook
const mockShowToast = vi.fn();
vi.mock('@framework/features/toast/ToastContext', () => ({
	useToast: () => ({
		showToast: mockShowToast,
	}),
}));

describe('BooksPage', () => {
	const mockBooks: Book[] = [
		withMetadata({
			id: '1',
			title: 'Clean Code',
			author: 'Robert C. Martin',
			isbn: '978-0132350884',
			pages: 464,
			genre: 'Programming',
		}),
		withMetadata({
			id: '2',
			title: 'The Pragmatic Programmer',
			author: 'Andrew Hunt',
			isbn: '978-0201616224',
			pages: 352,
			genre: 'Programming',
		}),
	];

	const defaultMockHook = {
		books: mockBooks,
		loading: false,
		error: null,
		pagination: {
			page: 1,
			pageSize: 10,
			total: 2,
			totalPages: 1,
		},
		createBook: vi.fn().mockResolvedValue(undefined),
		updateBook: vi.fn().mockResolvedValue(undefined),
		patchBook: vi.fn().mockResolvedValue(undefined),
		deleteBook: vi.fn().mockResolvedValue(undefined),
		bulkDeleteBooks: vi.fn().mockResolvedValue({
			deleted: [],
			failed: [],
			totalRequested: 0,
			totalDeleted: 0,
			totalFailed: 0,
			success: true,
		}),
		checkISBN: vi.fn().mockResolvedValue(null),
		clearError: vi.fn(),
		loadBooks: vi.fn(),
		refreshBook: vi.fn().mockResolvedValue(undefined),
		setBooks: vi.fn(),
		totalCount: 2,
		totalPages: 816,
	};

	// Helper to render with router
	const renderWithRouter = (initialRoute = '/books') => {
		return render(
			<MemoryRouter initialEntries={[initialRoute]}>
				<Routes>
					<Route path="/books" element={<BooksPage />} />
					<Route path="/books/:mode" element={<BooksPage />} />
					<Route path="/books/:id/:mode" element={<BooksPage />} />
				</Routes>
			</MemoryRouter>
		);
	};

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(useBooks).mockReturnValue(defaultMockHook);
	});

	describe('Edit Workflow', () => {
		it('should open form with book data when navigating to edit route', async () => {
			renderWithRouter('/books/1/edit');

			// Form should be visible with book data
			await waitFor(() => {
				expect(screen.getByText('Edit Book')).toBeInTheDocument();
			});

			expect(screen.getByDisplayValue('Clean Code')).toBeInTheDocument();
			expect(screen.getByDisplayValue('Robert C. Martin')).toBeInTheDocument();
			expect(screen.getByDisplayValue('978-0132350884')).toBeInTheDocument();
		});

		it('should update book when form submitted', async () => {
			const updateBook = vi.fn().mockResolvedValue(undefined);
			vi.mocked(useBooks).mockReturnValue({
				...defaultMockHook,
				updateBook,
			});

			renderWithRouter('/books/1/edit');

			// Wait for form to open
			await waitFor(() => {
				expect(screen.getByText('Edit Book')).toBeInTheDocument();
			});

			// Modify the title
			const titleInput = screen.getByDisplayValue('Clean Code');
			fireEvent.change(titleInput, { target: { value: 'Clean Code (Updated)' } });

			// Submit form
			const updateButton = screen.getByRole('button', { name: /update book/i });
			fireEvent.click(updateButton);

			// Verify updateBook was called
			await waitFor(() => {
				expect(updateBook).toHaveBeenCalledWith('1', {
					title: 'Clean Code (Updated)',
					author: 'Robert C. Martin',
					isbn: '978-0132350884',
					publishedYear: undefined,
					pages: 464,
					genre: 'Programming',
					version: 1,
				});
			});
		});

		it('should close form after successful update', async () => {
			const updateBook = vi.fn().mockResolvedValue(undefined);
			vi.mocked(useBooks).mockReturnValue({
				...defaultMockHook,
				updateBook,
			});

			renderWithRouter('/books/1/edit');

			// Wait for form to open
			await waitFor(() => {
				expect(screen.getByText('Edit Book')).toBeInTheDocument();
			});

			// Submit form
			const updateButton = screen.getByRole('button', { name: /update book/i });
			fireEvent.click(updateButton);

			// Wait for form to close
			await waitFor(() => {
				expect(screen.queryByText('Edit Book')).not.toBeInTheDocument();
			});
		});

		it('should close form when Cancel clicked', async () => {
			renderWithRouter('/books/1/edit');

			// Wait for form to open
			await waitFor(() => {
				expect(screen.getByText('Edit Book')).toBeInTheDocument();
			});

			// Click Cancel
			const cancelButton = screen.getByRole('button', { name: /cancel/i });
			fireEvent.click(cancelButton);

			// Form should close
			await waitFor(() => {
				expect(screen.queryByText('Edit Book')).not.toBeInTheDocument();
			});
		});

		it('should pass checkISBN and patchBook to BookForm', async () => {
			const checkISBN = vi.fn().mockResolvedValue(null);
			const patchBook = vi.fn().mockResolvedValue(undefined);
			vi.mocked(useBooks).mockReturnValue({
				...defaultMockHook,
				checkISBN,
				patchBook,
			});

			renderWithRouter('/books/1/edit');

			// Wait for form to open
			await waitFor(() => {
				expect(screen.getByText('Edit Book')).toBeInTheDocument();
			});

			// Verify Check ISBN button exists (means checkISBN was passed)
			const isbnInput = screen.getByDisplayValue('978-0132350884');
			fireEvent.change(isbnInput, { target: { value: '978-9999999999' } });

			await waitFor(() => {
				expect(screen.getByRole('button', { name: /^check$/i })).toBeInTheDocument();
			});

			// Verify Save ISBN button exists (means patchBook was passed)
			expect(screen.getByRole('button', { name: /save isbn/i })).toBeInTheDocument();
		});
	});

	describe('Create Workflow', () => {
		it('should open form when navigating to new route', () => {
			renderWithRouter('/books/new');

			// Form should be visible with "New Book" title
			expect(screen.getByText('New Book')).toBeInTheDocument();
		});

		it('should create book when form submitted', async () => {
			const createBook = vi.fn().mockResolvedValue(undefined);
			vi.mocked(useBooks).mockReturnValue({
				...defaultMockHook,
				createBook,
			});

			renderWithRouter('/books/new');

			// Get the dialog container
			const dialog = screen.getByRole('dialog');

			// Fill in form using within to scope to the dialog only
			fireEvent.change(within(dialog).getByLabelText(/title/i), {
				target: { value: 'Design Patterns' },
			});
			fireEvent.change(within(dialog).getByLabelText(/author/i), {
				target: { value: 'Gang of Four' },
			});

			// Submit form
			const addButton = within(dialog).getByRole('button', { name: /add book/i });
			fireEvent.click(addButton);

			// Verify createBook was called
			await waitFor(() => {
				expect(createBook).toHaveBeenCalledWith({
					title: 'Design Patterns',
					author: 'Gang of Four',
					isbn: '',
					publishedYear: expect.any(Number),
					pages: 0,
					genre: '',
				});
			});
		});

		it('should close form after successful create', async () => {
			const createBook = vi.fn().mockResolvedValue(undefined);
			vi.mocked(useBooks).mockReturnValue({
				...defaultMockHook,
				createBook,
			});

			renderWithRouter('/books/new');

			// Get the dialog container
			const dialog = screen.getByRole('dialog');

			// Fill in form using within to scope to the dialog only
			fireEvent.change(within(dialog).getByLabelText(/title/i), {
				target: { value: 'Design Patterns' },
			});
			fireEvent.change(within(dialog).getByLabelText(/author/i), {
				target: { value: 'Gang of Four' },
			});

			// Submit form
			const addButton = within(dialog).getByRole('button', { name: /add book/i });
			fireEvent.click(addButton);

			// Wait for form to close
			await waitFor(() => {
				expect(screen.queryByText('New Book')).not.toBeInTheDocument();
			});
		});
	});

	describe('Delete Workflow', () => {
		it('should delete book when Delete clicked and confirmed', async () => {
			const deleteBook = vi.fn().mockResolvedValue(undefined);
			vi.mocked(useBooks).mockReturnValue({
				...defaultMockHook,
				deleteBook,
			});

			renderWithRouter();

			// Click Delete button on first book
			const deleteButtons = screen.getAllByLabelText('Delete book');
			fireEvent.click(deleteButtons[0]!);

			// Verify dialog is shown
			await waitFor(() => {
				expect(screen.getByText('Delete "Clean Code"?')).toBeInTheDocument();
			});

			// Click Delete in dialog
			const confirmButton = screen.getByRole('button', { name: /^delete$/i });
			fireEvent.click(confirmButton);

			// Verify delete was called
			await waitFor(() => {
				expect(deleteBook).toHaveBeenCalledWith('1');
			});
		});

		it('should not delete book when Delete cancelled', async () => {
			const deleteBook = vi.fn().mockResolvedValue(undefined);
			vi.mocked(useBooks).mockReturnValue({
				...defaultMockHook,
				deleteBook,
			});

			renderWithRouter();

			// Click Delete button on first book
			const deleteButtons = screen.getAllByLabelText('Delete book');
			fireEvent.click(deleteButtons[0]!);

			// Verify dialog is shown
			await waitFor(() => {
				expect(screen.getByText('Delete "Clean Code"?')).toBeInTheDocument();
			});

			// Click Cancel in dialog
			const cancelButton = screen.getByRole('button', { name: /cancel/i });
			fireEvent.click(cancelButton);

			// Verify delete was NOT called
			expect(deleteBook).not.toHaveBeenCalled();

			// Verify dialog is closed
			await waitFor(() => {
				expect(screen.queryByText('Delete "Clean Code"?')).not.toBeInTheDocument();
			});
		});
	});

	describe('Loading State', () => {
		it('should show loading spinner when loading', () => {
			vi.mocked(useBooks).mockReturnValue({
				...defaultMockHook,
				loading: true,
				books: [],
			});

			renderWithRouter();

			expect(screen.getByText('Loading books...')).toBeInTheDocument();
		});
	});

	describe('Error State', () => {
		it('should call showToast with error', () => {
			const clearError = vi.fn();

			vi.mocked(useBooks).mockReturnValue({
				...defaultMockHook,
				error: 'Failed to load books',
				clearError,
			});

			renderWithRouter();

			// Toast should be shown with error
			expect(mockShowToast).toHaveBeenCalledWith('Failed to load books', 'error');
			// Error should be cleared after showing toast
			expect(clearError).toHaveBeenCalled();
		});
	});

	describe('Empty State', () => {
		it('should show empty state when no books', () => {
			vi.mocked(useBooks).mockReturnValue({
				...defaultMockHook,
				books: [],
				totalCount: 0,
			});

			renderWithRouter();

			expect(screen.getByText('No books yet')).toBeInTheDocument();
			expect(screen.getByText(/Start building your library/i)).toBeInTheDocument();
		});

		it('should navigate to new route when Add First Book clicked in empty state', () => {
			vi.mocked(useBooks).mockReturnValue({
				...defaultMockHook,
				books: [],
				totalCount: 0,
			});

			renderWithRouter();

			// Click "Add First Book" in empty state
			fireEvent.click(screen.getByRole('button', { name: /add first book/i }));

			// Form should be visible (navigation happened)
			expect(screen.getByText('New Book')).toBeInTheDocument();
		});
	});

	describe('Book List Display', () => {
		it('should display all books in table', () => {
			renderWithRouter();

			expect(screen.getByText('Clean Code')).toBeInTheDocument();
			expect(screen.getByText('Robert C. Martin')).toBeInTheDocument();
			expect(screen.getByText('The Pragmatic Programmer')).toBeInTheDocument();
			expect(screen.getByText('Andrew Hunt')).toBeInTheDocument();
		});

		it('should show total count in header', () => {
			renderWithRouter();

			expect(screen.getByText(/Books/i)).toBeInTheDocument();
			expect(screen.getByText('(2)')).toBeInTheDocument();
		});
	});

	describe('Form Toggle', () => {
		it('should navigate to new route when Add Book clicked', () => {
			renderWithRouter();

			// Click Add Book to show form
			const addButton = screen.getByRole('button', { name: /add book/i });
			fireEvent.click(addButton);

			expect(screen.getByText('New Book')).toBeInTheDocument();

			// Click Cancel to hide form
			const cancelButton = screen.getByRole('button', { name: /cancel/i });
			fireEvent.click(cancelButton);

			expect(screen.queryByText('New Book')).not.toBeInTheDocument();
		});
	});

	describe('ISBN Validation Integration', () => {
		it('should allow checking ISBN in create mode', async () => {
			const checkISBN = vi.fn().mockResolvedValue(null);
			vi.mocked(useBooks).mockReturnValue({
				...defaultMockHook,
				checkISBN,
			});

			renderWithRouter('/books/new');

			// Get the dialog container
			const dialog = screen.getByRole('dialog');

			// Enter ISBN using within to scope to the dialog only
			fireEvent.change(within(dialog).getByLabelText(/isbn/i), {
				target: { value: '978-9999999999' },
			});

			// Click Check
			fireEvent.click(within(dialog).getByRole('button', { name: /^check$/i }));

			await waitFor(() => {
				expect(checkISBN).toHaveBeenCalledWith('978-9999999999', undefined);
			});
		});

		it('should allow patching ISBN in edit mode', async () => {
			const patchBook = vi.fn().mockResolvedValue(undefined);
			vi.mocked(useBooks).mockReturnValue({
				...defaultMockHook,
				patchBook,
			});

			renderWithRouter('/books/1/edit');

			// Wait for form
			await waitFor(() => {
				expect(screen.getByText('Edit Book')).toBeInTheDocument();
			});

			// Change ISBN
			const isbnInput = screen.getByDisplayValue('978-0132350884');
			fireEvent.change(isbnInput, { target: { value: '978-1234567890' } });

			// Click Save ISBN
			fireEvent.click(screen.getByRole('button', { name: /save isbn/i }));

			await waitFor(() => {
				expect(patchBook).toHaveBeenCalledWith('1', {
					isbn: '978-1234567890',
					version: 1,
				});
			});
		});
	});
});
