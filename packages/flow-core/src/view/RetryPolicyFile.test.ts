import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { definitionsDirOf } from '../config/FlowConfigLayout.js';
import { hashDefinition } from '../definitions/DefinitionHash.js';
import { DefinitionSnapshotStore } from '../definitions/DefinitionSnapshotStore.js';
import { makeExec } from '../testing/makeExec.js';
import { readRecordedRetryPolicies, readRetryPolicies } from './RetryPolicyFile.js';

let directory: string;

beforeEach(() => {
	directory = fs.mkdtempSync(path.join(os.tmpdir(), 'retry-policy-'));
});

afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

describe('readRetryPolicies', () => {
	it('reads the retry budget of each step of the flow file', () => {
		const file = path.join(directory, 'flow.yml');
		fs.writeFileSync(
			file,
			'id: f\nsteps:\n  - { id: a, retry: { maxAttempts: 2, backoff: linear } }\n  - { id: b }\n'
		);
		expect(readRetryPolicies(file)).toEqual({ a: { retryBudget: 2 }, b: { retryBudget: 0 } });
	});

	it('answers undefined when the file is gone (a flow generated for one run is deleted afterwards)', () => {
		expect(readRetryPolicies(path.join(directory, 'missing.yml'))).toBeUndefined();
	});

	it('answers undefined when the file is not a flow definition', () => {
		const file = path.join(directory, 'bad.yml');
		fs.writeFileSync(file, 'just: a mapping');
		expect(readRetryPolicies(file)).toBeUndefined();
	});
});

describe('readRecordedRetryPolicies', () => {
	const definition = { id: 'f', steps: [{ id: 'a', retry: { maxAttempts: 3, backoff: 'linear' } }] };

	it('reads the budget from the definition the run recorded, not from the edited flow file', () => {
		const file = path.join(directory, 'flow.yml');
		fs.writeFileSync(file, 'id: f\nsteps:\n  - { id: a }\n');
		const ref = new DefinitionSnapshotStore(definitionsDirOf(directory)).save({
			flowId: 'f',
			version: '1.0.0',
			hash: hashDefinition(definition),
			text: JSON.stringify(definition),
		}).ref;

		const policies = readRecordedRetryPolicies(
			makeExec({ executionId: 'a', flowId: 'f', flowFile: file, definitionSnapshot: ref }),
			definitionsDirOf(directory)
		);

		expect(policies).toEqual({ a: { retryBudget: 3 } });
	});

	it('answers undefined, not the current file, when the recorded snapshot is gone', () => {
		const file = path.join(directory, 'flow.yml');
		fs.writeFileSync(file, 'id: f\nsteps:\n  - { id: a }\n');

		expect(
			readRecordedRetryPolicies(
				makeExec({ executionId: 'a', flowFile: file, definitionSnapshot: 'f/1.0.0-abcdef012345.yml' }),
				definitionsDirOf(directory)
			)
		).toBeUndefined();
	});

	it('uses the flow file for a record written before versions existed', () => {
		const file = path.join(directory, 'flow.yml');
		fs.writeFileSync(file, 'id: f\nsteps:\n  - { id: a, retry: { maxAttempts: 1 } }\n');

		expect(readRecordedRetryPolicies(makeExec({ executionId: 'a', flowFile: file }), directory)).toEqual({
			a: { retryBudget: 1 },
		});
	});
});
