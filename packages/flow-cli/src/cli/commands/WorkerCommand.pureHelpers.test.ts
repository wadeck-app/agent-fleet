import { describe, expect, it } from 'vitest';

import { buildReExecArgs, isNewerVersionAvailable } from './WorkerCommand';

describe('buildReExecArgs', () => {
	it('includes --source only when a sourceId is present', () => {
		expect(
			buildReExecArgs({
				sourceId: 'src-1',
				token: 'tok',
				extraProjects: [],
				labels: [],
				verbose: false,
				interactive: false,
			})
		).toEqual(['--source', 'src-1', '--token', 'tok']);

		expect(
			buildReExecArgs({
				sourceId: undefined,
				token: 'tok',
				extraProjects: [],
				labels: [],
				verbose: false,
				interactive: false,
			})
		).toEqual(['--token', 'tok']);
	});

	it('repeats --project for each extra project, in order', () => {
		const args = buildReExecArgs({
			sourceId: undefined,
			token: 'tok',
			extraProjects: ['/a', '/b'],
			labels: [],
			verbose: false,
			interactive: false,
		});
		expect(args).toEqual(['--token', 'tok', '--project', '/a', '--project', '/b']);
	});

	it('joins labels with commas, and omits --labels entirely when there are none', () => {
		const withLabels = buildReExecArgs({
			sourceId: undefined,
			token: 'tok',
			extraProjects: [],
			labels: ['a', 'b'],
			verbose: false,
			interactive: false,
		});
		expect(withLabels).toContain('--labels');
		expect(withLabels).toContain('a,b');

		const withoutLabels = buildReExecArgs({
			sourceId: undefined,
			token: 'tok',
			extraProjects: [],
			labels: [],
			verbose: false,
			interactive: false,
		});
		expect(withoutLabels).not.toContain('--labels');
	});

	it('includes --verbose and --interactive only when true', () => {
		const both = buildReExecArgs({
			sourceId: undefined,
			token: 'tok',
			extraProjects: [],
			labels: [],
			verbose: true,
			interactive: true,
		});
		expect(both).toContain('--verbose');
		expect(both).toContain('--interactive');

		const neither = buildReExecArgs({
			sourceId: undefined,
			token: 'tok',
			extraProjects: [],
			labels: [],
			verbose: false,
			interactive: false,
		});
		expect(neither).not.toContain('--verbose');
		expect(neither).not.toContain('--interactive');
	});
});

describe('isNewerVersionAvailable', () => {
	it('is false when the cache has no latestVersion yet', () => {
		expect(isNewerVersionAvailable('2026.10.10-100000-5-abc', null, undefined)).toBe(false);
	});

	it('is false when the latest version is the same as, or older than, the current one', () => {
		expect(isNewerVersionAvailable('5.0.0', '5.0.0', undefined)).toBe(false);
		expect(isNewerVersionAvailable('5.0.0', '4.0.0', undefined)).toBe(false);
	});

	it('is true when the latest version is strictly newer and has not been handled yet', () => {
		expect(isNewerVersionAvailable('5.0.0', '6.0.0', undefined)).toBe(true);
	});

	it('is false (idempotent) once that same version has already been recorded as handled', () => {
		expect(isNewerVersionAvailable('5.0.0', '6.0.0', '6.0.0')).toBe(false);
	});

	it('is true again for a further version bump past the last handled one', () => {
		expect(isNewerVersionAvailable('5.0.0', '7.0.0', '6.0.0')).toBe(true);
	});
});
