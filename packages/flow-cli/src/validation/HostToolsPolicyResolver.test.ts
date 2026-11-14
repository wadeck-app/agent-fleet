import { describe, expect, it } from 'vitest';

import { type FlowConfig, FlowConfigLoader } from '../config/FlowConfig.js';
import { HostToolsPolicyResolver } from './HostToolsPolicyResolver.js';

function configWith(mode: 'warn' | 'error' | undefined): FlowConfig {
	return {
		...FlowConfigLoader.DEFAULT,
		validation: { hostToolsUnderConfinedProfile: mode },
	};
}

describe('HostToolsPolicyResolver', () => {
	it.each([
		[undefined, 'warn', 'warning (validation.hostToolsUnderConfinedProfile=warn, default)'],
		['warn', 'warn', 'warning (validation.hostToolsUnderConfinedProfile=warn)'],
		['error', 'error', 'error (validation.hostToolsUnderConfinedProfile=error)'],
	] as const)(
		'turns the user setting %s into mode %s with the description the user reads',
		(setting, mode, description) => {
			expect(HostToolsPolicyResolver.of(configWith(setting))).toEqual({ mode, description });
		}
	);
});
