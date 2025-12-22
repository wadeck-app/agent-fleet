/**
 * CUSTOM HOOKS PATTERNS
 *
 * Examples of well-structured custom hooks for this project.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

// ==================== PATTERN 1: Data Fetching Hook ====================

type Book = { id: number; title: string; author: string };

/**
 * ✅ GOOD: Data fetching hook with loading/error states
 *
 * NAMING: use* prefix
 * RETURNS: Consistent interface with state + actions
 * LOCATION: packages/frontend/src/hooks/useBooks.ts
 */
export function useBooks() {
	const [data, setData] = useState<Book[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const fetchBooks = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const response = await fetch('/api/books');
			if (!response.ok) throw new Error('Failed to fetch');
			const books = await response.json();
			setData(books);
		} catch (err) {
			setError(err as Error);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchBooks();
	}, [fetchBooks]);

	const createBook = useCallback(async (book: Omit<Book, 'id'>) => {
		const response = await fetch('/api/books', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(book),
		});
		const newBook = await response.json();
		setData(prev => [...prev, newBook]);
		return newBook;
	}, []);

	return {
		books: data,
		loading,
		error,
		refetch: fetchBooks,
		createBook,
	};
}

// ==================== PATTERN 2: Form State Hook ====================

type FormValues = { [key: string]: string };
type FormErrors = { [key: string]: string };

/**
 * ✅ GOOD: Form management hook
 *
 * Handles: values, errors, validation, submission
 */
export function useForm<T extends FormValues>(
	initialValues: T,
	validate: (values: T) => FormErrors
) {
	const [values, setValues] = useState<T>(initialValues);
	const [errors, setErrors] = useState<FormErrors>({});
	const [touched, setTouched] = useState<Record<string, boolean>>({});
	const [submitting, setSubmitting] = useState(false);

	const handleChange = useCallback((name: keyof T, value: string) => {
		setValues(prev => ({ ...prev, [name]: value }));
	}, []);

	const handleBlur = useCallback((name: keyof T) => {
		setTouched(prev => ({ ...prev, [name]: true }));
	}, []);

	const handleSubmit = useCallback(
		async (onSubmit: (values: T) => Promise<void>) => {
			const validationErrors = validate(values);
			setErrors(validationErrors);

			if (Object.keys(validationErrors).length === 0) {
				setSubmitting(true);
				try {
					await onSubmit(values);
				} finally {
					setSubmitting(false);
				}
			}
		},
		[values, validate]
	);

	return {
		values,
		errors,
		touched,
		submitting,
		handleChange,
		handleBlur,
		handleSubmit,
	};
}

// ==================== PATTERN 3: Local Storage Hook ====================

/**
 * ✅ GOOD: Sync state with localStorage
 *
 * Persists state across page reloads
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
	const [storedValue, setStoredValue] = useState<T>(() => {
		try {
			const item = window.localStorage.getItem(key);
			return item ? JSON.parse(item) : initialValue;
		} catch (error) {
			console.error('Error reading from localStorage:', error);
			return initialValue;
		}
	});

	const setValue = useCallback(
		(value: T | ((val: T) => T)) => {
			try {
				const valueToStore = value instanceof Function ? value(storedValue) : value;
				setStoredValue(valueToStore);
				window.localStorage.setItem(key, JSON.stringify(valueToStore));
			} catch (error) {
				console.error('Error writing to localStorage:', error);
			}
		},
		[key, storedValue]
	);

	return [storedValue, setValue] as const;
}

// ==================== PATTERN 4: Debounce Hook ====================

/**
 * ✅ GOOD: Debounce value changes
 *
 * Useful for search inputs, API calls
 */
export function useDebounce<T>(value: T, delay: number): T {
	const [debouncedValue, setDebouncedValue] = useState<T>(value);

	useEffect(() => {
		const handler = setTimeout(() => {
			setDebouncedValue(value);
		}, delay);

		return () => {
			clearTimeout(handler);
		};
	}, [value, delay]);

	return debouncedValue;
}

