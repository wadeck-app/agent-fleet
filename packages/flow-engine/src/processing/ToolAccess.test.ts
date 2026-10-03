import { describe, expect, it } from 'vitest';

import { TOOL_NAMES, buildClaudeToolsArg, buildOpenCodeToolsConfig, validateToolNames } from './ToolAccess';

describe('validateToolNames', () => {
	it('accepts every canonical name', () => {
		expect(() => validateToolNames(TOOL_NAMES)).not.toThrow();
	});

	it('accepts an empty list', () => {
		expect(() => validateToolNames([])).not.toThrow();
	});

	it('throws on an unknown name, naming it and the valid set', () => {
		expect(() => validateToolNames(['Read'])).toThrow(/Unknown tool name 'Read'/);
		expect(() => validateToolNames(['Read'])).toThrow(/read/);
	});
});

describe('buildClaudeToolsArg', () => {
	it('joins mapped PascalCase names with commas', () => {
		expect(buildClaudeToolsArg(['read', 'bash'])).toBe('Read,Bash');
	});

	it('returns an empty string for an empty list', () => {
		expect(buildClaudeToolsArg([])).toBe('');
	});
});

describe('buildOpenCodeToolsConfig', () => {
	it('sets every canonical name explicitly, true only for the allowed ones', () => {
		const config = buildOpenCodeToolsConfig(['read', 'bash']);
		expect(config['read']).toBe(true);
		expect(config['bash']).toBe(true);
		expect(config['write']).toBe(false);
		expect(config['edit']).toBe(false);
		expect(config['glob']).toBe(false);
		expect(config['grep']).toBe(false);
		expect(config['webfetch']).toBe(false);
		expect(config['websearch']).toBe(false);
		expect(config['task']).toBe(false);
		expect(config['todowrite']).toBe(false);
	});

	it('folds patch into write -- excluding write also denies patch', () => {
		expect(buildOpenCodeToolsConfig(['read'])['patch']).toBe(false);
		expect(buildOpenCodeToolsConfig(['read', 'write'])['patch']).toBe(true);
	});

	it('denies every tool, including patch, for an empty allow-list', () => {
		const config = buildOpenCodeToolsConfig([]);
		expect(Object.values(config).every(v => v === false)).toBe(true);
	});
});
