import { describe, expect, it } from 'vitest';

import { FlowConfigLoader } from './FlowConfig.js';
import { describeHostToolsMode, HOST_TOOLS_MODES, resolveHostToolsMode } from './HostToolsMode.js';

describe('HOST_TOOLS_MODES', () => {
	it('lists warn then error', () => {
		expect([...HOST_TOOLS_MODES]).toEqual(['warn', 'error']);
	});
});

describe('resolveHostToolsMode', () => {
	it('defaults to warn when the key is absent', () => {
		expect(resolveHostToolsMode(FlowConfigLoader.DEFAULT)).toBe('warn');
	});

	it('returns warn when set to warn', () => {
		const config = { ...FlowConfigLoader.DEFAULT, validation: { hostToolsUnderConfinedProfile: 'warn' as const } };
		expect(resolveHostToolsMode(config)).toBe('warn');
	});

	it('returns error when set to error', () => {
		const config = { ...FlowConfigLoader.DEFAULT, validation: { hostToolsUnderConfinedProfile: 'error' as const } };
		expect(resolveHostToolsMode(config)).toBe('error');
	});
});

describe('describeHostToolsMode', () => {
	it('says warning and default when warn comes from the default', () => {
		expect(describeHostToolsMode('warn', true)).toBe('warning (validation.hostToolsUnderConfinedProfile=warn, default)');
	});

	it('says warning when warn is set explicitly', () => {
		expect(describeHostToolsMode('warn', false)).toBe('warning (validation.hostToolsUnderConfinedProfile=warn)');
	});

	it('says error when error is set', () => {
		expect(describeHostToolsMode('error', false)).toBe('error (validation.hostToolsUnderConfinedProfile=error)');
	});
});
