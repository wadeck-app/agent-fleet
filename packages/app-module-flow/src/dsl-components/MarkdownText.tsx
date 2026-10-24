import { useState } from 'react';
import Markdown from 'react-markdown';

import { ButtonAction } from '@wadeck-app/dsl-ui';
import remarkGfm from 'remark-gfm';

import { MARKDOWN_ELEMENTS, transformUrl } from './MarkdownElements.js';
import { MARKDOWN_ROOT_CLASS } from './MarkdownStyle.js';
import {
	MARKDOWN_SHOW_MORE_CHARS,
	MARKDOWN_TEXT_KEYS,
	MARKDOWN_VISIBLE_CHARS,
	type MarkdownTextProps,
	isCssLength,
} from './MarkdownTextProps.js';

const REMARK_PLUGINS = [remarkGfm];

function refusal(children: string) {
	return (
		<span role="alert" className="text-xs text-danger-text">
			{children}
		</span>
	);
}

/**
 * Markdown as React elements, for the log lines (the prompt of a model step). Safe by construction: no raw HTML (it is
 * written as text, there is no rehype-raw), links only to http, https and mailto and opened with rel=noopener noreferrer,
 * images never loaded (their alt text and address are written), code in plain monospace with a copy button. Only the
 * first characters are rendered; a "show more" button adds the rest, so a huge text cannot freeze the page.
 *
 * Local stand-in for a dsl-ui Markdown node: when it ships, change `$type: flow:MarkdownText` in the view and delete
 * this component. Props are closed (text, maxHeight): anything else renders an error, so nobody restyles it.
 */
export function MarkdownText({ text, maxHeight, unexpectedKeys }: MarkdownTextProps) {
	const [visibleChars, setVisibleChars] = useState(MARKDOWN_VISIBLE_CHARS);
	if (unexpectedKeys.length > 0) {
		return refusal(
			`flow:MarkdownText does not accept ${unexpectedKeys.join(', ')}: its style is fixed. Keep only ${MARKDOWN_TEXT_KEYS.join(', ')}.`
		);
	}
	if (typeof text !== 'string') {
		return refusal(
			`flow:MarkdownText needs a text string (for example text: $ctx.row.markdown), got ${JSON.stringify(text) ?? 'nothing'}.`
		);
	}
	if (maxHeight !== undefined && (typeof maxHeight !== 'string' || !isCssLength(maxHeight))) {
		return refusal(
			`flow:MarkdownText maxHeight must be a css length such as 30rem, 400px or 60vh, got ${JSON.stringify(maxHeight)}.`
		);
	}
	const hidden = Math.max(0, text.length - visibleChars);
	return (
		<div
			className={`${MARKDOWN_ROOT_CLASS}${maxHeight === undefined ? '' : ' overflow-auto'}`}
			style={maxHeight === undefined ? undefined : { maxHeight }}
		>
			<Markdown remarkPlugins={REMARK_PLUGINS} urlTransform={transformUrl} components={MARKDOWN_ELEMENTS}>
				{text.slice(0, visibleChars)}
			</Markdown>
			{hidden > 0 && (
				<ButtonAction
					label={`Show more (${hidden} more characters)`}
					variant="secondary"
					size="sm"
					onClick={() => setVisibleChars(visibleChars + MARKDOWN_SHOW_MORE_CHARS)}
				/>
			)}
		</div>
	);
}
