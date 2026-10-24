/** Longest preview of a log message in the table cell, ellipsis included. */
export const PREVIEW_MAX_CHARS = 200;

// The daemon prefixes the prompt of a model step with this marker (WorkerAdapter), then a newline and the prompt text.
const RENDERED_PROMPT_MARKER = '[rendered prompt]';

export interface LogMessageDisplay {
	/** One line of plain text for the table cell. */
	preview: string;
	/** Whether the row opens an expansion panel: a rendered prompt, a multi-line message or a cut preview. */
	expandable: boolean;
	/** What the panel renders as markdown; '' when the row has no panel. */
	markdown: string;
}

function collapsed(message: string): string {
	return message.replace(/\s+/g, ' ').trim();
}

/** A code block that keeps the lines of `message` whatever backticks it holds. */
function asCodeBlock(message: string): string {
	const longestRun = Math.max(0, ...(message.match(/`+/g) ?? []).map(run => run.length));
	const fence = '`'.repeat(Math.max(3, longestRun + 1));
	return `${fence}\n${message}\n${fence}`;
}

/**
 * The table cell shows `preview`, never markdown (a cell cannot hold it). A rendered prompt is markdown text and goes to
 * the panel as is; any other long or multi-line message goes there as a code block, so its lines are kept.
 */
export function displayLogMessage(message: string): LogMessageDisplay {
	const line = collapsed(message);
	const cut = line.length > PREVIEW_MAX_CHARS;
	const preview = cut ? `${line.slice(0, PREVIEW_MAX_CHARS - 3)}...` : line;
	if (message.startsWith(RENDERED_PROMPT_MARKER)) {
		return { preview, expandable: true, markdown: message };
	}
	if (message.includes('\n') || cut) {
		return { preview, expandable: true, markdown: asCodeBlock(message) };
	}
	return { preview, expandable: false, markdown: '' };
}
