import { Loader2 } from 'lucide-react';

/** Renders the count badge inside a tab trigger, with a spinner while loading. */
export function TabCountBadge({ count, loading }: { count: number; loading: boolean }) {
	if (loading) {
		return (
			<>
				{' '}
				(<Loader2 className="inline size-3 animate-spin" />)
			</>
		);
	}
	return <> ({count})</>;
}
