import { describe, expect, it, vi } from 'vitest';

import { SourceContactErrors } from './SourceContactErrors.js';
import { contactDeclaredSources } from './WorkerSourceContact.js';

/**
 * The text of a contact error is third-party text: it must never reach a message, whatever it holds, and the work done
 * with it must not depend on its length.
 */

const entry = {
	sourceId: 'sbx-1',
	provider: 'free',
	plugin: 'thing.default',
	pluginsDir: '/plugins',
	labels: [],
	maxWorkers: 1,
	tokenHash: 'h',
	createdAt: '2026-11-06T00:00:00.000Z',
};
const typeOf = (sourceId: string | undefined) => (sourceId === 'sbx-1' ? 'thing' : undefined);
const failing = (failure: unknown) =>
	({ get: () => Promise.resolve({ source: { obtainWorker: () => Promise.reject(failure) } }) }) as never;

const HOSTILE = [
	'login failed token=abc123 password: hunter2 Authorization: Bearer xyz.abc',
	'-----BEGIN PRIVATE KEY-----\nMIIBVQIBADANBgkqhkiG\n-----END PRIVATE KEY-----',
	`${'a=a='.repeat(25_000)}secret-tail`,
	'a://'.repeat(25_000),
	'=:'.repeat(50_000),
	'user:pw@host https://u:p@ss@h/x?token=zzz',
];

async function contactWith(failure: unknown) {
	const errors = new SourceContactErrors('C:/logs');
	const reports: string[] = [];
	await contactDeclaredSources([entry], 'ws://x', message => reports.push(message), {
		workerTypes: failing(failure),
		issueLaunchToken: () => 'tok',
		contactOutcome: errors,
	});
	return { errors, reports };
}

describe('hostile contact errors', () => {
	it.each(HOSTILE.map((text, index) => [index, text] as const))(
		'never reach the message built for a bound step (case %i)',
		async (_index, text) => {
			const { errors } = await contactWith(new Error(text));

			const sentences = errors.since('thing', typeOf, 0);
			expect(sentences).toHaveLength(1);
			expect(sentences[0]).toMatch(
				/^Last contact with source "sbx-1" failed at \d{4}-\d\d-\d\dT[\d:]+Z; the error is in the daemon log \(flow logs, or C:\/logs\)\.$/
			);
			for (const fragment of ['abc123', 'hunter2', 'xyz.abc', 'MIIBVQ', 'secret-tail', 'zzz', 'pw@', 'a=a=']) {
				expect(sentences[0]).not.toContain(fragment);
			}
			expect(sentences[0]!.length).toBeLessThan(200);
		}
	);

	it('are read once, for the report and the daemon log, and never again by the recording', async () => {
		let reads = 0;
		const hostile = {
			get message(): string {
				reads++;
				return HOSTILE[2]!;
			},
		};

		const { errors, reports } = await contactWith(hostile);

		expect(reads).toBe(1);
		expect(reports).toHaveLength(1);
		expect(errors.since('thing', typeOf, 0)[0]!.length).toBeLessThan(200);
	});

	it('hand the outcome sink the fact of the failure and nothing else', async () => {
		const outcome = { failed: vi.fn(), succeeded: vi.fn() };

		await contactDeclaredSources([entry], 'ws://x', () => {}, {
			workerTypes: failing(new Error(HOSTILE[0])),
			issueLaunchToken: () => 'tok',
			contactOutcome: outcome,
		});

		expect(outcome.failed).toHaveBeenCalledExactlyOnceWith('sbx-1');
	});

	it('never cost the report: not an unreadable message, not a sink that throws', async () => {
		const unreadable = {
			get message(): string {
				throw new Error('getter exploded');
			},
		};
		const reports: string[] = [];

		await contactDeclaredSources([entry], 'ws://x', message => reports.push(message), {
			workerTypes: failing(unreadable),
			issueLaunchToken: () => 'tok',
			contactOutcome: {
				failed: () => {
					throw new Error('sink broke');
				},
				succeeded: vi.fn(),
			},
		});

		expect(reports.join('\n')).toContain('could not obtain a worker from source "sbx-1"');
		expect(reports.join('\n')).toContain('could not record the contact failure of source "sbx-1"');
	});
});
