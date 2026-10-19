import { describe, expect, it } from 'vitest';

import { STATUS_LEGEND, statusStyle } from './StatusStyle.js';

describe('statusStyle', () => {
	it.each([
		['completed', 'success'],
		['failed', 'danger'],
		['running', 'primary'],
		['pending', 'border'],
	] as const)('%s uses the %s token family', (status, token) => {
		expect(statusStyle(status).nodeClass).toContain(token);
	});

	it('gives every status a word and a glyph: color alone must not carry the meaning', () => {
		for (const status of ['completed', 'failed', 'running', 'pending'] as const) {
			const style = statusStyle(status);
			expect(style.label).toBe(status);
			expect(style.glyph.length).toBeGreaterThan(0);
		}
	});

	it('styles a node without status (a definition alone) neutrally and names it', () => {
		const style = statusStyle(undefined);
		expect(style.label).toBe('not run');
		expect(style.nodeClass).toContain('surface');
	});

	it('uses only design-system tokens, never a raw color', () => {
		for (const status of [undefined, 'completed', 'failed', 'running', 'pending'] as const) {
			const { nodeClass, badgeClass } = statusStyle(status);
			expect(`${nodeClass} ${badgeClass}`).not.toMatch(
				/\b(?:bg|text|border|ring)-(?:red|green|blue|gray|slate|yellow|white|black)/
			);
			expect(`${nodeClass} ${badgeClass}`).not.toMatch(/#[0-9a-f]{3,6}/i);
		}
	});

	it('refuses a status flow-core does not define instead of drawing it as pending', () => {
		expect(() => statusStyle('skipped' as never)).toThrow(/skipped.*pending, running, completed, failed/);
	});

	it('lists the four statuses in run order for the legend', () => {
		expect(STATUS_LEGEND).toEqual(['pending', 'running', 'completed', 'failed']);
	});

	it('uses plain ASCII only, in glyphs and labels', () => {
		for (const status of [undefined, ...STATUS_LEGEND]) {
			const style = statusStyle(status);
			expect(`${style.glyph}${style.label}`).toMatch(/^[\x20-\x7E]+$/);
		}
	});
});
