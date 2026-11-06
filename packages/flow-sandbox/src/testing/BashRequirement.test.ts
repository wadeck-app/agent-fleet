import { describe, expect, it } from 'vitest';

import { BashRequirement } from './BashRequirement';

describe('BashRequirement', () => {
	it('passes when bash runs', () => {
		expect(() => BashRequirement.assertAvailable()).not.toThrow();
	});

	it('fails loudly and says what to install when bash is not on PATH', () => {
		const original = process.env['PATH'];
		process.env['PATH'] = '';
		try {
			expect(() => BashRequirement.assertAvailable()).toThrow(/need bash on PATH \(Git for Windows on Windows/);
		} finally {
			process.env['PATH'] = original;
		}
	});
});
