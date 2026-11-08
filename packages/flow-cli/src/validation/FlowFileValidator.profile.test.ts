import { DefinitionSnapshotStore } from 'flow-core';
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { validateFlowFile } from './FlowFileValidator';

let tmpDir: string;
let store: DefinitionSnapshotStore;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-validator-profile-'));
	store = new DefinitionSnapshotStore(path.join(tmpDir, 'definitions'));
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

function flowWith(extra: Record<string, unknown>, stepExtra: Record<string, unknown> = {}): string {
	const file = path.join(tmpDir, 'flow.yml');
	fs.writeFileSync(
		file,
		yaml.dump({
			id: 'p-flow',
			version: '1.0.0',
			name: 'P',
			description: 'd',
			workspace: 'in-place',
			...extra,
			steps: [{ id: 's', name: 'S', type: 'script', script: 'echo hi', ...stepExtra }],
		})
	);
	return file;
}

describe('validateFlowFile - profile', () => {
	it('accepts a known profile at flow and step level offline', () => {
		expect(validateFlowFile(flowWith({ profile: 'agent' }, { profile: 'untrusted-code' }), store)).toMatchObject({
			exit: 0,
			warnings: [],
		});
	});

	it('refuses an unknown profile with a did-you-mean and the known names in the printed message', () => {
		const result = validateFlowFile(flowWith({ profile: 'agnt' }), store);

		if (result.exit !== 1) throw new Error(`Expected exit 1, got ${JSON.stringify(result)}`);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]!.message).toContain('Did you mean "agent"?');
		expect(result.errors[0]!.message).toContain('hermetic-test');
	});

	it('refuses an unknown step profile', () => {
		const result = validateFlowFile(flowWith({}, { profile: 'strict' }), store);

		if (result.exit !== 1) throw new Error(`Expected exit 1, got ${JSON.stringify(result)}`);
		expect(result.errors[0]!.message).toContain("Step 's'");
		expect(result.errors[0]!.message).toContain('unknown profile "strict"');
	});
});

describe('validateFlowFile - note on the run-start check', () => {
	it('says that guarantee availability is only checked when the run starts, for a flow that uses a profile', () => {
		const result = validateFlowFile(flowWith({ profile: 'agent' }), store);

		if (result.exit !== 0) throw new Error(`Expected exit 0, got ${JSON.stringify(result)}`);
		expect(result.notes).toHaveLength(1);
		expect(result.notes?.[0]).toContain('checked when the run starts');
	});

	it('says it for a step profile and for requires too', () => {
		for (const result of [
			validateFlowFile(flowWith({}, { profile: 'inspect' }), store),
			validateFlowFile(flowWith({ requires: ['sandbox'] }), store),
		]) {
			if (result.exit !== 0) throw new Error(`Expected exit 0, got ${JSON.stringify(result)}`);
			expect(result.notes).toHaveLength(1);
		}
	});

	it('has no note for a flow without profile or requires', () => {
		const result = validateFlowFile(flowWith({}), store);

		if (result.exit !== 0) throw new Error(`Expected exit 0, got ${JSON.stringify(result)}`);
		expect(result.notes).toBeUndefined();
	});
});

describe('validateFlowFile - workerType deprecation', () => {
	it('prints the warning with the replacement for workerType: sandbox, exit stays 0', () => {
		const result = validateFlowFile(flowWith({ workerType: 'sandbox' }), store);

		if (result.exit !== 0) throw new Error(`Expected exit 0, got ${JSON.stringify(result)}`);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toContain('workerType "sandbox" is deprecated');
		expect(result.warnings[0]).toContain('requires: [sandbox]');
	});

	it('prints nothing without workerType', () => {
		expect(validateFlowFile(flowWith({}), store)).toMatchObject({ exit: 0, warnings: [] });
	});
});
