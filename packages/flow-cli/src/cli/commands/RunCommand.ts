import { DaemonNotRunningError, createDaemonClient } from '@wadeck/singleton-daemon-kit';
import type { Command } from 'commander';
import type { FlowDefinition, InputDefinition } from 'flow-engine/types';
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { DEFAULT_CONFIG, startDaemon } from '../../daemon/Daemon';
import type { ClientCommand, DaemonResponse, ExecutionState } from '../../ipc/Protocol';
import { ExecutionStore } from '../../storage/ExecutionStore';

type FlowCommands = { run: (payload: unknown) => Promise<DaemonResponse> };

function parseTimeout(value: string): number {
	const match = /^(\d+)(ms|s|m|h)?$/.exec(value);
	if (!match) throw new Error(`Invalid timeout: ${value}. Use e.g. 10m, 30s, 5000ms`);
	const n = parseInt(match[1]!, 10);
	switch (match[2] ?? 's') {
		case 'ms':
			return n;
		case 's':
			return n * 1000;
		case 'm':
			return n * 60 * 1000;
		case 'h':
			return n * 3600 * 1000;
		default:
			throw new Error(`Unknown time unit`);
	}
}

async function waitForCompletion(executionId: string, daemonDir: string, timeoutMs: number): Promise<ExecutionState> {
	const store = new ExecutionStore(path.join(daemonDir, 'executions'));
	const deadline = Date.now() + timeoutMs;
	let delay = 200;
	while (Date.now() < deadline) {
		// Only read once the file exists — avoids swallowing real I/O errors (disk-full, bad JSON)
		// by conflating them with the normal "not yet written" case.
		if (store.exists(executionId)) {
			const state = store.read(executionId);
			if (state.status === 'completed' || state.status === 'failed') return state;
		}
		await new Promise(r => setTimeout(r, delay));
		delay = Math.min(delay * 1.5, 2000);
	}
	throw new Error(`Execution ${executionId} did not complete within ${timeoutMs}ms`);
}

function findProjectRoot(startDir: string): string | null {
	let dir = path.resolve(startDir);
	const { root } = path.parse(dir);
	while (dir !== root) {
		if (fs.existsSync(path.join(dir, '.agent-fleet'))) return dir;
		dir = path.dirname(dir);
	}
	return null;
}

// Result type for flow file resolution — either found with an optional inferred flow ID,
// or not found with an error message for the caller to surface.
type FlowResolution = { found: true; flowFile: string; inferredFlowId?: string } | { found: false; error: string };

function resolveFlowFile(flowRef: string, cwd: string): FlowResolution {
	const resolvedPath = path.isAbsolute(flowRef) ? flowRef : path.resolve(cwd, flowRef);
	if (fs.existsSync(resolvedPath)) {
		return { found: true, flowFile: resolvedPath };
	}
	// Treat as registry ID — use .agent-fleet/flows.yml lookup
	const projectRoot = findProjectRoot(cwd);
	if (!projectRoot) {
		return { found: false, error: `Flow '${flowRef}' not found as a file and no .agent-fleet/ directory found.` };
	}
	const flowsFile = path.join(projectRoot, '.agent-fleet', 'flows.yml');
	if (!fs.existsSync(flowsFile)) {
		return { found: false, error: `Flow '${flowRef}' not found and no flows.yml in ${projectRoot}` };
	}
	return { found: true, flowFile: flowsFile, inferredFlowId: flowRef };
}

// D27: Validate secret/password inputs at CLI time — literal values are rejected with exit code 2
function validateSecretInputs(flowFilePath: string, inputs: Record<string, string>): string | null {
	// Only validate if the flow file exists and is readable
	let flow: FlowDefinition;
	try {
		const content = fs.readFileSync(flowFilePath, 'utf8');
		flow = yaml.load(content, { schema: yaml.JSON_SCHEMA }) as FlowDefinition;
	} catch {
		return null; // If we can't read the flow, let the daemon handle it
	}

	if (!flow?.inputs) return null;

	for (const [key, spec] of Object.entries(flow.inputs)) {
		const inputType = typeof spec === 'string' ? spec : (spec as InputDefinition).type;
		if (inputType !== 'password') continue;

		const value = inputs[key];
		if (value === undefined) continue; // missing optional input — daemon will handle

		// Validate that the value is a URI scheme, not a literal
		const isUriScheme = value.startsWith('env://') || value.startsWith('file://') || value.startsWith('input://');
		if (!isUriScheme) {
			return (
				`Input '${key}' is of type '${inputType}' but received a literal value. ` +
				`Use a URI scheme instead: env://VAR_NAME, file://./path, or input://name.`
			);
		}
	}
	return null;
}

function parseInputArgs(rawInputs: string[]): Record<string, string> {
	const inputs: Record<string, string> = {};
	for (const entry of rawInputs) {
		const idx = entry.indexOf('=');
		if (idx === -1) {
			console.error(`Invalid input: '${entry}'. Use key=value`);
			process.exit(1);
		}
		inputs[entry.slice(0, idx)] = entry.slice(idx + 1);
	}
	return inputs;
}

