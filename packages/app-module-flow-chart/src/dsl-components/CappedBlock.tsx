import { useState } from 'react';

import { ButtonAction } from '@wadeck-app/dsl-ui';
import type { CappedText } from 'flow-core';

import { CopyButton } from './CopyButton.js';
import { PREVIEW_CHARS, previewOf } from './StepIODetails.js';

// The height cap (`max-h-*`) comes from the density, whose classes are written out in full in PanelDensity.ts.
const BLOCK_CLASS =
	'overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-md border border-border bg-muted-bg p-2 font-mono text-xs text-content';

/** A captured output in a scrollable monospace block; a long one starts shortened, with a button to show the rest. */
export function CappedBlock({
	title,
	capped,
	heightClass,
	note,
}: {
	title: string;
	capped: CappedText;
	heightClass: string;
	/** Shown in plain view under the title, e.g. that the text is cut. */
	note?: string;
}) {
	const [expanded, setExpanded] = useState(false);
	const { text, hiddenChars } = previewOf(capped, expanded);
	const longer = capped.text.length > PREVIEW_CHARS;
	// The title reads "stdout" or "stdout (last 2000 of 30880 characters)": the copy button names the stream only.
	const stream = title.split(' (')[0] ?? title;
	return (
		<div>
			<div className="mb-1 flex flex-wrap items-center justify-between gap-2">
				<div className="text-xs font-semibold text-muted">{title}</div>
				<CopyButton text={capped.text} what={stream} />
			</div>
			{note !== undefined && <div className="mb-1 text-xs font-semibold text-warning-text">{note}</div>}
			<pre className={`${heightClass} ${BLOCK_CLASS}`} aria-label={title}>
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
