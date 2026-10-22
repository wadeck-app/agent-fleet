import { describe, expect, it } from 'vitest';

import { PATH_LEGEND, nodeStyle } from './NodeAppearance.js';
import { node } from './testing/GraphFixtures.js';

describe('nodeStyle', () => {
	it('shows the status of a step that ran', () => {
		const step = node('a', {
			status: 'completed',
			path: { outcome: 'ran', basis: 'recorded', reason: 'Ran.', ordinal: 1 },
		});

		expect(nodeStyle(step).label).toBe('completed');
	});

	it('shows a skipped step as skipped although the record says it completed', () => {
		const step = node('a', { status: 'completed', path: { outcome: 'skipped', basis: 'recorded', reason: 'x' } });

		expect(nodeStyle(step)).toMatchObject({ label: 'skipped', glyph: '[~]' });
		expect(nodeStyle(step).nodeClass).toContain('border-dashed');
	});

	it('shows a step the run never reached as not reached, not as pending', () => {
		const step = node('a', { status: 'pending', path: { outcome: 'not-reached', basis: 'inferred', reason: 'x' } });

		expect(nodeStyle(step).label).toBe('not reached');
	});

	it('keeps pending for a step still waiting in a running run, and the neutral look without a run', () => {
		expect(
			nodeStyle(node('a', { status: 'pending', path: { outcome: 'waiting', basis: 'recorded', reason: 'x' } }))
				.label
		).toBe('pending');
		expect(nodeStyle(node('a')).label).toBe('not run');
	});

	it('gives each path-only entry a word and a glyph, with design tokens only', () => {
		for (const style of PATH_LEGEND) {
			expect(style.glyph.length).toBeGreaterThan(0);
			expect(style.nodeClass).not.toMatch(/#|rgb|slate|gray/);
		}
	});
});
