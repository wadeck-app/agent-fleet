#!/usr/bin/env node

/**
 * Mock codex CLI for deterministic testing.
 *
 * Mirrors the real `codex exec --json` (codex-cli 0.163.0) in the places the provider depends on,
 * and StepRunner.codex.integration.test.ts compares it with the real CLI. What is emulated:
 *
 * Event schema (JSONL on stdout)
 *   {"type":"thread.started","thread_id":"<uuid>"}
 *   {"type":"turn.started"}
 *   {"type":"item.started"|"item.completed","item":{...}} with item.type
 *       command_execution { command, aggregated_output, exit_code: N|null, status }
 *       mcp_tool_call     { server, tool, arguments, result: {content[],structured_content}|null,
 *                           error: {message}|null, status: in_progress|completed|failed }
 *       file_change       { changes: [{path, kind}], status }
 *       agent_message     { text }
 *       error             { message }   (diagnostics)
 *   {"type":"turn.completed","usage":{input_tokens,cached_input_tokens,cache_write_input_tokens,
 *       output_tokens,reasoning_output_tokens}}
 *   failure: {"type":"error","message":...} then {"type":"turn.failed","error":{"message":...}}, exit 1
 *   Real codex reports NO cost: there is no cost field anywhere, so this mock has none either.
 *
 * Command line
 *   `codex exec [resume <threadId>] [flags] [--] [prompt]`. `exec resume` accepts a SMALLER flag set
 *   than `exec` (no --sandbox, no --approve-for-me: real codex exits 2 "unexpected argument"), and so
 *   does this mock. Unknown flags exit 2. Without `exec` the mock plays the TUI and just exits 0.
 *
 * Configuration (`-c key=value`, value parsed as TOML, falling back to a literal string like codex)
 *   - mcp_servers.<name>.{command,args,env,cwd,enabled,required,default_tools_approval_mode}
 *       required=true + program not found -> exit 1 with codex's stderr message, before any event.
 *       A tool call is refused ("requires approval, but approval policy is never") unless the server
 *       has default_tools_approval_mode="approve" or the run has --approve-for-me.
 *   - hooks.PreToolUse / hooks.PostToolUse: command hooks, run ONLY when --dangerously-bypass-hook-trust
 *       is present (real codex silently skips untrusted hooks). Payload and deny protocol as in real codex.
 *   - sandbox_mode, approval_policy, approvals_reviewer, web_search, features.<name>
 *   Default sandbox is read-only (what a plain `codex exec` ran with in testing); --approve-for-me
 *   is workspace-write.
 *
 * Env
 *   CODEX_MOCK_RESPONSE   overrides response text.
 *   CODEX_MOCK_EXIT_CODE  (default 0) simulates failure (real codex exits 1 on turn.failed).
 *
 * Special prompt keywords
 *   "use_tool"               a command_execution item before the answer (Bash hooks apply; shell_tool
 *                            disabled -> the answer says there is no shell)
 *   "use_patch"              an apply_patch file_change creating note.txt (rejected when read-only)
 *   "use_mcp <server> <tool> [json args]"  really launches the configured MCP server over stdio
 *   "echo_env:NAME"          answers with NAME=<value of NAME in this process's environment>
 */
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

// ── flag tables (from `codex exec --help` and `codex exec resume --help`) ─────────────────────────

