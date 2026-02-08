/**
 * StreamJsonParser Tests
 */
import { describe, expect, it, vi } from 'vitest';

import { type StreamJsonEvent, StreamJsonParser } from './StreamJsonParser';

describe('StreamJsonParser', () => {
	describe('feed', () => {
		it('should parse a complete JSON line', () => {
			const callback = vi.fn();
			const parser = new StreamJsonParser(callback);

			parser.feed('{"type":"system","data":"test"}\n');

			expect(callback).toHaveBeenCalledOnce();
			expect(callback).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'system',
					subtype: 'init',
					data: { type: 'system', data: 'test' },
				})
			);
		});

		it('should handle multiple lines in one chunk', () => {
			const callback = vi.fn();
			const parser = new StreamJsonParser(callback);

			parser.feed('{"type":"system"}\n{"type":"result"}\n');

			expect(callback).toHaveBeenCalledTimes(2);
			expect(callback.mock.calls[0][0].type).toBe('system');
			expect(callback.mock.calls[1][0].type).toBe('result');
		});

		it('should buffer partial lines across chunks', () => {
			const callback = vi.fn();
			const parser = new StreamJsonParser(callback);

			parser.feed('{"type":');
			expect(callback).not.toHaveBeenCalled();

			parser.feed('"assistant"}\n');
			expect(callback).toHaveBeenCalledOnce();
			expect(callback.mock.calls[0][0].type).toBe('assistant');
		});

		it('should handle chunks split in the middle of a line', () => {
			const events: StreamJsonEvent[] = [];
			const parser = new StreamJsonParser(event => events.push(event));

			parser.feed('{"type":"system","model":"claude"');
			parser.feed('}\n{"type":"result","cost":');
			parser.feed('"0.01"}\n');

			expect(events).toHaveLength(2);
			expect(events[0].type).toBe('system');
			expect(events[1].type).toBe('result');
		});

		it('should skip empty lines', () => {
			const callback = vi.fn();
			const parser = new StreamJsonParser(callback);

			parser.feed('\n\n{"type":"system"}\n\n');

			expect(callback).toHaveBeenCalledOnce();
		});

		it('should silently skip non-JSON lines', () => {
			const callback = vi.fn();
			const parser = new StreamJsonParser(callback);

			parser.feed('Starting Claude...\n{"type":"system"}\nSome debug text\n');

			expect(callback).toHaveBeenCalledOnce();
			expect(callback.mock.calls[0][0].type).toBe('system');
		});
	});

	describe('flush', () => {
		it('should process remaining buffer content', () => {
			const callback = vi.fn();
			const parser = new StreamJsonParser(callback);

			parser.feed('{"type":"result"}');
			expect(callback).not.toHaveBeenCalled();

			parser.flush();
			expect(callback).toHaveBeenCalledOnce();
			expect(callback.mock.calls[0][0].type).toBe('result');
		});

		it('should do nothing with empty buffer', () => {
			const callback = vi.fn();
			const parser = new StreamJsonParser(callback);

			parser.flush();
			expect(callback).not.toHaveBeenCalled();
		});

		it('should clear the buffer after flush', () => {
			const callback = vi.fn();
			const parser = new StreamJsonParser(callback);

			parser.feed('{"type":"result"}');
			parser.flush();
			parser.flush();

			expect(callback).toHaveBeenCalledOnce();
		});
	});

	describe('classifyEvent', () => {
		it('should classify system events with init subtype', () => {
			const callback = vi.fn();
			const parser = new StreamJsonParser(callback);

			parser.feed('{"type":"system","model":"claude-sonnet"}\n');

			expect(callback.mock.calls[0][0]).toEqual({
				type: 'system',
				subtype: 'init',
				data: { type: 'system', model: 'claude-sonnet' },
			});
		});

		it('should classify assistant text events', () => {
			const callback = vi.fn();
			const parser = new StreamJsonParser(callback);

			const event = {
				type: 'assistant',
				message: {
					content: [{ type: 'text', text: 'Hello' }],
				},
			};
			parser.feed(JSON.stringify(event) + '\n');

			expect(callback.mock.calls[0][0]).toEqual({
				type: 'assistant',
				subtype: 'text',
				data: event,
			});
		});

		it('should classify assistant tool_use events', () => {
			const callback = vi.fn();
			const parser = new StreamJsonParser(callback);

			const event = {
				type: 'assistant',
				message: {
					content: [{ type: 'tool_use', name: 'Read', input: { path: '/test' } }],
				},
			};
			parser.feed(JSON.stringify(event) + '\n');

			expect(callback.mock.calls[0][0].subtype).toBe('tool_use');
		});

		it('should classify user tool_result events', () => {
			const callback = vi.fn();
			const parser = new StreamJsonParser(callback);

			const event = {
				type: 'user',
				message: {
					content: [{ type: 'tool_result', tool_use_id: 'abc', content: 'file contents' }],
				},
			};
			parser.feed(JSON.stringify(event) + '\n');

			expect(callback.mock.calls[0][0].subtype).toBe('tool_result');
		});

		it('should classify result events', () => {
			const callback = vi.fn();
			const parser = new StreamJsonParser(callback);

			const event = {
				type: 'result',
				result: 'Final output',
				num_turns: 5,
				cost_usd: 0.05,
				duration_ms: 30000,
			};
			parser.feed(JSON.stringify(event) + '\n');

			expect(callback.mock.calls[0][0]).toEqual({
				type: 'result',
				subtype: 'result',
				data: event,
			});
		});

		it('should handle events without type field', () => {
			const callback = vi.fn();
			const parser = new StreamJsonParser(callback);

			parser.feed('{"data":"something"}\n');

			expect(callback.mock.calls[0][0].type).toBe('unknown');
		});
	});
});
