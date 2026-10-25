// Integration test: real daemon, real forked worker (`npm run build` first), real bash.
// A script step prints declared secrets in several forms; nothing the daemon persists or prints
// may contain a value, and the placeholder must show which secret was hidden.
import { FlowQueryService, logsDirOf } from 'flow-core';
import { createTempDirectory } from 'flow-core/testing';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tailLogFile } from '../cli/commands/ExecutionLogTail';
import { logsCommand } from '../cli/commands/LogsCommand';
import { RegisteredProjectFixture } from '../test-utils/RegisteredProjectFixture';
import { requireBashOrSkip, startTestDaemon, waitForExecution } from '../test-utils/TestHelpers';

const workerBinary = path.resolve(fileURLToPath(import.meta.url), '../../../dist/worker/Worker.js');

// Built at runtime from parts: a literal would trip secret scanners (GitHub push protection).
const TOKEN = ['tk', '_Ab3xY9', 'Q7z', '+K/m=9'].join('');
const KEY_LINES = [
	['-----BEGIN ', 'TEST KEY-----'].join(''),
	['MIIEvQIBADANBgkq', 'hkiG9w0B'].join(''),
	['Zm9vYmFy', 'YmF6cXV4'].join(''),
];
const KEY = KEY_LINES.join('\n');
const TOKEN_BASE64 = Buffer.from(TOKEN).toString('base64');

const FLOW_YAML = `\
id: secret-masking-e2e
version: "1.0.0"
name: Secret masking e2e
description: Prints secrets in several forms, then fails so stdout and stderr are recorded
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs:
  API_TOKEN:
    type: password
    required: true
  PEM_KEY:
    type: password
    required: true
steps:
  - id: leak
    name: Leak on purpose
    type: script
    shell: bash
    secrets: [API_TOKEN, PEM_KEY]
    script: |
      echo "plain: $API_TOKEN"
      echo "json: {\\"k\\":\\"$API_TOKEN\\"}"
      printf 'b64: %s\\n' "$(printf '%s' "$API_TOKEN" | base64 | tr -d '\\n')"
      echo "key follows"
      echo "$PEM_KEY"
      echo "to stderr: $API_TOKEN" >&2
      echo "via template: \${{ inputs.API_TOKEN }}"
      exit 1
`;

function readAll(dir: string): string {
	return fs
		.readdirSync(dir)
		.map(file => fs.readFileSync(path.join(dir, file), 'utf8'))
		.join('\n');
}

function expectNoSecret(label: string, text: string): void {
	const leaks = [TOKEN, TOKEN_BASE64, ...KEY_LINES].filter(secret => text.includes(secret));
	expect(leaks, `${label} contains a secret value (${leaks.length} form(s))`).toEqual([]);
}

describe('secret masking (end to end)', () => {
	let workDir: string;
	let registry: RegisteredProjectFixture;

	beforeAll(() => {
		if (!fs.existsSync(workerBinary)) {
			throw new Error(
				`Worker binary not found at ${workerBinary}: run 'npm run build' in packages/flow-cli first.`
			);
		}
	});

	beforeEach(async () => {
		// The in-process daemon resolves the project of each run from this process's registry.
		registry = new RegisteredProjectFixture().useAsProcessEnv();
		workDir = createTempDirectory('secret-e2e-work-');
		await registry.register('secret-masking-e2e', { folder: workDir });
		fs.writeFileSync(path.join(workDir, 'flow.yml'), FLOW_YAML, 'utf8');
		fs.writeFileSync(path.join(workDir, 'key.pem'), KEY + '\n', 'utf8');
		// The daemon runs in this process: env:// is read from this environment.
		process.env['SECRET_E2E_TOKEN'] = TOKEN;
	});

	afterEach(() => {
		registry.dispose();
		delete process.env['SECRET_E2E_TOKEN'];
	});

	it('writes the placeholder, never the value, to the record, the daily log, the follow output and flow show', async () => {
		if (!requireBashOrSkip('SecretMasking')) return;
		await using ctx = await startTestDaemon();

		const response = await ctx.client.send('run', {
			type: 'run',
			flowFile: path.join(workDir, 'flow.yml'),
			cwd: workDir,
			inputs: { API_TOKEN: 'env://SECRET_E2E_TOKEN', PEM_KEY: 'file://./key.pem' },
		});
		if (response.type !== 'execution_started') {
			throw new Error(`Expected execution_started, got ${JSON.stringify(response)}`);
		}
		const { executionId } = response;
		const finalState = await waitForExecution(ctx.daemonDir, executionId, 60000);
		expect(finalState.status).toBe('failed');

		// The step really received the secrets: its masked output proves it printed them.
		const recordText = fs.readFileSync(path.join(ctx.daemonDir, 'executions', `${executionId}.json`), 'utf8');
		expect(recordText).toContain('plain: [secret:API_TOKEN]');
		expect(recordText).toContain('to stderr: [secret:API_TOKEN]');
		expect(recordText).toContain('via template: [secret:API_TOKEN]');
		expect(recordText).toContain('[secret:PEM_KEY]');
		expectNoSecret('execution record', recordText);

		const logsDir = logsDirOf(ctx.daemonDir);
		const logText = readAll(logsDir);
		expect(logText).toContain('plain: [secret:API_TOKEN]');
		expectNoSecret('daily log', logText);

		const followed: string[] = [];
		for (const file of fs.readdirSync(logsDir)) {
			tailLogFile(path.join(logsDir, file), executionId, 0, (_stepId, message) => followed.push(message));
		}
		expect(followed.join('\n')).toContain('plain: [secret:API_TOKEN]');
		expectNoSecret('flow run follow output', followed.join('\n'));

		const logsOutput: string[] = [];
		await logsCommand(ctx.daemonDir, { follow: false, lines: 0, human: true }, text => logsOutput.push(text));
		expectNoSecret('flow logs', logsOutput.join(''));

		const shown = FlowQueryService.forConfigDir(ctx.daemonDir).renderExecution(executionId, {
			tail: 100000,
			full: true,
		});
		expect(shown).toContain('[secret:API_TOKEN]');
		expectNoSecret('flow show <execution>', shown);
	}, 90000);

	it('refuses to start, naming the input, when a secret cannot be resolved', async () => {
		await using ctx = await startTestDaemon();
		delete process.env['SECRET_E2E_TOKEN'];

		const response = await ctx.client.send('run', {
			type: 'run',
			flowFile: path.join(workDir, 'flow.yml'),
			cwd: workDir,
			inputs: { API_TOKEN: 'env://SECRET_E2E_TOKEN', PEM_KEY: 'file://./key.pem' },
		});
		if (response.type !== 'error') {
			throw new Error(`Expected an error, got ${JSON.stringify(response)}`);
		}
		expect(response.code).toBe('SECRET_RESOLUTION_FAILED');
		expect(response.message).toContain('API_TOKEN');
		expect(response.message).toContain('SECRET_E2E_TOKEN');
		expect(fs.readdirSync(path.join(ctx.daemonDir, 'executions'))).toEqual([]);
	}, 30000);
});
