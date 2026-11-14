import type { FlowDefinition, HostTool } from 'flow-engine/types';

/** Describes the limits that apply to a tool (the worker's defaults are known to flow-cli, not to flow-core). */
export type HostToolLimitsDescriber = (tool: HostTool) => string;

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function argumentsOf(tool: Record<string, unknown>): string {
	const args = isObject(tool['args']) ? tool['args'] : {};
	const parts = Object.entries(args).map(
		([name, arg]) => `${name}:${isObject(arg) && typeof arg['type'] === 'string' ? arg['type'] : '?'}`
	);
	return `args(${parts.join(', ')})`;
}

function rowOf(tool: unknown, describeLimits: HostToolLimitsDescriber | undefined): string {
	if (!isObject(tool) || typeof tool['id'] !== 'string' || !Array.isArray(tool['command'])) {
		return '  (invalid host tool: run flow validate)';
	}
	const command = tool['command'] as unknown[];
	const head = `  ${tool['id']} [${String(tool['sideEffect'])}] ${String(command[0])} ${argumentsOf(tool)}`;
	return describeLimits === undefined ? head : `${head} ${describeLimits(tool as unknown as HostTool)}`;
}

/**
 * The `tools of step 'X':` blocks of `flow show <file>`: per model step, one row per host tool with its id, side effect,
 * executable, typed arguments and the limits that will apply (the describer is injected by flow-cli, which owns the
 * defaults, so what is shown is what is applied). Nothing for a step without tools. A malformed entry is named, never
 * skipped, so the reader is sent to `flow validate`.
 */
export function hostToolLines(flow: FlowDefinition, describeLimits?: HostToolLimitsDescriber): string[] {
	const lines: string[] = [];
	for (const step of flow.steps ?? []) {
		const hostTools: unknown = (step as { hostTools?: unknown }).hostTools;
		if (hostTools === undefined || (Array.isArray(hostTools) && hostTools.length === 0)) {
			continue;
		}
		lines.push(`tools of step '${step.id}':`);
		if (!Array.isArray(hostTools)) {
			lines.push('  (hostTools is not a list: run flow validate)');
			continue;
		}
		for (const tool of hostTools as unknown[]) {
			lines.push(rowOf(tool, describeLimits));
		}
	}
	return lines;
}
