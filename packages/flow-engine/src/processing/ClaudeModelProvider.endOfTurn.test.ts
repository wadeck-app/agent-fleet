/**
 * ClaudeModelProvider forwards `resultGraceMs` to the launcher and `endedAfterResult` back to its caller.
 * Real child process (src/testing/claude-mock.mjs); verified against the mock only.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import { ClaudeModelProvider } from './ClaudeModelProvider';

const MOCK_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'testing', 'claude-mock.mjs');

describe('ClaudeModelProvider -- end of turn', () => {
	it('ends a process that outlives its result after the requested grace period and reports it', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});

		const result = await new ClaudeModelProvider().launchBackground({
			workingDir: process.cwd(),
			prompt: 'Hello',
			stepId: 'step',
			streamJson: true,
			verbose: true,
			resultGraceMs: 300,
			env: { CLAUDE_MOCK_PATH: MOCK_PATH, CLAUDE_MOCK_AFTER_RESULT: 'hang' },
		});

		expect(result.exitCode).toBe(0);
		expect(result.endedAfterResult).toEqual({ graceMs: 300 });
		vi.restoreAllMocks();
	});
});
