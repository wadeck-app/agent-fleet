#!/usr/bin/env node
/**
 * Mock codex CLI for deterministic testing.
 *
 * Emits the same NDJSON format as `codex exec --json`.
 * Parses: positional args (prompt is first non-flag arg after "exec")
 *
 * CODEX_MOCK_RESPONSE env var overrides response text.
 * CODEX_MOCK_EXIT_CODE env var (default 0) to simulate failure.
 *
 * Special prompt keywords:
 *   "use_tool"  — emits tool call sequence
 *   "echo_xdg"  — includes XDG_CONFIG_HOME value in response
 */

// Parse args: find positional prompt after "exec" subcommand
const args = process.argv.slice(2);
let prompt = '';
let inExecSubcommand = false;
for (let i = 0; i < args.length; i++) {
	const arg = args[i];
	if (arg === 'exec') {
		inExecSubcommand = true;
		continue;
	}
	if (!inExecSubcommand) continue;
	// Skip known flags and their values
	if (arg === '--json' || arg === '-m' || arg === '--resume') {
		i++;
		continue;
	}
	if (arg.startsWith('-')) continue;
	// First non-flag positional arg after "exec" is the prompt
	prompt = arg;
	break;
}

const exitCode = parseInt(process.env['CODEX_MOCK_EXIT_CODE'] ?? '0', 10);
const sessionId = 'codex-mock-session-' + Math.random().toString(36).slice(2, 10);
const messageId = 'msg-' + Math.random().toString(36).slice(2, 10);

function emit(obj) {
	process.stdout.write(JSON.stringify(obj) + '\n');
}

if (exitCode !== 0) {
	emit({
		type: 'step_start',
		timestamp: Date.now(),
		sessionID: sessionId,
		part: { type: 'step-start', messageID: messageId, sessionID: sessionId, snapshot: 'mock' },
	});
	emit({
		type: 'step_finish',
		timestamp: Date.now(),
		sessionID: sessionId,
		part: {
			type: 'step-finish',
			reason: 'error',
			messageID: messageId,
			sessionID: sessionId,
			tokens: { total: 0, input: 0, output: 0, reasoning: 0, cache: { write: 0, read: 0 } },
			cost: 0,
		},
	});
	process.exit(exitCode);
}

// ── use_tool scenario ──────────────────────────────────────────────────────
if (prompt.includes('use_tool')) {
	const callId = 'tooluse_codex_' + Math.random().toString(36).slice(2, 8);
	const toolPartId = 'prt_' + Math.random().toString(36).slice(2, 8);
	const toolMsgId = 'msg-' + Math.random().toString(36).slice(2, 8);
	const step2MsgId = 'msg-' + Math.random().toString(36).slice(2, 8);
	const now = Date.now();

	// Step 1: tool call
	emit({
		type: 'step_start',
		timestamp: now,
		sessionID: sessionId,
		part: { type: 'step-start', messageID: toolMsgId, sessionID: sessionId, snapshot: 'mock' },
	});
	emit({
		type: 'tool_use',
		timestamp: now + 10,
		sessionID: sessionId,
		part: {
			type: 'tool',
			tool: 'test_tool',
			callID: callId,
			state: {
				status: 'completed',
				input: { query: 'mock query' },
				output: 'tool result output',
				metadata: { truncated: false },
				title: '',
				time: { start: now, end: now + 5 },
			},
			id: toolPartId,
			sessionID: sessionId,
			messageID: toolMsgId,
		},
	});
	emit({
		type: 'step_finish',
		timestamp: now + 20,
		sessionID: sessionId,
		part: {
			type: 'step-finish',
			reason: 'tool-calls',
			messageID: toolMsgId,
			sessionID: sessionId,
			tokens: { total: 50, input: 10, output: 5, reasoning: 0, cache: { write: 35, read: 0 } },
			cost: 0.0005,
		},
	});

	// Step 2: final text response
	emit({
		type: 'step_start',
		timestamp: now + 30,
		sessionID: sessionId,
		part: { type: 'step-start', messageID: step2MsgId, sessionID: sessionId, snapshot: 'mock' },
	});
	emit({
		type: 'text',
		timestamp: now + 40,
		sessionID: sessionId,
		part: {
			type: 'text',
			text: 'Done with tool.',
			time: { start: now + 40, end: now + 50 },
		},
	});
	emit({
		type: 'step_finish',
		timestamp: now + 60,
		sessionID: sessionId,
		part: {
			type: 'step-finish',
			reason: 'stop',
			messageID: step2MsgId,
			sessionID: sessionId,
			tokens: { total: 100, input: 10, output: 5, reasoning: 0, cache: { write: 85, read: 0 } },
			cost: 0.001,
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

// step_start
emit({
	type: 'step_start',
	timestamp: Date.now(),
	sessionID: sessionId,
	part: { type: 'step-start', messageID: messageId, sessionID: sessionId, snapshot: 'mock' },
});

// text event
const textStart = Date.now();
emit({
	type: 'text',
	timestamp: Date.now(),
	sessionID: sessionId,
	part: {
		type: 'text',
		text: responseText,
		time: { start: textStart, end: textStart + 50 },
	},
});

// step_finish
emit({
	type: 'step_finish',
	timestamp: Date.now(),
	sessionID: sessionId,
	part: {
		type: 'step-finish',
		reason: 'stop',
		messageID: messageId,
		sessionID: sessionId,
		tokens: { total: 100, input: 10, output: 5, reasoning: 0, cache: { write: 85, read: 0 } },
		cost: 0.001,
	},
});

process.exit(0);
