import { describe, expect, it } from 'vitest';

import { TemplateEscape } from './TemplateEscape';

describe('TemplateEscape', () => {
	it('strips escaped literals and keeps real expressions', () => {
		expect(TemplateEscape.strip('a $${{ steps.x.outputs.y }} b ${{ inputs.z }}')).toBe('a  b ${{ inputs.z }}');
	});

	it('strips several escaped literals', () => {
		expect(TemplateEscape.strip('$${{ a }}-$${{ b }}')).toBe('-');
	});

	it('leaves text without escapes untouched', () => {
		expect(TemplateEscape.strip('echo $HOME ${{ inputs.a }}')).toBe('echo $HOME ${{ inputs.a }}');
	});

	it('returns an independent global regex each call (no shared lastIndex)', () => {
		const first = TemplateEscape.pattern();
		first.lastIndex = 5;
		expect(TemplateEscape.pattern().lastIndex).toBe(0);
	});
});
