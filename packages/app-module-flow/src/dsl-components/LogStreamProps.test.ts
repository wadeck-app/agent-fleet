import { describe, expect, it } from 'vitest';

import { LOG_STREAM_KEYS, parseLogStreamEntries, parseLogStreamSteps, readLogStreamProps } from './LogStreamProps.js';

const ENTRY = {
	timestamp: '2026-10-24T21:36:47.025Z',
	level: 'info',
	stepId: 'plan',
	preview: 'Launching sonnet',
	expandable: false,
	markdown: '',
	subjectStepId: null,
	stepOrder: 7,
	stepDepth: 0,
	attempt: 1,
	attempts: 1,
	offsetMs: 8_000,
	deltaMs: null,
};

const STEP = {
	stepId: 'plan',
	order: 7,
	depth: 0,
	parentId: null,
	status: 'completed',
	attempts: 1,
	lineCount: 3,
	startOffsetMs: 8_000,
	endOffsetMs: 53_000,
	durationMs: 45_000,
};

describe('readLogStreamProps', () => {
	it('resolves the declared keys against the context and lists the others', () => {
		const props = readLogStreamProps(
			{
				$type: 'flow:LogStream',
				entries: '$rows',
				steps: [],
				runDurationMs: 5,
				emptyMessage: 'none',
				style: 'x',
			},
			{ rows: [ENTRY] }
		);
		expect(props.entries).toEqual([ENTRY]);
		expect(props.runDurationMs).toBe(5);
		expect(props.unexpectedKeys).toEqual(['style']);
	});

	it('declares the keys the view may use', () => {
		expect(LOG_STREAM_KEYS).toEqual(['entries', 'steps', 'runDurationMs', 'emptyMessage']);
	});
});

describe('parseLogStreamEntries', () => {
	it('returns typed entries', () => {
		expect(parseLogStreamEntries([ENTRY])).toEqual([ENTRY]);
	});

	it('refuses a value that is not a list', () => {
		expect(() => parseLogStreamEntries('x')).toThrow(/entries must be a list/);
	});

	it.each([
		['timestamp', 3, /entry 0 needs a text timestamp/],
		['level', 'loud', /entry 0 has the level "loud"/],
		['expandable', 'yes', /entry 0 needs a true or false expandable/],
		['subjectStepId', 4, /entry 0 needs a text or null subjectStepId/],
		['stepOrder', 'a', /entry 0 needs a whole number or null stepOrder/],
		['offsetMs', undefined, /entry 0 needs a number offsetMs/],
		['deltaMs', 'a', /entry 0 needs a number or null deltaMs/],
	])('names the entry and the field when %s is wrong', (field, value, message) => {
		expect(() => parseLogStreamEntries([{ ...ENTRY, [field]: value }])).toThrow(message);
	});
});

describe('parseLogStreamSteps', () => {
	it('returns typed steps', () => {
		expect(parseLogStreamSteps([STEP])).toEqual([STEP]);
	});

	it('accepts a step that never started', () => {
		const pending = { ...STEP, order: null, startOffsetMs: null, endOffsetMs: null, durationMs: null };
		expect(parseLogStreamSteps([pending])).toEqual([pending]);
	});

	it('refuses a value that is not a list', () => {
		expect(() => parseLogStreamSteps(undefined)).toThrow(/steps must be a list/);
	});

	it.each([
		['stepId', 3, /step 0 needs a text stepId/],
		['status', 'weird', /step 0 has the status "weird"/],
		['parentId', 4, /step 0 needs a text or null parentId/],
		['lineCount', 'x', /step 0 needs a number lineCount/],
		['durationMs', 'x', /step 0 needs a number or null durationMs/],
	])('names the step and the field when %s is wrong', (field, value, message) => {
		expect(() => parseLogStreamSteps([{ ...STEP, [field]: value }])).toThrow(message);
	});
});
