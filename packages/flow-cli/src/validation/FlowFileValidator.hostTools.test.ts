import { DefinitionSnapshotStore } from 'flow-core';
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { validateFlowFile } from './FlowFileValidator';

const WARN = { mode: 'warn', description: 'warning (validation.hostToolsUnderConfinedProfile=warn, default)' } as const;
const ERROR = { mode: 'error', description: 'error (validation.hostToolsUnderConfinedProfile=error)' } as const;

let tmpDir: string;
let store: DefinitionSnapshotStore;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-validator-hosttools-'));
	store = new DefinitionSnapshotStore(path.join(tmpDir, 'definitions'));
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

function confinedFlow(): string {
	const file = path.join(tmpDir, 'flow.yml');
	fs.writeFileSync(
		file,
		yaml.dump({
			id: 'h-flow',
			version: '1.0.0',
			name: 'H',
			description: 'd',
			workspace: 'in-place',
			profile: 'agent',
			steps: [
				{
					id: 'ask',
					name: 'ask',
					type: 'model',
					prompt: 'p',
					hostTools: [
						{
							id: 'show-version',
							description: 'Prints the git version.',
							sideEffect: 'read',
							command: ['git', '--version'],
						},
					],
				},
			],
		})
	);
	return file;
}

describe('validateFlowFile - hostTools under a confined profile', () => {
	it('warns, exit 0, with the setting that applied, in warn mode', () => {
		const result = validateFlowFile(confinedFlow(), store, WARN);

		if (result.exit !== 0) throw new Error(`Expected exit 0, got ${JSON.stringify(result)}`);
		expect(JSON.stringify(result.warnings)).toContain(WARN.description);
	});

	it('fails, exit 1, with the setting that applied, in error mode', () => {
		const result = validateFlowFile(confinedFlow(), store, ERROR);

		if (result.exit !== 1) throw new Error(`Expected exit 1, got ${JSON.stringify(result)}`);
		expect(JSON.stringify(result.errors)).toContain(ERROR.description);
	});
});
