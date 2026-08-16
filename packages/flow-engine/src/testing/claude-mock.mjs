#!/usr/bin/env node
/**
 * Mock Claude CLI for deterministic testing.
 *
 * Emits the same NDJSON format as `claude -p "..." --output-format stream-json`.
 * Accepts the same flags: -p <prompt>, --output-format, --model, --dangerously-skip-permissions,
 * --verbose, --no-color, -c (continue).
 *
 * Response is deterministic: "Mock response for: <first 60 chars of prompt>"
 * Set CLAUDE_MOCK_RESPONSE env var to override the response text.
 * Set CLAUDE_MOCK_EXIT_CODE env var (default 0) to simulate failure.
 * Set CLAUDE_MOCK_STREAMING_DELAY env var (default 0) to add ms delay between chunks.
 *   When set, the response is split into ~5 chunks emitted with delays between them,
 *   simulating real Claude streaming behavior.
 */

// Parse args: find -p value
const args = process.argv.slice(2);
let prompt = '';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '-p' && args[i + 1]) {
    prompt = args[i + 1];
    i++;
  }
}

const exitCode = parseInt(process.env.CLAUDE_MOCK_EXIT_CODE ?? '0', 10);
const responseText = process.env.CLAUDE_MOCK_RESPONSE ?? `Mock response for: ${prompt.slice(0, 60)}`;
const streamingDelay = parseInt(process.env.CLAUDE_MOCK_STREAMING_DELAY ?? '0', 10);
const sessionId = 'mock-session-' + Math.random().toString(36).slice(2, 10);

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// system:init
emit({
  type: 'system',
  subtype: 'init',
  cwd: process.cwd(),
  session_id: sessionId,
  tools: [],
  mcp_servers: [],
  model: 'claude-haiku-mock',
  permissionMode: 'bypassPermissions',
});

if (exitCode !== 0) {
  emit({
    type: 'result',
    subtype: 'error_during_execution',
    is_error: true,
    result: '',
    session_id: sessionId,
    error: `Mock error (exit code ${exitCode})`,
    duration_ms: 50,
    duration_api_ms: 50,
  });
  process.exit(exitCode);
}

if (streamingDelay > 0) {
  // Split response into chunks and emit with delays — simulates real streaming
  const words = responseText.split(' ');
  const chunkSize = Math.max(1, Math.ceil(words.length / 5));
  const chunks = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(' '));
  }

  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) await sleep(streamingDelay);
    emit({
      type: 'assistant',
      message: {
        id: 'msg_mock_chunk_' + i,
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: chunks[i] + (i < chunks.length - 1 ? ' ' : '') }],
        model: 'claude-haiku-mock',
        stop_reason: i < chunks.length - 1 ? null : 'end_turn',
        usage: { input_tokens: i === 0 ? 10 : 0, output_tokens: chunks[i].split(' ').length },
      },
      session_id: sessionId,
    });
  }
} else {
  // Single assistant message (no streaming delay)
  emit({
    type: 'assistant',
    message: {
      id: 'msg_mock_' + Math.random().toString(36).slice(2, 10),
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: responseText }],
      model: 'claude-haiku-mock',
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: responseText.split(' ').length },
    },
    session_id: sessionId,
  });
}

// result:success
emit({
  type: 'result',
  subtype: 'success',
  is_error: false,
  result: responseText,
  session_id: sessionId,
  total_cost_usd: 0.0001,
  duration_ms: streamingDelay > 0 ? streamingDelay * 5 + 100 : 100,
  duration_api_ms: 80,
  usage: {
    input_tokens: 10,
    output_tokens: responseText.split(' ').length,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  },
  num_turns: 1,
  stop_reason: 'end_turn',
});

process.exit(0);
