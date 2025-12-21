import type { CreateBook } from '@shared';
import type { Meta, StoryObj } from '@storybook/react';

import { BookForm } from './BookForm';

/**
 * BookForm component stories demonstrating book creation/editing patterns.
 * Feature component for book form with validation.
 */
const meta = {
	title: 'Features/BookForm',
	component: BookForm,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
	argTypes: {
		onSubmit: { action: 'submitted' },
		onCancel: { action: 'cancelled' },
	},
} satisfies Meta<typeof BookForm>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default empty form
export const Default: Story = {
	args: {
		onSubmit: async (data: CreateBook) => {
			console.log('Form submitted:', data);
			// Simulate API delay
			await new Promise(resolve => setTimeout(resolve, 1000));
		},
		onCancel: () => console.log('Form cancelled'),
	},
};

// Custom submit label
export const CustomLabel: Story = {
	args: {
		onSubmit: async (data: CreateBook) => {
			console.log('Form submitted:', data);
			await new Promise(resolve => setTimeout(resolve, 1000));
		},
		onCancel: () => console.log('Form cancelled'),
		submitLabel: 'Save Book',
	},
};

// Edit mode with initial data
export const EditMode: Story = {
	args: {
		onSubmit: async (data: CreateBook) => {
			console.log('Form submitted:', data);
			await new Promise(resolve => setTimeout(resolve, 1000));
		},
		onCancel: () => console.log('Form cancelled'),
		submitLabel: 'Update Book',
		initialData: {
			title: 'The Great Gatsby',
			author: 'F. Scott Fitzgerald',
			isbn: '978-0-7432-7356-5',
			publishedYear: 1925,
			genre: 'Classic Fiction',
			pages: 180,
		},
	},
};

// Partial initial data
export const PartialData: Story = {
	args: {
		onSubmit: async (data: CreateBook) => {
			console.log('Form submitted:', data);
			await new Promise(resolve => setTimeout(resolve, 1000));
		},
		onCancel: () => console.log('Form cancelled'),
		initialData: {
			title: '1984',
			author: 'George Orwell',
			publishedYear: 1949,
			pages: 328,
		} as CreateBook,
	},
};

// With validation errors (interaction required)
export const ValidationDemo: Story = {
	args: {
		onSubmit: async () => {},
		onCancel: () => {},
	},
	render: () => (
		<div className="space-y-4">
			<div className="rounded-lg border border-border bg-muted/50 p-4">
				<h3 className="mb-2 font-semibold">Validation Demo</h3>
				<p className="text-sm text-muted-foreground">
					Try submitting the form with invalid data to see validation errors:
				</p>
				<ul className="mt-2 list-inside list-disc text-sm text-muted-foreground">
					<li>Title is required</li>
					<li>Author is required</li>
					<li>Pages must be positive</li>
					<li>Published year cannot be too far in the future</li>
				</ul>
			</div>
			<BookForm
				onSubmit={async data => {
					console.log('Submitted:', data);
					await new Promise(resolve => setTimeout(resolve, 1000));
				}}
				onCancel={() => console.log('Cancelled')}
			/>
		</div>
	),
};

// In context with header
export const InContext: Story = {
	args: {
		onSubmit: async () => {},
		onCancel: () => {},
	},
	render: () => (
		<div className="mx-auto max-w-4xl space-y-6">
			<div>
				<h1 className="text-2xl font-bold">Add New Book</h1>
				<p className="text-muted-foreground">Fill in the details to add a book to your library</p>
			</div>
			<BookForm
				onSubmit={async data => {
					console.log('Submitted:', data);
					await new Promise(resolve => setTimeout(resolve, 1000));
					alert('Book added successfully!');
				}}
				onCancel={() => {
					console.log('Cancelled');
					alert('Form cancelled');
				}}
			/>
		</div>
	),
};

// Side by side comparison
export const Comparison: Story = {
	args: {
		onSubmit: async () => {},
		onCancel: () => {},
	},
	render: () => (
		<div
			className={`
    grid gap-6
    lg:grid-cols-2
  `}
		>
			<div>
				<h3 className="mb-4 text-lg font-semibold">Create New Book</h3>
				<BookForm
					onSubmit={async data => console.log('Create:', data)}
					onCancel={() => console.log('Cancel create')}
					submitLabel="Create Book"
				/>
			</div>
			<div>
				<h3 className="mb-4 text-lg font-semibold">Edit Existing Book</h3>
				<BookForm
					onSubmit={async data => console.log('Update:', data)}
					onCancel={() => console.log('Cancel update')}
					submitLabel="Update Book"
					initialData={{
						title: 'To Kill a Mockingbird',
						author: 'Harper Lee',
						isbn: '978-0-06-112008-4',
						publishedYear: 1960,
						genre: 'Classic Fiction',
						pages: 324,
					}}
				/>
			</div>
		</div>
	),
};

