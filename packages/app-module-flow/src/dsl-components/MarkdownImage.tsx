import type { ComponentProps } from 'react';

/** Never an <img>: a log line must not make the browser call a remote host. The reader gets the words and the address. */
export function MarkdownImage({ src, alt }: ComponentProps<'img'>) {
	return (
		<span className="text-muted">
			[image: {alt === undefined || alt === '' ? 'no description' : alt}
			{typeof src === 'string' && src !== '' ? ` (${src})` : ''}]
		</span>
	);
}
