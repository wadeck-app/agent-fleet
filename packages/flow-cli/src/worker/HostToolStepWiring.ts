import type { HostTool } from 'flow-engine';

import { HostToolAuditLog } from './HostToolAuditLog';
import { HostToolCallService } from './HostToolCallService';
import type { HostToolServing } from './HostToolCallTypes';
import { HostToolEnvironment } from './HostToolEnvironment';
import { HostToolExecutableResolver } from './HostToolExecutableResolver';
import { HostToolExecutor } from './HostToolExecutor';
import { HostToolWorkspaceExecutableWarning } from './HostToolWorkspaceExecutableWarning';

const MAX_REPORTED_ENTRIES = 16;

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
 * here, before the server and the model start, with a named error when one cannot be resolved; one inside the workspace
 * is warned about, once, in the step log), refuses an `env` name
 * that must never reach a tool, and wires the call service with its executor and audit log. A step without tools gets
 * `undefined`: nothing changes for it.
 */
export class HostToolStepWiring {
	static prepare(options: HostToolStepWiringOptions): HostToolServing | undefined {
		const tools = options.hostTools;
		if (tools === undefined || tools.length === 0) {
			return undefined;
		}
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
		// Not an error: a PATH such as Git Bash's may hold relative entries. They are never searched; say so once.
		const ignored = resolver.ignoredPathEntries();
		if (ignored.length > 0 && tools.some(tool => HostToolStepWiring.isBareName(tool.command[0]))) {
			options.writeAuditLine(HostToolStepWiring.ignoredEntriesLine(options.stepId, ignored));
		}
		const executables = resolver.resolveAll(options.stepId, tools);
		// A warning, not a refusal: the model can write the workspace, so an executable inside it could be replaced.
		for (const warning of HostToolWorkspaceExecutableWarning.find({
			stepId: options.stepId,
			executables,
			workspaceDir: options.workspaceDir,
		})) {
			options.writeAuditLine(warning);
		}
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

	private static isBareName(command: string | undefined): boolean {
		return command !== undefined && command !== '' && !/[\\/]/.test(command);
	}

	private static ignoredEntriesLine(stepId: string, ignored: readonly string[]): string {
		const shown = HostToolExecutableResolver.describe(ignored.slice(0, MAX_REPORTED_ENTRIES));
		const more = ignored.length > MAX_REPORTED_ENTRIES ? ` and ${ignored.length - MAX_REPORTED_ENTRIES} more` : '';
		return `[host-tool] NOTICE Step '${stepId}': ignored ${ignored.length} relative or empty PATH entries when resolving host tools: ${shown}${more}. They are never searched (a file planted there would run). Fix: use absolute entries in the worker's PATH to silence this.`;
	}
}
