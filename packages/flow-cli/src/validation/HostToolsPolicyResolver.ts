import type { HostToolsConfinementPolicy } from 'flow-engine';

import type { FlowConfig } from '../config/FlowConfig.js';
import { describeHostToolsMode, resolveHostToolsMode } from '../config/HostToolsMode.js';

/**
 * Turns the user setting `validation.hostToolsUnderConfinedProfile` into what the flow validator is told (flow-engine cannot read the
 * configuration): the mode, and the text that says which setting decided it and whether it is the default.
 */
export class HostToolsPolicyResolver {
	static of(config: FlowConfig): HostToolsConfinementPolicy {
		const mode = resolveHostToolsMode(config);
		// `resolveHostToolsMode` hides whether the key was written: the description needs to say "default" only when it was not.
		const isDefault = config.validation.hostToolsUnderConfinedProfile === undefined;
		return { mode, description: describeHostToolsMode(mode, isDefault) };
	}
}
