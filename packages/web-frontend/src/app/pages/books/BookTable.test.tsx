import { withMetadata } from '@framework/tests/withMetadata';
import type { Book } from '@shared/api/books.contract';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BookTable } from './BookTable';

describe('BookTable', () => {
	const mockBooks: Book[] = [
		withMetadata({
			id: '1',
			title: 'Clean Code',
			author: 'Robert C. Martin',
			isbn: '978-0132350884',
			publishedYear: 2008,
			genre: 'Programming',
			pages: 464,
		}),
		withMetadata({
			id: '2',
			title: 'The Pragmatic Programmer',
			author: 'Andrew Hunt',
			isbn: '978-0135957059',
			publishedYear: 2019,
			genre: 'Programming',
			pages: 352,
		}),
	];

	const defaultProps = {
		storageId: 'test-storage',
		books: mockBooks,
		onDelete: vi.fn<(id: string) => void>(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('rendering', () => {
		it('should render table headers', () => {
			render(<BookTable {...defaultProps} />);

			expect(screen.getByText('Title')).toBeInTheDocument();
			expect(screen.getByText('Author')).toBeInTheDocument();
			expect(screen.getByText('ISBN')).toBeInTheDocument();
			expect(screen.getByText('Year')).toBeInTheDocument();
			expect(screen.getByText('Genre')).toBeInTheDocument();
			expect(screen.getByText('Pages')).toBeInTheDocument();
			expect(screen.getByText('Actions')).toBeInTheDocument();
		});

		it('should render all books', () => {
			render(<BookTable {...defaultProps} />);

			expect(screen.getByText('Clean Code')).toBeInTheDocument();
			expect(screen.getByText('The Pragmatic Programmer')).toBeInTheDocument();
		});

		it('should render book details correctly', () => {
			render(<BookTable {...defaultProps} />);

			// Check first book
			expect(screen.getByText('Clean Code')).toBeInTheDocument();
			expect(screen.getByText('Robert C. Martin')).toBeInTheDocument();
			expect(screen.getByText('978-0132350884')).toBeInTheDocument();
			expect(screen.getByText('2008')).toBeInTheDocument();
			expect(screen.getByText('464')).toBeInTheDocument();

			// Check second book
			expect(screen.getByText('The Pragmatic Programmer')).toBeInTheDocument();
			expect(screen.getByText('Andrew Hunt')).toBeInTheDocument();
			expect(screen.getByText('978-0135957059')).toBeInTheDocument();
			expect(screen.getByText('2019')).toBeInTheDocument();
			expect(screen.getByText('352')).toBeInTheDocument();

			// Check genre appears for both books (appears twice)
			const programmingGenres = screen.getAllByText('Programming');
			expect(programmingGenres).toHaveLength(2);
		});

		it('should render dash when optional fields are missing', () => {
			const booksWithMissingFields: Book[] = [
				withMetadata({
					id: '1',
					title: 'Test Book',
					author: 'Test Author',
				}),
			];

			render(
				<BookTable
					storageId="test-storage"
					books={booksWithMissingFields}
					onDelete={vi.fn<(id: string) => void>()}
				/>
			);

			// Should render dashes for missing fields
			const dashes = screen.getAllByText('-');
			expect(dashes.length).toBeGreaterThanOrEqual(3); // ISBN, genre, pages
		});

		it('should render delete button for each book', () => {
			render(<BookTable {...defaultProps} />);

			const deleteButtons = screen.getAllByRole('button', { name: /delete book/i });
			expect(deleteButtons).toHaveLength(mockBooks.length);
		});

		it('should render edit button when onEdit is provided', () => {
			const onEdit = vi.fn<(book: Book) => void>();
			render(<BookTable {...defaultProps} onEdit={onEdit} />);

			const editButtons = screen.getAllByRole('button', { name: /edit book/i });
			expect(editButtons).toHaveLength(mockBooks.length);
		});

		it('should not render edit button when onEdit is not provided', () => {
			render(<BookTable {...defaultProps} />);

			const editButtons = screen.queryAllByRole('button', { name: /edit book/i });
			expect(editButtons).toHaveLength(0);
		});
	});

	describe('empty state', () => {
		it('should render table structure even with empty books', () => {
			render(<BookTable storageId="test-storage" books={[]} onDelete={vi.fn<(id: string) => void>()} />);

			expect(screen.getByText('Title')).toBeInTheDocument();
			expect(screen.getByText('Author')).toBeInTheDocument();
		});
	});

	describe('delete action', () => {
		it('should show confirmation dialog when delete is clicked', async () => {
			const onDelete = vi.fn<(id: string) => void>();
			render(<BookTable {...defaultProps} onDelete={onDelete} />);

			const deleteButtons = screen.getAllByRole('button', { name: /delete book/i });
			fireEvent.click(deleteButtons[0]!);

			await waitFor(() => {
				expect(screen.getByRole('heading', { name: /Delete "Clean Code"\?/ })).toBeInTheDocument();
			});
		});

		it('should call onDelete when user confirms', async () => {
			const onDelete = vi.fn<(id: string) => void>();

			render(<BookTable {...defaultProps} onDelete={onDelete} />);

			const deleteButtons = screen.getAllByRole('button', { name: /delete book/i });
			fireEvent.click(deleteButtons[0]!);

			await waitFor(() => {
				expect(screen.getByRole('heading', { name: /Delete "Clean Code"\?/ })).toBeInTheDocument();
			});

			const confirmButton = screen.getByRole('button', { name: /^delete$/i });
			fireEvent.click(confirmButton);

			await waitFor(() => {
				expect(onDelete).toHaveBeenCalledWith('1');
			});
		});

		it('should not call onDelete when user cancels', async () => {
			const onDelete = vi.fn<(id: string) => void>();

			render(<BookTable {...defaultProps} onDelete={onDelete} />);

			const deleteButtons = screen.getAllByRole('button', { name: /delete book/i });
			fireEvent.click(deleteButtons[0]!);

			await waitFor(() => {
				expect(screen.getByRole('heading', { name: /Delete "Clean Code"\?/ })).toBeInTheDocument();
			});

			const cancelButton = screen.getByRole('button', { name: /cancel/i });
			fireEvent.click(cancelButton);

			await waitFor(() => {
				expect(screen.queryByRole('heading', { name: /Delete "Clean Code"\?/ })).not.toBeInTheDocument();
			});

			expect(onDelete).not.toHaveBeenCalled();
		});

		it('should call onDelete with correct book id', async () => {
			const onDelete = vi.fn<(id: string) => void>();

			render(<BookTable {...defaultProps} onDelete={onDelete} />);

			const deleteButtons = screen.getAllByRole('button', { name: /delete book/i });

			// Delete first book
			fireEvent.click(deleteButtons[0]!);
			await waitFor(() => {
				expect(screen.getByText('Delete "Clean Code"?')).toBeInTheDocument();
			});
			const confirmButton1 = screen.getByRole('button', { name: /^delete$/i });
			fireEvent.click(confirmButton1);
			await waitFor(() => {
				expect(onDelete).toHaveBeenCalledWith('1');
			});

			// Delete second book
			fireEvent.click(deleteButtons[1]!);
			await waitFor(() => {
				expect(screen.getByText('Delete "The Pragmatic Programmer"?')).toBeInTheDocument();
			});
			const confirmButton2 = screen.getByRole('button', { name: /^delete$/i });
			fireEvent.click(confirmButton2);
			await waitFor(() => {
				expect(onDelete).toHaveBeenCalledWith('2');
			});
		});
	});

	describe('edit action', () => {
		it('should call onEdit with book when edit is clicked', () => {
			const onEdit = vi.fn<(book: Book) => void>();
			render(<BookTable {...defaultProps} onEdit={onEdit} />);

			const editButtons = screen.getAllByRole('button', { name: /edit book/i });
			fireEvent.click(editButtons[0]!);

			expect(onEdit).toHaveBeenCalledWith(mockBooks[0]);
		});

		it('should call onEdit with correct book', () => {
			const onEdit = vi.fn<(book: Book) => void>();
			render(<BookTable {...defaultProps} onEdit={onEdit} />);

			const editButtons = screen.getAllByRole('button', { name: /edit book/i });

			// Edit first book
			fireEvent.click(editButtons[0]!);
			expect(onEdit).toHaveBeenCalledWith(mockBooks[0]);

			// Edit second book
			fireEvent.click(editButtons[1]!);
			expect(onEdit).toHaveBeenCalledWith(mockBooks[1]);
		});
	});

	describe('table styling', () => {
		it('should apply alternating row styles', () => {
			const { container } = render(<BookTable {...defaultProps} />);

			const rows = container.querySelectorAll('tbody tr');
			expect(rows).toHaveLength(mockBooks.length);

			// First row should have bg-background class
			expect(rows[0]!.className).toContain('bg-background');

			// Second row should have bg-muted/20 class
			expect(rows[1]!.className).toContain('bg-muted/20');
		});

		it('should have hover effect on rows', () => {
			const { container } = render(<BookTable {...defaultProps} />);

			const rows = container.querySelectorAll('tbody tr');

			rows.forEach(row => {
				expect(row.className).toContain('hover:bg-muted/50');
			});
		});
	});

	describe('ISBN formatting', () => {
		it('should display ISBN in monospace font', () => {
			const { container } = render(<BookTable {...defaultProps} />);

			const isbnSpans = container.querySelectorAll('span.font-mono');
			expect(isbnSpans.length).toBeGreaterThan(0);
		});
	});
});
