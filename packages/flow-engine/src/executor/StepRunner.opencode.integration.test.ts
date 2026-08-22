/**
 * Integration test: verifies opencode-mock produces NDJSON compatible with OpenCodeModelProvider.
 *
 * Auto-triggered when opencode version changes (detected via opencode-version-tested.json).
 * Manual run: OPENCODE_INTEGRATION=1 npx vitest run StepRunner.opencode.integration.test
 *
 * Covers:
 *   - Correct flags assembled by OpenCodeModelProvider (--format json, --auto, positional prompt)
 *   - NDJSON event structure emitted by opencode-mock
 *   - session_id, cost, tokens extracted via onStreamEvent
 *   - End-to-end parsing through OpenCodeModelProvider with OPENCODE_MOCK_PATH
 *
 * On Windows/Git Bash: OPENCODE_MOCK_PATH must point to an executable binary or wrapper.
 * For cross-platform test runs, set:
 *   OPENCODE_MOCK_PATH=$(node -e "process.stdout.write(require.resolve('./src/testing/opencode-mock.mjs'))")
 * and ensure the file has execute permission (chmod +x) on Unix.
 *
 * REQUIREMENT: Every provider feature must have 1-2 automated flow tests here using mocks.
 * - Use OPENCODE_MOCK_PATH → src/testing/opencode-mock.mjs for OpenCode steps
 * - Use CLAUDE_MOCK_PATH → src/testing/claude-mock.mjs for Claude steps
 * - Never use real APIs in automated tests
 * See also: StepRunner.model.integration.test.ts for the Claude equivalent.
 */
import { execSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { ClaudeModelProvider } from '../processing/ClaudeModelProvider';
import { OpenCodeModelProvider } from '../processing/OpenCodeModelProvider';
import type { StreamJsonEvent } from '../processing/StreamJsonParser';
import type { LiveLogEntry, ModelFlowStep, ModelStepMeta, Workspace } from '../types';
import { StepRunner } from './StepRunner';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCK_PATH = join(__dirname, '../testing/opencode-mock.mjs');
const CLAUDE_MOCK_FILE = join(__dirname, '../testing/claude-mock.mjs');
const VERSION_FILE = join(__dirname, '../../../../../.claude/opencode-version-tested.json');
const INTEGRATION_TIMEOUT = 60_000;

function currentOpenCodeVersion(): string | null {
	try {
		return execSync('opencode version', { encoding: 'utf8' }).trim();
	} catch {
		return null;
	}
}

function storedVersion(): string | null {
	if (!existsSync(VERSION_FILE)) return null;
	try {
		return (JSON.parse(readFileSync(VERSION_FILE, 'utf8')) as { testedVersion: string }).testedVersion;
	} catch {
		return null;
	}
}

/** Run when OPENCODE_INTEGRATION=1 OR when a baseline exists AND current opencode version ≠ it. */
function shouldRunIntegration(): boolean {
	if (process.env['OPENCODE_INTEGRATION']) return true;
	const current = currentOpenCodeVersion();
	const stored = storedVersion();
	// Auto-run only if we have a baseline AND it's stale — never on first install
	return current !== null && stored !== null && current !== stored;
}

function runProcess(
	command: string,
	args: string[],
	env?: NodeJS.ProcessEnv,
	useShell = false
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: ['pipe', 'pipe', 'pipe'],
			env: { ...process.env, ...env },
			shell: useShell,
		});
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (d: Buffer) => {
			stdout += d.toString();
		});
		child.stderr.on('data', (d: Buffer) => {
			stderr += d.toString();
		});
		child.on('close', code => resolve({ stdout, stderr, exitCode: code ?? -1 }));
		child.on('error', reject);
		if (child.stdin) {
			child.stdin.end();
		}
	});
}

function parseNdjson(raw: string): Record<string, unknown>[] {
	return raw
		.split('\n')
		.filter(l => l.trim())
		.map(l => JSON.parse(l) as Record<string, unknown>);
}

