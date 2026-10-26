import { defaultRegistryDir } from '@wadeck-app/project-sdk';
import type { Command } from 'commander';
import * as path from 'node:path';
import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { FlowConfigLoader } from '../../config/FlowConfig';
import { flowConfigDir } from '../../config/FlowConfigDir.js';
import { FLOW_PROJECT_ENV } from '../../config/ProjectScopeResolver';
import type { ClientCommand, DaemonResponse, ExecutionState } from '../../ipc/Protocol';
import { debugHint, describeCliFailure } from './CliFailureText';
import { ExecutionTimeoutError, waitForCompletion } from './ExecutionCompletionWaiter';
import { hasFastLogMode } from './FlowLogModeDetector';
import { resolveFlowReference } from './FlowReference';
import { loadMockConfig } from './MockConfigLoader';
import { parseInputArgs, parseTimeout } from './RunArgumentParser';
import { DaemonContactError, sendToDaemon } from './RunDaemonSender';
import { checkSecretInputs } from './SecretInputCheck';
import { singleProjectValue } from './SingleProjectOption';

// violations-suppress-end: ts/no-deep-relative

export function registerRunCommand(program: Command): void {
	program
		.command('run <flowRef>')
		.description(
			'Run a flow by file path or flow ID (requires daemon)\n' +
				'  <flowRef>  Path to a .yaml file (runs as it is), or a flow ID: the latest known version, or <id>@<version> to pin one\n' +
				'  -i key=value  Pass input (repeatable); e.g. -i name=Alice -i count=3\n' +
				'  --wait        Block until execution completes (default: fire-and-forget)\n' +
				'  --timeout     Timeout for --wait, e.g. 30s, 5m, 1h (default: 10m)\n' +
				'  --flow-id     Select a specific flow ID when YAML contains multiple flows\n' +
				'  -p, --project <ref>  Project (name, alias or id) the run belongs to. Default: FLOW_PROJECT, then the registered project containing the cwd'
		)
		.option(
			'-i, --input <key=value>',
			'Input key=value (repeatable)',
			(val: string, acc: string[]) => {
				acc.push(val);
				return acc;
			},
			[] as string[]
		)
		.option(
			'--inputs <key=value>',
			'Alias for --input (repeatable)',
			(val: string, acc: string[]) => {
				acc.push(val);
				return acc;
			},
			[] as string[]
		)
		.option('--flow-id <id>', 'Flow ID within a multi-flow YAML')
		.option(
			'-p, --project <ref>',
			'Project (name, alias or id) the run belongs to. Default: FLOW_PROJECT, then the registered project containing the cwd (see: project list)',
			singleProjectValue
		)
		.option(
			'--mock-config <path>',
			"YAML/JSON file mapping step id to env overlay, replacing that step's real execution via the mock-CLI convention (*_MOCK_PATH/*_MOCK_RESPONSE/*_MOCK_EXIT_CODE). Daemon-dispatched runs only."
		)
		.option('--wait', 'Block until execution completes')
		.option('--timeout <duration>', 'Timeout for --wait (default: 10m)', '10m')
		.option('--quiet', 'Suppress output')
		.option('--json', 'Machine-readable output')
		.option('--human', 'Force human-readable output')
		.action(
			async (
				flowRef: string,
				options: {
					input: string[];
					inputs: string[];
					flowId?: string;
					project?: string;
					mockConfig?: string;
					wait?: boolean;
					timeout: string;
					quiet?: boolean;
					json?: boolean;
					human?: boolean;
				}
			) => {
				const inputs = parseInputArgs([...options.input, ...options.inputs]);
				const cwd = process.cwd();
				const daemonDir = flowConfigDir();

				// FLOW_PROJECT is read here, in the client's environment: the daemon, shared by every shell, cannot see it.
				const envProject = process.env[FLOW_PROJECT_ENV];
				const namedEnvProject = envProject !== undefined && envProject.trim() !== '' ? envProject : undefined;
				const resolution = resolveFlowReference(flowRef, cwd, {
					projectRef: options.project,
					env: process.env,
					configDir: daemonDir,
				});
				if (resolution.kind === 'error') {
					console.error(resolution.error);
					process.exit(1);
				}
				const { flowFile } = resolution;
				const registered = resolution.kind === 'registered';
				if (registered && options.flowId !== undefined) {
					console.error(
						`Error:--flow-id cannot be combined with a flow id reference ('${flowRef}'): the id is already given. ` +
							'Use --flow-id only with a flow file.'
					);
					process.exit(2);
				}
				if (registered && options.mockConfig !== undefined) {
					console.error(
						`Error:--mock-config needs a flow file to check its step ids; '${flowRef}' is a flow id. ` +
							'Run the flow file by its path instead.'
					);
					process.exit(2);
				}
				const flowId = registered ? resolution.flowId : options.flowId;

				// D27: Validate secret inputs before sending to daemon
				// Only check if we resolved a specific file (not a registry ID)
				if (!registered) {
					const secretError = checkSecretInputs(flowFile, inputs);
					if (secretError) {
						console.error(`Error:${secretError}`);
						process.exit(2);
					}
				}

				// The same single location the daemon reads, so a run and the daemon it starts
				// never disagree about the configuration (D#58). The legacy-file warning is left
				// to the daemon, which is the process whose behaviour it would have changed.
				// Loaded for validation only: an invalid configuration must fail the run before any daemon contact.
				FlowConfigLoader.loadForDaemon(daemonDir);

				const resolvedMockConfigPath = options.mockConfig
					? path.isAbsolute(options.mockConfig)
						? options.mockConfig
						: path.resolve(cwd, options.mockConfig)
					: undefined;
				const mockEnv = options.mockConfig ? loadMockConfig(options.mockConfig, flowFile) : undefined;

				const cmd: Extract<ClientCommand, { type: 'run' }> = {
					type: 'run',
					flowFile,
					flowId,
					...(registered ? { registered: true, flowVersion: resolution.flowVersion } : {}),
					inputs,
					quiet: options.quiet,
					cwd,
					...(options.project === undefined ? {} : { projectRef: options.project }),
					...(namedEnvProject === undefined ? {} : { envProject: namedEnvProject }),
					registryDir: defaultRegistryDir(process.env),
					...(mockEnv ? { mockEnv, mockConfigPath: resolvedMockConfigPath } : {}),
				};

				let response: DaemonResponse;
				try {
					response = await sendToDaemon(cmd, daemonDir);
				} catch (err) {
					// Either the run could not be delivered to any daemon (exit 3, the message says what was tried), or the
					// daemon refused it with an error of its own (exit 1): its message is the answer, never a stack trace.
					console.error(
						err instanceof DaemonContactError
							? describeCliFailure(err)
							: `Error:${describeCliFailure(err)}\n${debugHint()}`
					);
					process.exit(err instanceof DaemonContactError ? 3 : 1);
				}

				if (response.type === 'error') {
					if (options.json && !options.human) {
						process.stderr.write(JSON.stringify({ code: response.code, message: response.message }) + '\n');
					} else {
						console.error(`Error:${response.message}`);
					}
					process.exit(
						response.code === 'VALIDATION_FAILED' || response.code.startsWith('FLOW_VERSION_') ? 2 : 1
					);
				}

				const { executionId } = response as { type: 'execution_started'; executionId: string };
				if (!executionId) {
					console.error(
						'Error: daemon returned a response without an executionId -- try restarting the daemon'
					);
					process.exit(1);
				}

				if (!options.wait) {
					if (options.json && !options.human) {
						process.stdout.write(JSON.stringify({ executionId }) + '\n');
					} else if (!options.quiet) {
						console.log(executionId);
					}
					process.exit(0);
				}

				// --wait: poll until done
				const timeoutMs = parseTimeout(options.timeout);
				const start = Date.now();
				const logCallback =
					!options.quiet && !(options.json && !options.human)
						? (stepId: string, message: string) => {
								const ts = new Date().toISOString().slice(11, 23);
								process.stdout.write(`[${ts}] [${stepId}] ${message}\n`);
							}
						: undefined;

				// Use fast 50ms poll when any model step has log:streaming or log:polling
				const fastPoll = !registered && hasFastLogMode(flowFile);

				let finalState: ExecutionState;
				try {
					finalState = await waitForCompletion(executionId, daemonDir, timeoutMs, logCallback, { fastPoll });
				} catch (err) {
					if (!(err instanceof ExecutionTimeoutError)) {
						// violations-suppress: security/no-raw-err-in-cli unexpected internal error while polling -- the normalized message is already user-facing
						console.error(`Error:${getErrorMessage(err)}`);
						process.exit(1);
					}
					if (options.json && !options.human) {
						process.stderr.write(JSON.stringify({ error: 'execution_timeout', executionId }) + '\n');
					} else {
						console.error('Error:Execution timed out.');
					}
					process.exit(124); // timeout exit code
				}

				const durationMs = Date.now() - start;
				if (options.json && !options.human) {
					// v1: step outputs are not persisted in ExecutionStore -- only step status is tracked.
					// The outputs map is always empty in --wait --json mode. Tracked for v2.
					const stepOutputs: Record<string, Record<string, unknown>> = {};
					process.stdout.write(
						JSON.stringify({ executionId, status: finalState.status, outputs: stepOutputs, durationMs }) +
							'\n'
					);
				} else {
					if (finalState.status === 'completed') {
						console.log(`Flow completed in ${durationMs}ms`);
					} else {
						const reason = finalState.lastError ? ` -- ${finalState.lastError}` : '';
						console.error(`Error:Flow failed${reason}`);
						process.exit(1);
					}
				}
				process.exit(0);
			}
		);
}