const EXEC_VALUE_FLAGS = new Set([
	'-c',
	'--config',
	'--enable',
	'--disable',
	'-i',
	'--image',
	'-m',
	'--model',
	'--local-provider',
	'-p',
	'--profile',
	'-s',
	'--sandbox',
	'-C',
	'--cd',
	'--add-dir',
	'--thread-source',
	'--cyber-access-program',
	'--output-schema',
	'--color',
	'-o',
	'--output-last-message',
]);
const EXEC_BOOLEAN_FLAGS = new Set([
	'--strict-config',
	'--oss',
	'--approve-for-me',
	'--dangerously-bypass-approvals-and-sandbox',
	'--dangerously-bypass-hook-trust',
	'--worktree',
	'--skip-git-repo-check',
	'--ephemeral',
	'--ignore-user-config',
	'--ignore-rules',
	'--json',
	'-h',
	'--help',
	'-V',
	'--version',
]);
const RESUME_VALUE_FLAGS = new Set([
	'-c',
	'--config',
	'--enable',
	'--disable',
	'-i',
	'--image',
	'-m',
	'--model',
	'--thread-source',
	'--cyber-access-program',
	'--output-schema',
	'-o',
	'--output-last-message',
]);
const RESUME_BOOLEAN_FLAGS = new Set([
	'--last',
	'--all',
	'--strict-config',
	'--dangerously-bypass-approvals-and-sandbox',
	'--dangerously-bypass-hook-trust',
	'--worktree',
	'--skip-git-repo-check',
	'--ephemeral',
	'--ignore-user-config',
	'--ignore-rules',
	'--json',
	'-h',
	'--help',
	'-V',
	'--version',
]);
// Top-level `codex [OPTIONS] [PROMPT]` (the TUI) and `codex resume`
const TUI_VALUE_FLAGS = new Set([
	'-c',
	'--config',
	'--enable',
	'--disable',
	'--remote',
	'--remote-auth-token-env',
	'-i',
	'--image',
	'-m',
	'--model',
	'--local-provider',
	'-p',
	'--profile',
	'-s',
	'--sandbox',
	'-C',
	'--cd',
	'--add-dir',
	'-a',
	'--ask-for-approval',
]);
const TUI_BOOLEAN_FLAGS = new Set([
	'--strict-config',
	'--oss',
	'--approve-for-me',
	'--dangerously-bypass-approvals-and-sandbox',
	'--dangerously-bypass-hook-trust',
	'--worktree',
	'--search',
	'--no-alt-screen',
	'--no-daemon',
	'--last',
	'--all',
	'--include-non-interactive',
	'-h',
	'--help',
	'-V',
	'--version',
]);

function usageError(arg) {
	// Real codex rejects unknown flags with a usage error (exit 2); an unknown flag here means the
	// provider sends something the real CLI does not accept.
	process.stderr.write(`error: unexpected argument '${arg}' found\n`);
	process.exit(2);
}

// ── argument parsing ──────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const execIdx = args.indexOf('exec');
const isExec = execIdx !== -1;
const afterExec = isExec ? args.slice(execIdx + 1) : args;

let isResume = false;
if (isExec && afterExec[0] === 'resume') isResume = true;
if (!isExec && afterExec[0] === 'resume') isResume = true;

let valueFlags;
let booleanFlags;
if (isExec) {
	valueFlags = isResume ? RESUME_VALUE_FLAGS : EXEC_VALUE_FLAGS;
	booleanFlags = isResume ? RESUME_BOOLEAN_FLAGS : EXEC_BOOLEAN_FLAGS;
} else {
	valueFlags = TUI_VALUE_FLAGS;
	booleanFlags = TUI_BOOLEAN_FLAGS;
}

const flags = { values: [], booleans: new Set() };
const positionals = [];
for (let i = isResume ? 1 : 0; i < afterExec.length; i++) {
	const arg = afterExec[i];
	if (arg === '--') {
		positionals.push(...afterExec.slice(i + 1));
		break;
	}
	if (arg.startsWith('-') && arg.length > 1) {
		if (valueFlags.has(arg)) {
			flags.values.push([arg, afterExec[++i] ?? '']);
		} else if (booleanFlags.has(arg)) {
			flags.booleans.add(arg);
		} else {
			usageError(arg);
		}
		continue;
	}
	positionals.push(arg);
}
const resumeThreadId = isResume ? (positionals.shift() ?? '') : '';
const prompt = positionals[0] ?? '';
const valuesOf = names => flags.values.filter(([flag]) => names.includes(flag)).map(([, value]) => value);

// ── TOML subset parser for `-c` values ────────────────────────────────────────────────────────────

