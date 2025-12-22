/**
 * REACT ANTI-PATTERNS WITH FIXES
 *
 * Side-by-side comparison of common mistakes and correct solutions.
 */
import { useCallback, useEffect, useState } from 'react';

// ==================== ANTI-PATTERN 1: Business Logic in Component ====================

// ❌ BAD: All logic in component
function Bad_LogicInComponent() {
	const [books, setBooks] = useState([]);

	useEffect(() => {
		fetch('/api/books')
			.then(res => res.json())
			.then(setBooks);
	}, []);

	return <div>{books.map(b => b.title)}</div>;
}

// ✅ GOOD: Logic in custom hook
function useBooks() {
	const [books, setBooks] = useState([]);
	useEffect(() => {
		fetch('/api/books')
			.then(res => res.json())
			.then(setBooks);
	}, []);
	return books;
}

function Good_LogicInHook() {
	const books = useBooks();
	return <div>{books.map(b => b.title)}</div>;
}

// ==================== ANTI-PATTERN 2: Mutating State ====================

// ❌ BAD: Mutating array
function Bad_MutatingState() {
	const [items, setItems] = useState([1, 2, 3]);

	const addItem = () => {
		items.push(4); // ❌ Mutation
		setItems(items); // ❌ Won't trigger re-render
	};

	return <button onClick={addItem}>Add</button>;
}

// ✅ GOOD: Immutable update
function Good_ImmutableState() {
	const [items, setItems] = useState([1, 2, 3]);

	const addItem = () => {
		setItems(prev => [...prev, 4]); // ✅ New array
	};

	return <button onClick={addItem}>Add</button>;
}

// ==================== ANTI-PATTERN 3: Derived State ====================

// ❌ BAD: Storing computed value in state
function Bad_DerivedState({ items }) {
	const [count, setCount] = useState(0);

	useEffect(() => {
		setCount(items.length); // ❌ Redundant state
	}, [items]);

	return <div>Count: {count}</div>;
}

// ✅ GOOD: Calculate during render
function Good_CalculatedValue({ items }) {
	const count = items.length; // ✅ Derived value

	return <div>Count: {count}</div>;
}

// ==================== ANTI-PATTERN 4: Prop Drilling ====================

// ❌ BAD: Passing props through many levels
function Bad_PropDrilling() {
	const [user, setUser] = useState({ name: 'John' });

	return <Level1 user={user} />;
}

function Level1({ user }) {
	return <Level2 user={user} />;
}

function Level2({ user }) {
	return <Level3 user={user} />;
}

function Level3({ user }) {
	return <div>{user.name}</div>;
}

// ✅ GOOD: Use composition or context
function Good_Composition() {
	const [user, setUser] = useState({ name: 'John' });

	return (
		<div>
			{/* Pass directly where needed */}
			<UserDisplay name={user.name} />
		</div>
	);
}

function UserDisplay({ name }) {
	return <div>{name}</div>;
}

// ==================== ANTI-PATTERN 5: Missing useEffect Cleanup ====================

// ❌ BAD: No cleanup
function Bad_NoCleanup() {
	useEffect(() => {
		const interval = setInterval(() => {
			console.log('tick');
		}, 1000);
		// ❌ Missing cleanup - interval continues after unmount
	}, []);

	return <div>Timer</div>;
}

// ✅ GOOD: Cleanup function
function Good_WithCleanup() {
	useEffect(() => {
		const interval = setInterval(() => {
			console.log('tick');
		}, 1000);

		return () => clearInterval(interval); // ✅ Cleanup
	}, []);

	return <div>Timer</div>;
}

// ==================== ANTI-PATTERN 6: Conditional Hooks ====================

// ❌ BAD: Calling hook conditionally
function Bad_ConditionalHook({ shouldLoad }) {
	if (shouldLoad) {
		const [data, setData] = useState([]); // ❌ Conditional hook
	}

	return <div>Data</div>;
}

