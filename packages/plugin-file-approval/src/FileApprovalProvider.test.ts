import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FileApprovalProvider } from './FileApprovalProvider.js';
import { createFileApprovalProvider } from './FileApprovalProvider.js';

// ConfigDir is mocked so the "no option, no env var" precedence case never touches the real ~/.config.
const configDirRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'file-approval-configdir-'));
vi.mock('@wadeck-app/shared-cli', () => ({
	ConfigDir: {
		get: (appName: string) => path.join(configDirRoot, appName),
	},
}));

const APPROVAL_REQUEST = { taskId: 'task-1', stepId: 'step-1', prompt: 'Ship it?', context: 'diff summary' };
const INPUT_REQUEST = { taskId: 'task-1', stepId: 'step-1', prompt: 'Release name?', hint: 'lowercase' };
const CHOICE_REQUEST = {
	taskId: 'task-1',
	stepId: 'step-1',
	prompt: 'Which strategy?',
	choices: [
		{ id: 'merge', label: 'Merge' },
		{ id: 'rebase', label: 'Rebase', description: 'linear history' },
	],
};

let dir: string;
let provider: FileApprovalProvider;

const requestPath = () => path.join(dir, 'task-1_step-1.request.json');
const responsePath = () => path.join(dir, 'task-1_step-1.response.json');
const answeredDir = () => path.join(dir, 'answered');

/** Resolves once the provider has published its request file. */
async function waitForRequestFile(): Promise<void> {
	await vi.waitFor(() => expect(fs.existsSync(requestPath())).toBe(true), { interval: 5, timeout: 2000 });
}

/** Writes the response file once the provider has published its request file. */
async function respondWith(body: string): Promise<void> {
	await waitForRequestFile();
	fs.writeFileSync(responsePath(), body, 'utf8');
}

beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-approval-'));
	provider = createFileApprovalProvider({ dir, pollIntervalMs: 5, timeoutMs: 5000 });
	vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
	vi.restoreAllMocks();
	fs.rmSync(dir, { recursive: true, force: true });
});

describe('FileApprovalProvider happy paths', () => {
	it('resolves an approval to true', async () => {
		const pending = provider.requestApproval(APPROVAL_REQUEST);
		await respondWith(JSON.stringify({ approved: true, comment: 'looks good' }));
		await expect(pending).resolves.toBe(true);
	});

	it('resolves an approval to false', async () => {
		const pending = provider.requestApproval(APPROVAL_REQUEST);
		await respondWith(JSON.stringify({ approved: false }));
		await expect(pending).resolves.toBe(false);
	});

	it('resolves an input to the provided string', async () => {
		const pending = provider.requestInput(INPUT_REQUEST);
		await respondWith(JSON.stringify({ value: 'v2-final' }));
		await expect(pending).resolves.toBe('v2-final');
	});

	it('resolves a choice to the selected id', async () => {
		const pending = provider.requestChoice(CHOICE_REQUEST);
		await respondWith(JSON.stringify({ choiceId: 'rebase' }));
		await expect(pending).resolves.toBe('rebase');
	});

	it('logs the absolute response path to stdout once per request', async () => {
		const pending = provider.requestApproval(APPROVAL_REQUEST);
		await respondWith(JSON.stringify({ approved: true }));
		await pending;
		const written = vi.mocked(process.stdout.write).mock.calls.map(call => String(call[0]));
		expect(written.filter(line => line.includes(responsePath()))).toHaveLength(1);
	});
});