function parseTomlValue(text) {
	let pos = 0;
	const skipSpace = () => {
		while (/\s/.test(text[pos] ?? '')) pos++;
	};
	const fail = () => {
		throw new Error(`not TOML at ${pos}`);
	};
	function parseString() {
		const start = pos;
		pos++; // opening quote
		while (pos < text.length && text[pos] !== '"') {
			if (text[pos] === '\\') pos++;
			pos++;
		}
		if (text[pos] !== '"') fail();
		pos++;
		return JSON.parse(text.slice(start, pos));
	}
	function parseKey() {
		skipSpace();
		if (text[pos] === '"') return parseString();
		const m = /^[A-Za-z0-9_-]+/.exec(text.slice(pos));
		if (!m) fail();
		pos += m[0].length;
		return m[0];
	}
	function parseAny() {
		skipSpace();
		const ch = text[pos];
		if (ch === '"') return parseString();
		if (ch === '[') {
			pos++;
			const items = [];
			skipSpace();
			while (text[pos] !== ']') {
				items.push(parseAny());
				skipSpace();
				if (text[pos] === ',') pos++;
				skipSpace();
				if (pos >= text.length) fail();
			}
			pos++;
			return items;
		}
		if (ch === '{') {
			pos++;
			const table = {};
			skipSpace();
			while (text[pos] !== '}') {
				const key = parseKey();
				skipSpace();
				if (text[pos] !== '=') fail();
				pos++;
				table[key] = parseAny();
				skipSpace();
				if (text[pos] === ',') pos++;
				skipSpace();
				if (pos >= text.length) fail();
			}
			pos++;
			return table;
		}
		const m = /^(true|false|-?\d+)(?![A-Za-z0-9_.])/.exec(text.slice(pos));
		if (!m) fail();
		pos += m[0].length;
		return m[1] === 'true' ? true : m[1] === 'false' ? false : Number(m[1]);
	}
	const value = parseAny();
	skipSpace();
	if (pos !== text.length) fail();
	return value;
}

const config = {};
function setConfig(dottedKey, value) {
	const parts = dottedKey.split('.');
	let node = config;
	for (const part of parts.slice(0, -1)) {
		if (typeof node[part] !== 'object' || node[part] === null) node[part] = {};
		node = node[part];
	}
	node[parts.at(-1)] = value;
}
for (const raw of valuesOf(['-c', '--config'])) {
	const eq = raw.indexOf('=');
	if (eq === -1) {
		process.stderr.write(`error: invalid value '${raw}' for '--config <key=value>': expected key=value\n`);
		process.exit(2);
	}
	const key = raw.slice(0, eq).trim();
	const text = raw.slice(eq + 1).trim();
	let value;
	try {
		value = parseTomlValue(text);
	} catch {
		// codex: "If it fails to parse as TOML, the raw string is used as a literal."
		value = text;
	}
	setConfig(key, value);
}

const approveForMe = flags.booleans.has('--approve-for-me') || config.approvals_reviewer === 'auto_review';
const sandbox =
	valuesOf(['-s', '--sandbox'])[0] ??
	config.sandbox_mode ??
	(flags.booleans.has('--approve-for-me') ? 'workspace-write' : 'read-only');
const disabledFeatures = new Set([
	...valuesOf(['--disable']),
	...Object.entries(config.features ?? {})
		.filter(([, on]) => on === false)
		.map(([name]) => name),
]);
const hooksTrusted = flags.booleans.has('--dangerously-bypass-hook-trust');
const mcpServers = Object.entries(config.mcp_servers ?? {}).filter(([, server]) => server.enabled !== false);

// ── TUI ───────────────────────────────────────────────────────────────────────────────────────────

if (!isExec) {
	process.stdout.write(`[mock codex tui] resume=${resumeThreadId || '-'} prompt=${prompt}\n`);
	process.exit(0);
}

// ── required MCP servers must start, or the whole run fails before any event ──────────────────────

for (const [name, server] of mcpServers) {
	if (server.required !== true) continue;
	const probe = spawnSync(String(server.command), [], { input: '', timeout: 15000, shell: false });
	if (probe.error && probe.error.code === 'ENOENT') {
		process.stderr.write(
			`Error: thread/start: thread/start failed: error creating thread: Fatal error: Failed to initialize session: required MCP servers failed to initialize: ${name}: program not found (code -32603)\n`
		);
		process.exit(1);
	}
}

// ── event emission ────────────────────────────────────────────────────────────────────────────────

const exitCode = parseInt(process.env['CODEX_MOCK_EXIT_CODE'] ?? '0', 10);

