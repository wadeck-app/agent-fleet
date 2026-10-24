import { DefinitionSnapshotStore, hashDefinition } from 'flow-core';
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { validateFlowFile } from './FlowFileValidator';

const SIMPLE_FLOW = path.resolve(__dirname, '../test-utils/fixtures/simple-flow.yml');
const INVALID_FLOW = path.resolve(__dirname, '../test-utils/fixtures/invalid-flow.yml');

let tmpDir: string;
let store: DefinitionSnapshotStore;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-validator-test-'));
	store = new DefinitionSnapshotStore(path.join(tmpDir, 'definitions'));
});

afterEach(() => {
	vi.restoreAllMocks();
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('validateFlowFile', () => {
	it('returns exit 0 for a valid flow YAML', () => {
		const result = validateFlowFile(SIMPLE_FLOW, store);
		expect(result.exit).toBe(0);
	});

	it('returns exit 1 with errors for a flow with invalid dependencies', () => {
		const result = validateFlowFile(INVALID_FLOW, store);
		expect(result.exit).toBe(1);
		if (result.exit !== 1) throw new Error('Expected exit 1');
		expect(result.errors.length).toBeGreaterThan(0);
	});

	it('returns exit 2 with "File not found" for a non-existent file', () => {
		const result = validateFlowFile('/no/such/file/does-not-exist.yml', store);
		expect(result.exit).toBe(2);
		if (result.exit !== 2) throw new Error('Expected exit 2');
		expect(result.message).toContain('File not found');
	});

	it('returns exit 3 with parse_error type for malformed YAML', () => {
		const tmpFile = path.join(tmpDir, 'bad.yml');
		fs.writeFileSync(tmpFile, 'key: [bad yaml: {{');
		const result = validateFlowFile(tmpFile, store);
		expect(result.exit).toBe(3);
		if (result.exit !== 3) throw new Error('Expected exit 3');
		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.errors[0].type).toBe('parse_error');
	});

	it('returns exit 3 with parse_error type when YAML root is an array', () => {
		const tmpFile = path.join(tmpDir, 'array.yml');
		fs.writeFileSync(tmpFile, '- item1\n- item2\n');
		const result = validateFlowFile(tmpFile, store);
		expect(result.exit).toBe(3);
		if (result.exit !== 3) throw new Error('Expected exit 3');
		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.errors[0].type).toBe('parse_error');
	});
});

describe('validateFlowFile versions', () => {
	const baseFlow = (version: string | undefined, script = 'echo hi') => ({
		id: 'versioned',
		...(version === undefined ? {} : { version }),
		name: 'Versioned',
		description: 'd',
		workspace: { mode: 'manual', gitStrategy: 'any', reusePolicy: 'if-available' },
		steps: [{ id: 's', name: 'S', type: 'script', script }],
	});
	const write = (flow: object): string => {
		const file = path.join(tmpDir, 'versioned.yml');
		fs.writeFileSync(file, yaml.dump(flow));
		return file;
	};

	it('reports the version of a valid flow, with no warning', () => {
		expect(validateFlowFile(write(baseFlow('1.2.0')), store)).toEqual({ exit: 0, version: '1.2.0', warnings: [] });
	});

	it('warns, without failing, about a flow without a version', () => {
		const result = validateFlowFile(write(baseFlow(undefined)), store);
		if (result.exit !== 0) throw new Error('Expected exit 0');
		expect(result.version).toBe('0.0.0');
		expect(result.warnings[0]).toMatch(/has no version.*version: '1\.0\.0'/);
	});

	it('fails an invalid version with how to write one', () => {
		const result = validateFlowFile(write({ ...baseFlow('1.0.0'), version: '1.0' }), store);
		expect(result.exit).toBe(1);
		if (result.exit !== 1) throw new Error('Expected exit 1');
		expect(result.errors[0]).toMatchObject({ type: 'version' });
		expect(result.errors[0]!.message).toContain('MAJOR.MINOR.PATCH');
	});

	it('fails the same version with different content as a run would, telling to bump it', () => {
		const first = baseFlow('1.0.0');
		store.save({ flowId: 'versioned', version: '1.0.0', hash: hashDefinition(first), text: 'x' });

		const result = validateFlowFile(write(baseFlow('1.0.0', 'echo edited')), store);

		expect(result.exit).toBe(1);
		if (result.exit !== 1) throw new Error('Expected exit 1');
		expect(result.errors[0]!.message).toMatch(/same version 1\.0\.0 but different content.*bump the version/);
	});

	it('warns when new content has a version below the latest known one', () => {
		const known = baseFlow('2.0.0');
		store.save({ flowId: 'versioned', version: '2.0.0', hash: hashDefinition(known), text: 'x' });

		const result = validateFlowFile(write(baseFlow('1.0.0', 'echo old')), store);

		if (result.exit !== 0) throw new Error('Expected exit 0');
		expect(result.warnings[0]).toMatch(/lower than the latest known version 2\.0\.0/);
	});
});

describe('validateFlowFile on a flow registry file', () => {
	const writeRaw = (name: string, text: string): string => {
		const file = path.join(tmpDir, name);
		fs.writeFileSync(file, text);
		return file;
	};
	const flowBody = { name: 'A flow', steps: [{ type: 'script', id: 's', script: 'echo hi' }] };

	it('reports a file with an includes key as a registry, listing the included files', () => {
		const file = writeRaw('flows.yml', yaml.dump({ includes: ['flows-custom.yml'], 'my-flow': flowBody }));

		const result = validateFlowFile(file, store);

		if (result.exit !== 4) throw new Error(`Expected exit 4, got ${JSON.stringify(result)}`);
		expect(result.includes).toEqual(['flows-custom.yml']);
		expect(result.flowIds).toEqual(['my-flow']);
		expect(result.message).toContain('is a flow registry');
		expect(result.message).toContain('includes:');
		expect(result.message).toContain('flow validate <path-to-flow-file>');
	});

	it('reports a top-level map of flows without includes as a registry', () => {
		const file = writeRaw('flows.yml', yaml.dump({ 'flow-a': flowBody, 'flow-b': flowBody }));

		const result = validateFlowFile(file, store);

		if (result.exit !== 4) throw new Error(`Expected exit 4, got ${JSON.stringify(result)}`);
		expect(result.flowIds).toEqual(['flow-a', 'flow-b']);
		expect(result.includes).toEqual([]);
		expect(result.message).toContain('lists flows');
	});

	it('does not treat a single flow as a registry', () => {
		expect(validateFlowFile(SIMPLE_FLOW, store).exit).toBe(0);
	});
});
