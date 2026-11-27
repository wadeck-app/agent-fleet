import { describe, expect, it } from 'vitest';

import { type PruneOutcome, PruneReport } from './PruneReport';

const item = { executionId: 'aaaaaaa1', flowId: 'probe', status: 'failed', startedAt: '2026-11-02T11:00:00.000Z' };
const base: PruneOutcome = { dryRun: false, items: [item], refused: [], snapshotsRemoved: 0, pluginMetaRemoved: 0 };

describe('PruneReport', () => {
	it('toJson names the list after what happened', () => {
		expect(PruneReport.toJson(base)).toEqual({ schema: 1, dryRun: false, deleted: [item], refused: [] });
		expect(PruneReport.toJson({ ...base, dryRun: true })).toEqual({
			schema: 1,
			dryRun: true,
			wouldDelete: [item],
			refused: [],
		});
	});

	it('renders a singular, side files and the left-in-place note after a real run', () => {
		const text = PruneReport.renderText({ ...base, snapshotsRemoved: 2, pluginMetaRemoved: 1 }, false);
		expect(text).toContain('Deleted 1 execution:');
		expect(text).toContain('2 leftover restart snapshot');
		expect(text).toContain('1 plugin workspace metadata');
		expect(text).toContain('.flow/runs/<id>.meta');
	});

	it('renders refusals and the two dry-run endings', () => {
		const refused = [{ executionId: 'aaaaaaa2', reason: 'running: not finished' }];
		const dry = { ...base, dryRun: true, refused };
		expect(PruneReport.renderText(dry, true)).toContain('Nothing deleted, rerun with --yes');
		expect(PruneReport.renderText(dry, false)).toContain('Nothing deleted (--dry-run)');
		expect(PruneReport.renderText(dry, true)).toContain('aaaaaaa2  running: not finished');
	});

	it('says nothing matched, without a deletion hint', () => {
		const text = PruneReport.renderText({ ...base, dryRun: true, items: [] }, true);
		expect(text).toBe('No finished execution matches the filters: nothing to delete.');
	});
});
