import { useState } from 'react';

import { ButtonAction } from '@wadeck-app/dsl-ui';
import type { CappedText } from 'flow-core';

import { PREVIEW_CHARS, previewOf } from './StepIODetails.js';

// Written out in full: Tailwind finds classes by scanning source text.
const BLOCK_CLASS =
	'max-h-56 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-md border border-border bg-muted-bg p-2 font-mono text-xs text-content';

/** A captured output in a scrollable monospace block; a long one starts shortened, with a button to show the rest. */
export function CappedBlock({ title, capped }: { title: string; capped: CappedText }) {
	const [expanded, setExpanded] = useState(false);
	const { text, hiddenChars } = previewOf(capped, expanded);
	const longer = capped.text.length > PREVIEW_CHARS;
	return (
		<div>
			<div className="mb-1 text-xs font-semibold text-muted">{title}</div>
			<pre className={BLOCK_CLASS} aria-label={title}>
				{text}
			</pre>
			{longer && (
				<ButtonAction
					label={expanded ? 'Show less' : `Show more (${hiddenChars} more characters)`}
					variant="secondary"
					size="sm"
					onClick={() => setExpanded(!expanded)}
				/>
			)}
		</div>
	);
}
