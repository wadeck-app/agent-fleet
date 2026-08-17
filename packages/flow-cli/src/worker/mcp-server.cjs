'use strict';
/**
 * MCP stdio server for the flow daemon — provideSteps tool.
 *
 * Protocol: JSON-RPC 2.0 over stdio (line-delimited NDJSON).
 * Claude sends requests to stdin; this server writes responses to stdout.
 *
 * When provideSteps is called, the steps are forwarded to WorkerAdapter
 * via a TCP callback connection on FLOW_MCP_CALLBACK_PORT.
 */

const net = require('net');
const readline = require('readline');

const CALLBACK_PORT = parseInt(process.env.FLOW_MCP_CALLBACK_PORT || '0', 10);
const CALLBACK_TOKEN = process.env.FLOW_MCP_CALLBACK_TOKEN || '';
const EXECUTION_ID = process.env.FLOW_EXECUTION_ID || '';

/**
 * provideSteps tool definition.
 *
 * Best-practice notes applied (MCP spec 2026-07-28):
 * - `title` is the display name; `name` is the programmatic identifier
 * - `description` states purpose, when to use, and when NOT to use
 * - Property descriptions explain what, valid values, constraints, and relationships
 * - `examples` at the `steps` property level follow JSON Schema 2020-12 (array of valid values)
 *   Each example value is a complete, runnable array of steps
 * - `additionalProperties: true` on step items is intentional: the orchestrator accepts
 *   extra fields (e.g. output, log, toolLog, session) and ignores unknown ones gracefully
 * - Error responses from tools/call are actionable text so the LLM can self-correct
 */
const PROVIDE_STEPS_TOOL = {
	name: 'provideSteps',
	title: 'Inject Workflow Steps',
	description: [
		'Add new steps to the running flow execution at runtime.',
		'The flow orchestrator schedules injected steps according to their `depends` field:',
		'steps with no depends run immediately in parallel; steps with depends run after',
		'their dependencies complete. This enables dynamic, conditional, iterative, and',
		'sub-task patterns.',
		'',
		'Use when: you need to decompose a task into steps at runtime, build a conditional',
		'branch, or create a feedback loop (retry a step on failure via onFailure.goto).',
		'',
		'Do NOT use when: the workflow steps are known upfront (define them in the YAML',
		'instead); or to inject more than the configured maxInjectedSteps limit per call.',
	].join(' '),
	inputSchema: {
		type: 'object',
		required: ['steps'],
		additionalProperties: false,
		properties: {
			steps: {
				type: 'array',
				minItems: 1,
				description: [
					'Ordered array of step definitions to inject.',
					'Steps are scheduled by the orchestrator — order in this array does NOT',
					'imply execution order; use `depends` to express ordering constraints.',
				].join(' '),
				items: {
					type: 'object',
					required: ['id', 'type'],
					additionalProperties: true,
					properties: {
						id: {
							type: 'string',
							pattern: '^[a-zA-Z0-9_-]+$',
							description: [
								'Unique identifier for this step within the execution.',
								'Must be unique across all steps (initial + injected).',
								'Used in `depends` references of other steps.',
								'Allowed characters: letters, digits, hyphens, underscores.',
							].join(' '),
						},
						type: {
							type: 'string',
							enum: ['script', 'model'],
							description: [
								'"script": runs a shell command; requires `script` field.',
								'"model": calls an AI model; requires `model` and `prompt` fields.',
							].join(' '),
						},
						script: {
							type: 'string',
							description: [
								'Shell command to execute (required when type is "script").',
								'Runs in the execution workspace directory.',
								'Multi-line scripts are supported.',
							].join(' '),
						},
						model: {
							type: 'string',
							enum: ['haiku', 'sonnet', 'opus'],
							description: [
								'AI model to use (required when type is "model").',
								'Prefer "haiku" for fast, cheap tasks; "sonnet" for complex reasoning.',
							].join(' '),
						},
						prompt: {
							type: 'string',
							description: [
								'Prompt to send to the model (required when type is "model").',
								'Supports template variables: ${{ steps.STEP_ID.outputs.FIELD }},',
								'${{ inputs.FIELD }}, ${{ context.workspaceDir }}.',
							].join(' '),
						},
						depends: {
							type: 'array',
							items: { type: 'string' },
							description: [
								'IDs of steps that must complete successfully before this step runs.',
								'Can reference initial flow steps or other injected steps.',
								'Omit (or use []) to run immediately in parallel with other ready steps.',
							].join(' '),
						},
						name: {
							type: 'string',
							description: 'Human-readable label for this step, shown in logs and flow history.',
						},
						env: {
							type: 'object',
							additionalProperties: { type: 'string' },
							description: [
								'Environment variables injected into the step process.',
								'Values support template variables (${{ }}).',
							].join(' '),
						},
						onFailure: {
							type: 'object',
							description: [
								'Feedback loop: re-run a target step when this step fails.',
								'Use to implement retry-with-improvement patterns.',
							].join(' '),
							required: ['goto'],
							additionalProperties: false,
							properties: {
								goto: {
									type: 'string',
									description:
										'ID of the step to re-run on failure (can be this step itself for self-retry).',
								},
								maxIterations: {
									type: 'integer',
									minimum: 1,
									maximum: 10,
									description: 'Max times the loop may fire before the execution fails. Default: 3.',
								},
								resetOnSuccess: {
									type: 'boolean',
									description:
										'If true, resets the iteration counter when the step eventually succeeds.',
								},
							},
						},
					},
				},
				// JSON Schema 2020-12 examples: array of valid values for this property.
				// Each element is a complete, runnable steps array illustrating a pattern.
				examples: [
					// Example 1: Sequential script steps with dependency
					[
						{ id: 'run-tests', type: 'script', name: 'Run test suite', script: 'npm test' },
						{
							id: 'report',
							type: 'script',
							name: 'Print result',
							script: 'echo "Tests passed"',
							depends: ['run-tests'],
						},
					],
					// Example 2: Model step that analyses output from a previous step
					[
						{
							id: 'analyse',
							type: 'model',
							model: 'haiku',
							name: 'Analyse test output',
							prompt: 'Review the test results in ${{ context.outputsDir }}/report.txt and summarise failures.',
							depends: ['run-tests'],
						},
					],
					// Example 3: Self-retry feedback loop (step re-runs itself on failure)
					[
						{
							id: 'generate',
							type: 'model',
							model: 'sonnet',
							name: 'Generate solution',
							prompt: 'Write a function that passes the tests.',
							onFailure: { goto: 'generate', maxIterations: 3, resetOnSuccess: true },
						},
					],
					// Example 4: Parallel steps (no depends — both run immediately)
					[
						{ id: 'lint', type: 'script', name: 'Lint code', script: 'npm run lint' },
						{ id: 'typecheck', type: 'script', name: 'Type check', script: 'npx tsc --noEmit' },
					],
				],
			},
		},
	},
};

