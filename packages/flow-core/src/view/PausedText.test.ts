import { describe, expect, it } from 'vitest';

import { statusTag } from './CellText.js';
import { PAUSED_LABEL, isPaused, pausedLines } from './PausedText.js';
import { statusLabelOf } from './WorkspaceWaitText.js';

const paused = { since: '2026-11-22T10:00:00.000Z', reason: 'budget exceeded' };

describe('PausedText', () => {
	it('recognises a running run that carries paused, and nothing else', () => {
		expect(isPaused({ status: 'running', paused })).toBe(true);
		expect(isPaused({ status: 'running' })).toBe(false);
		expect(isPaused({ status: 'failed', paused })).toBe(false);
		// Accepted but nothing dispatched yet: still pausable, still shown as paused.
		expect(isPaused({ status: 'queued', paused })).toBe(true);
	});

	it('words the status as paused only while the run is paused', () => {
		expect(statusLabelOf({ status: 'running', paused })).toBe(PAUSED_LABEL);
		expect(statusLabelOf({ status: 'running' })).toBe('running');
	});

	it('prints the pause start, the reason and how to resume, nothing for a run that is not paused', () => {
		expect(pausedLines({ executionId: 'abc12345', status: 'running', paused })).toEqual([
			'Paused:    since 2026-11-22 10:00:00 UTC (no new step starts; running steps finish; resume with: flow unpause abc12345)',
			'Reason:    budget exceeded',
		]);
		expect(
			pausedLines({ executionId: 'abc12345', status: 'running', paused: { since: paused.since } })
		).toHaveLength(1);
		expect(pausedLines({ executionId: 'abc12345', status: 'running' })).toEqual([]);
	});

	it('tags a paused run in a narrow cell and refuses a paused flag on a run that is not running', () => {
		expect(statusTag('running', false, true)).toBe('paused');
		expect(() => statusTag('failed', false, true)).toThrow(/corrupt execution file/);
	});
});
