/**
 * What the validator is told about the user's setting `validation.hostToolsUnderConfinedProfile`, without knowing the
 * configuration: the caller (flow-cli) reads the setting and passes the mode AND the text that describes it.
 */
export interface HostToolsConfinementPolicy {
	/** `warn` reports the finding as a warning, `error` as an error. */
	readonly mode: 'warn' | 'error';
	/**
	 * How the mode was decided, printed in the finding, for example
	 * `warning (validation.hostToolsUnderConfinedProfile=warn, default)`.
	 */
	readonly description: string;
}

/**
 * Used when the caller did not pass a policy (offline validation, the flow editor): the finding is still reported, as a
 * warning, and says that the setting was not consulted. It is never skipped.
 */
export const HOST_TOOLS_POLICY_NOT_CONSULTED: HostToolsConfinementPolicy = {
	mode: 'warn',
	description:
		'warning (the setting validation.hostToolsUnderConfinedProfile was not consulted by this validation; `flow run` applies it)',
};