describe('FileApprovalProvider request file', () => {
	it('is self-describing for an approval', async () => {
		const pending = provider.requestApproval(APPROVAL_REQUEST);
		await waitForRequestFile();
		const written = JSON.parse(fs.readFileSync(requestPath(), 'utf8'));
		expect(written).toMatchObject({
			kind: 'approval',
			taskId: 'task-1',
			stepId: 'step-1',
			prompt: 'Ship it?',
			context: 'diff summary',
		});
		expect(new Date(written.createdAt).toISOString()).toBe(written.createdAt);
		expect(written.respondBy).toContain(responsePath());
		expect(written.respondBy).toContain('"approved"');
		fs.writeFileSync(responsePath(), JSON.stringify({ approved: true }), 'utf8');
		await pending;
	});

	it('describes the offered choice ids for a choice', async () => {
		const pending = provider.requestChoice(CHOICE_REQUEST);
		await waitForRequestFile();
		const written = JSON.parse(fs.readFileSync(requestPath(), 'utf8'));
		expect(written.kind).toBe('choice');
		expect(written.choices).toEqual(CHOICE_REQUEST.choices);
		expect(written.respondBy).toContain('choiceId');
		expect(written.respondBy).toContain('rebase');
		fs.writeFileSync(responsePath(), JSON.stringify({ choiceId: 'merge' }), 'utf8');
		await pending;
	});

	it('describes the value field for an input', async () => {
		const pending = provider.requestInput(INPUT_REQUEST);
		await waitForRequestFile();
		const written = JSON.parse(fs.readFileSync(requestPath(), 'utf8'));
		expect(written.kind).toBe('input');
		expect(written.hint).toBe('lowercase');
		expect(written.respondBy).toContain('"value"');
		fs.writeFileSync(responsePath(), JSON.stringify({ value: 'x' }), 'utf8');
		await pending;
	});

	it('refuses to publish a request when a stale response file is already there', async () => {
		fs.writeFileSync(responsePath(), JSON.stringify({ approved: true }), 'utf8');
		await expect(provider.requestApproval(APPROVAL_REQUEST)).rejects.toThrow(/stale response file/i);
	});
});

describe('FileApprovalProvider audit trail', () => {
	it('moves both files to answered/ and leaves nothing behind', async () => {
		const pending = provider.requestApproval(APPROVAL_REQUEST);
		await respondWith(JSON.stringify({ approved: true }));
		await pending;

		expect(fs.existsSync(requestPath())).toBe(false);
		expect(fs.existsSync(responsePath())).toBe(false);
		const answered = fs.readdirSync(answeredDir());
		expect(answered.filter(name => name.endsWith('.request.json'))).toHaveLength(1);
		expect(answered.filter(name => name.endsWith('.response.json'))).toHaveLength(1);
		expect(answered.every(name => name.startsWith('task-1_step-1'))).toBe(true);
	});

	it('keeps every answer of the same step instead of overwriting the previous one', async () => {
		for (const value of ['first', 'second']) {
			const pending = provider.requestInput(INPUT_REQUEST);
			await respondWith(JSON.stringify({ value }));
			await expect(pending).resolves.toBe(value);
		}
		expect(fs.readdirSync(answeredDir())).toHaveLength(4);
	});
});

describe('FileApprovalProvider partially written response', () => {
	// A human or a script answers with a shell redirect, so the file can be seen while still
	// half-written. Failing the step on that transient state would make answering a lottery.
	it('waits for a file that is still being written instead of failing on truncated JSON', async () => {
		const pending = provider.requestApproval(APPROVAL_REQUEST);
		await waitForRequestFile();

		fs.writeFileSync(responsePath(), '{ "appro', 'utf8');
		await new Promise(resolve => setTimeout(resolve, 30));
		fs.writeFileSync(responsePath(), JSON.stringify({ approved: true }), 'utf8');

		await expect(pending).resolves.toBe(true);
	});

	// The grace period must not become a way to accept a broken answer in silence.
	it('still fails when the file never becomes valid JSON', async () => {
		const shortLived = createFileApprovalProvider({ dir, pollIntervalMs: 5, timeoutMs: 5000, settleMs: 50 });
		const pending = shortLived.requestApproval(APPROVAL_REQUEST);
		await waitForRequestFile();
		fs.writeFileSync(responsePath(), '{ still not json', 'utf8');

		await expect(pending).rejects.toThrow(/not valid JSON/i);
	});
});

