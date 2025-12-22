// @ts-nocheck - Example code, not compiled
// Type Guards Pattern
// Demonstrates runtime type checking with compile-time benefits

// Type guard
function isUser(obj: unknown): obj is User {
	return (
		typeof obj === 'object' &&
		obj !== null &&
		'id' in obj &&
		'email' in obj &&
		typeof obj.email === 'string'
	);
}

// Usage
const data = await fetchData();
if (isUser(data)) {
	// TypeScript knows data is User here
	console.log(data.email.toLowerCase());
}
