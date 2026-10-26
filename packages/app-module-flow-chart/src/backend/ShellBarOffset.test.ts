import { filesUnder } from 'flow-core/testing';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');
// The shell top bar is sticky and publishes its height here (dsl-ui AppShell); the fallback keeps a component usable outside the shell.
const BAR_VARIABLE = '--app-shell-bar-height';

const shipped = filesUnder(srcDir).filter(
	file => /\.(ts|tsx)$/.test(file) && !/\.test\.tsx?$/.test(file) && !/[\\/]testing[\\/]/.test(file)
);

const STRING_LITERAL = /(['"`])((?:(?!\1)[^\n\\])*)\1/g;
const CLASS_TOKEN = /^[\w:\-[\](),./%!*+]+$/;
const STICKS = /^(?:[\w-]+:)*(?:sticky|fixed)$/;
const TOP_OFFSET = /^(?:[\w-]+:)*-?(?:top|inset|inset-y)-/;
const SCROLL_MARGIN = /^(?:[\w-]+:)*scroll-m(?:t|y)?-/;

/** Class strings (every token looks like a Tailwind class) that stick to the viewport top or set a scroll margin. */
function offendingTokens(source: string): string[] {
	const offending: string[] = [];
	for (const [, , text] of source.matchAll(STRING_LITERAL)) {
		const tokens = text!.split(/\s+/).filter(Boolean);
		if (tokens.length === 0 || !tokens.every(token => CLASS_TOKEN.test(token))) continue;
		const sticks = tokens.some(token => STICKS.test(token));
		const offsets = tokens.filter(token => (sticks && TOP_OFFSET.test(token)) || SCROLL_MARGIN.test(token));
		if (sticks && !offsets.some(token => /(?:^|:)top-/.test(token))) {
			offending.push(
				`${text} (sticky or fixed without a top offset: it would stick at the viewport top, under the shell bar)`
			);
		}
		for (const token of offsets) {
			// inset-y-* of an absolute box is relative to its parent, not the viewport: only sticky/fixed boxes are checked above.
			if (!token.includes(BAR_VARIABLE)) offending.push(`${token} (in "${text}")`);
		}
	}
	return offending;
}

describe('the guard below', () => {
	it('flags a sticky top offset without the shell variable', () => {
		expect(offendingTokens(`const A = 'sticky top-0 z-10';`)).toHaveLength(1);
		expect(offendingTokens(`const A = 'lg:sticky lg:top-2';`)).toHaveLength(1);
		expect(offendingTokens(`const A = 'fixed inset-y-0';`).length).toBeGreaterThan(0);
	});

	it('flags a scroll margin without the shell variable', () => {
		expect(offendingTokens(`const A = 'scroll-mt-4 p-2';`)).toHaveLength(1);
	});

	it('flags a sticky without any top offset', () => {
		expect(offendingTokens(`const A = 'sticky z-10';`)).toHaveLength(1);
	});

	it('accepts the shell variable and ignores boxes that do not stick', () => {
		expect(offendingTokens(["const A = 'sticky top-[var(", BAR_VARIABLE, ",0px)]';"].join(''))).toEqual([]);
		expect(
			offendingTokens(["const A = 'lg:sticky lg:top-[calc(var(", BAR_VARIABLE, ",0px)+0.5rem)]';"].join(''))
		).toEqual([]);
		expect(offendingTokens(`const A = 'absolute inset-y-2 top-0';`)).toEqual([]);
		expect(offendingTokens(`const A = 'Sticky strip above the lines';`)).toEqual([]);
	});
});

describe('every sticky, fixed or scroll-margin class clears the sticky shell top bar', () => {
	it('finds the files to check (a wrong directory would make the check below vacuous)', () => {
		expect(shipped.length).toBeGreaterThan(10);
	});

	it.each(shipped.map(file => [relative(srcDir, file).split(sep).join('/'), file]))('%s', (_name, file) => {
		const offending = offendingTokens(readFileSync(file as string, 'utf8'));
		expect(
			offending,
			`use top-[var(${BAR_VARIABLE},0px)] (or calc(var(${BAR_VARIABLE},0px)+<gap>)): the shell top bar is sticky`
		).toEqual([]);
	});
});
