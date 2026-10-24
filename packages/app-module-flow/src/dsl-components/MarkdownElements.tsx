import type { Components } from 'react-markdown';

import { MarkdownCode } from './MarkdownCode.js';
import { MarkdownCodeBlock } from './MarkdownCodeBlock.js';
import { MarkdownImage } from './MarkdownImage.js';
import { MarkdownLink } from './MarkdownLink.js';
import { MARKDOWN_CELL_CLASS, MARKDOWN_TABLE_CLASS } from './MarkdownStyle.js';
import { safeLinkTarget } from './SafeLinkTarget.js';

/** The elements react-markdown renders with our policy; every other element keeps react-markdown's own, in React. */
export const MARKDOWN_ELEMENTS: Components = {
	a: MarkdownLink,
	img: MarkdownImage,
	code: MarkdownCode,
	pre: ({ children }) => <MarkdownCodeBlock>{children}</MarkdownCodeBlock>,
	table: ({ children }) => (
		<div className="my-2 overflow-x-auto">
			<table className={MARKDOWN_TABLE_CLASS}>{children}</table>
		</div>
	),
	th: ({ children, style }) => (
		<th className={`${MARKDOWN_CELL_CLASS} bg-muted-bg font-semibold`} style={style}>
			{children}
		</th>
	),
	td: ({ children, style }) => (
		<td className={MARKDOWN_CELL_CLASS} style={style}>
			{children}
		</td>
	),
};

/** react-markdown calls this for every href and src: images are only written as text, so their address is kept. */
export function transformUrl(url: string, key: string): string {
	return key === 'src' ? url : safeLinkTarget(url);
}
