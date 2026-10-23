import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ExecutionMasks } from '../secrets/ExecutionMasks';
import { SecretMasker } from '../secrets/SecretMasker';
import { ExecutionStore } from './ExecutionStore';

// Built at runtime from parts: a literal would trip secret scanners on the source file.
const TOKEN = ['tk', '_Ab3xY9', 'Q7z'].join('');
const EXEC_ID = 'abcd1234';

describe('ExecutionStore masking', () => {
	let dir: string;
	let store: ExecutionStore;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-store-mask-'));
		const masks = new ExecutionMasks();
		masks.register(EXEC_ID, new SecretMasker(new Map([['API_TOKEN', TOKEN]])));
		store = new ExecutionStore(dir, 30, masks);
		store.create({ executionId: EXEC_ID, flowFile: 'f.yml', flowId: 'f', stepIds: ['s'] });
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it('never writes the value of a secret into the record (error, stdout, stderr, lastError)', () => {
		store.markStepFailed(EXEC_ID, 's', `boom ${TOKEN}`, `out ${TOKEN}`, `err ${TOKEN}`);
		const raw = fs.readFileSync(path.join(dir, `${EXEC_ID}.json`), 'utf8');
		expect(raw).not.toContain(TOKEN);
		const state = JSON.parse(raw) as { lastError: string; steps: Record<string, { stdout: string }> };
		expect(state.lastError).toBe('boom [secret:API_TOKEN]');
		expect(state.steps['s']!.stdout).toBe('out [secret:API_TOKEN]');
	});
});
