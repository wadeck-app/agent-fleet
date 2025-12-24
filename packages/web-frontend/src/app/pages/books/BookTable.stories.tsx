import { withMetadata } from '@framework/tests/withMetadata';
import type { Book } from '@shared/api/books.contract';
import type { Meta, StoryObj } from '@storybook/react';

import { BookTable } from './BookTable';

/**
 * BookTable component stories demonstrating book list display patterns.
 * Feature component for presenting books in a table format with actions.
 */
const meta = {
	title: 'Features/BookTable',
	component: BookTable,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
	argTypes: {
		onDelete: { action: 'deleted' },
		onEdit: { action: 'edited' },
	},
} satisfies Meta<typeof BookTable>;

export default meta;
type Story = StoryObj<typeof meta>;

// Sample book data
const sampleBooks: Book[] = [
	withMetadata({
		id: '1',
		title: 'The Great Gatsby',
		author: 'F. Scott Fitzgerald',
		isbn: '978-0-7432-7356-5',
		publishedYear: 1925,
		genre: 'Classic Fiction',
		pages: 180,
	}),
	withMetadata({
		id: '2',
		title: 'To Kill a Mockingbird',
		author: 'Harper Lee',
		isbn: '978-0-06-112008-4',
		publishedYear: 1960,
		genre: 'Classic Fiction',
		pages: 324,
	}),
	withMetadata({
		id: '3',
		title: '1984',
		author: 'George Orwell',
		isbn: '978-0-452-28423-4',
		publishedYear: 1949,
		genre: 'Dystopian',
		pages: 328,
	}),
	withMetadata({
		id: '4',
		title: 'Pride and Prejudice',
		author: 'Jane Austen',
		isbn: '978-0-14-143951-8',
		publishedYear: 1813,
		genre: 'Romance',
		pages: 432,
	}),
	withMetadata({
		id: '5',
		title: 'The Hobbit',
		author: 'J.R.R. Tolkien',
		isbn: '978-0-547-92822-7',
		publishedYear: 1937,
		genre: 'Fantasy',
		pages: 310,
	}),
];

// Default table with books
export const Default: Story = {
	args: {
		storageId: 'story-books',
		books: sampleBooks,
		onDelete: (id: string) => console.log('Delete book:', id),
	},
};

// With edit functionality
export const WithEdit: Story = {
	args: {
		storageId: 'story-books',
		books: sampleBooks,
		onDelete: (id: string) => console.log('Delete book:', id),
		onEdit: (book: Book) => console.log('Edit book:', book),
	},
};

// Empty table
export const Empty: Story = {
	args: {
		storageId: 'story-books',
		books: [],
		onDelete: (id: string) => console.log('Delete book:', id),
	},
	render: args => (
		<div>
			<BookTable {...args} />
			<p className="mt-4 text-center text-sm text-muted-foreground">
				Empty state - typically handled by parent component
			</p>
		</div>
	),
};

// Single book
export const SingleBook: Story = {
	args: {
		storageId: 'story-books',
		books: [sampleBooks[0]!],
		onDelete: (id: string) => console.log('Delete book:', id),
		onEdit: (book: Book) => console.log('Edit book:', book),
	},
};

// Books with missing optional data
export const IncompleteData: Story = {
	args: {
		storageId: 'story-books',
		books: [
			withMetadata({
				id: '6',
				title: 'Unknown Classic',
				author: 'Anonymous',
				publishedYear: 1800,
				pages: 250,
			}),
			withMetadata({
				id: '7',
				title: 'Another Book',
				author: 'Unknown Author',
				isbn: '978-1-234-56789-0',
				genre: 'Mystery',
			}),
		],
		onDelete: (id: string) => console.log('Delete book:', id),
		onEdit: (book: Book) => console.log('Edit book:', book),
	},
};

// Large dataset - MUST be deterministic for visual regression tests
export const LargeDataset: Story = {
	args: {
		storageId: 'story-books',
		books: Array.from({ length: 20 }, (_, i) =>
			withMetadata({
				id: `${i + 1}`,
				title: `Book Title ${i + 1}`,
				author: `Author Name ${i + 1}`,
				isbn: `978-0-${(123 + i * 7) % 1000}-${(4567 + i * 13) % 10000}-${i}`,
				publishedYear: 1900 + ((i * 3) % 123),
				genre: ['Fiction', 'Non-Fiction', 'Biography', 'Science', 'History'][i % 5],
				pages: 100 + ((i * 17) % 500),
			})
		),
		onDelete: (id: string) => console.log('Delete book:', id),
		onEdit: (book: Book) => console.log('Edit book:', book),
	},
};

// In context with header
export const InContext: Story = {
	args: {
		storageId: 'story-books',
		books: sampleBooks,
		onDelete: (id: string) => console.log('Delete:', id),
		onEdit: (book: Book) => console.log('Edit:', book),
	},
	render: args => (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold">Book Library</h1>
					<p className="text-muted-foreground">Manage your book collection</p>
				</div>
				<button
					className={`
       rounded-md bg-primary px-4 py-2 text-sm font-medium
       text-primary-foreground
     `}
				>
					Add Book
				</button>
			</div>
			<BookTable storageId={args.storageId} books={args.books} onDelete={args.onDelete} onEdit={args.onEdit} />
		</div>
	),
};
