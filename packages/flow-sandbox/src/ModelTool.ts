import { SandboxError } from './SandboxError';

/** The model CLIs a sandbox can run. */
export const MODEL_TOOLS = ['claude', 'codex', 'opencode'] as const;

export type ModelTool = (typeof MODEL_TOOLS)[number];

/** Throws for anything that is not a known tool, so a typo never selects a default. */
export function requireModelTool(tool: string): ModelTool {
	const known = MODEL_TOOLS.find(candidate => candidate === tool);
	if (known === undefined) {
		throw new SandboxError(
			'invalid-argument',
			`Model tool "${tool}" is not supported. Use one of: ${MODEL_TOOLS.join(', ')}.`
		);
	}
	return known;
}
