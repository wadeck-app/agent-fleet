import { describe, expect, it } from 'vitest';

import { CodexConfigBuilder } from './CodexConfigBuilder';

describe('CodexConfigBuilder', () => {
	describe('tomlString', () => {
		it('quotes and escapes backslashes, quotes and control characters', () => {
			expect(CodexConfigBuilder.tomlString('C:\\a "b"\n\t')).toBe('"C:\\\\a \\"b\\"\\n\\t"');
		});

		// TOML forbids a raw DEL in a basic string; JSON.stringify leaves it as is
		it('escapes DEL, which JSON does not', () => {
			expect(CodexConfigBuilder.tomlString('a\x7fb')).toBe('"a\\u007fb"');
		});

		it('keeps non-ASCII text as is', () => {
			expect(CodexConfigBuilder.tomlString('héllo')).toBe('"héllo"');
		});
	});

	it('encodes string arrays', () => {
		expect(CodexConfigBuilder.tomlStringArray(['a b', 'c"d'])).toBe('["a b", "c\\"d"]');
		expect(CodexConfigBuilder.tomlStringArray([])).toBe('[]');
	});

	it('encodes inline tables with quoted keys', () => {
		expect(CodexConfigBuilder.tomlInlineTable({ A_B: '1', C: 'x"y' })).toBe('{ "A_B" = "1", "C" = "x\\"y" }');
	});

	it('builds a -c pair', () => {
		expect(CodexConfigBuilder.override('a.b', '1')).toEqual(['-c', 'a.b=1']);
	});

	describe('mcpServerOverrides', () => {
		it('emits only the fields a server sets', () => {
			expect(CodexConfigBuilder.mcpServerOverrides([{ name: 'x', command: ['node'] }])).toEqual([
				'-c',
				'mcp_servers.x.command="node"',
				'-c',
				'mcp_servers.x.required=true',
				'-c',
				'mcp_servers.x.default_tools_approval_mode="approve"',
			]);
		});

		it('emits args, env and cwd when present, and skips an empty env', () => {
			const args = CodexConfigBuilder.mcpServerOverrides([
				{ name: 'x', command: ['node', 'a.js', 'b'], env: {}, cwd: '/w' },
			]);

			expect(args).toContain('mcp_servers.x.args=["a.js", "b"]');
			expect(args).toContain('mcp_servers.x.cwd="/w"');
			expect(args.join(' ')).not.toContain('.env=');
		});

		it('replaces required with enabled=false for a disabled server', () => {
			const args = CodexConfigBuilder.mcpServerOverrides([{ name: 'x', command: ['node'], enabled: false }]);

			expect(args).toContain('mcp_servers.x.enabled=false');
			expect(args).not.toContain('mcp_servers.x.required=true');
		});

		it('handles several servers', () => {
			const args = CodexConfigBuilder.mcpServerOverrides([
				{ name: 'a', command: ['one'] },
				{ name: 'b-2', command: ['two'] },
			]);

			expect(args).toContain('mcp_servers.a.command="one"');
			expect(args).toContain('mcp_servers.b-2.command="two"');
		});
	});

	it('builds a catch-all command hook override with a timeout', () => {
		expect(CodexConfigBuilder.hookOverride('PreToolUse', 'node "C:/x/hook.cjs" pre')).toEqual([
			'-c',
			'hooks.PreToolUse=[{ matcher = "*", hooks = [{ type = "command", command = "node \\"C:/x/hook.cjs\\" pre", timeout = 30 }] }]',
		]);
	});
});
