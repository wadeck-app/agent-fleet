// ==================== LAYER 2: HOOKS (Business Logic + State) ====================
// hooks/useBooks.ts
import { useEffect, useState } from 'react';

import { BookCard } from '../../components/BookCard';
// ==================== LAYER 4: FEATURES (Composition) ====================

// features/books/BookList.tsx
import { useBooks } from '../../hooks/useBooks';
// ==================== LAYER 5: PAGES (Assembly) ====================

// pages/BooksPage.tsx
import { BookList } from '../features/books/BookList';

/**
 * PROJECT ARCHITECTURE: components/ vs hooks/ vs services/
 *
 * This file demonstrates the separation of concerns in this React project.
 */

// ==================== DIRECTORY STRUCTURE ====================
/**
 * packages/frontend/src/
 * ├── components/       # Generic, reusable UI components
 * │   ├── Button.tsx
 * │   ├── Input.tsx
 * │   └── Card.tsx
 * ├── features/         # Feature-specific components
 * │   └── books/
 * │       └── BookList.tsx
 * ├── hooks/           # Custom hooks (business logic)
 * │   ├── useBooks.ts
 * │   └── useForm.ts
 * ├── services/        # API calls and external interactions
 * │   ├── api/
 * │   │   └── books.api.ts
 * │   └── storage.ts
 * └── pages/           # Page-level components
 *     └── BooksPage.tsx
 */

// ==================== LAYER 1: SERVICES (No React) ====================

// services/api/books.api.ts
export class BooksApi {
	async getBooks() {
		const response = await fetch('/api/books');
		if (!response.ok) throw new Error('Failed to fetch books');
		return response.json();
	}

	async createBook(book: { title: string; author: string }) {
		const response = await fetch('/api/books', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(book),
		});
		if (!response.ok) throw new Error('Failed to create book');
		return response.json();
	}
}

const booksApi = new BooksApi();

type Book = { id: number; title: string; author: string };

export function useBooks() {
	const [books, setBooks] = useState<Book[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Load books on mount
	useEffect(() => {
		loadBooks();
	}, []);

	const loadBooks = async () => {
		setLoading(true);
		setError(null);
		try {
			const data = await booksApi.getBooks();
			setBooks(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unknown error');
		} finally {
			setLoading(false);
		}
	};

	const createBook = async (book: { title: string; author: string }) => {
		setError(null);
		try {
			const newBook = await booksApi.createBook(book);
			setBooks(prev => [...prev, newBook]);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unknown error');
			throw err;
		}
	};

	return {
		books,
		loading,
		error,
		createBook,
		reload: loadBooks,
	};
}

// ==================== LAYER 3: COMPONENTS (Pure UI) ====================

// components/BookCard.tsx
type BookCardProps = {
	title: string;
	author: string;
	onDelete?: () => void;
};

export function BookCard({ title, author, onDelete }: BookCardProps) {
	// ✅ PURE UI - No business logic, no API calls
	return (
		<div className="card">
			<h3>{title}</h3>
			<p>by {author}</p>
			{onDelete && <button onClick={onDelete}>Delete</button>}
		</div>
	);
}

export function BookList() {
	// ✅ GOOD: Hook handles all business logic and state
	const { books, loading, error } = useBooks();

	if (loading) return <div>Loading...</div>;
	if (error) return <div>Error: {error}</div>;

	return (
		<div>
			{books.map(book => (
				<BookCard key={book.id} title={book.title} author={book.author} />
			))}
		</div>
	);
}

export function BooksPage() {
	return (
		<div className="page">
			<h1>Books</h1>
			<BookList />
		</div>
	);
}

// ==================== KEY TAKEAWAYS ====================

/**
 * RESPONSIBILITIES BY LAYER:
 *
 * 1. SERVICES (services/)
 *    - API calls
 *    - External interactions (localStorage, WebSocket)
 *    - NO React hooks
 *    - NO React components
 *    - Pure functions or classes
 *
 * 2. HOOKS (hooks/)
 *    - Business logic
 *    - State management (useState, useReducer)
 *    - Side effects (useEffect)
 *    - Call services
 *    - Return state + actions
 *
 * 3. COMPONENTS (components/)
 *    - Pure UI rendering
 *    - Accept props
 *    - Emit callbacks
 *    - NO business logic
 *    - NO API calls
 *    - NO useState for business state
 *
 * 4. FEATURES (features/)
 *    - Compose components
 *    - Use hooks
 *    - Feature-specific logic
 *
 * 5. PAGES (pages/)
 *    - Assemble features
 *    - Route-level components
 *    - Page layout
 *
 * BENEFITS:
 * - Clear separation of concerns
 * - Easy to test each layer
 * - Reusable components and hooks
 * - Maintainable codebase
 */
