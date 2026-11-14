import type { HostTool } from 'flow-engine';

import { HostToolAuditLog } from './HostToolAuditLog';
import { HostToolCallService } from './HostToolCallService';
import type { HostToolServing } from './HostToolCallTypes';
import { HostToolEnvironment } from './HostToolEnvironment';
import { HostToolExecutableResolver } from './HostToolExecutableResolver';
import { HostToolExecutor } from './HostToolExecutor';

export interface HostToolStepWiringOptions {
	stepId: string;
	/** `hostTools` of the step as the daemon assigned it. */
	hostTools: readonly HostTool[] | undefined;
	/** The run's workspace directory. */
	workspaceDir: string;
	/** The worker's own environment (declared env NAMES are read here, PATH is searched here). */
	workerEnvironment: Readonly<Record<string, string | undefined>>;
	/** Where audit lines go: the worker's log channel (already masked). */
	writeAuditLine: (line: string) => void;
}

/**
 * Builds what `McpServer` needs to serve the host tools of one model step: resolves every executable (the step fails
 * here, before the server and the model start, with a named error when one cannot be resolved), refuses an `env` name
 * that must never reach a tool, and wires the call service with its executor and audit log. A step without tools gets
 * `undefined`: nothing changes for it.
 */
export class HostToolStepWiring {
	static prepare(options: HostToolStepWiringOptions): HostToolServing | undefined {
		const tools = options.hostTools;
		if (tools === undefined || tools.length === 0) return undefined;
		for (const tool of tools) {
			for (const name of tool.env ?? []) {
				if (HostToolEnvironment.isDenied(name)) {
					throw new Error(
						`Step '${options.stepId}' tool '${tool.id}': env name '${name}' is never passed to host tools (it carries the worker's credentials or the step's tokens). Fix: remove it from env.`
					);
				}
			}
		}
		const resolver = new HostToolExecutableResolver({ environment: options.workerEnvironment });
		const executables = resolver.resolveAll(options.stepId, tools);
		const handler = new HostToolCallService({
			stepId: options.stepId,
			tools,
			executables,
			executor: new HostToolExecutor({ workerEnvironment: options.workerEnvironment, resolver }),
			audit: new HostToolAuditLog(options.stepId, options.writeAuditLine),
			workspaceDir: options.workspaceDir,
		});
		return { stepId: options.stepId, tools, handler };
	}
}
