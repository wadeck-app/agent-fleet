import { describe, expect, it } from 'vitest';

import { EDGE_LEGEND, edgeStyle } from './EdgeStyle.js';

describe('edgeStyle', () => {
	it('draws a dependency solid, a condition dashed, a retry loop animated and routed around the flow', () => {
		expect(edgeStyle('dependency')).toMatchObject({ dash: undefined, animated: false, type: 'smoothstep' });
		expect(edgeStyle('conditional')).toMatchObject({ dash: '6 4', animated: false });
		expect(edgeStyle('loop')).toMatchObject({ animated: true, type: 'smoothstep' });
	});

	it('gives the five kinds five distinguishable looks', () => {
		const looks = (['dependency', 'conditional', 'loop', 'substep', 'sequence'] as const).map(kind => {
			const s = edgeStyle(kind);
			return `${s.stroke}|${s.dash}|${s.animated}|${s.type}`;
		});
		expect(new Set(looks).size).toBe(5);
	});

	it('takes colors from theme variables only', () => {
		for (const kind of ['dependency', 'conditional', 'loop', 'substep', 'sequence'] as const) {
			expect(edgeStyle(kind).stroke).toMatch(/^var\(--color-[a-z-]+\)$/);
		}
	});

	it('refuses an edge kind it cannot draw', () => {
		expect(() => edgeStyle('teleport' as never)).toThrow(
			/teleport.*dependency, conditional, loop, substep, sequence/
		);
	});

	it('lists every kind in the legend with a sentence', () => {
		expect(EDGE_LEGEND.map(e => e.kind)).toEqual(['dependency', 'conditional', 'loop', 'substep', 'sequence']);
		for (const entry of EDGE_LEGEND) expect(entry.description.length).toBeGreaterThan(5);
	});
});