// ✅ GOOD: Hook at top level, conditionally use it
function Good_UnconditionalHook({ shouldLoad }) {
	const [data, setData] = useState([]); // ✅ Always called

	useEffect(() => {
		if (shouldLoad) {
			// ✅ Condition inside hook
			// fetch data
		}
	}, [shouldLoad]);

	return <div>Data</div>;
}

// ==================== ANTI-PATTERN 7: Unnecessary useEffect ====================

// ❌ BAD: useEffect for derived state
function Bad_UnnecessaryEffect({ items }) {
	const [total, setTotal] = useState(0);

	useEffect(() => {
		setTotal(items.reduce((sum, item) => sum + item.price, 0));
	}, [items]);

	return <div>Total: {total}</div>;
}

// ✅ GOOD: Calculate during render
function Good_NoEffect({ items }) {
	const total = items.reduce((sum, item) => sum + item.price, 0); // ✅ Direct calculation

	return <div>Total: {total}</div>;
}

// ==================== ANTI-PATTERN 8: Missing Dependencies ====================

// ❌ BAD: Missing dependency
function Bad_MissingDependency({ userId }) {
	const [user, setUser] = useState(null);

	useEffect(() => {
		fetch(`/api/users/${userId}`)
			.then(res => res.json())
			.then(setUser);
	}, []); // ❌ Missing userId dependency

	return <div>{user?.name}</div>;
}

// ✅ GOOD: Include all dependencies
function Good_AllDependencies({ userId }) {
	const [user, setUser] = useState(null);

	useEffect(() => {
		fetch(`/api/users/${userId}`)
			.then(res => res.json())
			.then(setUser);
	}, [userId]); // ✅ Includes userId

	return <div>{user?.name}</div>;
}

// ==================== ANTI-PATTERN 9: Stale Closure ====================

// ❌ BAD: Stale closure in interval
function Bad_StaleClosure() {
	const [count, setCount] = useState(0);

	useEffect(() => {
		const interval = setInterval(() => {
			setCount(count + 1); // ❌ Captures initial count value
		}, 1000);

		return () => clearInterval(interval);
	}, []); // ❌ Empty deps = stale closure

	return <div>Count: {count}</div>;
}

// ✅ GOOD: Use functional update
function Good_FunctionalUpdate() {
	const [count, setCount] = useState(0);

	useEffect(() => {
		const interval = setInterval(() => {
			setCount(prev => prev + 1); // ✅ Always has latest value
		}, 1000);

		return () => clearInterval(interval);
	}, []); // ✅ No dependencies needed

	return <div>Count: {count}</div>;
}

// ==================== ANTI-PATTERN 10: Not Using useCallback ====================

// ❌ BAD: New function every render
function Bad_NoCallback({ items }) {
	const handleClick = id => {
		// ❌ New function created every render
		console.log('Clicked:', id);
	};

	return (
		<div>
			{items.map(item => (
				<ExpensiveComponent key={item.id} onClick={() => handleClick(item.id)} />
			))}
		</div>
	);
}

// ✅ GOOD: Memoized callback
function Good_WithCallback({ items }) {
	const handleClick = useCallback(id => {
		// ✅ Same function reference
		console.log('Clicked:', id);
	}, []);

	return (
		<div>
			{items.map(item => (
				<ExpensiveComponent key={item.id} onClick={() => handleClick(item.id)} />
			))}
		</div>
	);
}

// Placeholder for example
function ExpensiveComponent({ onClick }) {
	return <button onClick={onClick}>Click</button>;
}

/**
 * KEY TAKEAWAYS:
 *
 * 1. Extract logic to hooks, keep components pure
 * 2. Always use immutable updates
 * 3. Calculate derived values, don't store them
 * 4. Avoid prop drilling with composition
 * 5. Always cleanup in useEffect
 * 6. Never call hooks conditionally
 * 7. Don't use useEffect for derived state
 * 8. Include all dependencies in useEffect
 * 9. Use functional updates to avoid stale closures
 * 10. Memoize callbacks when passing to children
 *
 * RESULT: Predictable, performant, maintainable React code
 */
