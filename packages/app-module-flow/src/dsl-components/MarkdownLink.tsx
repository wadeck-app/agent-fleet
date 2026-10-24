import type { ComponentProps } from 'react';

/** A link the policy let through opens in a new tab with rel=noopener noreferrer; a refused one is plain text. */
export function MarkdownLink({ href, children }: ComponentProps<'a'>) {
	if (href === undefined || href === '') {
		return <span>{children}</span>;
	}
	return (
		<a href={href} target="_blank" rel="noopener noreferrer">
			{children}
		</a>
	);
}
