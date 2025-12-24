import { useState } from 'react';

import { Button } from '@framework/components/primitives/Button';
import type { Book, CreateBook } from '@shared/api/books.contract';
import type { Meta, StoryObj } from '@storybook/react';

import { BookDialog } from './BookDialog';

/**
 * BookDialog component stories demonstrating create and edit modes.
 * Wraps BookForm in a CrudDialog with appropriate title/description.
 */
const meta = {
	title: 'Domain/BookDialog',
	component: BookDialog,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {
		open: {
			control: 'boolean',
			description: 'Whether the dialog is open',
		},
		book: {
			control: 'object',
			description: 'Book to edit (undefined/null for create mode)',
		},
	},
} satisfies Meta<typeof BookDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// Mock book data for stories
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

const anotherBook: Book = {
	id: 'book-2',
	title: '1984',
	author: 'George Orwell',
	isbn: '978-0-452-28423-4',
	publishedYear: 1949,
	genre: 'Dystopian',
	pages: 328,
	version: 2,
	createdAt: '2024-01-02T00:00:00Z',
	updatedAt: '2024-01-15T00:00:00Z',
};

// Interactive wrapper component for stories
function BookDialogStoryWrapper({
	book,
	withISBNCheck = false,
	withPatchISBN = false,
}: {
	book?: Book | null;
	withISBNCheck?: boolean;
	withPatchISBN?: boolean;
}) {
	const [open, setOpen] = useState(false);

	const handleSubmit = async (data: CreateBook) => {
		console.log('Submit:', data);
		// Simulate API call
		await new Promise(resolve => setTimeout(resolve, 1000));
		setOpen(false);
	};

	const handleCheckISBN = async (isbn: string, excludeBookId?: string) => {
		console.log('Check ISBN:', isbn, 'exclude:', excludeBookId);
		// Simulate API call
		await new Promise(resolve => setTimeout(resolve, 500));
		// Return null = ISBN available, return Book = ISBN taken
		if (isbn === '978-0-000-00000-0') {
			return {
				id: 'other-book',
				title: 'Other Book',
				author: 'Other Author',
			} as Book;
		}
		return null;
	};

	const handlePatchISBN = async (id: string, data: Partial<CreateBook> & { version: number }) => {
		console.log('Patch ISBN:', id, data);
		// Simulate API call
		await new Promise(resolve => setTimeout(resolve, 500));
		return { ...mockBook, ...data, version: data.version + 1 };
	};

	const handleRefresh = async () => {
		console.log('Refresh book');
		// Simulate API call
		await new Promise(resolve => setTimeout(resolve, 500));
	};

	return (
		<div>
			<Button onClick={() => setOpen(true)}>Open Dialog</Button>
			<BookDialog
				open={open}
				onClose={() => setOpen(false)}
				book={book}
				onSubmit={handleSubmit}
				onRefresh={book ? handleRefresh : undefined}
				onCheckISBN={withISBNCheck ? handleCheckISBN : undefined}
				onPatchISBN={withPatchISBN ? handlePatchISBN : undefined}
			/>
		</div>
	);
}

// Create Mode Stories
export const CreateMode: Story = {
	args: undefined as any,
	render: () => <BookDialogStoryWrapper />,
};

export const CreateModeWithISBNCheck: Story = {
	args: undefined as any,
	render: () => <BookDialogStoryWrapper withISBNCheck={true} />,
};

// Edit Mode Stories
export const EditMode: Story = {
	args: undefined as any,
	render: () => <BookDialogStoryWrapper book={mockBook} />,
};

export const EditModeWithAllHandlers: Story = {
	args: undefined as any,
	render: () => <BookDialogStoryWrapper book={mockBook} withISBNCheck={true} withPatchISBN={true} />,
};

export const EditModeAnotherBook: Story = {
	args: undefined as any,
	render: () => <BookDialogStoryWrapper book={anotherBook} withISBNCheck={true} withPatchISBN={true} />,
};

// Edge Cases
export const EditModeWithLongContent: Story = {
	args: undefined as any,
	render: () => {
		const longBook: Book = {
			id: 'book-long',
			title: 'A Very Long Book Title That Demonstrates How The Dialog Handles Extended Text',
			author: 'Author With A Very Long Name That Tests Text Wrapping Behavior',
			isbn: '978-0-123-45678-9-012-34567-8',
			publishedYear: 2024,
			genre: 'Science Fiction, Fantasy, Adventure, Mystery, Thriller, Drama',
			pages: 9999,
			version: 1,
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-01T00:00:00Z',
		};

		return <BookDialogStoryWrapper book={longBook} withISBNCheck={true} withPatchISBN={true} />;
	},
};

