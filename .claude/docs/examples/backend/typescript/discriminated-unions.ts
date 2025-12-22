// @ts-nocheck - Example code, not compiled
// Discriminated Unions Pattern
// Demonstrates type-safe state machines

type RequestState =
	| { status: 'idle' }
	| { status: 'loading' }
	| { status: 'success'; data: User }
	| { status: 'error'; error: Error };

function handleRequest(state: RequestState) {
	switch (state.status) {
		case 'idle':
			return 'Not started';
		case 'loading':
			return 'Loading...';
		case 'success':
			return state.data.email; // TypeScript knows data exists
		case 'error':
			return state.error.message; // TypeScript knows error exists
	}
}
