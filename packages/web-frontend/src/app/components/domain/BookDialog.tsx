import { useMemo } from 'react';

import { CrudDialog } from '@framework/components/overlays/CrudDialog';
import { Button } from '@framework/components/primitives/Button';
import type { Book, CreateBook } from '@shared/api/books.contract';
import { RefreshCw } from 'lucide-react';

import { BookForm } from '@app/pages/books/BookForm';

/**
 * ===========================================================================================
 * BOOK DIALOG - Domain Component
 * ===========================================================================================
 *
 * Wraps BookForm in a CrudDialog with appropriate title/description based on mode.
 * - Uses CrudDialog for consistent dialog styling
 * - Determines create vs edit mode automatically
 * - Passes through all necessary handlers to BookForm
 * - Handles ISBN-specific operations (check, patch)
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

	// Determine title based on mode
	const title = isEditMode ? 'Edit Book' : 'New Book';

	// Build header actions (refresh button + version badge)
	const isDev = import.meta.env.DEV;
	const headerActions = isEditMode ? (
		<>
			{onRefresh && (
				<Button
					type="button"
					onClick={onRefresh}
					disabled={isRefreshing}
					variant="ghost"
					size="icon-sm"
					title="Refresh data"
				>
					<RefreshCw
						className={`
        size-4
        ${isRefreshing ? 'animate-spin' : ''}
      `}
					/>
				</Button>
			)}
			{isDev && book?.version !== undefined && (
				<span
					className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground"
					title="Current version (dev only)"
				>
					v{book.version}
				</span>
			)}
		</>
	) : null;

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

	// Handler for dialog open change (called when user clicks overlay or ESC)
	const handleOpenChange = (newOpen: boolean) => {
		if (!newOpen) {
			onClose();
		}
	};

	return (
		<CrudDialog
			open={open}
			onOpenChange={handleOpenChange}
			title={title}
			headerActions={headerActions}
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
		</CrudDialog>
	);
}
