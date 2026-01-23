import { useMemo } from 'react';

import type { Book, CreateBook } from '@shared/api/books.contract';

import { BookForm } from '@app/pages/books/BookForm';

import { EntityDialog } from './EntityDialog';

/**
 * ===========================================================================================
 * BOOK DIALOG - Domain Component
 * ===========================================================================================
 *
 * Wraps BookForm in an EntityDialog with book-specific initial data handling.
 * - Uses EntityDialog for consistent dialog structure
 * - Handles book-specific operations (ISBN check, patch)
 * - Prepares initial data and edit mode for BookForm
 *
 * **Refactored:** Now uses generic EntityDialog wrapper, eliminating ~70 lines of
 * duplicated dialog boilerplate.
 *
 * ===========================================================================================
 */

export interface BookDialogProps {
	open: boolean;
	onClose: () => void;
	book?: Book | null;
	onSubmit: (data: CreateBook) => Promise<void>;
	onRefresh?: () => void;
	isRefreshing?: boolean;
	onCheckISBN?: (isbn: string, excludeBookId?: string) => Promise<Book | null>;
	onPatchISBN?: (id: string, data: Partial<CreateBook> & { version: number }) => Promise<Book>;
}

export function BookDialog({
	open,
	onClose,
	book,
	onSubmit,
	onRefresh,
	isRefreshing = false,
	onCheckISBN,
	onPatchISBN,
}: BookDialogProps) {
	// Determine mode based on whether book exists
	const isEditMode = !!book;

	// Prepare initial data for edit mode (memoized to prevent form resets)
	// Using individual book fields as dependencies instead of book object reference
	// This prevents form reset when book object changes but data fields remain the same
	const initialData = useMemo(() => {
		if (!book) return undefined;
		return {
			title: book.title,
			author: book.author,
			isbn: book.isbn,
			publishedYear: book.publishedYear,
			genre: book.genre,
			pages: book.pages,
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [book?.title, book?.author, book?.isbn, book?.publishedYear, book?.genre, book?.pages]);

	// Prepare edit mode info for BookForm (memoized to prevent form resets)
	// Using individual book fields as dependencies to track version updates
	const editMode = useMemo(() => {
		if (!book) return undefined;
		return {
			bookId: book.id,
			version: book.version,
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [book?.id, book?.version]);

	return (
		<EntityDialog
			open={open}
			onClose={onClose}
			entity={book}
			entityName="Book"
			onRefresh={onRefresh}
			isRefreshing={isRefreshing}
			maxWidth="2xl"
		>
			<BookForm
				onSubmit={onSubmit}
				onCancel={onClose}
				onCheckISBN={onCheckISBN}
				onPatchISBN={onPatchISBN}
				initialData={initialData}
				editMode={editMode}
				submitLabel={isEditMode ? 'Update Book' : 'Add Book'}
			/>
		</EntityDialog>
	);
}