// With ISBN Check button
export const WithISBNCheck: Story = {
	args: {
		onSubmit: async (data: CreateBook) => {
			console.log('Form submitted:', data);
			await new Promise(resolve => setTimeout(resolve, 1000));
		},
		onCancel: () => console.log('Form cancelled'),
		onCheckISBN: async (isbn: string) => {
			console.log('Checking ISBN:', isbn);
			// Simulate API delay
			await new Promise(resolve => setTimeout(resolve, 1000));
			// Return null to indicate ISBN is available
			return null;
		},
		initialData: {
			title: 'The Catcher in the Rye',
			author: 'J.D. Salinger',
			isbn: '978-0-316-76948-0',
			publishedYear: 1951,
			genre: 'Fiction',
			pages: 234,
		},
	},
};

// ISBN Check - ISBN Already Taken
export const ISBNTaken: Story = {
	args: {
		onSubmit: async (data: CreateBook) => {
			console.log('Form submitted:', data);
			await new Promise(resolve => setTimeout(resolve, 1000));
		},
		onCancel: () => console.log('Form cancelled'),
		onCheckISBN: async (isbn: string) => {
			console.log('Checking ISBN:', isbn);
			await new Promise(resolve => setTimeout(resolve, 1000));
			// Return a book to simulate ISBN already taken
			return {
				id: '123',
				title: 'Existing Book',
				author: 'Some Author',
				isbn: isbn,
				publishedYear: 2020,
				genre: 'Fiction',
				pages: 200,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				version: 1,
			};
		},
		initialData: {
			title: 'New Book',
			author: 'New Author',
			isbn: '978-1-234-56789-0',
			publishedYear: 2024,
			genre: 'Fiction',
			pages: 300,
		},
	},
};

// Edit Mode with Save ISBN button
export const EditModeWithSaveISBN: Story = {
	args: {
		mode: 'edit' as const,
		onSubmit: async (data: CreateBook) => {
			console.log('Form submitted:', data);
			await new Promise(resolve => setTimeout(resolve, 1000));
		},
		onCancel: () => console.log('Form cancelled'),
		submitLabel: 'Update Book',
		onCheckISBN: async (isbn: string, excludeBookId?: string) => {
			console.log('Checking ISBN:', isbn, 'excluding book:', excludeBookId);
			await new Promise(resolve => setTimeout(resolve, 800));
			return null;
		},
		onPatchISBN: async (id: string, data) => {
			console.log('Patching ISBN for book:', id, 'with data:', data);
			await new Promise(resolve => setTimeout(resolve, 1000));
			return {
				id: id,
				title: 'The Great Gatsby',
				author: 'F. Scott Fitzgerald',
				isbn: data.isbn || '978-0-7432-7356-5',
				publishedYear: 1925,
				genre: 'Classic Fiction',
				pages: 180,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				version: data.version + 1,
			};
		},
		editMode: {
			bookId: 'book-123',
			version: 1,
		},
		initialData: {
			title: 'The Great Gatsby',
			author: 'F. Scott Fitzgerald',
			isbn: '978-0-7432-7356-5',
			publishedYear: 1925,
			genre: 'Classic Fiction',
			pages: 180,
		},
	},
};

// Edit Mode - ISBN Conflict (version conflict)
export const EditModeISBNConflict: Story = {
	args: {
		onSubmit: async () => {},
		onCancel: () => {},
	},
	render: () => (
		<div className="space-y-4">
			<div className="rounded-lg border border-destructive bg-destructive/10 p-4">
				<h3 className="mb-2 font-semibold text-destructive">Version Conflict Demo</h3>
				<p className="text-sm text-muted-foreground">This story demonstrates version conflict handling:</p>
				<ul className="mt-2 list-inside list-disc text-sm text-muted-foreground">
					<li>Modify the ISBN field</li>
					<li>
						Click the <strong>"Save ISBN"</strong> button
					</li>
					<li>The server will return a 409 conflict error</li>
					<li>Error message will appear below the ISBN field</li>
				</ul>
			</div>
			<BookForm
				mode="edit"
				onSubmit={async (data: CreateBook) => {
					console.log('Form submitted:', data);
					await new Promise(resolve => setTimeout(resolve, 1000));
				}}
				onCancel={() => console.log('Form cancelled')}
				submitLabel="Update Book"
				onCheckISBN={async (isbn: string, excludeBookId?: string) => {
					console.log('Checking ISBN:', isbn, 'excluding book:', excludeBookId);
					await new Promise(resolve => setTimeout(resolve, 800));
					return null;
				}}
				onPatchISBN={async (id: string, data) => {
					console.log('Patching ISBN for book:', id, 'with data:', data);
					await new Promise(resolve => setTimeout(resolve, 1000));
					// Simulate version conflict
					throw {
						status: 409,
						message: 'Version conflict detected: book was modified by another user',
					};
				}}
				editMode={{
					bookId: 'book-456',
					version: 1,
				}}
				initialData={{
					title: 'Brave New World',
					author: 'Aldous Huxley',
					isbn: '978-0-06-085052-4',
					publishedYear: 1932,
					genre: 'Dystopian Fiction',
					pages: 268,
				}}
			/>
		</div>
	),
};
