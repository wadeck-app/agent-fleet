import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readRetryPolicies } from './RetryPolicyFile.js';

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
