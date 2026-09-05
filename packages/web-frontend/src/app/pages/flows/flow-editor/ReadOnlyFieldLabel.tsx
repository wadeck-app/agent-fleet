import type { ReactNode } from 'react';

/** Renders a small muted label for readOnly mode */
export function ReadOnlyFieldLabel({ children }: { children: ReactNode }) {
	return <p className="text-xs font-medium text-muted-foreground">{children}</p>;
}
