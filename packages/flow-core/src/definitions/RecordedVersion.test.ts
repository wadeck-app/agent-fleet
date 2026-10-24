import { describe, expect, it } from 'vitest';

import { makeExec } from '../testing/makeExec.js';
import { versionColumnOf, versionDetailLineOf, versionNoteOf } from './RecordedVersion.js';

describe('RecordedVersion', () => {
	const recorded = makeExec({
		executionId: 'a',
		flowVersion: '1.2.0',
		definitionHash: 'abcdef0123456789'.repeat(4),
		definitionSnapshot: 'f/1.2.0-abcdef012345.yml',
		versionChoice: 'latest',
	});

	it('shows the recorded version in the list column', () => {
		expect(versionColumnOf(recorded)).toBe('1.2.0');
	});

	it('shows a dash for a record written before versions existed', () => {
		expect(versionColumnOf(makeExec({ executionId: 'a' }))).toBe('-');
	});

	it('describes how the version was chosen and which content ran', () => {
		expect(versionDetailLineOf(recorded)).toBe('1.2.0 (latest at run start, definition abcdef012345)');
		expect(versionDetailLineOf({ ...recorded, versionChoice: 'pinned' })).toBe(
			'1.2.0 (pinned by the request, definition abcdef012345)'
		);
		expect(versionDetailLineOf({ ...recorded, versionChoice: 'file' })).toBe(
			'1.2.0 (the flow file as it was, definition abcdef012345)'
		);
	});

	it('gives the note alone for a table cell', () => {
		expect(versionNoteOf(recorded)).toBe('latest at run start, definition abcdef012345');
		expect(versionNoteOf(makeExec({ executionId: 'a' }))).toBe('run started before flow versions existed');
	});

	it('says plainly when the version was not recorded', () => {
		expect(versionDetailLineOf(makeExec({ executionId: 'a' }))).toBe(
			'not recorded (run started before flow versions existed)'
		);
	});

	it('refuses a record with a version but no choice instead of guessing one', () => {
		expect(() => versionDetailLineOf({ ...recorded, versionChoice: undefined })).toThrow(/versionChoice/);
	});
});
