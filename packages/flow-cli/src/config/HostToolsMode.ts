import type { FlowConfig } from './FlowConfig.js';

/** What happens to a step that declares `hostTools` under a confined profile: reported (`warn`) or refused (`error`). */
export type HostToolsMode = 'warn' | 'error';

/** The accepted values of `validation.hostToolsUnderConfinedProfile` in the user config. */
export const HOST_TOOLS_MODES: readonly HostToolsMode[] = ['warn', 'error'];

/** Mode in force when `validation.hostToolsUnderConfinedProfile` is absent. */
const DEFAULT_HOST_TOOLS_MODE: HostToolsMode = 'warn';

/** The mode of the user config; `warn` when the key is absent. The loader has already refused any other value. */
export function resolveHostToolsMode(config: FlowConfig): HostToolsMode {
	return config.validation.hostToolsUnderConfinedProfile ?? DEFAULT_HOST_TOOLS_MODE;
}

/**
 * Names the mode and where it comes from, for a message that must tell the user how to change it.
 *
 * @param isDefault - true when the key is absent from the config (`config.validation.hostToolsUnderConfinedProfile === undefined`)
 */
export function describeHostToolsMode(mode: HostToolsMode, isDefault: boolean): string {
	const setting = `validation.hostToolsUnderConfinedProfile=${mode}`;
	const label = mode === 'warn' ? 'warning' : 'error';
	return `${label} (${setting}${isDefault ? ', default' : ''})`;
}
