import { describe, expect, it } from 'vitest';

import { EXECUTION_ID_LENGTH, generateExecutionId, isExecutionId, looksLikeExecutionId } from './ExecutionId.js';

describe('generateExecutionId', () => {
	it('generates ids that pass isExecutionId', () => {
		for (let i = 0; i < 50; i++) {
			const id = generateExecutionId();
			expect(id).toHaveLength(EXECUTION_ID_LENGTH);
			expect(isExecutionId(id)).toBe(true);
		}
	});

	it('generates unique ids across multiple calls', () => {
		expect(new Set(Array.from({ length: 20 }, () => generateExecutionId())).size).toBe(20);
	});
});

describe('isExecutionId', () => {
	it.each(['a6wug7bh', '00000000'])('accepts %s', id => {
		expect(isExecutionId(id)).toBe(true);
	});

	it.each(['a6wug7b', 'a6wug7bhx', 'A6WUG7BH', 'a6wug7b/', '../a6wug', ''])('rejects %j', id => {
		expect(isExecutionId(id)).toBe(false);
	});
});

describe('looksLikeExecutionId (id or prefix)', () => {
	it('accepts partial ids', () => {
		expect(looksLikeExecutionId('a6')).toBe(true);
		expect(looksLikeExecutionId('a6wug7bh')).toBe(true);
	});

	it('rejects uppercase, separators and the empty string', () => {
		expect(looksLikeExecutionId('A6')).toBe(false);
		expect(looksLikeExecutionId('a/b')).toBe(false);
		expect(looksLikeExecutionId('')).toBe(false);
	});
});