/** Send JSON-RPC response to Claude via stdout. */
function respond(id, result) {
	process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function respondError(id, code, message) {
	process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

/** Forward injected steps to WorkerAdapter via TCP callback. */
function forwardSteps(steps) {
	return new Promise((resolve, reject) => {
		if (!CALLBACK_PORT) {
			reject(new Error('FLOW_MCP_CALLBACK_PORT not set'));
			return;
		}
		const socket = net.createConnection(CALLBACK_PORT, '127.0.0.1', () => {
			const payload = JSON.stringify({ token: CALLBACK_TOKEN, executionId: EXECUTION_ID, steps }) + '\n';
			socket.write(payload, () => {
				socket.end();
				resolve(undefined);
			});
		});
		socket.once('error', reject);
		// Timeout: 5s
		socket.setTimeout(5000, () => {
			socket.destroy(new Error('TCP callback timeout'));
		});
	});
}

/** Validate that each step has required fields for its type. Returns an error string or null. */
function validateSteps(steps) {
	for (const step of steps) {
		if (typeof step.id !== 'string' || !step.id) {
			return `Step is missing a valid "id" field: ${JSON.stringify(step)}`;
		}
		if (step.type !== 'script' && step.type !== 'model') {
			return `Step "${step.id}": type must be "script" or "model", got: ${JSON.stringify(step.type)}`;
		}
		if (step.type === 'script' && typeof step.script !== 'string') {
			return `Step "${step.id}" (type: script) is missing the required "script" field.`;
		}
		if (step.type === 'model' && typeof step.model !== 'string') {
			return `Step "${step.id}" (type: model) is missing the required "model" field (e.g. "haiku").`;
		}
		if (step.type === 'model' && typeof step.prompt !== 'string') {
			return `Step "${step.id}" (type: model) is missing the required "prompt" field.`;
		}
	}
	return null;
}

/** Handle a single JSON-RPC request. */
async function handle(req) {
	const id = req.id ?? null;

	switch (req.method) {
		case 'initialize':
			respond(id, {
				protocolVersion: '2024-11-05',
				capabilities: { tools: {} },
				serverInfo: { name: 'flow-mcp', version: '1.0.0' },
			});
			break;

		case 'initialized':
			// Notification — no response
			break;

		case 'ping':
			respond(id, {});
			break;

		case 'tools/list':
			respond(id, { tools: [PROVIDE_STEPS_TOOL] });
			break;

		case 'tools/call': {
			const params = req.params || {};
			if (params.name !== 'provideSteps') {
				respondError(id, -32601, `Unknown tool: ${params.name}. Available tools: provideSteps`);
				break;
			}
			const args = params.arguments || {};
			if (!Array.isArray(args.steps) || args.steps.length === 0) {
				// Actionable error: tells the LLM exactly what to fix
				respond(id, {
					content: [
						{
							type: 'text',
							text: 'Error: "steps" must be a non-empty array of step objects. Each step needs at minimum: id (string) and type ("script" or "model").',
						},
					],
					isError: true,
				});
				break;
			}
			const validationError = validateSteps(args.steps);
			if (validationError) {
				respond(id, {
					content: [{ type: 'text', text: `Validation error: ${validationError}` }],
					isError: true,
				});
				break;
			}
			try {
				await forwardSteps(args.steps);
				const injectedIds = args.steps.map(s => s.id);
				respond(id, {
					content: [
						{
							type: 'text',
							text: `Successfully injected ${injectedIds.length} step(s): ${injectedIds.join(', ')}. The orchestrator will schedule them according to their depends fields.`,
						},
					],
					structuredContent: { injected: injectedIds },
				});
			} catch (err) {
				respond(id, {
					content: [
						{
							type: 'text',
							text: `Failed to inject steps: ${String(err)}. The flow daemon may have completed this execution already.`,
						},
					],
					isError: true,
				});
			}
			break;
		}

		default:
			respondError(id, -32601, `Method not found: ${req.method}`);
	}
}

// Read JSON-RPC requests line by line from stdin
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', line => {
	const trimmed = line.trim();
	if (!trimmed) return;
	let req;
	try {
		req = JSON.parse(trimmed);
	} catch {
		process.stdout.write(
			JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n'
		);
		return;
	}
	handle(req).catch(err => {
		process.stderr.write(`[mcp-server] unhandled error: ${String(err)}\n`);
	});
});
