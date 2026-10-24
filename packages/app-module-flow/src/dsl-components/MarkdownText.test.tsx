import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MarkdownText } from './MarkdownText.js';
import { MARKDOWN_SHOW_MORE_CHARS, MARKDOWN_VISIBLE_CHARS } from './MarkdownTextProps.js';

function show(text: string, maxHeight?: string) {
	return render(<MarkdownText text={text} maxHeight={maxHeight} unexpectedKeys={[]} />);
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('MarkdownText renders markdown', () => {
	it('renders headings, lists, emphasis and inline code as elements', () => {
		const { container } = show('# Title\n\n- one\n- two\n\nSome **bold** and `code`.');
		expect(screen.getByRole('heading', { level: 1, name: 'Title' })).toBeInTheDocument();
		expect(screen.getAllByRole('listitem')).toHaveLength(2);
		expect(container.querySelector('strong')?.textContent).toBe('bold');
		expect(container.querySelector('code')?.textContent).toBe('code');
	});

	it('renders GFM tables, task lists and strikethrough', () => {
		const { container } = show('| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n- [ ] todo\n\n~~gone~~');
		expect(screen.getByRole('table')).toBeInTheDocument();
		expect(screen.getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['a', 'b']);
		expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
		expect(container.querySelector('del')?.textContent).toBe('gone');
	});

	it('draws a code fence in monospace with a copy button that copies the code', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('navigator', { clipboard: { writeText } });
		const { container } = show('```ts\nconst a = 1;\nconst b = 2;\n```');
		const pre = container.querySelector('pre');
		expect(pre?.textContent).toBe('const a = 1;\nconst b = 2;\n');
		expect(pre?.className).toMatch(/font-mono/);
		fireEvent.click(screen.getByRole('button', { name: /copy/i }));
		expect(writeText).toHaveBeenCalledWith('const a = 1;\nconst b = 2;\n');
		expect(await screen.findByRole('button', { name: /copied/i })).toBeInTheDocument();
	});

	it('says why a copy failed when the clipboard is missing', () => {
		vi.stubGlobal('navigator', {});
		show('```\nx\n```');
		fireEvent.click(screen.getByRole('button', { name: /copy/i }));
		expect(screen.getByRole('alert').textContent).toMatch(/clipboard/i);
	});

	it('limits the height and scrolls when maxHeight is given', () => {
		const { container } = show('text', '30rem');
		const root = container.firstElementChild as HTMLElement;
		expect(root.style.maxHeight).toBe('30rem');
		expect(root.className).toMatch(/overflow-auto/);
	});
});

