import { describe, expect, it } from 'vitest';

import { isFileNotFoundError } from './getErrorMessage';

describe('isFileNotFoundError', () => {
	it('matches an error carrying the ENOENT code', () => {
		expect(isFileNotFoundError(Object.assign(new Error('missing'), { code: 'ENOENT' }))).toBe(true);
	});

	it('rejects other error codes', () => {
		expect(isFileNotFoundError(Object.assign(new Error('denied'), { code: 'EACCES' }))).toBe(false);
	});

	it('rejects errors without a code and non-object values', () => {
		expect(isFileNotFoundError(new Error('plain'))).toBe(false);
		expect(isFileNotFoundError('ENOENT')).toBe(false);
		expect(isFileNotFoundError(null)).toBe(false);
		expect(isFileNotFoundError(undefined)).toBe(false);
	});
});
