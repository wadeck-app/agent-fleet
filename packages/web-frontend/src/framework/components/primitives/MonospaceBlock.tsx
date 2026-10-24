import { cn } from '@framework/lib/utils';

/**
 * ===========================================================================================
 * MONOSPACE BLOCK - Generic UI Component
 * ===========================================================================================
 *
 * Pre-formatted, scrollable text (CLI output, logs, snippets). Whitespace is preserved and
 * long lines scroll horizontally instead of wrapping. Zero business logic.
 *
 * ===========================================================================================
 */

export interface MonospaceBlockProps {
	text: string;
	/** Accessible name of the scrollable region. */
	label: string;
	className?: string;
}

export function MonospaceBlock({ text, label, className }: MonospaceBlockProps) {
	return (
		<pre
			aria-label={label}
			// Scrollable region must be reachable with the keyboard
			tabIndex={0}
			className={cn(
				'max-h-[32rem] overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs whitespace-pre',
				className
			)}
		>
			{text}
		</pre>
	);
}
