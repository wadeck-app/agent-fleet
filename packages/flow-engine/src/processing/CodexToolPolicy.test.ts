import { describe, expect, it } from 'vitest';

import { CodexToolPolicy } from './CodexToolPolicy';
import { TOOL_NAMES, type ToolName } from './ToolAccess';

const without = (...excluded: ToolName[]): ToolName[] => TOOL_NAMES.filter(name => !excluded.includes(name));

describe('CodexToolPolicy', () => {
	it('imposes nothing when tools is undefined', () => {
		expect(CodexToolPolicy.resolve(undefined)).toEqual({
			readOnlySandbox: false,
			disableShell: false,
			disableWebSearch: false,
			warnings: [],
		});
	});

	it('imposes nothing when every tool is allowed', () => {
		expect(CodexToolPolicy.resolve([...TOOL_NAMES])).toEqual({
			readOnlySandbox: false,
			disableShell: false,
			disableWebSearch: false,
			warnings: [],
		});
	});

	it('maps excluding write and edit to the read-only sandbox', () => {
		const result = CodexToolPolicy.resolve(without('write', 'edit'));

		expect(result.readOnlySandbox).toBe(true);
		expect(result.disableShell).toBe(false);
	});

	it('maps excluding bash to removing the shell tool', () => {
		const result = CodexToolPolicy.resolve(without('bash'));

		expect(result.disableShell).toBe(true);
		expect(result.readOnlySandbox).toBe(false);
	});

	it('maps excluding websearch and webfetch to turning web search off', () => {
		expect(CodexToolPolicy.resolve(without('websearch', 'webfetch')).disableWebSearch).toBe(true);
	});

	it.each([
		['write', /single apply_patch tool/],
		['edit', /single apply_patch tool/],
		['websearch', /single web_search tool/],
		['webfetch', /single web_search tool/],
	] as const)('throws when only %s of a pair codex cannot tell apart is excluded', (name, message) => {
		expect(() => CodexToolPolicy.resolve(without(name))).toThrow(message);
	});

	it('names the exclusion in the error so the step author knows what to change', () => {
		expect(() => CodexToolPolicy.resolve(without('write'))).toThrow(/excludes 'write'/);
	});

	it('warns about read/glob/grep exclusions while the shell is available', () => {
		const result = CodexToolPolicy.resolve(without('read', 'glob'));

		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toContain("'read', 'glob'");
		expect(result.warnings[0]).toContain("allows 'bash'");
	});

	it('does not warn about read/glob/grep once the shell is removed', () => {
		expect(CodexToolPolicy.resolve(without('bash', 'read', 'glob', 'grep')).warnings).toEqual([]);
	});

	it.each(['task', 'todowrite'] as const)('warns that excluding %s cannot be enforced', name => {
		const result = CodexToolPolicy.resolve(without(name));

		expect(result.warnings).toEqual([expect.stringContaining(`excludes '${name}'`)]);
	});

	it('handles an empty allow-list: everything that can be removed is', () => {
		const result = CodexToolPolicy.resolve([]);

		expect(result).toMatchObject({ readOnlySandbox: true, disableShell: true, disableWebSearch: true });
		expect(result.warnings).toHaveLength(2);
	});
});
