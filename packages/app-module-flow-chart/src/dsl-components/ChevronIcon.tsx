/** Points right when folded, down when open. */
export function ChevronIcon({ open }: { open: boolean }) {
	return (
		// violations-suppress: react/no-inline-svg this file is the dedicated SVG component the rule asks for; it is not a registry atomic, so the rule cannot see that
		<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className={open ? 'rotate-90' : ''}>
			<path d="M4 2 L8 6 L4 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
		</svg>
	);
}
