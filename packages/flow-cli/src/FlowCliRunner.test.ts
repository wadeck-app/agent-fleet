import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FlowCliRunner } from './FlowCliRunner.js';

const mockExecute = vi.fn();
const mockLoadProjectFlows = vi.fn();
const mockGetFlow = vi.fn();
const mockRegisterFlow = vi.fn();

vi.mock('flow-engine', () => ({
	FlowExecutor: vi.fn(function () {
		return { execute: mockExecute };
	}),
	FlowRegistry: vi.fn(function () {
		return {
			loadProjectFlows: mockLoadProjectFlows,
			getFlow: mockGetFlow,
			registerFlow: mockRegisterFlow,
		};
	}),
}));

vi.mock('fs');
import * as fs from 'fs';
const mockedFs = vi.mocked(fs);

// Reset fs property assignments between tests — vi.clearAllMocks() doesn't cover these
function resetFsMocks() {
	mockedFs.existsSync = vi.fn().mockReturnValue(false);
	mockedFs.readFileSync = vi.fn().mockReturnValue('');
}

vi.mock('js-yaml', () => ({
	load: vi.fn(),
	JSON_SCHEMA: {},
}));
import * as yaml from 'js-yaml';
const mockYamlLoad = vi.mocked(yaml.load);

const STUB_FLOW = { id: 'test-flow', name: 'Test', steps: [], workspace: { mode: 'manual' } };
const SUCCESS_RESULT = { success: true, outputs: {}, error: undefined };

describe('FlowCliRunner', () => {
	beforeEach(() => {
		resetFsMocks();
		mockLoadProjectFlows.mockResolvedValue(undefined);
		mockGetFlow.mockReturnValue(STUB_FLOW);
		mockExecute.mockResolvedValue(SUCCESS_RESULT);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('resolves a flow by ID when flowRef is not a file path', async () => {
		const runner = new FlowCliRunner('/project');
		await runner.run({ flowRef: 'my-flow-id' });

		expect(mockGetFlow).toHaveBeenCalledWith('my-flow-id');
		expect(mockExecute).toHaveBeenCalled();
	});

	it('loads flow from file when flowRef resolves to an existing file', async () => {
		mockedFs.existsSync = vi.fn().mockReturnValue(true);
		mockedFs.readFileSync = vi.fn().mockReturnValue('content');
		mockYamlLoad.mockReturnValue({ id: 'file-flow', steps: [] });

		const runner = new FlowCliRunner('/project');
		await runner.run({ flowRef: 'my-flow.yml', cwd: '/project' });

		expect(mockRegisterFlow).toHaveBeenCalledWith(expect.objectContaining({ id: 'file-flow' }));
		expect(mockGetFlow).toHaveBeenCalledWith('file-flow');
	});

	it('throws when flowRef is not a file and not found in registry', async () => {
		mockGetFlow.mockReturnValue(undefined);
		const runner = new FlowCliRunner('/project');

		await expect(runner.run({ flowRef: 'unknown-flow' })).rejects.toThrow("Flow not found: 'unknown-flow'");
	});

	it('throws when YAML file has no id field', async () => {
		mockedFs.existsSync = vi.fn().mockReturnValue(true);
		mockedFs.readFileSync = vi.fn().mockReturnValue('content');
		mockYamlLoad.mockReturnValue({ steps: [] }); // no id

		const runner = new FlowCliRunner('/project');
		await expect(runner.run({ flowRef: 'no-id.yml', cwd: '/project' })).rejects.toThrow("string 'id' field");
	});

	it('throws when YAML file content is not an object', async () => {
		mockedFs.existsSync = vi.fn().mockReturnValue(true);
		mockedFs.readFileSync = vi.fn().mockReturnValue('content');
		mockYamlLoad.mockReturnValue('just a string');

		const runner = new FlowCliRunner('/project');
		await expect(runner.run({ flowRef: 'bad.yml', cwd: '/project' })).rejects.toThrow('valid object');
	});

	it('wraps registerFlow errors with the filename', async () => {
		mockedFs.existsSync = vi.fn().mockReturnValue(true);
		mockedFs.readFileSync = vi.fn().mockReturnValue('content');
		mockYamlLoad.mockReturnValue({ id: 'bad-flow' });
		mockRegisterFlow.mockImplementation(() => { throw new Error('invalid step'); });

		const runner = new FlowCliRunner('/project');
		await expect(runner.run({ flowRef: 'bad.yml', cwd: '/project' })).rejects.toThrow('bad.yml');
	});

	it('passes cwd as workspace path', async () => {
		const runner = new FlowCliRunner('/my-project');
		await runner.run({ flowRef: 'my-flow', cwd: '/my-project' });

		expect(mockExecute).toHaveBeenCalledWith(
			expect.objectContaining({
				workspace: expect.objectContaining({ path: '/my-project', mode: 'manual' }),
			}),
		);
	});

	it('passes parsed inputs to executor', async () => {
		const runner = new FlowCliRunner('/project');
		await runner.run({ flowRef: 'my-flow', inputs: { foo: 'bar' } });

		expect(mockExecute).toHaveBeenCalledWith(
			expect.objectContaining({ inputs: { foo: 'bar' } }),
		);
	});

	it('resolves relative flowRef against cwd, not process.cwd()', async () => {
		mockedFs.existsSync = vi.fn().mockImplementation((p: unknown) => {
			return p === path.resolve('/custom-cwd', 'relative-flow.yml');
		});
		mockedFs.readFileSync = vi.fn().mockReturnValue('content');
		mockYamlLoad.mockReturnValue({ id: 'relative-flow' });

		const runner = new FlowCliRunner('/custom-cwd');
		await runner.run({ flowRef: 'relative-flow.yml', cwd: '/custom-cwd' });

		expect(mockRegisterFlow).toHaveBeenCalled();
	});
});
