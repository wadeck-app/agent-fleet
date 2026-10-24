// Integration test: real daemon, real forked worker (`npm run build` first), real bash.
// A worker the daemon forks must declare the shells it can run, otherwise a script step with
// `shell: bash` (the form the secrets documentation uses) is never assigned and stays queued.
import { logsDirOf } from 'flow-core';
import { SECRET_EXAMPLE_FLOW_YAML } from 'flow-engine/secrets/SecretFlowExample';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { requireBashOrSkip, startTestDaemon, waitForExecution } from '../test-utils/TestHelpers';

const workerBinary = path.resolve(fileURLToPath(import.meta.url), '../../../dist/worker/Worker.js');

function flowYaml(id: string, stepLines: string): string {
	return `\
id: ${id}
version: "1.0.0"
name: ${id}
description: Forked worker shell routing
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
steps:
  - id: only
    name: Only step
    type: script
${stepLines}
`;
}

describe('forked worker shell routing (end to end)', () => {
	let workDir: string;

	beforeAll(() => {
		if (!fs.existsSync(workerBinary)) {
			throw new Error(
				`Worker binary not found at ${workerBinary}: run 'npm run build' in packages/flow-cli first.`
			);
		}
	});

	beforeEach(() => {
		workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-e2e-work-'));
		process.env['SHELL_E2E_TOKEN'] = 'tk_shell_e2e_value_123';
	});

	afterEach(() => {
		delete process.env['SHELL_E2E_TOKEN'];
		fs.rmSync(workDir, { recursive: true, force: true });
	});

	async function runFlow(
		yaml: string,
		inputs: Record<string, string>
	): Promise<{ status: string; persisted: string }> {
		await using ctx = await startTestDaemon();
		fs.writeFileSync(path.join(workDir, 'flow.yml'), yaml, 'utf8');
		const response = await ctx.client.send('run', {
			type: 'run',
			flowFile: path.join(workDir, 'flow.yml'),
			cwd: workDir,
			inputs,
		});
		if (response.type !== 'execution_started') {
			throw new Error(`Expected execution_started, got ${JSON.stringify(response)}`);
		}
		const finalState = await waitForExecution(ctx.daemonDir, response.executionId, 30000);
		const records = path.join(ctx.daemonDir, 'executions', `${response.executionId}.json`);
		const logsDir = logsDirOf(ctx.daemonDir);
		const logs = fs.readdirSync(logsDir).map(file => fs.readFileSync(path.join(logsDir, file), 'utf8'));
		return {
			status: finalState.status,
			persisted: [fs.readFileSync(records, 'utf8'), ...logs].join(String.fromCharCode(10)),
		};
	}

	it('runs a `shell: bash` script step on a forked worker', async () => {
		if (!requireBashOrSkip('ForkedWorkerShell')) return;
		const yaml = flowYaml('shell-bash-e2e', '    shell: bash\n    script: |\n      echo hello-from-bash');
		expect((await runFlow(yaml, {})).status).toBe('completed');
	}, 45000);

	it('runs a step without `shell:` on a forked worker', async () => {
		const yaml = flowYaml('shell-none-e2e', '    script: |\n      echo hello');
		expect((await runFlow(yaml, {})).status).toBe('completed');
	}, 45000);

	it('runs the documented secrets example (`shell: bash` + `secrets:`) up to the network call', async () => {
		if (!requireBashOrSkip('ForkedWorkerShell')) return;
		// The documented flow, with the network call replaced by an echo that fails: the point is
		// that the step is assigned, runs with the secret, and fails in the script, not in routing.
		const yaml = SECRET_EXAMPLE_FLOW_YAML.replace(/curl .*/, 'echo "got $API_TOKEN"; exit 3').replace(
			'mode: isolated',
			'mode: manual'
		);
		const { status, persisted } = await runFlow(yaml, { API_TOKEN: 'env://SHELL_E2E_TOKEN' });
		expect(status).toBe('failed');
		// The step really received the secret (the placeholder shows which one), and the value is nowhere.
		expect(persisted).toContain('got [secret:API_TOKEN]');
		expect(persisted).not.toContain('tk_shell_e2e_value_123');
	}, 45000);
});
