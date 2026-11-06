import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RunMounts } from '../RunMounts';
import { RecordingSandboxLog } from '../testing/RecordingSandboxLog';
import { ASSIGNMENT_SCOPED_TYPES, type ActiveAssignment, type JsonObject, MAX_FRAME_BYTES } from './HarnessMessages';
import { type InsideDecision, InsideMessageGuard } from './InsideMessageGuard';
import { ReturnedPaths } from './ReturnedPaths';

const ASSIGNMENT: ActiveAssignment = { assignmentId: 'a1', executionId: 'exec1', stepId: 'build', stepType: 'script' };
const MODEL_ASSIGNMENT: ActiveAssignment = { ...ASSIGNMENT, stepType: 'model' };

let root: string;
let mounts: RunMounts;
let log: RecordingSandboxLog;

beforeEach(() => {
	root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'flow-guard-')));
	fs.mkdirSync(path.join(root, 'ws'));
	fs.mkdirSync(path.join(root, 'ws.meta'));
	log = new RecordingSandboxLog();
	mounts = new RunMounts({
		workspaceDir: path.join(root, 'ws'),
		workspaceMetaDir: path.join(root, 'ws.meta'),
		platform: process.platform,
		log,
	});
});

afterEach(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

function guard(assignment: ActiveAssignment | null = ASSIGNMENT, maxInjectedSteps?: number): InsideMessageGuard {
	const instance = new InsideMessageGuard({
		log,
		returnedPaths: () => new ReturnedPaths(mounts),
		...(maxInjectedSteps === undefined ? {} : { maxInjectedSteps }),
	});
	if (assignment !== null) instance.begin(assignment);
	return instance;
}

function scoped(type: string, extra: JsonObject = {}): string {
	return JSON.stringify({ type, assignmentId: 'a1', executionId: 'exec1', stepId: 'build', ...extra });
}

function forwarded(decision: InsideDecision): JsonObject {
	if (decision.action !== 'forward') throw new Error(`expected forward, got ${JSON.stringify(decision)}`);
	return decision.message;
}

// What the worker adds when it fits a result to the frame limit must reach the daemon (the retry decision depends on it).
describe('InsideMessageGuard: the fields of a fitted result', () => {
	it.each([
		{ type: 'step_completed', extra: { truncated: [{ field: 'io.stdout', originalBytes: 9, keptBytes: 3 }] } },
		{ type: 'step_failed', extra: { error: 'too big', origin: 'engine' } },
	])('keeps them on a $type', ({ type, extra }) => {
		const decision = guard().handle(scoped(type, { output: {}, ...extra }));

		expect(forwarded(decision)).toMatchObject(extra);
	});
});

describe('InsideMessageGuard: the allowed messages', () => {
	it('forwards log, started and progress for the active assignment, rebuilt from the known fields', () => {
		const instance = guard();

		const started = forwarded(instance.handle(scoped('step_started', { evil: 'x' })));
		const logMessage = forwarded(instance.handle(scoped('log', { entry: { message: 'hi' }, evil: 'x' })));
		const progress = forwarded(
			instance.handle(scoped('step_progress', { activity: null, lastCompletedTool: 'Bash', evil: 'x' }))
		);

		expect(started).toEqual({ type: 'step_started', assignmentId: 'a1', executionId: 'exec1', stepId: 'build' });
		expect(logMessage).toEqual({ ...started, type: 'log', entry: { message: 'hi' } });
		expect(progress).toEqual({ ...started, type: 'step_progress', activity: null, lastCompletedTool: 'Bash' });
	});

	it('forwards step_completed with output, meta and io (marks the outcome terminal), defaulting a missing output to an empty object', () => {
		const instance = guard();
		instance.handle(scoped('step_started'));

		const decision = instance.handle(
			scoped('step_completed', { output: { a: '1' }, meta: { exit_code: 0 }, io: { inputs: {} }, secret: 'x' })
		);

		expect(decision).toMatchObject({ action: 'forward', terminal: true });
		expect(forwarded(decision)).toEqual({
			type: 'step_completed',
			assignmentId: 'a1',
			executionId: 'exec1',
			stepId: 'build',
			output: { a: '1' },
			meta: { exit_code: 0 },
			io: { inputs: {} },
		});
		expect(instance.finished).toBe(true);
		expect(forwarded(guard().handle(scoped('step_completed')))['output']).toEqual({});
	});

	it('forwards step_failed with its error, stdout and stderr, and refuses one without an error text', () => {
		const message = forwarded(guard().handle(scoped('step_failed', { error: 'boom', stdout: 'o', stderr: 'e' })));
		expect(message).toMatchObject({ type: 'step_failed', error: 'boom', stdout: 'o', stderr: 'e' });

		expect(guard().handle(scoped('step_failed')).action).toBe('drop');
		expect(log.text()).toContain('without an error text');
	});

	it('announces the wrapper registration after the outcome, once', () => {
		const instance = guard();
		instance.handle(scoped('step_completed'));

		expect(instance.handle(JSON.stringify({ type: 'ready', pid: 1 }))).toEqual({ action: 'free' });
		expect(instance.handle(JSON.stringify({ type: 'ready', pid: 1 })).action).toBe('absorb');
	});

	it('absorbs the registration of a freshly started inner worker (no active assignment)', () => {
		const instance = guard(null);

		const decision = instance.handle(JSON.stringify({ type: 'ready', pid: 7, labels: ['evil'], authToken: 'x' }));

		expect(decision).toEqual({ action: 'absorb', reason: 'registration of the inner worker' });
		expect(log.text()).toBe('');
	});
});

describe('InsideMessageGuard: forged, unexpected and malformed messages are dropped and logged', () => {
	it('drops EVERY message type outside the allow-list, even with the ids of the active assignment, and keeps working', () => {
		const allowed = new Set<string>([...ASSIGNMENT_SCOPED_TYPES, 'ready']);
		// Daemon-to-worker and registration types a forged inner worker may try, look-alikes of the allowed ones
		// (case, whitespace, separators, prefixes) and names that live on Object.prototype.
		const hostile = [
			'assign',
			'source_ready',
			'idle',
			'done',
			'shutdown_daemon',
			'shutdown',
			'cancel',
			'cancel_step',
			'abort',
			'ping',
			'pong',
			'heartbeat',
			'register',
			'unregister',
			'reconnect',
			'user_input',
			'input',
			'assignment',
			'step_cancelled',
			'step_skipped',
			'step_started_',
			'steps_started',
			'inject-steps',
			'injectSteps',
			'inject_step',
			'Log',
			'LOG',
			'Ready',
			'READY',
			'STEP_COMPLETED',
			'Step_Failed',
			'log ',
			' log',
			'log\n',
			'log\0',
			'step_completed\t',
			'ready ',
			'',
			' ',
			'__proto__',
			'constructor',
			'toString',
			'hasOwnProperty',
			'valueOf',
			'prototype',
		].filter(type => !allowed.has(type));
		expect(hostile.length).toBeGreaterThanOrEqual(40);
		const instance = guard(MODEL_ASSIGNMENT);
		instance.handle(scoped('step_started'));

		for (const type of hostile) {
			const before = log.lines.length;

			const decision = instance.handle(scoped(type, { secret: 'TOP-SECRET-VALUE', entry: {}, steps: [{}] }));

			expect(decision.action, JSON.stringify(type)).toBe('drop');
			expect(log.lines.length, JSON.stringify(type)).toBe(before + 1);
			expect(log.lines.at(-1), JSON.stringify(type)).toContain('not in the allow-list');
		}
		expect(log.text()).not.toContain('TOP-SECRET-VALUE');
		expect(instance.finished).toBe(false);
		// Nothing the hostile messages did changed the state: the real step still goes through.
		expect(guard().handle(scoped('log', { entry: {} })).action).toBe('forward');
		expect(instance.handle(scoped('step_progress', { activity: 'x' })).action).toBe('forward');
		expect(instance.handle(scoped('step_completed', { output: {} })).action).toBe('forward');
	});

	it('drops a message about another assignment, execution or step', () => {
		const instance = guard();

		for (const wrong of [{ assignmentId: 'other' }, { executionId: 'other' }, { stepId: 'other' }]) {
			expect(instance.handle(scoped('step_completed', wrong)).action).toBe('drop');
		}
		expect(instance.finished).toBe(false);
		expect(log.lines.filter(line => line.startsWith('warn: bridge dropped'))).toHaveLength(3);
	});

	it('drops everything while no assignment is active, naming the reason', () => {
		const decision = guard(null).handle(scoped('log', { entry: {} }));

		expect(decision.action).toBe('drop');
		expect(log.text()).toContain('no assignment is active');
	});

	it('drops a second outcome and anything after the outcome', () => {
		const instance = guard();
		instance.handle(scoped('step_completed'));

		expect(instance.handle(scoped('step_completed')).action).toBe('drop');
		expect(instance.handle(scoped('log', { entry: {} })).action).toBe('drop');
		expect(log.text()).toContain('already reported its outcome');
	});

	it('drops a "ready" or a second step_started while the step is still running', () => {
		const instance = guard();
		instance.handle(scoped('step_started'));

		expect(instance.handle(JSON.stringify({ type: 'ready' })).action).toBe('drop');
		expect(log.text()).toContain('"ready" while a step is in progress');
		expect(instance.handle(scoped('step_started')).action).toBe('drop');
	});

	it('drops a log without an entry object and an output that is not an object', () => {
		expect(guard().handle(scoped('log', { entry: 'text' })).action).toBe('drop');
		expect(guard().handle(scoped('step_completed', { output: 'text' })).action).toBe('drop');
	});

	it('drops frames that are not a JSON object with a string type', () => {
		for (const raw of ['not json {', '[1,2]', '"text"', '{"noType":1}', '{"type":5}']) {
			log = new RecordingSandboxLog();
			expect(guard().handle(raw).action, raw).toBe('drop');
			expect(log.text(), raw).toContain('bridge dropped a frame');
		}
	});

	it('drops a frame above the daemon limit without parsing it', () => {
		const huge = JSON.stringify({ type: 'log', entry: { message: 'x'.repeat(MAX_FRAME_BYTES) } });

		const decision = guard().handle(huge);

		expect(decision.action).toBe('drop');
		expect(log.text()).toContain('exceeds the 1048576-byte limit');
	});

	it('does not put the content of a dropped message in the log', () => {
		guard().handle(JSON.stringify({ type: 'assign', secret: 'TOP-SECRET-VALUE' }));

		expect(log.text()).not.toContain('TOP-SECRET-VALUE');
	});
});

describe('InsideMessageGuard: inject_steps', () => {
	const steps = [{ id: 's1', type: 'script' }];

	it('forwards it from a started model step', () => {
		const instance = guard(MODEL_ASSIGNMENT);
		instance.handle(scoped('step_started'));

		const decision = instance.handle(scoped('inject_steps', { steps, stepId: undefined }));

		expect(forwarded(decision)).toEqual({ type: 'inject_steps', assignmentId: 'a1', executionId: 'exec1', steps });
	});

	it('drops it from a script step', () => {
		const instance = guard();
		instance.handle(scoped('step_started'));

		expect(instance.handle(scoped('inject_steps', { steps })).action).toBe('drop');
		expect(log.text()).toContain('not a model step');
	});

	it('drops it before step_started, with no steps, with non-objects, or too many', () => {
		const instance = guard(MODEL_ASSIGNMENT, 2);
		expect(instance.handle(scoped('inject_steps', { steps })).action).toBe('drop');
		instance.handle(scoped('step_started'));

		expect(instance.handle(scoped('inject_steps', { steps: [] })).action).toBe('drop');
		expect(instance.handle(scoped('inject_steps', { steps: ['x'] })).action).toBe('drop');
		expect(instance.handle(scoped('inject_steps', { steps: [{}, {}, {}] })).action).toBe('drop');
		expect(log.text()).toContain('before "step_started"');
		expect(log.text()).toContain('3 steps, more than 2');
	});
});

describe('InsideMessageGuard: returned paths stay inside the two mounts', () => {
	it('translates session_file and files_written to host paths', () => {
		const instance = guard();
		const sessionFile = mounts.toSandboxPath(path.join(root, 'ws.meta', 'sessions', 'claude', 's.jsonl'), 'x');
		const written = mounts.toSandboxPath(path.join(root, 'ws', 'out.txt'), 'x');

		const meta = forwarded(
			instance.handle(scoped('step_completed', { meta: { session_file: sessionFile, files_written: [written] } }))
		)['meta'] as JsonObject;

		expect(meta['session_file']).toBe(path.join(root, 'ws.meta', 'sessions', 'claude', 's.jsonl'));
		expect(meta['files_written']).toEqual([path.join(root, 'ws', 'out.txt')]);
	});

	it('removes files_written entries outside the mounts and logs them', () => {
		const instance = guard();
		const inside = mounts.toSandboxPath(path.join(root, 'ws', 'a.txt'), 'x');

		const meta = forwarded(
			instance.handle(
				scoped('step_completed', {
					meta: { files_written: [inside, '/tmp/elsewhere.txt'], files_written_count: 2 },
				})
			)
		)['meta'] as JsonObject;

		expect(meta['files_written']).toEqual([path.join(root, 'ws', 'a.txt')]);
		expect(meta['files_written_count']).toBe(2);
		expect(log.text()).toContain('removed "/tmp/elsewhere.txt" from files_written');
	});

	it('replaces a result whose session_file leaves the mounts by a step_failed naming the reason', () => {
		const instance = guard();

		const decision = instance.handle(
			scoped('step_completed', { output: { a: 1 }, meta: { session_file: '/etc/passwd' } })
		);

		expect(decision).toMatchObject({ action: 'forward', terminal: true });
		const message = forwarded(decision);
		expect(message['type']).toBe('step_failed');
		expect(message['output']).toBeUndefined();
		expect(String(message['error'])).toContain('refused by the bridge');
		expect(String(message['error'])).toMatch(/outside|cannot be used/);
		expect(log.text()).toContain('replaced "step_completed"');
		expect(instance.finished).toBe(true);
	});

	it('replaces a result whose meta is malformed, or whose mounts are not known yet, by a step_failed', () => {
		const cases: [string, JsonObject][] = [
			['a session_file that is not a string', { meta: { session_file: 42 } }],
			['a files_written that is not a list', { meta: { files_written: 'x' } }],
			['a path with ..', { meta: { session_file: '/c/ws/../other' } }],
			['a meta that is not an object', { meta: 'x' }],
		];
		for (const [label, extra] of cases) {
			expect(forwarded(guard().handle(scoped('step_completed', extra)))['type'], label).toBe('step_failed');
		}

		const unknownMounts = new InsideMessageGuard({ log, returnedPaths: () => undefined });
		unknownMounts.begin(ASSIGNMENT);
		expect(forwarded(unknownMounts.handle(scoped('step_completed', { meta: {} })))['type']).toBe('step_failed');
	});

	it('refuses a symlinked path inside the mount', () => {
		const target = path.join(root, 'outside');
		fs.mkdirSync(target);
		// 'junction' needs no privilege on Windows and is ignored elsewhere (a plain symlink); a failure here must be visible.
		fs.symlinkSync(target, path.join(root, 'ws', 'link'), 'junction');
		const viaLink = mounts.translator.toSandbox(path.join(root, 'ws', 'link', 'f.jsonl'), 'x');

		const decision = guard().handle(scoped('step_completed', { meta: { session_file: viaLink } }));

		expect(forwarded(decision)['type']).toBe('step_failed');
		expect(String(forwarded(decision)['error'])).toContain('symbolic link or junction');
	});
});

describe('InsideMessageGuard: end', () => {
	it('forgets the assignment', () => {
		const instance = guard();
		instance.end();

		expect(instance.handle(scoped('log', { entry: {} })).action).toBe('drop');
		expect(instance.handle(JSON.stringify({ type: 'ready' })).action).toBe('absorb');
	});
});