function loadDaemonConfig(configFile: string): typeof DEFAULT_CONFIG {
	if (!fs.existsSync(configFile)) return DEFAULT_CONFIG;
	try {
		const loaded = yaml.load(fs.readFileSync(configFile, 'utf8'), {
			schema: yaml.JSON_SCHEMA,
		}) as typeof DEFAULT_CONFIG;
		return {
			queue: { ...DEFAULT_CONFIG.queue, ...loaded.queue },
			logs: { ...DEFAULT_CONFIG.logs, ...loaded.logs },
			worker: { ...DEFAULT_CONFIG.worker, ...loaded.worker },
			security: { ...DEFAULT_CONFIG.security, ...loaded.security },
		};
	} catch (err) {
		process.stderr.write('Warning: daemon config could not be parsed, using defaults.\n');
		return DEFAULT_CONFIG;
	}
}

async function sendToDaemon(
	cmd: Extract<ClientCommand, { type: 'run' }>,
	config: typeof DEFAULT_CONFIG,
	daemonDir: string
): Promise<DaemonResponse> {
	const makeClient = () =>
		createDaemonClient<FlowCommands>({
			configDir: daemonDir,
			commands: { run: async p => p as DaemonResponse },
		});
	try {
		return (await makeClient().send('run', cmd)) as DaemonResponse;
	} catch (err) {
		if (!(err instanceof DaemonNotRunningError)) throw err;
		try {
			await startDaemon(config);
			return (await makeClient().send('run', cmd)) as DaemonResponse;
		} catch (e2) {
			console.error('Daemon could not be started:', e2);
			process.exit(3); // D34: exit 3 = daemon start failed
		}
	}
}

export function registerRunCommand(program: Command): void {
	program
		.command('run <flowRef>')
		.description('Run a flow by file path or flow ID')
		.option(
			'-i, --input <key=value>',
			'Input key=value (repeatable)',
			(val: string, acc: string[]) => {
				acc.push(val);
				return acc;
			},
			[] as string[]
		)
		.option('--flow-id <id>', 'Flow ID within a multi-flow YAML')
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
					flowId?: string;
					wait?: boolean;
					timeout: string;
					quiet?: boolean;
					json?: boolean;
					human?: boolean;
				}
			) => {
				const inputs = parseInputArgs(options.input);
				const cwd = process.cwd();
				const daemonDir = path.join(os.homedir(), '.flow-daemon');

				const resolution = resolveFlowFile(flowRef, cwd);
				if (!resolution.found) {
					console.error(resolution.error);
					process.exit(1);
				}
				const { flowFile, inferredFlowId } = resolution;
				const flowId = options.flowId ?? inferredFlowId;

				// D27: Validate secret inputs before sending to daemon
				// Only check if we resolved a specific file (not a registry ID)
				if (fs.existsSync(flowFile)) {
					const secretError = validateSecretInputs(flowFile, inputs);
					if (secretError) {
						console.error(`✗ ${secretError}`);
						process.exit(2);
					}
				}

				const config = loadDaemonConfig(path.join(os.homedir(), '.flow-config.yaml'));

				const cmd: Extract<ClientCommand, { type: 'run' }> = {
					type: 'run',
					flowFile,
					flowId,
					inputs,
					quiet: options.quiet,
					cwd,
				};

				let response: DaemonResponse;
				try {
					response = await sendToDaemon(cmd, config, daemonDir);
				} catch (err) {
					console.error('Failed to contact the daemon.');
					process.exit(1);
				}

				if (response.type === 'error') {
					if (options.json && !options.human) {
						process.stderr.write(JSON.stringify({ code: response.code, message: response.message }) + '\n');
					} else {
						console.error(`✗ ${response.message}`);
					}
					process.exit(response.code === 'VALIDATION_FAILED' ? 2 : 1);
				}

				const { executionId } = response;

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
				let finalState: ExecutionState;
				try {
					finalState = await waitForCompletion(executionId, daemonDir, timeoutMs);
				} catch (err) {
					if (options.json && !options.human) {
						process.stderr.write(JSON.stringify({ error: 'execution_timeout', executionId }) + '\n');
					} else {
						console.error('✗ Execution timed out.');
					}
					process.exit(124); // timeout exit code
				}

				const durationMs = Date.now() - start;
				if (options.json && !options.human) {
					// v1: step outputs are not persisted in ExecutionStore — only step status is tracked.
					// The outputs map is always empty in --wait --json mode. Tracked for v2.
					const stepOutputs: Record<string, Record<string, unknown>> = {};
					process.stdout.write(
						JSON.stringify({ executionId, status: finalState.status, outputs: stepOutputs, durationMs }) +
							'\n'
					);
				} else {
					if (finalState.status === 'completed') {
						console.log(`✓ Flow completed in ${durationMs}ms`);
					} else {
						console.error(`✗ Flow failed`);
						process.exit(1);
					}
				}
				process.exit(0);
			}
		);
}
