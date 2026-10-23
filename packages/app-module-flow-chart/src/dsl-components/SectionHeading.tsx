const HEADING_CLASS = 'text-xs font-semibold uppercase tracking-wide text-muted';

/** A small caps title of a block; dropped where the surrounding tab or section already names the block. */
export function SectionHeading({ show, children }: { show: boolean; children: string }) {
	return show ? <div className={HEADING_CLASS}>{children}</div> : null;
}
