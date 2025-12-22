/**
 * COMPONENT BEST PRACTICES
 *
 * This file shows correct component patterns.
 * Compare with component.bad.tsx to see the differences.
 */
import { useState } from 'react';

// ==================== GOOD: Pure UI Component ====================

type BookCardProps = {
	title: string;
	author: string;
	published: boolean;
	onDelete?: () => void;
};

// ✅ GOOD: Pure component, no business logic
export function BookCard({ title, author, published, onDelete }: BookCardProps) {
	return (
		<div className="book-card">
			<h3>{title}</h3>
			<p>by {author}</p>
			<p>{published ? 'Published' : 'Draft'}</p>
			{onDelete && (
				<button onClick={onDelete} className="btn-danger">
					Delete
				</button>
			)}
		</div>
	);
}

// ==================== GOOD: Using Custom Hook ====================

// Custom hook handles all business logic
function useBooks() {
	const [books, setBooks] = useState([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);

	const loadBooks = async () => {
		setLoading(true);
		try {
			const response = await fetch('/api/books');
			const data = await response.json();
			setBooks(data);
		} catch (err) {
			setError(err.message);
		} finally {
			setLoading(false);
		}
	};

	const createBook = async book => {
		const response = await fetch('/api/books', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(book),
		});
		const newBook = await response.json();
		setBooks(prev => [...prev, newBook]);
	};

	return { books, loading, error, loadBooks, createBook };
}

// ✅ GOOD: Component delegates to hook
export function GoodBookList() {
	const { books, loading, error, createBook } = useBooks();

	const handleCreate = () => {
		createBook({ title: 'New Book', author: 'Author' });
	};

	if (loading) return <div>Loading...</div>;
	if (error) return <div>Error: {error}</div>;

	return (
		<div>
			{books.map(book => (
				<BookCard
					key={book.id}
					title={book.title}
					author={book.author}
					published={book.published}
				/>
			))}
			<button onClick={handleCreate}>Create</button>
		</div>
	);
}

// ==================== GOOD: Immutable State Updates ====================

// ✅ GOOD: Immutable state updates
export function GoodCounter() {
	const [count, setCount] = useState(0);
	const [history, setHistory] = useState<number[]>([]);

	const increment = () => {
		const newCount = count + 1;
		setCount(newCount);
		// ✅ GOOD: Create new array
		setHistory(prev => [...prev, newCount]);
	};

	return (
		<div>
			<p>Count: {count}</p>
			<p>History: {history.join(', ')}</p>
			<button onClick={increment}>Increment</button>
		</div>
	);
}

// ==================== GOOD: Derived State (No Unnecessary State) ====================

type User = { firstName: string; lastName: string };

// ✅ GOOD: Calculate during render
export function GoodUserProfile({ user }: { user: User }) {
	// ✅ GOOD: Derived value, no state needed
	const displayName = `${user.firstName} ${user.lastName}`;

	return <div>Hello, {displayName}!</div>;
}

// ==================== GOOD: Pure Component (No Side Effects) ====================

// ✅ GOOD: Pure component, no side effects during render
export function GoodLogger({ message }: { message: string }) {
	// If you need logging, use useEffect
	// useEffect(() => {
	//   console.log('Message changed:', message);
	// }, [message]);

	return <div>{message}</div>;
}

// ==================== GOOD: Composition ====================

type BookListProps = {
	books: Array<{ id: number; title: string; author: string; published: boolean }>;
	onBookDelete?: (id: number) => void;
};

// ✅ GOOD: Component composes smaller components
export function BookListComposition({ books, onBookDelete }: BookListProps) {
	return (
		<div className="book-list">
			{books.map(book => (
				<BookCard
					key={book.id}
					title={book.title}
					author={book.author}
					published={book.published}
					onDelete={onBookDelete ? () => onBookDelete(book.id) : undefined}
				/>
			))}
		</div>
	);
}

// ==================== GOOD: Props Down, Events Up ====================

type SearchBarProps = {
	value: string;
	onChange: (value: string) => void;
	onSearch: () => void;
};

// ✅ GOOD: Controlled component, events bubble up
export function SearchBar({ value, onChange, onSearch }: SearchBarProps) {
	return (
		<div className="search-bar">
			<input
				type="text"
				value={value}
				onChange={e => onChange(e.target.value)}
				placeholder="Search books..."
			/>
			<button onClick={onSearch}>Search</button>
		</div>
	);
}

/**
 * KEY BENEFITS OF THESE PATTERNS:
 *
 * 1. Separation of concerns - UI in components, logic in hooks
 * 2. Reusability - Components and hooks can be reused
 * 3. Testability - Easy to test logic separately
 * 4. Maintainability - Changes are localized
 * 5. Composability - Small components compose into larger ones
 * 6. Predictability - Pure components, immutable updates
 *
 * PRINCIPLES:
 * - Keep components pure and focused on UI
 * - Extract business logic to custom hooks
 * - Use composition to build complex UIs
 * - Props down, events up
 * - Immutable state updates
 * - Calculate derived values, don't store them
 */
