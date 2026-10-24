import { describe, expect, it } from 'vitest';

import { PREVIEW_MAX_CHARS, displayLogMessage } from './LogMessageDisplay.js';

describe('displayLogMessage', () => {
	it('keeps a one-line message as its own preview, with no expansion', () => {
		expect(displayLogMessage('compiling')).toEqual({ preview: 'compiling', expandable: false, markdown: '' });
	});

	it('expands a rendered prompt and serves it as markdown as is', () => {
		const message = '[rendered prompt]\n# Title\n\n- one\n- two';
		expect(displayLogMessage(message)).toEqual({
			preview: '[rendered prompt] # Title - one - two',
			expandable: true,
			markdown: message,
		});
	});

	it('expands a rendered prompt even when it has a single line', () => {
		const shown = displayLogMessage('[rendered prompt] hi');
		expect(shown.expandable).toBe(true);
		expect(shown.markdown).toBe('[rendered prompt] hi');
	});

	it('expands any multi-line message, shown as a code block so its lines are kept', () => {
		const shown = displayLogMessage('line one\nline two');
		expect(shown).toEqual({
			preview: 'line one line two',
			expandable: true,
			markdown: '```\nline one\nline two\n```',
		});
	});

	it('fences with more backticks than the longest run of the message', () => {
		const shown = displayLogMessage('a\n```\nb\n```');
		expect(shown.markdown).toBe('````\na\n```\nb\n```\n````');
	});

	it('cuts a long preview on one line and says so', () => {
		const shown = displayLogMessage(`x${'y'.repeat(PREVIEW_MAX_CHARS * 2)}`);
		expect(shown.preview).toHaveLength(PREVIEW_MAX_CHARS);
		expect(shown.preview.endsWith('...')).toBe(true);
		expect(shown.preview).not.toContain('\n');
		expect(shown.expandable).toBe(true);
	});

	it('expands an over-long one-line message: the cell shows a cut text, the panel the whole', () => {
		const message = 'z'.repeat(PREVIEW_MAX_CHARS + 1);
		expect(displayLogMessage(message)).toMatchObject({ expandable: true, markdown: `\`\`\`\n${message}\n\`\`\`` });
	});
});
