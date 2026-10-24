// Tailwind preflight removes the look of headings, lists and tables, so each element is styled from the root. The tokens
// are the dsl-ui ones (content, muted, border, muted-bg) and follow the light and the dark theme.
export const MARKDOWN_ROOT_CLASS = [
	'min-w-0 break-words text-sm leading-relaxed text-content',
	'[&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-lg [&_h1]:font-semibold',
	'[&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold',
	'[&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold',
	'[&_h4]:mb-1 [&_h4]:mt-2 [&_h4]:text-sm [&_h4]:font-medium',
	'[&_h5]:mb-1 [&_h5]:mt-2 [&_h5]:text-sm [&_h5]:font-medium',
	'[&_h6]:mb-1 [&_h6]:mt-2 [&_h6]:text-sm [&_h6]:font-medium [&_h6]:text-muted',
	'[&_p]:my-2',
	'[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6',
	'[&_blockquote]:my-2 [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted',
	'[&_hr]:my-3 [&_hr]:border-border',
	'[&_a]:text-primary [&_a]:underline',
].join(' ');

export const MARKDOWN_TABLE_CLASS = 'my-2 w-full border-collapse text-left text-xs';
export const MARKDOWN_CELL_CLASS = 'border border-border px-2 py-1 align-top';
export const MARKDOWN_INLINE_CODE_CLASS = 'rounded bg-muted-bg px-1 font-mono text-xs';
export const MARKDOWN_PRE_CLASS =
	'overflow-auto whitespace-pre rounded-md border border-border bg-muted-bg p-2 font-mono text-xs text-content';
