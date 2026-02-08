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

			const entry = mapper.map(event);

			expect(entry).not.toBeNull();
			expect(entry!.level).toBe('debug');
			expect(entry!.eventType).toBe('system');
			expect(entry!.message).toBe('Session: claude-sonnet-4-20250514, 3 tools');
			expect(entry!.metadata?.model).toBe('claude-sonnet-4-20250514');
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

			const entry = mapper.map(event);

			expect(entry).not.toBeNull();
			expect(entry!.level).toBe('info');
			expect(entry!.eventType).toBe('assistant_text');
			expect(entry!.message).toBe('Claude: I will help you with that.');
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

			const entry = mapper.map(event);

			expect(entry!.message).toBe(`Claude: ${longText}`);
			expect(entry!.metadata).toBeUndefined();
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

			const entry = mapper.map(event);

			expect(entry).not.toBeNull();
			expect(entry!.level).toBe('warning');
			expect(entry!.eventType).toBe('tool_use');
			expect(entry!.message).toContain('Tool: Read');
			expect(entry!.message).toContain('file_path=/src/index.ts');
			expect(entry!.metadata?.toolName).toBe('Read');
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

			const entry = mapper.map(event);

			expect(entry).not.toBeNull();
			expect(entry!.level).toBe('debug');
			expect(entry!.eventType).toBe('tool_result');
			expect(entry!.message).toContain('Tool result [toolu_123]');
			expect(entry!.message).toContain('File contents here...');
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

			const entry = mapper.map(event);

			expect(entry).not.toBeNull();
			expect(entry!.level).toBe('info');
			expect(entry!.eventType).toBe('result');
			expect(entry!.message).toBe('Completed: 5 turns, $0.0523 USD, 30.0s');
			expect(entry!.metadata?.resultText).toBe('Final output text');
		});

		it('should return null for unknown event types', () => {
			const mapper = new StreamEventMapper('step-1');
			const event: StreamJsonEvent = {
				type: 'unknown_type',
				data: { type: 'unknown_type' },
			};

			const entry = mapper.map(event);

			expect(entry).toBeNull();
		});

		it('should return null for assistant events without content', () => {
			const mapper = new StreamEventMapper('step-1');
			const event: StreamJsonEvent = {
				type: 'assistant',
				data: { type: 'assistant', message: {} },
			};

			const entry = mapper.map(event);

			expect(entry).toBeNull();
		});

		it('should return null for user events without tool_result content', () => {
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

			const entry = mapper.map(event);

			expect(entry).toBeNull();
		});

		it('should generate unique IDs per step', () => {
			const mapper = new StreamEventMapper('step-1');
			const event: StreamJsonEvent = {
				type: 'system',
				subtype: 'init',
				data: { type: 'system', model: 'test', tools: [] },
			};

			const entry1 = mapper.map(event);
			const entry2 = mapper.map(event);

			expect(entry1!.id).not.toBe(entry2!.id);
			expect(entry1!.id).toContain('step-1');
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

			const entry = mapper.map(event);
			expect(entry!.message).toBe('Tool: Read(file_path=/src/index.ts)');
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

			const entry = mapper.map(event);
			expect(entry!.message).toBe(`Tool: Read(file_path=${longPath})`);
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

			const entry = mapper.map(event);
			expect(entry!.message).toBe('Tool: Bash(command=npm run build && npm test)');
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
