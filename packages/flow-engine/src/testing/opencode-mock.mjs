#!/usr/bin/env node
/**
 * Mock opencode CLI for deterministic testing.
 *
 * Emits the same NDJSON format as `opencode run --format json`.
 * Parses: positional args (prompt is first non-flag arg after "run")
 *
 * OPENCODE_MOCK_RESPONSE env var overrides response text.
 * OPENCODE_MOCK_EXIT_CODE env var (default 0) to simulate failure.
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
const responseText = process.env['OPENCODE_MOCK_RESPONSE'] ?? `Mock opencode response for: ${prompt.slice(0, 60)}`;
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
