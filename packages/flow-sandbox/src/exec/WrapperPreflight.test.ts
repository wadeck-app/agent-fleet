import { describe, expect, it } from 'vitest';

import type { PrerequisiteReport } from '../SbxPrerequisiteCheck';
import { eachRow } from '../testing/EachRow';
import { RecordingSandboxLog } from '../testing/RecordingSandboxLog';
import { SbxTemplateListing, WrapperPreflight } from './WrapperPreflight';

const OK: PrerequisiteReport = { ok: true, findings: [{ id: 'version', severity: 'ok', message: 'sbx 0.51.0' }] };
const BROKEN: PrerequisiteReport = {
	ok: false,
	findings: [{ id: 'not-signed-in', severity: 'error', message: 'sbx is not signed in: run `sbx login`' }],
};
const LISTING = 'REPOSITORY   TAG   IMAGE ID\nflow-sandbox   m7   abc123   2 days ago\n';

const REAL_LISTING = [
	'REPOSITORY                                TAG                  IMAGE ID       FLAVOR               CREATED',
	'docker.io/docker/sandbox-templates        claude-code-docker   4a94d9144a70   claude-code-docker   2w',
	'docker.io/library/flow-sandbox            m6                   ff2274123d7c   claude-code-docker   1m',
	'docker.io/library/flow-sandbox            m7                   45b01d327679   claude-code-docker   1w',
	'docker.io/library/sandbox-kit-assembled   288e344711c803b4     e2fec539cbfc   claude-code-docker   1w',
].join('\n');

const CONFIG = {
	image: 'flow-sandbox:m7' as string | undefined,
	cpus: 2,
	memory: '2g',
	idleStopMinutes: 5,
	maxConcurrentSandboxes: 4,
	profileAlias: 'claude',
	hostProfile: 'p',
	extraAllowedHosts: [] as string[],
	acceptSshAgentForwarding: false,
};

describe('SbxTemplateListing', () => {
	it('finds a template tag in the listing (each case)', () =>
		eachRow(
			[
				{ tag: 'flow-sandbox:m7', present: true },
				{ tag: 'flow-sandbox:m8', present: false },
				{ tag: 'sandbox:m7', present: false },
				{ tag: 'flow-sandbox:m', present: false },
			],
			({ tag, present }) => {
				expect(SbxTemplateListing.has(LISTING, tag)).toBe(present);
			}
		));

	// Real `sbx template ls` (0.51.0, 2026-11-08): the repository column is the full name, `docker.io/library/flow-sandbox`.
	it('finds a template tag in the listing of the real sbx, where the repository carries its registry and namespace (each case)', () =>
		eachRow(
			[
				{ tag: 'flow-sandbox:m7', present: true },
				{ tag: 'flow-sandbox:m6', present: true },
				{ tag: 'docker.io/library/flow-sandbox:m6', present: true },
				{ tag: 'flow-sandbox:m9', present: false },
				{ tag: 'sandbox:m7', present: false },
				{ tag: 'templates:claude-code-docker', present: false },
				{ tag: 'sandbox-templates:claude-code-docker', present: true },
			],
			({ tag, present }) => {
				expect(SbxTemplateListing.has(REAL_LISTING, tag)).toBe(present);
			}
		));
});

describe('WrapperPreflight (what "flow-sandbox preflight" checks before a worker is asked for)', () => {
	it('checks options, sbx and the image before a worker is asked for (each case)', () =>
		eachRow(
			[
				{
					label: 'a machine that is ready',
					report: OK,
					listing: () => Promise.resolve(LISTING),
					config: CONFIG,
					outcome: undefined,
				},
				{
					label: 'no image configured: the template list is not even read',
					report: OK,
					listing: () => Promise.reject(new Error('must not be read')),
					config: { ...CONFIG, image: undefined },
					outcome: undefined,
				},
				{
					label: 'sbx not signed in',
					report: BROKEN,
					listing: () => Promise.resolve(LISTING),
					config: CONFIG,
					outcome: 'sbx login',
				},
				{
					label: 'a bare image tag: refused before the listing is read, with the repository:tag form',
					report: OK,
					listing: () => Promise.reject(new Error('must not be read')),
					config: { ...CONFIG, image: 'm6' },
					outcome: 'flow-sandbox:m6',
				},
				{
					label: 'an image this machine does not know',
					report: OK,
					listing: () => Promise.resolve(LISTING),
					config: { ...CONFIG, image: 'flow-sandbox:m9' },
					outcome: 'build-image.mjs',
				},
				{
					label: 'a memory below the sbx minimum (the same options parser as the package)',
					report: OK,
					listing: () => Promise.resolve(LISTING),
					config: { ...CONFIG, memory: '128m' },
					outcome: 'at least 512m',
				},
			],
			async ({ report, listing, config, outcome }) => {
				const log = new RecordingSandboxLog();
				const preflight = new WrapperPreflight({
					prerequisites: () => Promise.resolve(report),
					templateListing: listing,
					log,
				});

				if (outcome === undefined) await expect(preflight.run(config)).resolves.toBeUndefined();
				else await expect(preflight.run(config)).rejects.toThrow(outcome);
			}
		));

	it('only warns when the template list itself cannot be read (best effort), saying why', async () => {
		const log = new RecordingSandboxLog();
		const preflight = new WrapperPreflight({
			prerequisites: () => Promise.resolve(OK),
			templateListing: () => Promise.reject(new Error('sbx template ls failed')),
			log,
		});

		await expect(preflight.run(CONFIG)).resolves.toBeUndefined();

		expect(log.text()).toContain('could not check whether the image "flow-sandbox:m7" exists');
		expect(log.text()).toContain('sbx template ls failed');
	});
});
