import { describe, expect, it } from 'vitest';

import { MODEL_TOOLS, requireModelTool } from './ModelTool';
import { failure } from './testing/ExpectedFailures';

describe('requireModelTool', () => {
	it('lists the tools of the model CLIs and accepts each of them', () => {
		expect([...MODEL_TOOLS]).toEqual(['claude', 'codex', 'opencode']);
		for (const tool of MODEL_TOOLS) expect(requireModelTool(tool)).toBe(tool);
	});

	it('refuses an unknown tool, however close, and lists the supported tools', () => {
		for (const value of ['', 'Claude', 'gemini', 'claude ']) {
			const error = failure(() => requireModelTool(value), JSON.stringify(value));

			expect(error.kind, value).toBe('invalid-argument');
			expect(error.message, value).toBe(
				`Model tool "${value}" is not supported. Use one of: claude, codex, opencode.`
			);
		}
	});
});
