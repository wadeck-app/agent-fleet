import { describe, expect, it } from 'vitest';

import { SourceContactErrors, describeContactError } from './SourceContactErrors.js';
import type { WorkerTypeLookup } from './WorkerTypeCatalog.js';

const identity = (text: string): string => text;
const typeOf: WorkerTypeLookup = sourceId =>
	({ 'sbx-1': 'sandbox', 'sbx-2': 'sandbox', 'gpu-1': 'gpu' })[sourceId ?? ''];

function store(start = 1_000) {
	const clock = { now: start };
	return { clock, errors: new SourceContactErrors(() => clock.now) };
}

describe('SourceContactErrors', () => {
	it('keeps the last contact error of a source and reports it newer than a start, labelled with the source', () => {
		const { clock, errors } = store();
		clock.now = 2_000;
		errors.failed('sbx-1', 'wrapper failed to start');

		expect(errors.since('sandbox', typeOf, 1_500, identity)).toEqual([
			'reported by source "sbx-1": wrapper failed to start',
		]);
	});

	it('excludes an error older than the start of the wait', () => {
		const { clock, errors } = store();
		clock.now = 1_000;
		errors.failed('sbx-1', 'old failure');

		expect(errors.since('sandbox', typeOf, 1_001, identity)).toEqual([]);
	});

	it('includes an error recorded at the very start of the wait', () => {
		const { errors } = store(1_000);
		errors.failed('sbx-1', 'now');

		expect(errors.since('sandbox', typeOf, 1_000, identity)).toHaveLength(1);
	});

	it('excludes the errors of sources of another type', () => {
		const { clock, errors } = store();
		clock.now = 2_000;
		errors.failed('gpu-1', 'gpu farm down');
		errors.failed('stray', 'not a source of any type');

		expect(errors.since('sandbox', typeOf, 0, identity)).toEqual([]);
	});

	it('forgets the error of a source once an ask of it succeeds', () => {
		const { clock, errors } = store();
		clock.now = 2_000;
		errors.failed('sbx-1', 'wrapper failed to start');

		errors.succeeded('sbx-1');

		expect(errors.since('sandbox', typeOf, 0, identity)).toEqual([]);
	});

	it('keeps only the last error of a source, and lists every source of the type', () => {
		const { clock, errors } = store();
		clock.now = 2_000;
		errors.failed('sbx-1', 'first');
		clock.now = 3_000;
		errors.failed('sbx-1', 'second');
		errors.failed('sbx-2', 'other source');

		expect(errors.since('sandbox', typeOf, 0, identity)).toEqual([
			'reported by source "sbx-1": second',
			'reported by source "sbx-2": other source',
		]);
	});

	it('passes the text through the masker it is given', () => {
		const { clock, errors } = store();
		clock.now = 2_000;
		errors.failed('sbx-1', 'login with S3CRET failed');

		expect(errors.since('sandbox', typeOf, 0, text => text.replaceAll('S3CRET', '***'))).toEqual([
			'reported by source "sbx-1": login with *** failed',
		]);
	});
});

describe('describeContactError', () => {
	it('flattens a multi-line error to one line', () => {
		expect(describeContactError('first\n  second\r\nthird\t\tfourth', identity)).toBe('first second third fourth');
	});

	it('strips URL user info and query values, keeping scheme, host and path', () => {
		expect(describeContactError('GET https://user:pw@api.example.com/v1/auth?token=abc&x=1 failed', identity)).toBe(
			'GET https://api.example.com/v1/auth?… failed'
		);
	});

	it('redacts credential-named key=value pairs even outside a URL', () => {
		expect(describeContactError('login failed: token=abc123 and api_key=zzz and mode=fast', identity)).toBe(
			'login failed: token=<redacted> and api_key=<redacted> and mode=fast'
		);
	});

	it('applies the masker after the structural clean-up', () => {
		expect(describeContactError('ssh S3CRET@host failed', text => text.replaceAll('S3CRET', '***'))).toBe(
			'ssh ***@host failed'
		);
	});

	it('never prints the raw text when the masker throws', () => {
		expect(
			describeContactError('has S3CRET', () => {
				throw new Error('masker broke');
			})
		).toBe('<masking failed>');
	});

	it('caps the text at 300 characters, ending with an ellipsis', () => {
		const text = describeContactError('x'.repeat(1000), identity);

		expect(text).toHaveLength(300);
		expect(text.endsWith('…')).toBe(true);
	});

	it('leaves a short plain message as it is', () => {
		expect(describeContactError('credential endpoint down', identity)).toBe('credential endpoint down');
	});
});
