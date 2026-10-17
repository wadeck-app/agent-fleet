#!/usr/bin/env node
/**
 * Mock codex CLI for deterministic testing.
 *
 * Emits the same JSONL event schema as the real `codex exec --json` (verified against
 * codex-cli 0.163.0 by StepRunner.codex.integration.test.ts):
 *
 *   {"type":"thread.started","thread_id":"<uuid>"}
 *   {"type":"turn.started"}
 *   {"type":"item.started"|"item.completed","item":{"id":"item_N","type":"command_execution",
 *       "command":...,"aggregated_output":...,"exit_code":N|null,"status":"in_progress"|"completed"}}
 *   {"type":"item.completed","item":{"id":"item_N","type":"agent_message","text":...}}
 *   {"type":"turn.completed","usage":{input_tokens,cached_input_tokens,cache_write_input_tokens,
 *       output_tokens,reasoning_output_tokens}}
 *   failure: {"type":"error","message":...} then {"type":"turn.failed","error":{"message":...}}, exit 1
 *
 * Real codex reports NO cost: there is no cost field anywhere, so this mock has none either.
 *
 * Args: `codex exec [resume <threadId>] [flags] [prompt]` -- the prompt is the first positional
 * after `exec` (after the thread id when resuming). A resumed run reuses the given thread id.
 *
 * CODEX_MOCK_RESPONSE env var overrides response text.
 * CODEX_MOCK_EXIT_CODE env var (default 0) simulates failure (real codex exits 1 on turn.failed).
 *
 * Special prompt keywords:
 *   "use_tool"    -- emits a command_execution item (started + completed) before the answer
 *   "echo_xdg"    -- includes XDG_CONFIG_HOME value in response
 *   "echo_config" -- includes CODEX_CONFIG_CONTENT in response
 */

// Flags that consume the next argument as their value (from `codex exec --help`).
const FLAGS_WITH_VALUE = new Set([
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
// Flags without a value (from `codex exec --help`).
const BOOLEAN_FLAGS = new Set([
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

const args = process.argv.slice(2);
let prompt = '';
let resumeThreadId = '';
let inExec = false;
let resumeSeen = false;
for (let i = 0; i < args.length; i++) {
	const arg = args[i];
	if (!inExec) {
		if (arg === 'exec') inExec = true;
		continue;
	}
	if (arg.startsWith('-')) {
		if (FLAGS_WITH_VALUE.has(arg)) {
			i++;
		} else if (!BOOLEAN_FLAGS.has(arg)) {
			// Real codex rejects unknown flags with a usage error (exit 2); an unknown flag here
			// means the provider sends something the real CLI does not accept.
			process.stderr.write(`error: unexpected argument '${arg}' found\n`);
			process.exit(2);
		}
		continue;
	}
	if (arg === 'resume' && !resumeSeen && prompt === '') {
		resumeSeen = true;
		resumeThreadId = args[++i] ?? '';
		continue;
	}
	prompt = arg;
	break;
}

const exitCode = parseInt(process.env['CODEX_MOCK_EXIT_CODE'] ?? '0', 10);

function uuid() {
	const hex = () => Math.random().toString(16).slice(2, 6).padEnd(4, '0');
	return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}`;
}
const threadId = resumeThreadId || uuid();

function emit(obj) {
	process.stdout.write(JSON.stringify(obj) + '\n');
}

emit({ type: 'thread.started', thread_id: threadId });
emit({ type: 'turn.started' });

if (exitCode !== 0) {
	const message = 'mock codex failure (CODEX_MOCK_EXIT_CODE)';
	emit({ type: 'error', message });
	emit({ type: 'turn.failed', error: { message } });
	process.exit(exitCode);
}

let itemCounter = 0;
const nextItemId = () => `item_${itemCounter++}`;

// ── use_tool scenario ──────────────────────────────────────────────────────
if (prompt.includes('use_tool')) {
	const id = nextItemId();
	const command = 'cat mock.txt';
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
	emit({ type: 'item.completed', item: { id: nextItemId(), type: 'agent_message', text: 'Done with tool.' } });
	emit({
		type: 'turn.completed',
		usage: {
			input_tokens: 200,
			cached_input_tokens: 100,
			cache_write_input_tokens: 90,
			output_tokens: 20,
			reasoning_output_tokens: 10,
		},
	});
	process.exit(0);
}

// ── standard scenario ──────────────────────────────────────────────────────

let responseText;
if (process.env['CODEX_MOCK_RESPONSE']) {
	responseText = process.env['CODEX_MOCK_RESPONSE'];
} else if (prompt.includes('echo_xdg')) {
	responseText = `XDG_CONFIG_HOME:${process.env['XDG_CONFIG_HOME'] ?? 'not-set'}`;
} else if (prompt.includes('echo_config')) {
	const configContent = process.env['CODEX_CONFIG_CONTENT'] ?? process.env['OPENCODE_CONFIG_CONTENT'] ?? 'no-config';
	responseText = `CODEX_CONFIG:${configContent}`;
} else {
	responseText = `Mock codex response for: ${prompt.slice(0, 60)}`;
}

emit({ type: 'item.completed', item: { id: nextItemId(), type: 'agent_message', text: responseText } });
emit({
	type: 'turn.completed',
	usage: {
		input_tokens: 100,
		cached_input_tokens: 0,
		cache_write_input_tokens: 90,
		output_tokens: 5,
		reasoning_output_tokens: 0,
	},
});

process.exit(0);