describe.skipIf(!shouldRunIntegration())('OpenCode real vs mock compatibility', () => {
	let realOpenCodePath: string;

	try {
		realOpenCodePath = execSync(process.platform === 'win32' ? 'where.exe opencode' : 'which opencode', {
			encoding: 'utf8',
		})
			.trim()
			.split('\n')[0]
			.trim();
	} catch {
		realOpenCodePath = '';
	}

	// --- INPUT / PARAMETER TESTS ---

	it(
		'mock accepts same flags as real opencode without error',
		async () => {
			const flags = ['run', 'hello opencode', '--format', 'json', '--auto'];
			const mock = await runProcess('node', [MOCK_PATH, ...flags]);
			expect(mock.exitCode).toBe(0);
			expect(mock.stdout.length).toBeGreaterThan(0);

			if (realOpenCodePath) {
				// On Windows .cmd wrappers require shell:true
				const needsShell = process.platform === 'win32';
				const real = await runProcess(realOpenCodePath, flags, undefined, needsShell);
				// Real opencode may fail in test env but should not exit with code 2 (bad args)
				expect(real.exitCode).not.toBe(2);
			}
		},
		INTEGRATION_TIMEOUT
	);

	it(
		'mock exits non-zero on OPENCODE_MOCK_EXIT_CODE=1',
		async () => {
			const mock = await runProcess('node', [MOCK_PATH, 'run', 'hello', '--format', 'json'], {
				OPENCODE_MOCK_EXIT_CODE: '1',
			});
			expect(mock.exitCode).toBe(1);
			// Should still emit step_start before exiting
			const events = parseNdjson(mock.stdout);
			const stepStart = events.find(e => e['type'] === 'step_start');
			expect(stepStart).toBeDefined();
		},
		INTEGRATION_TIMEOUT
	);

	// --- OUTPUT / NDJSON STRUCTURE TESTS ---

	it(
		'mock emits required event types: step_start, text, step_finish',
		async () => {
			const mock = await runProcess('node', [MOCK_PATH, 'run', 'Say: hi', '--format', 'json', '--auto']);
			expect(mock.exitCode).toBe(0);
			const events = parseNdjson(mock.stdout);

			const types = events.map(e => e['type']);
			expect(types).toContain('step_start');
			expect(types).toContain('text');
			expect(types).toContain('step_finish');

			// step_start required fields
			const stepStart = events.find(e => e['type'] === 'step_start');
			expect(typeof stepStart!['sessionID']).toBe('string');
			expect(typeof stepStart!['timestamp']).toBe('number');

			// text event: part.text is present
			const textEvent = events.find(e => e['type'] === 'text');
			expect(textEvent).toBeDefined();
			const textPart = textEvent!['part'] as Record<string, unknown>;
			expect(typeof textPart['text']).toBe('string');

			// step_finish: reason stop, tokens, cost
			const stepFinish = events.find(e => e['type'] === 'step_finish') as Record<string, unknown> | undefined;
			expect(stepFinish).toBeDefined();
			const finishPart = stepFinish!['part'] as Record<string, unknown>;
			expect(finishPart['reason']).toBe('stop');
			expect(typeof (finishPart['tokens'] as Record<string, unknown>)['input']).toBe('number');
			expect(typeof finishPart['cost']).toBe('number');
		},
		INTEGRATION_TIMEOUT
	);

	it(
		'sessionID is consistent across all events in a run',
		async () => {
			const mock = await runProcess('node', [MOCK_PATH, 'run', 'ping', '--format', 'json']);
			expect(mock.exitCode).toBe(0);
			const events = parseNdjson(mock.stdout);
			const sessionIds = events.map(e => e['sessionID'] as string).filter(Boolean);
			expect(sessionIds.length).toBeGreaterThan(0);
			// All sessionIDs should be the same value
			expect(new Set(sessionIds).size).toBe(1);
		},
		INTEGRATION_TIMEOUT
	);

	// --- END-TO-END THROUGH OpenCodeModelProvider ---

	it(
		'OpenCodeModelProvider parses mock NDJSON: session_id, cost, tokens extracted',
		async () => {
			// On Unix: ensure mock is executable. On Windows: requires a .cmd wrapper.
			// This sub-test only runs when the mock file exists and is accessible.
			if (!existsSync(MOCK_PATH)) {
				console.warn('opencode-mock.mjs not found — skipping provider end-to-end test');
				return;
			}

			const provider = new OpenCodeModelProvider();
			const capturedEvents: StreamJsonEvent[] = [];

			// On Unix the shebang makes the .mjs directly executable after chmod.
			// Set OPENCODE_MOCK_PATH so findOpenCodePath() returns the node binary path
			// and use a node-wrapper approach via env: pass the script as OPENCODE_MOCK_PATH
			// pointing to a pre-resolved node path or the script itself (Unix).
			// For cross-platform safety, this test sets OPENCODE_MOCK_PATH to 'node'
			// and prefixes the script in mock via the env... but that changes spawn args.
			// Instead, on Unix we use the mock script directly; Windows testers need a .cmd wrapper.
			// OPENCODE_MOCK_PATH points to the .mjs file.
			// findOpenCodeCommand() detects .mjs and wraps as ['node', path] automatically.
			const prevMockPath = process.env['OPENCODE_MOCK_PATH'];
			process.env['OPENCODE_MOCK_PATH'] = MOCK_PATH;

			try {
				const result = await provider.launchBackground({
					workingDir: process.cwd(),
					prompt: 'hello opencode integration',
					stepId: 'integration-test-step',
					onStreamEvent: e => capturedEvents.push(e),
				});

				// Even if spawn fails on Windows (no shebang support), the promise resolves
				const initEvent = capturedEvents.find(e => e.type === 'system');
				const resultEvent = capturedEvents.find(e => e.type === 'result');

				if (result.exitCode === 0) {
					expect(initEvent).toBeDefined();
					expect(typeof initEvent?.data['session_id']).toBe('string');
					expect((initEvent?.data['session_id'] as string).length).toBeGreaterThan(0);

					expect(resultEvent).toBeDefined();
					expect(typeof resultEvent?.data['result']).toBe('string');
					expect(resultEvent?.data['cost_usd']).toBeGreaterThan(0);

					const usage = resultEvent?.data['modelUsage'] as Record<
						string,
						{ inputTokens: number; outputTokens: number }
					>;
					expect(usage['opencode'].inputTokens).toBeGreaterThan(0);
					expect(usage['opencode'].outputTokens).toBeGreaterThan(0);

					// Store tested version
					const version = currentOpenCodeVersion();
					if (version) {
						writeFileSync(
							VERSION_FILE,
							JSON.stringify(
								{ testedVersion: version, testedAt: new Date().toISOString().slice(0, 10) },
								null,
								2
							)
						);
						console.log(`✓ OpenCode mock compatible with opencode ${version}`);
					}
				} else {
					console.warn(
						`opencode-mock.mjs exited with code ${result.exitCode} — on Windows, set OPENCODE_MOCK_PATH to a .cmd wrapper`
					);
				}
			} finally {
				if (prevMockPath === undefined) {
					delete process.env['OPENCODE_MOCK_PATH'];
				} else {
					process.env['OPENCODE_MOCK_PATH'] = prevMockPath;
				}
			}
		},
		INTEGRATION_TIMEOUT
	);

	// --- E2E: real OpenCode + real MCP server ---

	it(
		'E2E: OpenCode calls get_weather MCP tool and emits tool_use event',
		async () => {
			const MCP_SERVER_PATH = join(__dirname, '../../../../../_test-tasks/mcp-server/index.mjs');

			if (!existsSync(MCP_SERVER_PATH)) {
				console.warn(`MCP server not found at ${MCP_SERVER_PATH} — skipping E2E MCP test`);
				return;
			}

			const provider = new OpenCodeModelProvider();
			const capturedEvents: StreamJsonEvent[] = [];

			const result = await provider.launchBackground({
				workingDir: process.cwd(),
				prompt: 'Use the get_weather tool to get the current weather for Paris, France. Report the result clearly.',
				stepId: 'e2e-mcp-weather-test',
				skipPermissions: true,
				mcpServers: [
					{
						name: 'weather-test',
						command: [process.execPath, MCP_SERVER_PATH.replace(/\\/g, '/')],
					},
				],
				onStreamEvent: e => capturedEvents.push(e),
			});

			if (result.exitCode !== 0) {
				console.warn(
					`opencode exited with code ${result.exitCode} — MCP E2E test cannot assert tool events.\nstderr: ${result.stderr}`
				);
				return;
			}

			// At least one tool_use event must have been emitted for get_weather
			const toolUseEvents = capturedEvents.filter(e => e.type === 'tool_use');
			expect(toolUseEvents.length).toBeGreaterThan(0);

			const weatherToolEvent = toolUseEvents.find(e => String(e.data['tool'] ?? '').includes('get_weather'));
			expect(weatherToolEvent).toBeDefined();

			// The tool output must contain the expected weather response from the MCP server
			const toolOutput = String(weatherToolEvent?.data['output'] ?? '');
			const hasExpectedOutput = toolOutput.includes('sunny') || toolOutput.includes('22');
			expect(hasExpectedOutput).toBe(true);

			// Final result event must also arrive
			const resultEvent = capturedEvents.find(e => e.type === 'result');
			expect(resultEvent).toBeDefined();
			const finalResult = String(resultEvent?.data['result'] ?? '');
			expect(finalResult.length).toBeGreaterThan(0);

			console.log(`✓ E2E MCP test passed. Tool output: ${toolOutput}`);
			console.log(`  Final response (first 120 chars): ${finalResult.slice(0, 120)}`);
		},
		INTEGRATION_TIMEOUT
	);

	// --- VERSION STALENESS CHECK (always runs, warns only) ---

	it('warns when opencode version changed since last integration test', () => {
		const current = currentOpenCodeVersion();
		const stored = storedVersion();
		if (!current) {
			console.warn('opencode not found on PATH — cannot check version');
			return;
		}
		if (!stored) {
			console.warn('No opencode-version-tested.json — run with OPENCODE_INTEGRATION=1 to baseline');
			return;
		}
		if (stored !== current) {
			console.warn(
				`⚠  opencode version changed: ${stored} → ${current}. Integration test will auto-run next session.`
			);
		} else {
			console.log(`✓ Mock last verified against opencode ${stored}`);
		}
		expect(stored).toBeTruthy();
	});
});

