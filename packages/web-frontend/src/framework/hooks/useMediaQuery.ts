import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(() => {
		if (typeof window !== 'undefined') {
			return window.matchMedia(query).matches;
		}
		return false;
	});

	useEffect(() => {
		const mediaQuery = window.matchMedia(query);

		// Update state initially
		setMatches(mediaQuery.matches);

		// Define handler
		const handler = (event: MediaQueryListEvent) => {
			setMatches(event.matches);
		};

		// Add listener
		mediaQuery.addEventListener('change', handler);

		// Cleanup
		return () => {
			mediaQuery.removeEventListener('change', handler);
		};
	}, [query]);

	return matches;
}
