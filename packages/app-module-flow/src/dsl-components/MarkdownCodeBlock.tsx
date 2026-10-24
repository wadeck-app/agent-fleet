import { type ReactNode, isValidElement, useState } from 'react';

import { ButtonAction } from '@wadeck-app/dsl-ui';

import { MARKDOWN_PRE_CLASS } from './MarkdownStyle.js';

type CopyState = { kind: 'idle' } | { kind: 'copied' } | { kind: 'failed'; reason: string };

/** The text a react-markdown node tree shows, which is what the copy button must put in the clipboard. */
export function textOfNode(node: ReactNode): string {
	if (typeof node === 'string' || typeof node === 'number') {
		return String(node);
	}
	if (Array.isArray(node)) {
		return node.map(textOfNode).join('');
	}
	if (isValidElement<{ children?: ReactNode }>(node)) {
		return textOfNode(node.props.children);
	}
	return '';
}

/** A fenced code block: plain monospace (no highlighter), with a button that copies the code. */
export function MarkdownCodeBlock({ children }: { children?: ReactNode }) {
	const [state, setState] = useState<CopyState>({ kind: 'idle' });
	const code = textOfNode(children);
	const copy = () => {
		if (navigator.clipboard === undefined) {
			setState({
				kind: 'failed',
				reason: 'the clipboard is only available on https or localhost pages; select the code and copy it by hand',
			});
			return;
		}
		navigator.clipboard.writeText(code).then(
			() => setState({ kind: 'copied' }),
			(error: unknown) => setState({ kind: 'failed', reason: String(error) })
		);
	};
	return (
		<div className="my-2">
			<pre className={MARKDOWN_PRE_CLASS}>{children}</pre>
			<span className="mt-1 inline-flex items-center gap-2">
				<ButtonAction
					label={state.kind === 'copied' ? 'Copied' : 'Copy'}
					variant="secondary"
					size="sm"
					onClick={copy}
				/>
				{state.kind === 'failed' && (
					<span role="alert" className="text-xs text-danger-text">
						Copy failed: {state.reason}
					</span>
				)}
			</span>
		</div>
	);
}
