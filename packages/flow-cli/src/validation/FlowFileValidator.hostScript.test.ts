import { DefinitionSnapshotStore } from 'flow-core';
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { validateFlowFile } from './FlowFileValidator';

let tmpDir: string;
let store: DefinitionSnapshotStore;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-validator-host-'));
	store = new DefinitionSnapshotStore(path.join(tmpDir, 'definitions'));
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

function flowWith(...steps: Record<string, unknown>[]): string {
	const file = path.join(tmpDir, 'flow.yml');
	fs.writeFileSync(
		file,
		yaml.dump({ id: 'h-flow', version: '1.0.0', name: 'H', description: 'd', workspace: 'in-place', steps })
	);
	return file;
}

const script = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
	id,
	name: id,
	type: 'script',
	script: 'ls',
	shell: 'bash',
	...extra,
});
const model = (id: string): Record<string, unknown> => ({ id, name: id, type: 'model', prompt: 'p' });

describe('validateFlowFile - host script marker', () => {
	it('prints HOST_SCRIPT_WITH_MODEL_STEPS for a host script next to a model step, naming the step and both fixes; exit stays 0', () => {
		const result = validateFlowFile(flowWith(model('agent'), script('lister', { host: true })), store);

		if (result.exit !== 0) throw new Error(`Expected exit 0, got ${JSON.stringify(result)}`);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toContain("'lister'");
		expect(result.warnings[0]).toContain("user's rights");
		expect(result.warnings[0]).toContain('Remove `host: true`');
	});

	it('prints nothing for host: false, or for a host script without model step', () => {
		expect(validateFlowFile(flowWith(model('agent'), script('s', { host: false })), store)).toMatchObject({
			exit: 0,
			warnings: [],
		});
		expect(validateFlowFile(flowWith(script('s', { host: true })), store)).toMatchObject({ exit: 0, warnings: [] });
	});

	it('refuses host on a model step with exit 1, naming the step', () => {
		const result = validateFlowFile(flowWith({ ...model('agent'), host: true }), store);

		if (result.exit !== 1) throw new Error(`Expected exit 1, got ${JSON.stringify(result)}`);
		expect(result.errors[0]!.message).toContain("'agent'");
		expect(result.errors[0]!.message).toContain('host');
	});

	it('refuses a templated host with exit 1', () => {
		const result = validateFlowFile(flowWith(script('s', { host: '${{ inputs.where }}' })), store);

		if (result.exit !== 1) throw new Error(`Expected exit 1, got ${JSON.stringify(result)}`);
		expect(result.errors[0]!.message).toContain('static');
	});
});
