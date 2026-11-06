import { describe, expect, it, vi } from 'vitest';

import { SecretMasker } from '../secrets/SecretMasker.js';
import { DaemonSecrets } from './DaemonSecrets.js';
import { SourceContactErrors, describeContactError } from './SourceContactErrors.js';
import { contactDeclaredSources } from './WorkerSourceContact.js';

/**
 * The text of a contact error reaches step errors, logs, the UI and queue events: nothing secret may survive it, in
 * whatever shape it comes. The REAL daemon masker is used, with registered secrets.
 */

const SPACED_SECRET = 'abcdefgh  ijklmnop\tqrstuvwx';
const PEM_SECRET = '-----BEGIN KEY-----\nMIIBVQIBADANBgkqhkiG\nw0BAQEFAASCAT8wggE7AgEA\n-----END KEY-----';
const STRADDLING_SECRET = 'S3CRET-VALUE-0123456789';

function realMask(): (text: string) => string {
	const daemonSecrets = new DaemonSecrets();
	daemonSecrets.masks.register(
		'e1',
		new SecretMasker(
			new Map([
				['SPACED', SPACED_SECRET],
				['PEM', PEM_SECRET],
				['STRADDLE', STRADDLING_SECRET],
			])
		)
	);
	return text => daemonSecrets.masks.maskAll(text);
}

const describe_ = (message: string): string => describeContactError(message, realMask());

describe('the masker sees the raw text, before anything is flattened', () => {
	it('masks a secret that contains a double space and a tab', () => {
		const text = describe_(`login failed with ${SPACED_SECRET} for the account`);

		expect(text).not.toContain('abcdefgh');
		expect(text).not.toContain('ijklmnop');
		expect(text).not.toContain('qrstuvwx');
	});

	it('masks a multi-line secret (a PEM key)', () => {
		const text = describe_(`cannot use key\n${PEM_SECRET}\nsee the docs`);

		expect(text).not.toContain('MIIBVQIBADANBgkqhkiG');
		expect(text).not.toContain('w0BAQEFAASCAT8wggE7AgEA');
	});

	it('masks a secret that straddles the 300-character cap, so no part of it survives the cut', () => {
		const text = describe_(`${'x'.repeat(292)}${STRADDLING_SECRET} and more text after it`);

		expect(text.length).toBeLessThanOrEqual(300);
		expect(text).not.toContain('S3CRET');
		expect(text).not.toContain('VALUE');
	});
});

describe('credentials the masker does not know', () => {
	const mask = (text: string): string => text;

	it('redacts a launch or source token: any run of 64 hex characters', () => {
		const token = 'a1b2c3d4'.repeat(8);

		expect(describeContactError(`spawn failed, token was ${token}, sorry`, mask)).toBe(
			'spawn failed, token was <redacted>, sorry'
		);
	});

	it.each([
		['Bearer abc.def-123', 'Bearer <redacted>'],
		['Authorization: Basic dXNlcjpwYXNz', 'Authorization: <redacted> <redacted>'],
		['Authorization: Bearer abc.def-123 rejected', 'Authorization: <redacted> <redacted> rejected'],
		['response {"token":"abc123","ok":false}', 'response {"token":<redacted>,"ok":false}'],
		['token: abc123 was refused', 'token: <redacted> was refused'],
		['token = abc123 was refused', 'token = <redacted> was refused'],
		['TOKEN="a b c" was refused', 'TOKEN=<redacted> was refused'],
		["password='two words' failed", 'password=<redacted> failed'],
		['host/path?access_token=zzz&mode=fast', 'host/path?access_token=<redacted>&mode=fast'],
	])('redacts the shape %s', (input, expected) => {
		expect(describeContactError(input, mask)).toBe(expected);
	});

	it.each([
		['https://u:p@ss@host.example.com/x', 'https://host.example.com/x'],
		['https://u:p/ss@host.example.com/x', 'https://host.example.com/x'],
		['connect to user:pw@db.example.com failed', 'connect to db.example.com failed'],
		['https://api.example.com/v1?mode=fast&sig=1', 'https://api.example.com/v1?…'],
	])('strips user info anywhere in %s', (input, expected) => {
		expect(describeContactError(input, mask)).toBe(expected);
	});

	it.each([
		'client_secret',
		'auth_token',
		'passwd',
		'authorization',
		'cookie',
		'x-session-id',
		'db_credentials',
		'apiKey',
	])('redacts the value of the credential-like key %s', key => {
		expect(describeContactError(`${key}=zzz999`, mask)).toBe(`${key}=<redacted>`);
	});

	it('keeps ordinary key=value text and words that merely contain a short sensitive word', () => {
		expect(describeContactError('mode=fast monkey=1 status: failed to start', mask)).toBe(
			'mode=fast monkey=1 status: failed to start'
		);
	});

	it('strips ANSI escape sequences and control characters', () => {
		expect(describeContactError('\u001b[31mred\u001b[0m\u0007 bell\u0000 done', mask)).toBe('red bell done');
	});

	it('prints the masking-failed constant when the masker throws, never the raw text', () => {
		expect(
			describeContactError('has S3CRET', () => {
				throw new Error('broken');
			})
		).toBe('[secret-masking-failed]');
	});
});

describe('SourceContactErrors.retainOnly', () => {
	it('forgets the errors of sources that are no longer declared', () => {
		const errors = new SourceContactErrors();
		errors.failed('kept', 'boom');
		errors.failed('removed', 'boom');
		const typeOf = () => 'sandbox';

		errors.retainOnly(['kept']);

		expect(errors.since('sandbox', typeOf, 0, text => text)).toEqual(['reported by source "kept": boom']);
	});
});

describe('contactDeclaredSources - recording an error must not hide the report', () => {
	const entry = {
		sourceId: 'box',
		provider: 'free',
		plugin: 'thing.default',
		pluginsDir: '/plugins',
		labels: [],
		maxWorkers: 1,
		tokenHash: 'h',
		createdAt: '2026-11-06T00:00:00.000Z',
	};
	const workerTypes = (failure: unknown) =>
		({ get: () => Promise.resolve({ source: { obtainWorker: () => Promise.reject(failure) } }) }) as never;

	it('still reports when the error has a message that cannot be read', async () => {
		const reports: string[] = [];
		const weird = {
			get message(): string {
				throw new Error('getter exploded');
			},
		};

		await contactDeclaredSources([entry], 'ws://x', message => reports.push(message), {
			workerTypes: workerTypes(weird),
			issueLaunchToken: () => 'tok',
			contactOutcome: { failed: vi.fn(), succeeded: vi.fn() },
		});

		expect(reports).toHaveLength(1);
		expect(reports[0]).toContain('could not obtain a worker from source "box"');
	});

	it('still reports when the outcome sink itself throws, and says it could not record the error', async () => {
		const reports: string[] = [];

		await contactDeclaredSources([entry], 'ws://x', message => reports.push(message), {
			workerTypes: workerTypes(new Error('plugin said no')),
			issueLaunchToken: () => 'tok',
			contactOutcome: {
				failed: () => {
					throw new Error('sink broke');
				},
				succeeded: vi.fn(),
			},
		});

		expect(reports.join('\n')).toContain('plugin said no');
		expect(reports.join('\n')).toContain('could not record the contact error of source "box"');
	});
});
