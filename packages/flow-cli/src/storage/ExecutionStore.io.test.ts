import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ExecutionMasks } from '../secrets/ExecutionMasks';
import { SecretMasker } from '../secrets/SecretMasker';
import { ExecutionStore } from './ExecutionStore';
import { StepIoRecorder } from './StepIoRecorder';

// Built at runtime from parts: a literal would trip secret scanners on the source file.
const TOKEN = ['tk', '_Ab3xY9', 'Q7z'].join('');
const EXEC_ID = 'abcd1234';

describe('ExecutionStore step io', () => {
	let dir: string;
	let masks: ExecutionMasks;
	let store: ExecutionStore;
	const readRecord = () =>
		JSON.parse(fs.readFileSync(path.join(dir, `${EXEC_ID}.json`), 'utf8')) as ReturnType<ExecutionStore['read']>;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-store-io-'));
		masks = new ExecutionMasks();
		masks.register(EXEC_ID, new SecretMasker(new Map([['API_TOKEN', TOKEN]])));
		store = new ExecutionStore(dir, 30, masks);
		store.create({ executionId: EXEC_ID, flowFile: 'f.yml', flowId: 'f', stepIds: ['a', 'b'] });
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it('records the inputs, outputs and stdout of a completed step', () => {
		store.markStepRunning(EXEC_ID, 'a');
		store.markStepCompleted(EXEC_ID, 'a', undefined, {
			capture: { inputs: { 'inputs.task': 'fix it' }, stdout: 'done\n' },
			outputs: { plan: 'one' },
		});

		const io = readRecord().steps['a']!.io!;
		expect(io.inputs['inputs.task']?.text).toBe('fix it');
		expect(io.outputs['plan']?.text).toBe('one');
		expect(io.stdout?.text).toBe('done\n');
	});

	it('records the outputs alone when the worker sent no capture (an older worker)', () => {
		store.markStepRunning(EXEC_ID, 'a');
		store.markStepCompleted(EXEC_ID, 'a', undefined, { capture: undefined, outputs: { plan: 'one' } });

		const io = readRecord().steps['a']!.io!;
		expect(io.inputs).toEqual({});
		expect(io.outputs['plan']?.text).toBe('one');
	});

	it('keeps the record free of io when the caller gave none (a skipped step)', () => {
		store.markStepCompleted(EXEC_ID, 'a');

		expect(readRecord().steps['a']).not.toHaveProperty('io');
	});

	it('records io on a failed step next to its legacy stdout and stderr', () => {
		store.markStepRunning(EXEC_ID, 'a');
		store.markStepFailed(EXEC_ID, 'a', 'boom', 'out', 'err', {
			capture: { inputs: { 'env.REGION': 'eu' }, stdout: 'out', stderr: 'err' },
			outputs: { stderr: 'err' },
		});

		const step = readRecord().steps['a']!;
		expect(step.stdout).toBe('out');
		expect(step.io?.inputs['env.REGION']?.text).toBe('eu');
		expect(step.io?.stderr?.text).toBe('err');
	});

	it('drops the io of the previous attempt when the step starts again', () => {
		store.markStepRunning(EXEC_ID, 'a');
		store.markStepCompleted(EXEC_ID, 'a', undefined, { capture: undefined, outputs: { plan: 'one' } });
		store.markStepRunning(EXEC_ID, 'a');

		expect(readRecord().steps['a']).not.toHaveProperty('io');
	});

	it('never writes the value of a secret in the io, whichever field carries it', () => {
		store.markStepRunning(EXEC_ID, 'a');
		store.markStepCompleted(EXEC_ID, 'a', undefined, {
			capture: { inputs: { 'env.T': TOKEN, prompt: `use ${TOKEN}` }, stdout: TOKEN, stderr: TOKEN },
			outputs: { echoed: TOKEN },
		});

		const raw = fs.readFileSync(path.join(dir, `${EXEC_ID}.json`), 'utf8');
		expect(raw).not.toContain(TOKEN);
		expect(raw).toContain('[secret:API_TOKEN]');
	});

	it('shares the execution budget between steps: the second step only gets what the first left', () => {
		const small = new StepIoRecorder((id, text) => masks.mask(id, text), {
			perValue: 50,
			perStep: 50,
			perExecution: 60,
		});
		const limited = new ExecutionStore(dir, 30, masks, undefined, small);
		limited.markStepRunning(EXEC_ID, 'a');
		limited.markStepCompleted(EXEC_ID, 'a', undefined, { capture: undefined, outputs: { x: 'x'.repeat(50) } });
		limited.markStepRunning(EXEC_ID, 'b');
		limited.markStepCompleted(EXEC_ID, 'b', undefined, { capture: undefined, outputs: { y: 'y'.repeat(50) } });

		const state = readRecord();
		expect(state.steps['a']!.io!.outputs['x']).toMatchObject({ truncated: false, chars: 50 });
		expect(state.steps['b']!.io!.outputs['y']).toMatchObject({ truncated: true, chars: 50 });
		expect(state.steps['b']!.io!.outputs['y']!.text).toHaveLength(10);
	});

	it('does not count the io a step is about to replace against the budget (a retry)', () => {
		const small = new StepIoRecorder((id, text) => masks.mask(id, text), {
			perValue: 50,
			perStep: 50,
			perExecution: 50,
		});
		const limited = new ExecutionStore(dir, 30, masks, undefined, small);
		for (let attempt = 0; attempt < 2; attempt++) {
			limited.markStepRunning(EXEC_ID, 'a');
			limited.markStepCompleted(EXEC_ID, 'a', undefined, { capture: undefined, outputs: { x: 'x'.repeat(50) } });
		}

		expect(readRecord().steps['a']!.io!.outputs['x']!.truncated).toBe(false);
	});
});