// ==================== PATTERN 5: Previous Value Hook ====================

/**
 * ✅ GOOD: Get previous value
 *
 * Useful for comparing values
 */
export function usePrevious<T>(value: T): T | undefined {
	const ref = useRef<T>();

	useEffect(() => {
		ref.current = value;
	}, [value]);

	return ref.current;
}

// ==================== PATTERN 6: Toggle Hook ====================

/**
 * ✅ GOOD: Boolean toggle state
 *
 * Simple utility hook
 */
export function useToggle(initialValue = false): [boolean, () => void] {
	const [value, setValue] = useState(initialValue);

	const toggle = useCallback(() => {
		setValue(v => !v);
	}, []);

	return [value, toggle];
}

// ==================== PATTERN 7: Interval Hook ====================

/**
 * ✅ GOOD: Interval with cleanup
 *
 * Handles cleanup automatically
 */
export function useInterval(callback: () => void, delay: number | null) {
	const savedCallback = useRef(callback);

	useEffect(() => {
		savedCallback.current = callback;
	}, [callback]);

	useEffect(() => {
		if (delay === null) return;

		const id = setInterval(() => savedCallback.current(), delay);

		return () => clearInterval(id);
	}, [delay]);
}

// ==================== USAGE EXAMPLES ====================

/**
 * Example: Using useBooks hook
 */
function BookListExample() {
	const { books, loading, error, createBook } = useBooks();

	if (loading) return <div>Loading...</div>;
	if (error) return <div>Error: {error.message}</div>;

	return (
		<div>
			{books.map(book => (
				<div key={book.id}>{book.title}</div>
			))}
			<button onClick={() => createBook({ title: 'New', author: 'Me' })}>Add Book</button>
		</div>
	);
}

/**
 * Example: Using useForm hook
 */
function LoginFormExample() {
	const { values, errors, handleChange, handleSubmit } = useForm(
		{ email: '', password: '' },
		values => {
			const errors: FormErrors = {};
			if (!values.email) errors.email = 'Required';
			if (!values.password) errors.password = 'Required';
			return errors;
		}
	);

	return (
		<form
			onSubmit={e => {
				e.preventDefault();
				handleSubmit(async values => {
					console.log('Submitting:', values);
				});
			}}
		>
			<input value={values.email} onChange={e => handleChange('email', e.target.value)} />
			{errors.email && <span>{errors.email}</span>}

			<input
				type="password"
				value={values.password}
				onChange={e => handleChange('password', e.target.value)}
			/>
			{errors.password && <span>{errors.password}</span>}

			<button type="submit">Login</button>
		</form>
	);
}

/**
 * Example: Using useDebounce for search
 */
function SearchExample() {
	const [searchTerm, setSearchTerm] = useState('');
	const debouncedSearchTerm = useDebounce(searchTerm, 500);

	useEffect(() => {
		if (debouncedSearchTerm) {
			// Perform search
			console.log('Searching for:', debouncedSearchTerm);
		}
	}, [debouncedSearchTerm]);

	return (
		<input
			value={searchTerm}
			onChange={e => setSearchTerm(e.target.value)}
			placeholder="Search..."
		/>
	);
}

/**
 * KEY PATTERNS FOR CUSTOM HOOKS:
 *
 * 1. NAMING: Always use* prefix
 * 2. STRUCTURE:
 *    - State with useState/useReducer
 *    - Side effects with useEffect
 *    - Callbacks with useCallback
 *    - Return consistent interface
 * 3. RETURN:
 *    - State values
 *    - Update functions
 *    - Loading/error states
 *    - Action functions
 * 4. LOCATION: packages/frontend/src/hooks/
 * 5. REUSABILITY: Extract common patterns
 *
 * BENEFITS:
 * - Reusable stateful logic
 * - Testable in isolation
 * - Composable
 * - Clear separation from UI
 */
