/**
 * StreamEventMapper Tests
 */
import { describe, expect, it } from 'vitest';

import { StreamEventMapper } from './StreamEventMapper';
import type { StreamJsonEvent } from './StreamJsonParser';

describe('StreamEventMapper', () => {
	describe('map', () => {
		it('should map system events to debug level', () => {
			const mapper = new StreamEventMapper('step-1');
			const event: StreamJsonEvent = {
				type: 'system',
				subtype: 'init',
				data: {
					type: 'system',
					model: 'claude-sonnet-4-20250514',
					tools: ['Read', 'Write', 'Bash'],
				},
			};

			const entries = mapper.map(event);

			expect(entries).toHaveLength(1);
			expect(entries[0].level).toBe('debug');
			expect(entries[0].eventType).toBe('system');
			expect(entries[0].message).toBe('Session: claude-sonnet-4-20250514, 3 tools');
			expect(entries[0].metadata?.model).toBe('claude-sonnet-4-20250514');
		});

		it('should map assistant text events to info level', () => {
			const mapper = new StreamEventMapper('step-1');
			const event: StreamJsonEvent = {
				type: 'assistant',
				subtype: 'text',
				data: {
					type: 'assistant',
					message: {
						content: [{ type: 'text', text: 'I will help you with that.' }],
					},
				},
			};

			const entries = mapper.map(event);

			expect(entries).toHaveLength(1);
			expect(entries[0].level).toBe('info');
			expect(entries[0].eventType).toBe('assistant_text');
			expect(entries[0].message).toBe('Claude: I will help you with that.');
		});

		it('should preserve full assistant text without truncation', () => {
			const mapper = new StreamEventMapper('step-1');
			const longText = 'A'.repeat(600);
			const event: StreamJsonEvent = {
				type: 'assistant',
				subtype: 'text',
				data: {
					type: 'assistant',
					message: {
						content: [{ type: 'text', text: longText }],
					},
				},
			};

			const entries = mapper.map(event);

			expect(entries[0].message).toBe(`Claude: ${longText}`);
			expect(entries[0].metadata).toBeUndefined();
		});

		it('should map assistant tool_use events to warning level', () => {
			const mapper = new StreamEventMapper('step-1');
			const event: StreamJsonEvent = {
				type: 'assistant',
				subtype: 'tool_use',
				data: {
					type: 'assistant',
					message: {
						content: [
							{
								type: 'tool_use',
								name: 'Read',
								input: { file_path: '/src/index.ts' },
							},
						],
					},
				},
			};

			const entries = mapper.map(event);

			expect(entries).toHaveLength(1);
			expect(entries[0].level).toBe('warning');
			expect(entries[0].eventType).toBe('tool_use');
			expect(entries[0].message).toContain('Tool: Read');
			expect(entries[0].message).toContain('file_path=/src/index.ts');
			expect(entries[0].metadata?.toolName).toBe('Read');
		});

		it('should map user tool_result events to debug level', () => {
			const mapper = new StreamEventMapper('step-1');
			const event: StreamJsonEvent = {
				type: 'user',
				subtype: 'tool_result',
				data: {
					type: 'user',
					message: {
						content: [
							{
								type: 'tool_result',
								tool_use_id: 'toolu_123',
								content: 'File contents here...',
							},
						],
					},
				},
			};

			const entries = mapper.map(event);

			expect(entries).toHaveLength(1);
			expect(entries[0].level).toBe('debug');
			expect(entries[0].eventType).toBe('tool_result');
			expect(entries[0].message).toContain('Tool result [toolu_123]');
			expect(entries[0].message).toContain('File contents here...');
		});

		it('should map result events to info level with cost and turns', () => {
			const mapper = new StreamEventMapper('step-1');
			const event: StreamJsonEvent = {
				type: 'result',
				subtype: 'result',
				data: {
					type: 'result',
					result: 'Final output text',
					num_turns: 5,
					cost_usd: 0.0523,
					duration_ms: 30000,
				},
			};

			const entries = mapper.map(event);

			expect(entries).toHaveLength(1);
			expect(entries[0].level).toBe('info');
			expect(entries[0].eventType).toBe('result');
			expect(entries[0].message).toBe('Completed: 5 turns, $0.0523 USD, 30.0s');
			expect(entries[0].metadata?.resultText).toBe('Final output text');
		});

		it('should return empty array for unknown event types', () => {
			const mapper = new StreamEventMapper('step-1');
			const event: StreamJsonEvent = {
				type: 'unknown_type',
				data: { type: 'unknown_type' },
			};

			const entries = mapper.map(event);

			expect(entries).toHaveLength(0);
		});

		it('should return empty array for assistant events without content', () => {
			const mapper = new StreamEventMapper('step-1');
			const event: StreamJsonEvent = {
				type: 'assistant',
				data: { type: 'assistant', message: {} },
			};

			const entries = mapper.map(event);

			expect(entries).toHaveLength(0);
		});

		it('should return empty array for user events without tool_result content', () => {
			const mapper = new StreamEventMapper('step-1');
			const event: StreamJsonEvent = {
				type: 'user',
				data: {
					type: 'user',
					message: {
						content: [{ type: 'text', text: 'user message' }],
					},
				},
			};

			const entries = mapper.map(event);

			expect(entries).toHaveLength(0);
		});

		it('should generate unique IDs per step', () => {
			const mapper = new StreamEventMapper('step-1');
			const event: StreamJsonEvent = {
				type: 'system',
				subtype: 'init',
				data: { type: 'system', model: 'test', tools: [] },
			};

			const entries1 = mapper.map(event);
			const entries2 = mapper.map(event);

			expect(entries1[0].id).not.toBe(entries2[0].id);
			expect(entries1[0].id).toContain('step-1');
		});

		// --- OpenCode-specific event types ---

		it('should map OpenCode text events to info level with raw text as message', () => {
			const mapper = new StreamEventMapper('step-1');
			const event: StreamJsonEvent = {
				type: 'text',
				subtype: 'text',
				data: { text: 'Analyzing your request...' },
			};

			const entries = mapper.map(event);

			expect(entries).toHaveLength(1);
			expect(entries[0].level).toBe('info');
			expect(entries[0].eventType).toBe('assistant_text');
			expect(entries[0].message).toBe('Analyzing your request...');
		});

		it('should return empty array for text events with empty text', () => {
			const mapper = new StreamEventMapper('step-1');
			const event: StreamJsonEvent = {
				type: 'text',
				subtype: 'text',
				data: { text: '' },
			};

			const entries = mapper.map(event);

			expect(entries).toHaveLength(0);
		});

		it('should return empty array for text events without text field', () => {
			const mapper = new StreamEventMapper('step-1');
			const event: StreamJsonEvent = {
				type: 'text',
				subtype: 'text',
				data: {},
			};

			const entries = mapper.map(event);

			expect(entries).toHaveLength(0);
		});

		it('should map OpenCode tool_use events with input and output to two entries', () => {
			const mapper = new StreamEventMapper('step-1');
			const event: StreamJsonEvent = {
				type: 'tool_use',
				subtype: 'tool_use',
				data: {
					tool: 'bash',
					callID: 'call-123',
					input: { command: 'ls -la' },
					output: 'total 0\ndrwxr-xr-x  2 user  staff   64 Aug 22 10:00 .',
					status: 'done',
				},
			};

			const entries = mapper.map(event);

			expect(entries).toHaveLength(2);
			// First entry: tool call with input summary
			expect(entries[0].level).toBe('warning');
			expect(entries[0].eventType).toBe('tool_use');
			expect(entries[0].message).toContain('bash');
			expect(entries[0].message).toContain('command=ls -la');
			expect(entries[0].metadata?.toolName).toBe('bash');
			// Second entry: tool output
			expect(entries[1].level).toBe('debug');
			expect(entries[1].eventType).toBe('tool_result');
			expect(entries[1].message).toContain('total 0');
			expect(entries[1].metadata?.toolName).toBe('bash');
		});

		it('should map OpenCode tool_use events without output to one entry', () => {
			const mapper = new StreamEventMapper('step-1');
			const event: StreamJsonEvent = {
				type: 'tool_use',
				subtype: 'tool_use',
				data: {
					tool: 'bash',
					callID: 'call-456',
					input: { command: 'echo hello' },
					output: '',
					status: 'done',
				},
			};

			const entries = mapper.map(event);

			expect(entries).toHaveLength(1);
			expect(entries[0].eventType).toBe('tool_use');
		});

		// This test documents the assumed hook_event schema.
		// The schema has not been verified against a live Claude run with --include-hook-events.
		it('maps hook_event with assumed schema (PreToolUse)', () => {
			const mapper = new StreamEventMapper('step-1');
			const event: StreamJsonEvent = {
				type: 'hook_event',
				subtype: 'hook_event',
				data: {
					hook: { type: 'PreToolUse', matcher: '*' },
					tool_name: 'Bash',
					timing: 'before',
				},
			};

			const entries = mapper.map(event);

			expect(entries).toHaveLength(1);
			expect(entries[0]!.eventType).toBe('hook_event');
			expect(entries[0]!.level).toBe('debug');
			expect(entries[0]!.message).toContain('PreToolUse');
			expect(entries[0]!.message).toContain('Bash');
		});

		it('should use "unknown" for tool_use events missing the tool name', () => {
			const mapper = new StreamEventMapper('step-1');
			const event: StreamJsonEvent = {
				type: 'tool_use',
				subtype: 'tool_use',
				data: {
					input: {},
					output: '',
					status: 'done',
				},
			};

			const entries = mapper.map(event);

			expect(entries).toHaveLength(1);
			expect(entries[0].message).toContain('unknown');
		});
	});

	describe('tool input summarization', () => {
		it('should show full short file paths without truncation', () => {
			const mapper = new StreamEventMapper('step-1');
			const event: StreamJsonEvent = {
				type: 'assistant',
				subtype: 'tool_use',
				data: {
					type: 'assistant',
					message: {
						content: [
							{
								type: 'tool_use',
								name: 'Read',
								input: { file_path: '/src/index.ts' },
							},
						],
					},
				},
			};

			const entries = mapper.map(event);
			expect(entries[0].message).toBe('Tool: Read(file_path=/src/index.ts)');
		});

		it('should never truncate file paths regardless of length', () => {
			const mapper = new StreamEventMapper('step-1');
			const longPath =
				'C:\\Users\\Developer\\Workspace_Tooling\\agent-fleet\\packages\\flow-engine\\src\\processing\\deep\\StreamEventMapper.ts';
			const event: StreamJsonEvent = {
				type: 'assistant',
				subtype: 'tool_use',
				data: {
					type: 'assistant',
					message: {
						content: [
							{
								type: 'tool_use',
								name: 'Read',
								input: { file_path: longPath },
							},
						],
					},
				},
			};

			const entries = mapper.map(event);
			expect(entries[0].message).toBe(`Tool: Read(file_path=${longPath})`);
		});

		it('should not truncate non-path string values under 120 chars', () => {
			const mapper = new StreamEventMapper('step-1');
			const event: StreamJsonEvent = {
				type: 'assistant',
				subtype: 'tool_use',
				data: {
					type: 'assistant',
					message: {
						content: [
							{
								type: 'tool_use',
								name: 'Bash',
								input: { command: 'npm run build && npm test' },
							},
						],
					},
				},
			};

			const entries = mapper.map(event);
			expect(entries[0].message).toBe('Tool: Bash(command=npm run build && npm test)');
		});
	});

	describe('capEntries', () => {
		it('should not modify entries under the cap', () => {
			const entries = Array.from({ length: 10 }, (_, i) => ({
				id: `id-${i}`,
				timestamp: i,
				level: 'info' as const,
				message: `msg-${i}`,
				eventType: 'assistant_text',
			}));

			const result = StreamEventMapper.capEntries(entries);

			expect(result).toHaveLength(10);
		});

		it('should drop oldest debug entries first when over cap', () => {
			const entries = Array.from({ length: 1200 }, (_, i) => ({
				id: `id-${i}`,
				timestamp: i,
				// First 800 are debug, last 400 are info
				level: (i < 800 ? 'debug' : 'info') as 'debug' | 'info',
				message: `msg-${i}`,
				eventType: i < 800 ? 'tool_result' : 'assistant_text',
			}));

			const result = StreamEventMapper.capEntries(entries);

			expect(result.length).toBeLessThanOrEqual(1000);
			// All 400 info entries should be preserved
			const infoEntries = result.filter(e => e.level === 'info');
			expect(infoEntries).toHaveLength(400);
		});

		it('should keep most recent entries when even non-debug exceeds cap', () => {
			const entries = Array.from({ length: 1200 }, (_, i) => ({
				id: `id-${i}`,
				timestamp: i,
				level: 'info' as const,
				message: `msg-${i}`,
				eventType: 'assistant_text',
			}));

			const result = StreamEventMapper.capEntries(entries);

			expect(result).toHaveLength(1000);
			// Should have the last 1000 entries
			expect(result[0].id).toBe('id-200');
			expect(result[999].id).toBe('id-1199');
		});
	});
});
