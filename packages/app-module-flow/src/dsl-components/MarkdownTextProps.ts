import { resolveExpressionValue } from '@wadeck-app/dsl-renderer';

/** The keys a `flow:MarkdownText` node may carry: nothing that styles the text. */
export const MARKDOWN_TEXT_KEYS = ['text', 'maxHeight'] as const;

/** Characters rendered at first; the rest waits behind a "show more" button (500 KB would freeze the page). */
export const MARKDOWN_VISIBLE_CHARS = 20_000;
/** Characters one "show more" click adds. */
export const MARKDOWN_SHOW_MORE_CHARS = 100_000;

export interface MarkdownTextProps {
	text: unknown;
	maxHeight: unknown;
	/** Keys of the node outside the contract (the platform checks only the root $type, never the props). */
	unexpectedKeys: string[];
}

/** A plain css length (30rem, 20px, 50vh...): the value goes into a style attribute, so nothing else is accepted. */
export function isCssLength(value: string): boolean {
	return /^(0|\d+(\.\d+)?(rem|em|px|vh))$/.test(value);
}

/** Reads the node: the declared values resolved against the context, and the undeclared keys. */
export function readMarkdownTextProps(node: Record<string, unknown>, ctx: Record<string, unknown>): MarkdownTextProps {
	const declared: readonly string[] = MARKDOWN_TEXT_KEYS;
	return {
		text: resolveExpressionValue(node['text'], ctx),
		maxHeight: resolveExpressionValue(node['maxHeight'], ctx),
		// "$type", "$if" and the like belong to the engine, not to the node.
		unexpectedKeys: Object.keys(node)
			.filter(key => !key.startsWith('$') && !declared.includes(key))
			.sort(),
	};
}