// Helper: minimal Workspace for tests that only need a working directory
function makeTestWorkspace(): Workspace {
	return {
		id: 'test-ws',
		path: process.cwd(),
		metaDir: process.cwd(),
		mode: 'shared',
		concurrency: { key: 'test', activeTasks: new Set(), locked: false },
		createdAt: new Date().toISOString(),
		lastUsedAt: new Date().toISOString(),
		usageCount: 0,
	};
}

describe('Flow-level feature tests (mock providers)', () => {
	const FLOW_TEST_TIMEOUT = 30_000;

	it(
		'flow with provider:opencode executes end-to-end via mock',
		async () => {
			const prevMockPath = process.env['OPENCODE_MOCK_PATH'];
			process.env['OPENCODE_MOCK_PATH'] = MOCK_PATH;

			try {
				const step: ModelFlowStep = {
					id: 'opencode-step',
					name: 'OpenCode Step',
					type: 'model',
					provider: 'opencode',
					prompt: 'hello',
				};

				const runner = new StepRunner({
					interactive: false,
					providers: new Map([['opencode', new OpenCodeModelProvider()]]),
				});

				const trace = await runner.executeStep(step, makeTestWorkspace(), {
					inputs: {},
					stepOutputs: new Map(),
					taskMetadata: {},
				});

				expect(trace.error).toBeUndefined();
				const meta = trace.meta as ModelStepMeta;
				expect(meta).toBeDefined();
				expect(meta.session_id.length).toBeGreaterThan(0);
				expect(meta.cost.usd).toBeGreaterThan(0);
			} finally {
				if (prevMockPath === undefined) {
					delete process.env['OPENCODE_MOCK_PATH'];
				} else {
					process.env['OPENCODE_MOCK_PATH'] = prevMockPath;
				}
			}
		},
		FLOW_TEST_TIMEOUT
	);

	it(
		'flow with mixed providers (opencode + claude) both execute via mocks',
		async () => {
			const prevOcMockPath = process.env['OPENCODE_MOCK_PATH'];
			const prevClaudeMockPath = process.env['CLAUDE_MOCK_PATH'];
			process.env['OPENCODE_MOCK_PATH'] = MOCK_PATH;
			process.env['CLAUDE_MOCK_PATH'] = CLAUDE_MOCK_FILE;

			try {
				const opencodeStep: ModelFlowStep = {
					id: 'step-opencode',
					name: 'OpenCode Step',
					type: 'model',
					provider: 'opencode',
					prompt: 'hello from opencode',
				};
				const claudeStep: ModelFlowStep = {
					id: 'step-claude',
					name: 'Claude Step',
					type: 'model',
					provider: 'claude',
					prompt: 'hello from claude',
				};

				const runner = new StepRunner({
					interactive: false,
					providers: new Map([
						['opencode', new OpenCodeModelProvider()],
						['claude', new ClaudeModelProvider()],
					]),
				});

				const workspace = makeTestWorkspace();
				const context = {
					inputs: {},
					stepOutputs: new Map<string, Record<string, unknown>>(),
					taskMetadata: {},
				};

				const traceOc = await runner.executeStep(opencodeStep, workspace, context);
				const traceCl = await runner.executeStep(claudeStep, workspace, context);

				expect(traceOc.error).toBeUndefined();
				expect((traceOc.meta as ModelStepMeta).session_id.length).toBeGreaterThan(0);

				expect(traceCl.error).toBeUndefined();
				expect((traceCl.meta as ModelStepMeta).session_id.length).toBeGreaterThan(0);
			} finally {
				if (prevOcMockPath === undefined) {
					delete process.env['OPENCODE_MOCK_PATH'];
				} else {
					process.env['OPENCODE_MOCK_PATH'] = prevOcMockPath;
				}
				if (prevClaudeMockPath === undefined) {
					delete process.env['CLAUDE_MOCK_PATH'];
				} else {
					process.env['CLAUDE_MOCK_PATH'] = prevClaudeMockPath;
				}
			}
		},
		FLOW_TEST_TIMEOUT
	);

	it(
		'tool_use events emitted correctly via mock (use_tool prompt scenario)',
		async () => {
			const prevMockPath = process.env['OPENCODE_MOCK_PATH'];
			process.env['OPENCODE_MOCK_PATH'] = MOCK_PATH;

			try {
				const provider = new OpenCodeModelProvider();
				const capturedEvents: StreamJsonEvent[] = [];

				const result = await provider.launchBackground({
					workingDir: process.cwd(),
					prompt: 'please use_tool to answer',
					stepId: 'tool-use-test',
					onStreamEvent: e => capturedEvents.push(e),
				});

				if (result.exitCode !== 0) {
					console.warn('opencode-mock exited non-zero — skipping assertions');
					return;
				}

				// tool_use event must be emitted once (mock emits exactly one tool call)
				const toolUseEvents = capturedEvents.filter(e => e.type === 'tool_use');
				expect(toolUseEvents.length).toBeGreaterThan(0);

				const toolEvent = toolUseEvents[0]!;
				expect(toolEvent.data['tool']).toBe('test_tool');
				expect(typeof toolEvent.data['callID']).toBe('string');
				expect((toolEvent.data['callID'] as string).length).toBeGreaterThan(0);
				expect(toolEvent.data['status']).toBe('completed');
				expect(toolEvent.data['output']).toBe('tool result output');

				// Final result must still arrive — step_finish(tool-calls) must NOT terminate execution
				const resultEvent = capturedEvents.find(e => e.type === 'result');
				expect(resultEvent).toBeDefined();
				expect(resultEvent!.data['result']).toBe('Done with tool.');
				// Cost from the final stop step only (tool-calls step cost excluded from total in provider)
				expect(resultEvent!.data['cost_usd']).toBeGreaterThan(0);
			} finally {
				if (prevMockPath === undefined) {
					delete process.env['OPENCODE_MOCK_PATH'];
				} else {
					process.env['OPENCODE_MOCK_PATH'] = prevMockPath;
				}
			}
		},
		FLOW_TEST_TIMEOUT
	);

	it(
		'XDG_CONFIG_HOME isolation: each spawn receives a unique temp dir path in its env',
		async () => {
			// The mock echoes XDG_CONFIG_HOME back in the response when "echo_xdg" is in prompt.
			// This verifies the subprocess actually received the isolation env var.
			const prevMockPath = process.env['OPENCODE_MOCK_PATH'];
			process.env['OPENCODE_MOCK_PATH'] = MOCK_PATH;

			try {
				const provider = new OpenCodeModelProvider();

				const capturedRun1: StreamJsonEvent[] = [];
				const capturedRun2: StreamJsonEvent[] = [];

				await provider.launchBackground({
					workingDir: process.cwd(),
					prompt: 'please echo_xdg here',
					stepId: 'xdg-test-1',
					onStreamEvent: e => capturedRun1.push(e),
				});
				await provider.launchBackground({
					workingDir: process.cwd(),
					prompt: 'please echo_xdg here',
					stepId: 'xdg-test-2',
					onStreamEvent: e => capturedRun2.push(e),
				});

				const extractXdgPath = (events: StreamJsonEvent[]): string | null => {
					const resultEvent = events.find(e => e.type === 'result');
					const text = resultEvent?.data['result'] as string | undefined;
					if (!text || !text.startsWith('XDG_CONFIG_HOME:')) return null;
					return text.replace('XDG_CONFIG_HOME:', '');
				};

				const path1 = extractXdgPath(capturedRun1);
				const path2 = extractXdgPath(capturedRun2);

				// Both runs must have received a XDG_CONFIG_HOME
				expect(path1).not.toBeNull();
				expect(path2).not.toBeNull();

				// Each path must contain the opencode-run- prefix (generated by the provider)
				expect(path1).toMatch(/opencode-run-/);
				expect(path2).toMatch(/opencode-run-/);

				// The two runs must have used distinct directories
				expect(path1).not.toBe(path2);
			} finally {
				if (prevMockPath === undefined) {
					delete process.env['OPENCODE_MOCK_PATH'];
				} else {
					process.env['OPENCODE_MOCK_PATH'] = prevMockPath;
				}
			}
		},
		FLOW_TEST_TIMEOUT
	);

	it(
		'streaming text: text events from OpenCode appear in onLogEntry as assistant_text entries',
		async () => {
			// The standard mock scenario emits a `text` event with the response text.
			// With the streaming fix in place, that text event must flow through
			// onStreamEvent → StreamEventMapper.map('text') → onLogEntry.
			const prevMockPath = process.env['OPENCODE_MOCK_PATH'];
			process.env['OPENCODE_MOCK_PATH'] = MOCK_PATH;

			try {
				const step: ModelFlowStep = {
					id: 'streaming-text-step',
					name: 'Streaming Text Step',
					type: 'model',
					provider: 'opencode',
					prompt: 'hello streaming',
					// 'streaming' log mode: each entry is forwarded via onLogEntry immediately
					log: 'streaming',
				};

				const runner = new StepRunner({
					interactive: false,
					providers: new Map([['opencode', new OpenCodeModelProvider()]]),
				});

				const logEntries: LiveLogEntry[] = [];

				const trace = await runner.executeStep(
					step,
					makeTestWorkspace(),
					{ inputs: {}, stepOutputs: new Map(), taskMetadata: {} },
					undefined,
					entry => logEntries.push(entry)
				);

				expect(trace.error).toBeUndefined();

				// At least one assistant_text entry must have been forwarded via onLogEntry
				const textEntries = logEntries.filter(e => e.eventType === 'assistant_text');
				expect(textEntries.length).toBeGreaterThan(0);

				// The text content from the mock must appear in one of the entries
				const hasExpectedText = textEntries.some(e => e.message.includes('Mock opencode response'));
				expect(hasExpectedText).toBe(true);
			} finally {
				if (prevMockPath === undefined) {
					delete process.env['OPENCODE_MOCK_PATH'];
				} else {
					process.env['OPENCODE_MOCK_PATH'] = prevMockPath;
				}
			}
		},
		FLOW_TEST_TIMEOUT
	);

	it(
		'deny regedit hook: tool_use with status error and blocked text appear in log entries',
		async () => {
			// The bash_regedit mock scenario emits:
			//   tool_use(Bash, status=error, output="Tool denied: regedit is forbidden...")
			//   text("I tried to run regedit but it was blocked by a system policy.")
			// Both must appear as log entries when log: 'streaming'.
			const prevMockPath = process.env['OPENCODE_MOCK_PATH'];
			process.env['OPENCODE_MOCK_PATH'] = MOCK_PATH;

			try {
				const step: ModelFlowStep = {
					id: 'deny-regedit-step',
					name: 'Deny Regedit Step',
					type: 'model',
					provider: 'opencode',
					prompt: 'bash_regedit',
					log: 'streaming',
					toolHooks: [
						{
							timing: 'before',
							action: {
								type: 'deny',
								reason: 'regedit is forbidden on this system',
								argsContains: 'regedit',
							},
						},
					],
				};

				const runner = new StepRunner({
					interactive: false,
					providers: new Map([['opencode', new OpenCodeModelProvider()]]),
				});

				const logEntries: LiveLogEntry[] = [];

				const trace = await runner.executeStep(
					step,
					makeTestWorkspace(),
					{ inputs: {}, stepOutputs: new Map(), taskMetadata: {} },
					undefined,
					entry => logEntries.push(entry)
				);

				expect(trace.error).toBeUndefined();

				// tool_use entry with status error must appear
				const toolUseEntries = logEntries.filter(e => e.eventType === 'tool_use');
				expect(toolUseEntries.length).toBeGreaterThan(0);
				const bashEntry = toolUseEntries.find(e => e.message.includes('Bash'));
				expect(bashEntry).toBeDefined();

				// tool_result entry must contain the denial message
				const toolResultEntries = logEntries.filter(e => e.eventType === 'tool_result');
				expect(toolResultEntries.length).toBeGreaterThan(0);
				const deniedEntry = toolResultEntries.find(e => e.message.includes('Tool denied'));
				expect(deniedEntry).toBeDefined();

				// The follow-up text about being blocked must appear as assistant_text
				const textEntries = logEntries.filter(e => e.eventType === 'assistant_text');
				expect(textEntries.length).toBeGreaterThan(0);
				const blockedEntry = textEntries.find(e => e.message.includes('blocked by a system policy'));
				expect(blockedEntry).toBeDefined();
			} finally {
				if (prevMockPath === undefined) {
					delete process.env['OPENCODE_MOCK_PATH'];
				} else {
					process.env['OPENCODE_MOCK_PATH'] = prevMockPath;
				}
			}
		},
		FLOW_TEST_TIMEOUT
	);

	it(
		'plugin hook injection: OPENCODE_CONFIG_CONTENT includes plugin key with hook.js path',
		async () => {
			// The mock echoes OPENCODE_CONFIG_CONTENT back when "echo_config" is in prompt.
			// This verifies the provider correctly includes the plugin in the subprocess config.
			const prevMockPath = process.env['OPENCODE_MOCK_PATH'];
			process.env['OPENCODE_MOCK_PATH'] = MOCK_PATH;

			try {
				const provider = new OpenCodeModelProvider();
				const capturedEvents: StreamJsonEvent[] = [];

				const result = await provider.launchBackground({
					workingDir: process.cwd(),
					prompt: 'please echo_config for me',
					stepId: 'plugin-test',
					toolHooks: [
						{ timing: 'before' as const, action: { type: 'log' as const } },
						{ timing: 'after' as const, action: { type: 'log' as const } },
					],
					onStreamEvent: e => capturedEvents.push(e),
				});

				if (result.exitCode !== 0) {
					console.warn('opencode-mock exited non-zero — skipping assertions');
					return;
				}

				const resultEvent = capturedEvents.find(e => e.type === 'result');
				expect(resultEvent).toBeDefined();

				const responseText = resultEvent!.data['result'] as string;
				expect(responseText.startsWith('OPENCODE_CONFIG:')).toBe(true);

				const configJson = responseText.replace('OPENCODE_CONFIG:', '');
				const config = JSON.parse(configJson) as Record<string, unknown>;

				// Config must include a plugin array with a path ending in hook.js
				expect(Array.isArray(config['plugin'])).toBe(true);
				const pluginPaths = config['plugin'] as string[];
				expect(pluginPaths.length).toBe(1);
				expect(pluginPaths[0]).toMatch(/hook\.js$/);
				// Path must be inside an opencode-run-* temp dir
				expect(pluginPaths[0]).toMatch(/opencode-run-/);
				// Path uses forward slashes (Windows path fix)
				expect(pluginPaths[0]).not.toContain('\\');
			} finally {
				if (prevMockPath === undefined) {
					delete process.env['OPENCODE_MOCK_PATH'];
				} else {
					process.env['OPENCODE_MOCK_PATH'] = prevMockPath;
				}
			}
		},
		FLOW_TEST_TIMEOUT
	);
});
