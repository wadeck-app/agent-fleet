/**
 * ToolHook -- unified hook abstraction for tool interception across model providers.
 *
 * Business logic (what to do) is defined here, independent of provider-specific formats.
 * Provider translators (OpenCodeHookTranslator, ClaudeHookTranslator) convert these
 * hooks into their respective native formats.
 */

/** When the hook fires relative to the tool call */
export type ToolHookTiming = 'before' | 'after';

/** What the hook does */
export type ToolHookAction =
	/** Log tool name, args (before) or output (after) to stderr */
	| { type: 'log' }
	/**
	 * Deny tool execution. Only meaningful for 'before' timing.
	 * Both conditions must match when both are specified (AND logic).
	 * If neither is set, matches all tools.
	 */
	| {
			type: 'deny';
			reason: string;
			/** Glob pattern matched against tool name. Optional -- if omitted, matches all tools. */
			toolPattern?: string;
			/** String that must appear in JSON-serialized tool arguments to trigger denial. Case-insensitive. */
			argsContains?: string;
	  };

/** A single hook entry combining when it fires and what it does */
export type ToolHook = {
	timing: ToolHookTiming;
	action: ToolHookAction;
};
