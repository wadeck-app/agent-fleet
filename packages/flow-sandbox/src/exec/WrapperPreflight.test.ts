import { describe, expect, it } from 'vitest';

import type { PrerequisiteReport } from '../SbxPrerequisiteCheck';
import { eachRow } from '../testing/EachRow';
import { RecordingSandboxLog } from '../testing/RecordingSandboxLog';
import { SbxTemplateListing, WrapperPreflight } from './WrapperPreflight';

const OK: PrerequisiteReport = { ok: true, findings: [{ id: 'version', severity: 'ok', message: 'sbx 0.49.2' }] };
const BROKEN: PrerequisiteReport = {
	ok: false,
	findings: [{ id: 'not-signed-in', severity: 'error', message: 'sbx is not signed in: run `sbx login`' }],
};
const LISTING = 'REPOSITORY   TAG   IMAGE ID\nflow-sandbox   m7   abc123   2 days ago\n';

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