function uuid() {
	const hex = () => Math.random().toString(16).slice(2, 6).padEnd(4, '0');
	return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}`;
}
const threadId = resumeThreadId || uuid();

function emit(obj) {
	process.stdout.write(JSON.stringify(obj) + '\n');
}

let itemCounter = 0;
const nextItemId = () => `item_${itemCounter++}`;

emit({ type: 'thread.started', thread_id: threadId });
const hasHooks = Object.keys(config.hooks ?? {}).length > 0;
if (hasHooks && hooksTrusted) {
	// Real codex says this twice per run
	for (let i = 0; i < 2; i++) {
		emit({
			type: 'item.completed',
			item: {
				id: nextItemId(),
				type: 'error',
				message:
					'`--dangerously-bypass-hook-trust` is enabled. Enabled hooks may run without review for this invocation.',
			},
		});
	}
}
emit({ type: 'turn.started' });

if (exitCode !== 0) {
	const message = 'mock codex failure (CODEX_MOCK_EXIT_CODE)';
	emit({ type: 'error', message });
	emit({ type: 'turn.failed', error: { message } });
	process.exit(exitCode);
}

// ── hooks ─────────────────────────────────────────────────────────────────────────────────────────

/** Runs the configured hooks of an event for one tool call. Returns the deny reason, if any. */
function runHooks(event, toolName, toolInput, toolResponse) {
	if (!hooksTrusted) return undefined; // real codex skips untrusted hooks without a word
	for (const group of config.hooks?.[event] ?? []) {
		const matcher = group.matcher;
		if (matcher !== undefined && matcher !== '*' && !new RegExp(matcher).test(toolName)) continue;
		for (const hook of group.hooks ?? []) {
			if (hook.type !== 'command') continue;
			const payload = {
				session_id: threadId,
				turn_id: uuid(),
				transcript_path: '',
				cwd: process.cwd(),
				hook_event_name: event,
				model: valuesOf(['-m', '--model'])[0] ?? 'mock',
				permission_mode: 'default',
				tool_name: toolName,
				tool_input: toolInput,
				...(toolResponse === undefined ? {} : { tool_response: toolResponse }),
				tool_use_id: `call_${uuid()}`,
			};
			const result = spawnSync(hook.command, {
				shell: true,
				input: JSON.stringify(payload),
				encoding: 'utf8',
				timeout: (hook.timeout ?? 600) * 1000,
			});
			if (result.status === 2) {
				const reason = (result.stderr ?? '').trim();
				if (!reason)
					throw new Error('PreToolUse hook exited with code 2 but did not write a blocking reason to stderr');
				return reason;
			}
			try {
				const out = JSON.parse(result.stdout || '{}');
				const decision = out.hookSpecificOutput?.permissionDecision;
				if (decision === 'deny') {
					const reason = out.hookSpecificOutput.permissionDecisionReason;
					if (!reason)
						throw new Error(
							'PreToolUse hook returned permissionDecision:deny without a non-empty permissionDecisionReason'
						);
					return reason;
				}
			} catch (err) {
				if (String(err.message).startsWith('PreToolUse hook')) throw err;
				// non-JSON output is not a block
			}
		}
	}
	return undefined;
}

function routerError(message) {
	// codex's tracing output; it goes to stderr, not into the JSONL stream
	process.stderr.write(`${new Date().toISOString()} ERROR codex_core::tools::router: error=${message}\n`);
}

const USAGE = {
	input_tokens: 200,
	cached_input_tokens: 100,
	cache_write_input_tokens: 90,
	output_tokens: 20,
	reasoning_output_tokens: 10,
};

function finish(text, usage = USAGE) {
	emit({ type: 'item.completed', item: { id: nextItemId(), type: 'agent_message', text } });
	emit({ type: 'turn.completed', usage });
	process.exit(0);
}

// ── use_tool scenario: a shell command ────────────────────────────────────────────────────────────

if (prompt.includes('use_tool')) {
	if (disabledFeatures.has('shell_tool')) finish('NOSHELL');
	const id = nextItemId();
	const command = 'cat mock.txt';
	const denied = runHooks('PreToolUse', 'Bash', { command });
	if (denied !== undefined) {
		routerError(`Command blocked by PreToolUse hook: ${denied}. Command: ${command}`);
		finish('The command was blocked by a PreToolUse hook.');
	}
	emit({
		type: 'item.started',
		item: { id, type: 'command_execution', command, aggregated_output: '', exit_code: null, status: 'in_progress' },
	});
	emit({
		type: 'item.completed',
		item: {
			id,
			type: 'command_execution',
			command,
			aggregated_output: 'tool result output\n',
			exit_code: 0,
			status: 'completed',
		},
	});
	runHooks('PostToolUse', 'Bash', { command }, 'tool result output\n');
	finish('Done with tool.');
}

// ── use_patch scenario: apply_patch ───────────────────────────────────────────────────────────────

if (prompt.includes('use_patch')) {
	const patch = '*** Begin Patch\n*** Add File: note.txt\n+hi\n*** End Patch\n';
	const denied = runHooks('PreToolUse', 'apply_patch', { command: patch });
	if (denied !== undefined) {
		routerError(`Tool call blocked by PreToolUse hook: ${denied}. Tool: apply_patch`);
		finish('The patch was blocked by a PreToolUse hook.');
	}
	if (sandbox === 'read-only') {
		routerError('patch rejected: writing is blocked by read-only sandbox; rejected by user approval settings');
		finish('It did not succeed: the read-only sandbox blocked creation of note.txt.');
	}
	const id = nextItemId();
	const changes = [{ path: join(process.cwd(), 'note.txt'), kind: 'add' }];
	emit({ type: 'item.started', item: { id, type: 'file_change', changes, status: 'in_progress' } });
	writeFileSync(changes[0].path, 'hi');
	emit({ type: 'item.completed', item: { id, type: 'file_change', changes, status: 'completed' } });
	finish('Created note.txt.');
}

// ── use_mcp scenario: a real stdio MCP round trip ─────────────────────────────────────────────────

const mcpMatch = /use_mcp\s+(\S+)\s+(\S+)\s*(\{.*\})?/.exec(prompt);
if (mcpMatch) {
	const [, serverName, toolName, rawArgs] = mcpMatch;
	const server = mcpServers.find(([name]) => name === serverName)?.[1];
	if (!server) finish(`MCP server '${serverName}' is not available.`);
	const toolArguments = rawArgs ? JSON.parse(rawArgs) : {};
	const id = nextItemId();
	const item = { id, type: 'mcp_tool_call', server: serverName, tool: toolName, arguments: toolArguments };

	const denied = runHooks('PreToolUse', `mcp__${serverName}__${toolName}`, toolArguments);
	if (denied !== undefined) {
		routerError(`Tool call blocked by PreToolUse hook: ${denied}. Tool: mcp__${serverName}__${toolName}`);
		finish('The tool call was blocked by a PreToolUse hook.');
	}

	emit({ type: 'item.started', item: { ...item, result: null, error: null, status: 'in_progress' } });

	if (server.default_tools_approval_mode !== 'approve' && !approveForMe) {
		emit({
			type: 'item.completed',
			item: {
				...item,
				result: null,
				error: { message: 'MCP tool call requires approval, but approval policy is never' },
				status: 'failed',
			},
		});
		finish('DONE');
	}

	const child = spawn(String(server.command), server.args ?? [], {
		cwd: server.cwd,
		env: { ...process.env, ...(server.env ?? {}) },
		stdio: ['pipe', 'pipe', 'inherit'],
	});
	const pending = new Map();
	createInterface({ input: child.stdout }).on('line', line => {
		const msg = JSON.parse(line);
		pending.get(msg.id)?.(msg);
	});
	let nextRpcId = 1;
	const rpc = (method, params) =>
		new Promise(resolve => {
			const rpcId = nextRpcId++;
			pending.set(rpcId, resolve);
			child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: rpcId, method, params }) + '\n');
		});
	await rpc('initialize', {
		protocolVersion: '2025-06-18',
		capabilities: {},
		clientInfo: { name: 'codex-mock', version: '0' },
	});
	child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
	const reply = await rpc('tools/call', { name: toolName, arguments: toolArguments });
	child.kill();

	let completed;
	if (reply.error) {
		completed = {
			...item,
			result: null,
			error: {
				message: `tool call error: tool call failed for \`${serverName}/${toolName}\`\n\nCaused by:\n    Mcp error: ${reply.error.code}: ${reply.error.message}`,
			},
			status: 'failed',
		};
	} else {
		completed = {
			...item,
			result: { content: reply.result.content, structured_content: null },
			error: null,
			status: reply.result.isError ? 'failed' : 'completed',
		};
	}
	emit({ type: 'item.completed', item: completed });
	runHooks('PostToolUse', `mcp__${serverName}__${toolName}`, toolArguments, completed.result);
	finish(completed.result?.content?.[0]?.text ?? 'DONE');
}

// ── standard scenario ─────────────────────────────────────────────────────────────────────────────

const echoEnv = /echo_env:([A-Za-z0-9_]+)/.exec(prompt);
let responseText;
if (process.env['CODEX_MOCK_RESPONSE']) {
	responseText = process.env['CODEX_MOCK_RESPONSE'];
} else if (echoEnv) {
	responseText = `${echoEnv[1]}=${process.env[echoEnv[1]] ?? 'not-set'}`;
} else {
	responseText = `Mock codex response for: ${prompt.slice(0, 60)}`;
}

finish(responseText, {
	input_tokens: 100,
	cached_input_tokens: 0,
	cache_write_input_tokens: 90,
	output_tokens: 5,
	reasoning_output_tokens: 0,
});
