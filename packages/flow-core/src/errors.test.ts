import { describe, expect, it } from 'vitest';

import { FlowCoreError, InvalidQueryError, errorMessage } from './errors.js';

describe('FlowCoreError', () => {
	it('carries the kind callers branch on and the message the user reads', () => {
		const err = new FlowCoreError('Cannot do it. Try again.', 'some-kind');
		expect(err.message).toBe('Cannot do it. Try again.');
		expect(err.kind).toBe('some-kind');
		expect(err).toBeInstanceOf(Error);
	});

	it('names itself after the concrete class so logs and stack traces say which error it was', () => {
		class CustomError extends FlowCoreError {}
		expect(new FlowCoreError('x', 'k').name).toBe('FlowCoreError');
		expect(new CustomError('x', 'k').name).toBe('CustomError');
	});
});

describe('InvalidQueryError', () => {
	it('is a FlowCoreError of kind invalid-query', () => {
		const err = new InvalidQueryError("Invalid limit 'abc'");
		expect(err).toBeInstanceOf(FlowCoreError);
		expect(err.kind).toBe('invalid-query');
		expect(err.name).toBe('InvalidQueryError');
		expect(err.message).toBe("Invalid limit 'abc'");
	});
});

describe('errorMessage', () => {
	it('returns the message of an Error', () => {
		expect(errorMessage(new Error('boom'))).toBe('boom');
	});

	it('renders a thrown non-Error value as text', () => {
		expect(errorMessage('plain')).toBe('plain');
		expect(errorMessage(42)).toBe('42');
		expect(errorMessage(undefined)).toBe('undefined');
	});
});
