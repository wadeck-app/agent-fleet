import { describe, expect, it } from 'vitest';

import { workerSatisfiesLabels } from './LabelMatcher.js';

describe('workerSatisfiesLabels - AND semantics (D#7)', () => {
	it('accepts a worker carrying every required label', () => {
		expect(workerSatisfiesLabels(['gpu', 'linux'], ['gpu', 'linux', 'extra'])).toBe(true);
	});

	it('rejects a worker missing one required label', () => {
		expect(workerSatisfiesLabels(['gpu', 'linux'], ['gpu'])).toBe(false);
	});

	it('rejects a worker with no labels when the step requires some', () => {
		expect(workerSatisfiesLabels(['gpu'], [])).toBe(false);
	});

	it('order does not matter', () => {
		expect(workerSatisfiesLabels(['a', 'b'], ['b', 'a'])).toBe(true);
	});

	it('matching is exact, not prefix or substring', () => {
		expect(workerSatisfiesLabels(['gpu'], ['gpu-large'])).toBe(false);
	});
});

describe('workerSatisfiesLabels - permissive default (D#22)', () => {
	// Labels are greenfield: no existing flow declares any, so a step that demands
	// nothing must run anywhere, or a freshly launched worker would sit inert.
	it('a step requiring no labels runs on an unlabelled worker', () => {
		expect(workerSatisfiesLabels(undefined, [])).toBe(true);
		expect(workerSatisfiesLabels([], [])).toBe(true);
	});

	it('a step requiring no labels runs on a labelled worker', () => {
		expect(workerSatisfiesLabels(undefined, ['gpu'])).toBe(true);
	});
});

describe('workerSatisfiesLabels - unsupported forms fail loudly (D#7, P-4)', () => {
	it('rejects a bare string instead of treating it as one label', () => {
		expect(() => workerSatisfiesLabels('gpu' as unknown as string[], ['gpu'])).toThrow(/must be a list/i);
	});

	// The specific trap: accepting a string would silently AND the atoms of "a || b".
	it('names the offending value and the expected form', () => {
		let message = '';
		try {
			workerSatisfiesLabels('a || b' as unknown as string[], []);
		} catch (err) {
			message = err instanceof Error ? err.message : String(err);
		}

		expect(message).toContain('a || b');
		expect(message).toMatch(/\[.*\]|list/i);
	});

	it('rejects a list containing a non-string entry', () => {
		expect(() => workerSatisfiesLabels([1 as unknown as string], [])).toThrow(/string/i);
	});

	it('rejects an empty or blank label rather than matching everything', () => {
		expect(() => workerSatisfiesLabels([''], [])).toThrow(/empty/i);
		expect(() => workerSatisfiesLabels(['  '], [])).toThrow(/empty/i);
	});
});
