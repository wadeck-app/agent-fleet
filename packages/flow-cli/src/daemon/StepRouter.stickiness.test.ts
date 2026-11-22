import { cacheFilePath, writeCache } from '@wadeck-app/shared-updater';
import type { StepDistributionProvider, StepPlacement } from 'extension-points';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';

import { DefaultStepDistribution, type RoutingCandidate, StepRouter } from './StepRouter.js';
import type { RegisteredWorker } from './WorkerRegistry.js';

function candidate(workerId: string, overrides: Partial<RegisteredWorker> = {}): RoutingCandidate {
	return {
		ws: { workerId } as unknown as WebSocket,
		worker: {
			state: 'idle',
			workerId,
			pid: 1,
			labels: [],
			attachedProjects: [],
			attachedProjectIds: [],
			hasUserInterface: false,
			ephemeral: true,
			shellCapabilities: [],
			features: [],
			...overrides,
		},
	};
}

const step = (overrides: Partial<StepPlacement> = {}): StepPlacement => ({
	stepId: 's1',
	labels: [],
	requiresUserInterface: false,
	...overrides,
});

const idOf = (ws: WebSocket | undefined): string | undefined =>
	(ws as unknown as { workerId?: string } | undefined)?.workerId;

describe('StepRouter - soft stickiness to the worker of the previous step of the run', () => {
	let configDir: string;
	let router: StepRouter;

	beforeEach(() => {
		// An empty config dir: no latest version known, so the up-to-date preference is inert unless a test writes one.
		configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sticky-'));
		router = new StepRouter(undefined, new DefaultStepDistribution(configDir));
	});

	afterEach(() => {
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	it('keeps the existing order when the run has no previous worker', () => {
		const picked = router.select(step(), [candidate('w1'), candidate('w2')], undefined, undefined, undefined);
		expect(idOf(picked)).toBe('w1');
	});

	it('prefers the previous worker over the first registered one', () => {
		const picked = router.select(step(), [candidate('w1'), candidate('w2')], undefined, undefined, 'w2');
		expect(idOf(picked)).toBe('w2');
	});

	it('prefers the previous worker over an up-to-date one', () => {
		writeLatestVersion(configDir, '2.0.0');
		const candidates = [candidate('w1', { version: '2.0.0' }), candidate('w2', { version: '1.0.0' })];
		// Guards the test itself: the version preference must be active, or the assertion below proves nothing.
		expect(idOf(router.select(step(), candidates, undefined, undefined, undefined))).toBe('w1');
		expect(idOf(router.select(step(), candidates, undefined, undefined, 'w2'))).toBe('w2');
	});

	it('never outranks registered-before-forked: a forked previous worker loses to a registered one', () => {
		const candidates = [
			candidate('forked', { ephemeral: true }),
			candidate('reg', { ephemeral: false, attachedProjectIds: ['p'] }),
		];
		const picked = router.select(step({ projectId: 'p' }), candidates, undefined, undefined, 'forked');
		expect(idOf(picked)).toBe('reg');
	});

	it('moves the previous worker first within its own group', () => {
		const candidates = [
			candidate('reg1', { ephemeral: false, attachedProjectIds: ['p'] }),
			candidate('reg2', { ephemeral: false, attachedProjectIds: ['p'] }),
			candidate('forked', { ephemeral: true }),
		];
		expect(idOf(router.select(step({ projectId: 'p' }), candidates, undefined, undefined, 'reg2'))).toBe('reg2');
	});

	it('ignores a previous worker that is not offered (not idle, or held by another run)', () => {
		const picked = router.select(step(), [candidate('w1'), candidate('w3')], undefined, undefined, 'w2');
		expect(idOf(picked)).toBe('w1');
	});

	it('ignores a previous worker the step does not accept (labels)', () => {
		const candidates = [candidate('w1', { labels: ['gpu'] }), candidate('w2', { labels: [] })];
		const picked = router.select(step({ labels: ['gpu'] }), candidates, undefined, undefined, 'w2');
		expect(idOf(picked)).toBe('w1');
	});

	it('ignores a previous worker of another project', () => {
		const candidates = [
			candidate('w1', { ephemeral: false, attachedProjectIds: ['p'] }),
			candidate('w2', { ephemeral: false, attachedProjectIds: ['other'] }),
		];
		const picked = router.select(step({ projectId: 'p' }), candidates, undefined, undefined, 'w2');
		expect(idOf(picked)).toBe('w1');
	});

	it('ignores a previous worker whose source guarantees too little (requires)', () => {
		const withGuarantees = new StepRouter(undefined, new DefaultStepDistribution(configDir), {
			requirementOnlyLookup: () => () => false,
			guaranteeLookup: () => sourceId => (sourceId === 'good' ? ['sandbox'] : []),
		});
		const candidates = [candidate('w1', { sourceId: 'good' }), candidate('w2', { sourceId: 'poor' })];
		const picked = withGuarantees.select(step({ requires: ['sandbox'] }), candidates, undefined, undefined, 'w2');
		expect(idOf(picked)).toBe('w1');
	});

	it('returns nothing, as before, when no worker is eligible, whatever the preference', () => {
		expect(router.select(step({ labels: ['gpu'] }), [candidate('w1')], undefined, undefined, 'w1')).toBeUndefined();
	});

	it('leaves the whole order to a custom distribution plugin', () => {
		const reverse: StepDistributionProvider = { order: candidates => [...candidates].reverse() };
		const custom = new StepRouter(undefined, reverse);
		const candidates = [candidate('w1'), candidate('w2'), candidate('w3')];
		expect(idOf(custom.select(step(), candidates, undefined, undefined, 'w1'))).toBe('w3');
	});
});

function writeLatestVersion(configDir: string, latestVersion: string): void {
	writeCache(cacheFilePath(configDir), { lastCheckedAt: Date.now(), latestVersion });
}
