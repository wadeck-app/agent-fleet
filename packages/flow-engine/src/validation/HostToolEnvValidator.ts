import type { HostToolIssueReporter } from './HostToolIssueReporter';
import { ValidationCode } from './ValidationTypes';

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Checks the `env` of one host tool: a list of variable NAMES read from the worker's environment, never `NAME=value`.
 * The worker's own credentials (`FLOW_WORKER_*`) and the engine's MCP variables (`FLOW_MCP_*`) can never be passed on.
 */
export class HostToolEnvValidator {
	/** True for a name the worker never passes to a tool (compared case-insensitively: Windows variables are). */
	static isReserved(name: string): boolean {
		const upper = name.toUpperCase();
		return upper.startsWith('FLOW_WORKER_') || upper.startsWith('FLOW_MCP_');
	}

	validate(env: unknown, reporter: HostToolIssueReporter): void {
		if (env === undefined) {
			return;
		}
		if (!Array.isArray(env)) {
			reporter.error(
				ValidationCode.HOST_TOOL_INVALID_ENV,
				'env',
				'env must be a list of environment variable NAMES',
				'write env: [TASK_PROFILE]; the value comes from the worker environment'
			);
			return;
		}
		const seen = new Set<string>();
		env.forEach((entry: unknown, index) => {
			const field = `env[${index}]`;
			if (typeof entry !== 'string' || !ENV_NAME.test(entry)) {
				const equals = typeof entry === 'string' && entry.includes('=');
				reporter.error(
					ValidationCode.HOST_TOOL_INVALID_ENV,
					field,
					equals
						? `env entry ${JSON.stringify(entry)} looks like NAME=value, but env lists NAMES only: a value in the flow would be a credential in a file`
						: `env entry ${JSON.stringify(entry)} is not a valid variable name (letters, digits and '_', not starting with a digit)`,
					equals
						? `write only the name (${JSON.stringify((entry as string).split('=')[0])}); the worker takes the value from its own environment`
						: 'write a name such as TASK_PROFILE'
				);
				return;
			}
			if (HostToolEnvValidator.isReserved(entry)) {
				reporter.error(
					ValidationCode.HOST_TOOL_FORBIDDEN_ENV,
					field,
					`env '${entry}' is reserved: the worker credentials (FLOW_WORKER_TOKEN, FLOW_WORKER_*) and the engine variables (FLOW_MCP_*) are never passed to a tool`,
					`remove '${entry}'; a tool that needs a secret uses its own login on the host`
				);
				return;
			}
			const key = entry.toUpperCase();
			if (seen.has(key)) {
				reporter.error(
					ValidationCode.HOST_TOOL_INVALID_ENV,
					field,
					`env '${entry}' is listed more than once`,
					`remove the duplicate '${entry}'`
				);
			}
			seen.add(key);
		});
	}
}
