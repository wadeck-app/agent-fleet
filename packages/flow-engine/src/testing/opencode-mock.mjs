#!/usr/bin/env node
/**
 * Mock opencode CLI for deterministic testing.
 *
 * Emits the same NDJSON format as `opencode run --format json`.
 * Parses: positional args (prompt is first non-flag arg after "run")
 *
 * OPENCODE_MOCK_RESPONSE env var overrides response text.
 * OPENCODE_MOCK_EXIT_CODE env var (default 0) to simulate failure.
 *
 * Special prompt keywords:
 *   "use_tool"  — emits: step_start → tool_use(completed) → step_finish(tool-calls) → step_start → text → step_finish(stop)
 *   "echo_xdg"  — includes XDG_CONFIG_HOME value in response text for isolation tests
 */

// Parse args: find positional prompt after "run" subcommand
const args = process.argv.slice(2);
let prompt = '';
let inRunSubcommand = false;
for (let i = 0; i < args.length; i++) {
	const arg = args[i];
	if (arg === 'run') {
		inRunSubcommand = true;
		continue;
	}
	if (!inRunSubcommand) continue;
	// Skip known flags and their values
	if (arg === '--format' || arg === '-m' || arg === '--resume') {
		i++;
		continue;
	}
	if (arg.startsWith('-')) continue;
	// First non-flag positional arg after "run" is the prompt
	prompt = arg;
	break;
}

const exitCode = parseInt(process.env['OPENCODE_MOCK_EXIT_CODE'] ?? '0', 10);
const sessionId = 'mock-session-' + Math.random().toString(36).slice(2, 10);
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
// Sequence: step_start → tool_use(completed) → step_finish(tool-calls) → step_start → text → step_finish(stop)
if (prompt.includes('use_tool')) {
	const callId = 'tooluse_mock_' + Math.random().toString(36).slice(2, 8);
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

// ── bash_regedit scenario ──────────────────────────────────────────────────
// Simulates OpenCode receiving a hook "deny" result for a regedit bash call.
// Sequence: step_start → tool_use(error/denied) → step_finish(stop) → text → step_finish(stop)
if (prompt.includes('bash_regedit')) {
	const callId = 'tooluse_mock_' + Math.random().toString(36).slice(2, 8);
	const toolPartId = 'prt_' + Math.random().toString(36).slice(2, 8);
	const toolMsgId = 'msg-' + Math.random().toString(36).slice(2, 8);
	const now = Date.now();

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
			tool: 'Bash',
			callID: callId,
			state: {
				status: 'error',
				input: { command: 'regedit /s nul' },
				output: 'Tool denied: regedit is forbidden on this system',
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
			reason: 'stop',
			messageID: toolMsgId,
			sessionID: sessionId,
			tokens: { total: 50, input: 10, output: 5, reasoning: 0, cache: { write: 35, read: 0 } },
			cost: 0.0005,
		},
	});

	// Final text response after the denied tool call
	const textMsgId = 'msg-' + Math.random().toString(36).slice(2, 8);
	emit({
		type: 'step_start',
		timestamp: now + 30,
		sessionID: sessionId,
		part: { type: 'step-start', messageID: textMsgId, sessionID: sessionId, snapshot: 'mock' },
	});
	emit({
		type: 'text',
		timestamp: now + 40,
		sessionID: sessionId,
		part: {
			type: 'text',
			text: 'I tried to run regedit but it was blocked by a system policy.',
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
			messageID: textMsgId,
			sessionID: sessionId,
			tokens: { total: 100, input: 10, output: 5, reasoning: 0, cache: { write: 85, read: 0 } },
			cost: 0.001,
		},
	});

	process.exit(0);
}

// ── standard scenario ──────────────────────────────────────────────────────

let responseText;
if (process.env['OPENCODE_MOCK_RESPONSE']) {
	responseText = process.env['OPENCODE_MOCK_RESPONSE'];
} else if (prompt.includes('echo_xdg')) {
	// Include XDG_CONFIG_HOME value so isolation tests can verify each spawn is unique
	responseText = `XDG_CONFIG_HOME:${process.env['XDG_CONFIG_HOME'] ?? 'not-set'}`;
} else if (prompt.includes('echo_config')) {
	// Output the OpenCode config JSON so plugin injection tests can verify it
	const configContent = process.env['OPENCODE_CONFIG_CONTENT'] ?? 'no-config';
	responseText = `OPENCODE_CONFIG:${configContent}`;
} else {
	responseText = `Mock opencode response for: ${prompt.slice(0, 60)}`;
}

// step_start
emit({
	type: 'step_start',
	timestamp: Date.now(),
	sessionID: sessionId,
	part: { type: 'step-start', messageID: messageId, sessionID: sessionId, snapshot: 'mock' },
});

// text event (response content)
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

// step_finish with reason: "stop"
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
