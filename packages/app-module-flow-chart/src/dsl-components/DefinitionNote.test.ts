import type { FlowGraphResult } from 'flow-core';
import { describe, expect, it } from 'vitest';

import { definitionNoteOf } from './DefinitionNote.js';

type NoteInput = Pick<FlowGraphResult, 'definition' | 'execution'>;

const execution = { executionId: 'e1', status: 'completed', startedAt: '2026-10-24T10:00:00.000Z', completedAt: null };

describe('definitionNoteOf', () => {
	it('says a run is drawn from the definition it ran, with its version', () => {
		const input: NoteInput = {
			definition: { source: 'recorded', version: '1.2.0', snapshot: 'f/1.2.0-abcdef012345.yml' },
			execution,
		};
		expect(definitionNoteOf(input)).toBe('definition v1.2.0 as it ran');
	});

	it('warns that an older run is drawn from the flow file as it is now', () => {
		expect(definitionNoteOf({ definition: { source: 'flow-file' }, execution })).toBe(
			'definition read from the flow file as it is now (this run predates flow versions)'
		);
	});

	it('says nothing for a definition shown without a run', () => {
		expect(definitionNoteOf({ definition: { source: 'flow-file' } })).toBeUndefined();
	});
});
