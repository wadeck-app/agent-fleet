import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { checkSecretInputs } from './SecretInputCheck';

// Built at runtime from parts: a literal would trip secret scanners on the source file.
const LITERAL = ['tk', '_Ab3xY9', 'Q7z'].join('');

describe('checkSecretInputs', () => {
	let dir: string;
	let flowFile: string;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-input-check-'));
		flowFile = path.join(dir, 'flow.yml');
		fs.writeFileSync(
			flowFile,
			[
				'id: f',
				'version: "1"',
				'name: f',
				'inputs:',
				'  API_TOKEN:',
				'    type: password',
				'  plain: string',
				'steps: []',
			].join('\n')
		);
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it('accepts env:// and file:// references', () => {
		expect(checkSecretInputs(flowFile, { API_TOKEN: 'env://T' })).toBeNull();
		expect(checkSecretInputs(flowFile, { API_TOKEN: 'file://./t.txt' })).toBeNull();
	});

	it('ignores non-secret inputs and a missing secret (the daemon decides whether it is required)', () => {
		expect(checkSecretInputs(flowFile, { plain: 'anything' })).toBeNull();
	});

	it('refuses a literal without echoing it, and says what to pass instead', () => {
		const message = checkSecretInputs(flowFile, { API_TOKEN: LITERAL })!;
		expect(message).toContain("'API_TOKEN'");
		expect(message).toContain('env://');
		expect(message).toContain('file://');
		expect(message).not.toContain(LITERAL);
	});

	it('refuses input:// and value://', () => {
		expect(checkSecretInputs(flowFile, { API_TOKEN: 'input://other' })).toContain("'API_TOKEN'");
		expect(checkSecretInputs(flowFile, { API_TOKEN: 'value://x' })).toContain("'API_TOKEN'");
	});

	it('does not read an unreadable flow: the daemon reports that', () => {
		expect(checkSecretInputs(path.join(dir, 'missing.yml'), { API_TOKEN: LITERAL })).toBeNull();
	});
});