describe('MarkdownText security', () => {
	it('does not render raw HTML: no script, no element, no event handler attribute', () => {
		const { container } = show(
			'<script>window.pwned = 1</script>\n\n<img src="https://evil.example/x.png" onerror="window.pwned = 2">\n\nhi <b onmouseover="window.pwned = 3">there</b> <iframe src="https://evil.example"></iframe>'
		);
		for (const tag of ['script', 'img', 'b', 'iframe']) {
			expect(container.querySelector(tag), `<${tag}> must not be rendered`).toBeNull();
		}
		const handlers = Array.from(container.querySelectorAll('*')).flatMap(element =>
			element.getAttributeNames().filter(name => name.startsWith('on'))
		);
		expect(handlers).toEqual([]);
		expect((window as unknown as { pwned?: number }).pwned).toBeUndefined();
	});

	it('writes a tag such as <role> as text instead of making it disappear (prompts use them)', () => {
		const { container } = show('<role>reviewer</role>');
		expect(container.querySelector('role')).toBeNull();
		expect(container.textContent).toContain('reviewer');
	});

	it.each([
		['javascript:alert(1)'],
		['JaVaScRiPt:alert(1)'],
		['  javascript:alert(1)'],
		['data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='],
		['vbscript:msgbox(1)'],
		['file:///etc/passwd'],
	])('neutralises the link target %s but keeps its text', target => {
		const { container } = show(`[click me](<${target}>)`);
		expect(container.textContent).toContain('click me');
		for (const anchor of Array.from(container.querySelectorAll('a'))) {
			expect(anchor.getAttribute('href') ?? '').toMatch(/^(https?:|mailto:|$)/);
		}
		expect(container.innerHTML).not.toMatch(/javascript:|data:text|vbscript:|file:/i);
	});

	it('neutralises the target of an autolink-style javascript: url', () => {
		const { container } = show('see javascript:alert(1) here');
		expect(container.querySelector('a')).toBeNull();
	});

	it('does not fetch images: no img element, the alt text and the url are written as text', () => {
		const { container } = show('![company logo](https://evil.example/pixel.png)');
		expect(container.querySelector('img')).toBeNull();
		expect(container.textContent).toContain('company logo');
		expect(container.textContent).toContain('https://evil.example/pixel.png');
		expect(container.querySelector('[src]')).toBeNull();
	});

	it('opens links in a new tab with rel=noopener noreferrer', () => {
		show('[docs](https://example.com/a?b=1) and [mail](mailto:a@example.com)');
		for (const name of ['docs', 'mail']) {
			const link = screen.getByRole('link', { name });
			expect(link).toHaveAttribute('target', '_blank');
			expect(link).toHaveAttribute('rel', 'noopener noreferrer');
		}
		expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute('href', 'https://example.com/a?b=1');
	});

	it('does not turn a relative link into a navigation of the shell', () => {
		const { container } = show('[local](/modules/flow/executions)');
		expect(container.querySelector('a')).toBeNull();
		expect(container.textContent).toContain('local');
	});
});

describe('MarkdownText with a huge input', () => {
	it('renders 500 KB without freezing: only the first part, with a visible show more', () => {
		const line = 'A line of text with **bold** and a [link](https://example.com) inside.\n\n';
		const text = line.repeat(Math.ceil(500_000 / line.length));
		const started = performance.now();
		const { container } = show(text);
		const elapsed = performance.now() - started;
		expect(elapsed).toBeLessThan(5000);
		expect(container.querySelectorAll('p').length).toBeLessThan(MARKDOWN_VISIBLE_CHARS / 20);
		expect(screen.getByRole('button', { name: /show more/i }).textContent).toMatch(/\d/);
	});

	it('shows more on request, then stops offering it once everything is shown', () => {
		const text = 'x'.repeat(MARKDOWN_VISIBLE_CHARS + MARKDOWN_SHOW_MORE_CHARS - 10);
		const { container } = show(text);
		expect(container.textContent).not.toContain(text);
		fireEvent.click(screen.getByRole('button', { name: /show more/i }));
		expect(container.textContent).toContain(text);
		expect(screen.queryByRole('button', { name: /show more/i })).toBeNull();
	});

	it('offers no show more for a short text', () => {
		show('short');
		expect(screen.queryByRole('button', { name: /show more/i })).toBeNull();
	});
});

describe('MarkdownText refuses a wrong use visibly', () => {
	it('lists the props outside the contract and what is accepted', () => {
		render(<MarkdownText text="hi" maxHeight={undefined} unexpectedKeys={['className', 'style']} />);
		const alert = screen.getByRole('alert');
		expect(alert.textContent).toContain('className, style');
		expect(alert.textContent).toContain('text, maxHeight');
		expect(screen.queryByText('hi')).toBeNull();
	});

	it('says the text is missing instead of rendering nothing', () => {
		render(<MarkdownText text={undefined} maxHeight={undefined} unexpectedKeys={[]} />);
		expect(screen.getByRole('alert').textContent).toMatch(/text/);
	});

	it('refuses a maxHeight that is not a plain css length', () => {
		render(<MarkdownText text="hi" maxHeight="calc(100vh; background:url(x))" unexpectedKeys={[]} />);
		expect(screen.getByRole('alert').textContent).toMatch(/maxHeight/);
	});

	it('renders an empty text as an empty block', () => {
		const { container } = show('');
		expect(container.textContent).toBe('');
		expect(screen.queryByRole('alert')).toBeNull();
	});
});
