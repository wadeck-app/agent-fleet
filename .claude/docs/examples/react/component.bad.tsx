/**
 * COMPONENT ANTI-PATTERNS
 *
 * This file shows what NOT to do in components.
 * See component.good.tsx for correct patterns.
 */
import { useEffect, useState } from 'react';

// ❌ BAD: Business logic in component
export function BadBookList() {
	const [books, setBooks] = useState([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);

	// ❌ BAD: API call directly in component
	useEffect(() => {
		setLoading(true);
		fetch('/api/books')
			.then(res => res.json())
			.then(data => {
				setBooks(data);
				setLoading(false);
			})
			.catch(err => {
				setError(err.message);
				setLoading(false);
			});
	}, []);

	// ❌ BAD: Business logic in component
	const handleCreate = async () => {
		const newBook = { title: 'New Book', author: 'Author' };
		const response = await fetch('/api/books', {
			method: 'POST',
			body: JSON.stringify(newBook),
		});
		const book = await response.json();
		setBooks([...books, book]);
	};

	// ❌ BAD: Complex transformation logic in component
	const filteredBooks = books.filter(b => b.published);
	const sortedBooks = filteredBooks.sort((a, b) => a.title.localeCompare(b.title));
	const groupedBooks = sortedBooks.reduce((acc, book) => {
		const key = book.author;
		if (!acc[key]) acc[key] = [];
		acc[key].push(book);
		return acc;
	}, {});

	if (loading) return <div>Loading...</div>;
	if (error) return <div>Error: {error}</div>;

	return (
		<div>
			{Object.entries(groupedBooks).map(([author, books]) => (
				<div key={author}>
					<h3>{author}</h3>
					{books.map(book => (
						<div key={book.id}>{book.title}</div>
					))}
				</div>
			))}
			<button onClick={handleCreate}>Create</button>
		</div>
	);
}

// PROBLEMS:
// 1. Component has business logic (API calls, filtering, sorting)
// 2. Component has state management
// 3. Component is hard to test
// 4. Component is not reusable
// 5. Component has multiple responsibilities
// 6. Logic can't be shared with other components

// ❌ BAD: Mutating state directly
export function BadCounter() {
	const [count, setCount] = useState(0);
	const [history, setHistory] = useState([]);

	const increment = () => {
		history.push(count + 1); // ❌ Mutating array directly
		setHistory(history); // ❌ Won't trigger re-render
		setCount(count + 1);
	};

	return (
		<div>
			<p>Count: {count}</p>
			<button onClick={increment}>Increment</button>
		</div>
	);
}

// ❌ BAD: Derived state (unnecessary state)
export function BadUserProfile({ user }) {
	const [displayName, setDisplayName] = useState('');

	// ❌ BAD: Mirroring props in state
	useEffect(() => {
		setDisplayName(`${user.firstName} ${user.lastName}`);
	}, [user]);

	return <div>Hello, {displayName}!</div>;
}

// ❌ BAD: Side effects during render
export function BadLogger({ message }) {
	// ❌ BAD: Console log during render (side effect)
	console.log('Rendering with message:', message);

	// ❌ BAD: Modifying external state during render
	window.lastMessage = message;

	return <div>{message}</div>;
}

// ❌ BAD: Breaking rules of hooks
export function BadConditionalHook({ condition }) {
	// ❌ BAD: Calling hook conditionally
	if (condition) {
		const [state, setState] = useState(0);
	}

	// ❌ BAD: Hook in loop
	for (let i = 0; i < 3; i++) {
		useEffect(() => {}, []);
	}

	return <div>Bad hooks</div>;
}

/**
 * KEY PROBLEMS WITH THESE PATTERNS:
 *
 * 1. Tight coupling - Component tied to specific API
 * 2. Hard to test - Can't test logic without mounting component
 * 3. Not reusable - Logic locked in component
 * 4. Multiple responsibilities - Violates single responsibility principle
 * 5. Difficult to maintain - Changes require modifying component
 * 6. Poor performance - Unnecessary re-renders, mutations don't work
 *
 * See component.good.tsx for correct patterns.
 */
