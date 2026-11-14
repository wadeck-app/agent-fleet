/**
 * The maxima the `hostTools` schema enforces. Defaults are NOT here: they are applied where a tool runs (flow-cli
 * `HostToolLimits`), so the definition is stored as written.
 */
export class HostToolSchemaLimits {
	static readonly MAX_TIMEOUT_SECONDS = 300;
	static readonly MAX_OUTPUT_BYTES = 1_048_576;
	/** Tools per step. */
	static readonly MAX_TOOLS_PER_STEP = 16;
	/** Serialized model-facing description set of a step (see HostToolModelView), in bytes. */
	static readonly MAX_DESCRIPTION_SET_BYTES = 16_384;
	/** Longest accepted `pattern` source: a bound on the cost of matching a value. */
	static readonly MAX_PATTERN_LENGTH = 256;
	/** Longest string value a call may carry, checked before the pattern is tried. */
	static readonly MAX_VALUE_LENGTH = 1024;
	/** The tool name the engine already serves; a host tool cannot take it. */
	static readonly RESERVED_TOOL_ID = 'provideSteps';
}
