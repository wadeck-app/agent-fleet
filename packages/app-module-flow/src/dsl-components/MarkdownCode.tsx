import type { ComponentProps } from 'react';

import { textOfNode } from './MarkdownCodeBlock.js';
import { MARKDOWN_INLINE_CODE_CLASS } from './MarkdownStyle.js';

/** A fenced block ends with a newline, an inline span never does (a line break inside it becomes a space). */
export function MarkdownCode({ className, children }: ComponentProps<'code'>) {
	const isBlock = /language-/.test(className ?? '') || textOfNode(children).endsWith('\n');
	return <code className={isBlock ? className : MARKDOWN_INLINE_CODE_CLASS}>{children}</code>;
}