export const EditModeMinimalData: Story = {
	args: undefined as any,
	render: () => {
		const minimalBook: Book = {
			id: 'book-minimal',
			title: 'Book',
			author: 'A',
			isbn: '1',
			publishedYear: 1,
			genre: '',
			pages: 1,
			version: 1,
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-01T00:00:00Z',
		};

		return <BookDialogStoryWrapper book={minimalBook} withISBNCheck={true} withPatchISBN={true} />;
	},
};

// Mode Comparison
export const ModeComparison: Story = {
	args: undefined as any,
	render: () => {
		const [openCreate, setOpenCreate] = useState(false);
		const [openEdit, setOpenEdit] = useState(false);

		const handleSubmit = async (data: CreateBook) => {
			console.log('Submit:', data);
			await new Promise(resolve => setTimeout(resolve, 1000));
			setOpenCreate(false);
			setOpenEdit(false);
		};

		return (
			<div className="flex gap-4">
				<div>
					<Button onClick={() => setOpenCreate(true)}>Open Create Mode</Button>
					<BookDialog
						open={openCreate}
						onClose={() => setOpenCreate(false)}
						onSubmit={handleSubmit}
						onCheckISBN={async () => null}
					/>
				</div>
				<div>
					<Button onClick={() => setOpenEdit(true)}>Open Edit Mode</Button>
					<BookDialog
						open={openEdit}
						onClose={() => setOpenEdit(false)}
						book={mockBook}
						onSubmit={handleSubmit}
						onRefresh={async () => {}}
						onCheckISBN={async () => null}
						onPatchISBN={async (id, data) => ({
							...mockBook,
							...data,
							version: data.version + 1,
						})}
					/>
				</div>
			</div>
		);
	},
};

// Interactive Testing
export const InteractiveCreateMode: Story = {
	args: undefined as any,
	render: () => {
		const [open, setOpen] = useState(true);
		const [submitted, setSubmitted] = useState(false);

		const handleSubmit = async (data: CreateBook) => {
			console.log('Submit:', data);
			setSubmitted(true);
			await new Promise(resolve => setTimeout(resolve, 1000));
			setOpen(false);
			setTimeout(() => {
				setSubmitted(false);
				setOpen(true);
			}, 2000);
		};

		return (
			<div>
				{submitted && (
					<div className="mb-4 rounded-md bg-green-100 p-4 text-green-900">Book submitted successfully!</div>
				)}
				<BookDialog
					open={open}
					onClose={() => setOpen(false)}
					onSubmit={handleSubmit}
					onCheckISBN={async isbn => {
						if (isbn === '978-0-000-00000-0') {
							return {
								id: 'existing',
								title: 'Existing Book',
								author: 'Existing Author',
							} as Book;
						}
						return null;
					}}
				/>
			</div>
		);
	},
};

export const InteractiveEditMode: Story = {
	args: undefined as any,
	render: () => {
		const [open, setOpen] = useState(true);
		const [currentBook, setCurrentBook] = useState(mockBook);
		const [submitted, setSubmitted] = useState(false);

		const handleSubmit = async (data: CreateBook) => {
			console.log('Submit:', data);
			setSubmitted(true);
			setCurrentBook({ ...currentBook, ...data });
			await new Promise(resolve => setTimeout(resolve, 1000));
			setOpen(false);
			setTimeout(() => {
				setSubmitted(false);
				setOpen(true);
			}, 2000);
		};

		const handlePatchISBN = async (id: string, data: Partial<CreateBook> & { version: number }) => {
			console.log('Patch ISBN:', id, data);
			await new Promise(resolve => setTimeout(resolve, 500));
			const updated = { ...currentBook, ...data, version: data.version + 1 };
			setCurrentBook(updated);
			return updated;
		};

		return (
			<div>
				{submitted && (
					<div className="mb-4 rounded-md bg-green-100 p-4 text-green-900">Book updated successfully!</div>
				)}
				<div className="mb-4 rounded-md bg-blue-50 p-4">
					<h3 className="font-semibold">Current Book Data:</h3>
					<pre className="mt-2 text-xs">{JSON.stringify(currentBook, null, 2)}</pre>
				</div>
				<BookDialog
					open={open}
					onClose={() => setOpen(false)}
					book={currentBook}
					onSubmit={handleSubmit}
					onRefresh={async () => {
						console.log('Refresh');
					}}
					onCheckISBN={async isbn => {
						if (isbn === '978-0-000-00000-0') {
							return {
								id: 'existing',
								title: 'Existing Book',
								author: 'Existing Author',
							} as Book;
						}
						return null;
					}}
					onPatchISBN={handlePatchISBN}
				/>
			</div>
		);
	},
};
