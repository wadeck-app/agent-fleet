/**
 * Types of the `hostTools` step field: tools the worker runs ON ITS HOST for a model step, behind one closed argv.
 * Design: `.claude/plans/2026-11-14_generic-tool-provision-mcp.md` (D2). Documentation: `.claude/docs/flows/host-tools.md`.
 *
 * Everything optional is stored as written: defaults (cwd, timeout, output cap, ...) are applied where the tool is used
 * (flow-cli `HostToolLimits`), never written into the definition.
 */

/** What a tool may do. Slice 1 accepts `read` only; `write` is refused by validation. */
export type HostToolSideEffect = 'read' | 'write';

/** Where the tool process starts: the workspace of the run, or no particular directory. */
export type HostToolCwd = 'workspace' | 'none';

/** Fields every argument type shares. */
export interface HostToolArgBase {
	/** Shown to the model in the generated input schema. */
	description?: string;
	/** Default false: an argument that is not required may be omitted by the model (its argv element is then dropped). */
	required?: boolean;
	/** True lets the audit log keep the VALUE; otherwise only the name and a hash are logged. */
	log?: boolean;
	/** True lets a value start with `-` (refused by default: it would be read as an option by the tool). */
	allowLeadingDash?: boolean;
}

export interface HostToolEnumArg extends HostToolArgBase {
	type: 'enum';
	values: string[];
}

/** A string always carries a pattern: a free-form string is refused by validation. */
export interface HostToolStringArg extends HostToolArgBase {
	type: 'string';
	/** Anchored regular expression (starts with `^`, ends with `$`) the whole value must match. */
	pattern: string;
}

export interface HostToolIntegerArg extends HostToolArgBase {
	type: 'integer';
	min: number;
	max: number;
}

export interface HostToolBooleanArg extends HostToolArgBase {
	type: 'boolean';
}

export type HostToolArg = HostToolEnumArg | HostToolStringArg | HostToolIntegerArg | HostToolBooleanArg;

export const HOST_TOOL_ARG_TYPES = ['enum', 'string', 'integer', 'boolean'] as const;

/** One tool a model step may call. */
export interface HostTool {
	/** The MCP tool name: `[a-z0-9-]+`, unique in the step, never `provideSteps`. */
	id: string;
	/** What the tool does, for the model. Required. */
	description: string;
	/** Required, no default. */
	sideEffect: HostToolSideEffect;
	/** argv array, never a shell string. `{name}` placeholders: a whole element or the value of `--flag={name}`. */
	command: string[];
	/** The closed set of arguments the model may pass; every `{name}` of `command` must be declared here. */
	args?: Record<string, HostToolArg>;
	cwd?: HostToolCwd;
	/** NAMES of environment variables taken from the worker process environment; never values. */
	env?: string[];
	/** Maximum 300. */
	timeoutSeconds?: number;
	/** Maximum 1048576. */
	maxOutputBytes?: number;
}