describe('FileApprovalProvider validation', () => {
	async function expectRejection(body: string, kind: 'approval' | 'input' | 'choice'): Promise<Error> {
		const pending =
			kind === 'approval'
				? provider.requestApproval(APPROVAL_REQUEST)
				: kind === 'input'
					? provider.requestInput(INPUT_REQUEST)
					: provider.requestChoice(CHOICE_REQUEST);
		const captured = pending.then(
			value => {
				throw new Error(`expected a rejection, got ${JSON.stringify(value)}`);
			},
			(error: Error) => error
		);
		await respondWith(body);
		return captured;
	}

	it('rejects malformed JSON naming the file', async () => {
		const error = await expectRejection('{ not json', 'approval');
		expect(error.message).toContain(responsePath());
		expect(error.message).toMatch(/not valid JSON/i);
	});

	it('rejects a non-object payload', async () => {
		const error = await expectRejection('[1,2]', 'approval');
		expect(error.message).toMatch(/JSON object/i);
	});

	it('rejects a missing "approved" field', async () => {
		const error = await expectRejection(JSON.stringify({ comment: 'nope' }), 'approval');
		expect(error.message).toContain('approved');
		expect(error.message).toContain(responsePath());
	});

	it('rejects a non-boolean "approved" field', async () => {
		const error = await expectRejection(JSON.stringify({ approved: 'yes' }), 'approval');
		expect(error.message).toMatch(/boolean/i);
		expect(error.message).toMatch(/"yes"/);
	});

	it('rejects a non-string "comment" field', async () => {
		const error = await expectRejection(JSON.stringify({ approved: true, comment: 42 }), 'approval');
		expect(error.message).toContain('comment');
		expect(error.message).toMatch(/string/i);
	});

	it('rejects a missing "value" field', async () => {
		const error = await expectRejection(JSON.stringify({}), 'input');
		expect(error.message).toContain('value');
	});

	it('rejects a non-string "value" field', async () => {
		const error = await expectRejection(JSON.stringify({ value: 42 }), 'input');
		expect(error.message).toMatch(/string/i);
		expect(error.message).toContain('42');
	});

	it('rejects a missing "choiceId" field', async () => {
		const error = await expectRejection(JSON.stringify({}), 'choice');
		expect(error.message).toContain('choiceId');
	});

	it('rejects a choiceId that is not among the offered choices', async () => {
		const error = await expectRejection(JSON.stringify({ choiceId: 'squash' }), 'choice');
		expect(error.message).toContain('squash');
		expect(error.message).toContain('merge');
		expect(error.message).toContain('rebase');
	});

	it('never falls back to a default when the payload is invalid', async () => {
		await expectRejection(JSON.stringify({ approved: null }), 'approval');
		// A rejected answer must stay on disk for inspection, not be swallowed into answered/.
		expect(fs.existsSync(responsePath())).toBe(true);
	});
});

describe('FileApprovalProvider timeout', () => {
	it('throws an actionable error instead of resolving to false', async () => {
		const impatient = createFileApprovalProvider({ dir, pollIntervalMs: 5, timeoutMs: 30 });
		await expect(impatient.requestApproval(APPROVAL_REQUEST)).rejects.toThrow(/timed out/i);
	});

	it('names the request path, the response path and the expected shape', async () => {
		const impatient = createFileApprovalProvider({ dir, pollIntervalMs: 5, timeoutMs: 30 });
		const error = await impatient.requestChoice(CHOICE_REQUEST).then(
			value => {
				throw new Error(`expected a timeout, got ${value}`);
			},
			(caught: Error) => caught
		);
		expect(error.message).toContain(requestPath());
		expect(error.message).toContain(responsePath());
		expect(error.message).toContain('choiceId');
		expect(error.message).toContain('30');
	});
});

describe('FileApprovalProvider directory resolution', () => {
	const envKey = 'FLOW_APPROVAL_DIR';
	let previousEnv: string | undefined;

	beforeEach(() => {
		previousEnv = process.env[envKey];
		delete process.env[envKey];
	});

	afterEach(() => {
		if (previousEnv === undefined) delete process.env[envKey];
		else process.env[envKey] = previousEnv;
	});

	it('prefers the explicit option over the env var', () => {
		process.env[envKey] = path.join(dir, 'from-env');
		expect(createFileApprovalProvider({ dir }).dir).toBe(dir);
	});

	it('falls back to FLOW_APPROVAL_DIR when no option is given', () => {
		const fromEnv = path.join(dir, 'from-env');
		process.env[envKey] = fromEnv;
		expect(createFileApprovalProvider().dir).toBe(fromEnv);
	});

	it('falls back to <ConfigDir flow>/approvals when nothing is configured', () => {
		expect(createFileApprovalProvider().dir).toBe(path.join(configDirRoot, 'flow', 'approvals'));
	});

	it('creates the directory when it does not exist', () => {
		const nested = path.join(dir, 'deep', 'approvals');
		expect(createFileApprovalProvider({ dir: nested }).dir).toBe(nested);
		expect(fs.existsSync(nested)).toBe(true);
	});

	it('rejects a relative explicit dir', () => {
		expect(() => createFileApprovalProvider({ dir: 'relative/approvals' })).toThrow(/absolute/i);
	});

	it('rejects a relative FLOW_APPROVAL_DIR', () => {
		process.env[envKey] = 'relative/approvals';
		expect(() => createFileApprovalProvider()).toThrow(/absolute/i);
	});
});
