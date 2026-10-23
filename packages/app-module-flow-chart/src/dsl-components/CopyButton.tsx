import { useState } from 'react';

import { ButtonAction } from '@wadeck-app/dsl-ui';

type CopyState = { kind: 'idle' } | { kind: 'copied' } | { kind: 'failed'; reason: string };

/** Copies `text` to the clipboard; a refusal (no permission, no secure context) is shown next to the button. */
export function CopyButton({ text, what }: { text: string; what: string }) {
	const [state, setState] = useState<CopyState>({ kind: 'idle' });
	const copy = () => {
		if (navigator.clipboard === undefined) {
			setState({
				kind: 'failed',
				reason: 'the clipboard is only available on https or localhost pages; select the text and copy it by hand',
			});
			return;
		}
		navigator.clipboard.writeText(text).then(
			() => setState({ kind: 'copied' }),
			(error: unknown) => setState({ kind: 'failed', reason: String(error) })
		);
	};
	return (
		<span className="inline-flex items-center gap-2">
			<ButtonAction
				label={state.kind === 'copied' ? 'Copied' : `Copy ${what}`}
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
	);
}
