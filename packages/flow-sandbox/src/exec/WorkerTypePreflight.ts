import { describeError } from '../ErrorText';
import type { SandboxLog } from '../SandboxLog';
import type { SourceFacts } from './FlowSourceLookup';

export interface WorkerTypePreflightOptions {
	/** `FLOW_WORKER_SOURCE_ID`: the source that launched this wrapper. */
	sourceId: string;
	lookup: () => SourceFacts | undefined;
	log: SandboxLog;
}

/**
 * Startup statement about routing, from the one thing the wrapper can know: how its SOURCE was declared. The flow is out of
 * its sight (the daemon sends it single steps), so it cannot check `workerType:` and never claims isolation.
 *
 * Why it matters: a step injected through the MCP `provideSteps` tool carries no labels, so under LABEL routing
 * (`labels: [sandbox]`, a `built-in:command` source) the daemon may run it on a host worker, outside the sandbox. Only a
 * run bound to a worker TYPE (`workerType: sandbox` in the flow, workers of a source declared with
 * `--plugin sandbox.<impl>`) keeps every step, injected ones included, on these workers.
 * - source with a plugin ref: info line naming the type the flow has to bind to;
 * - source without one, not in the registry this process can read, or an unreadable registry: ONE warning.
 */
export class WorkerTypePreflight {
	constructor(private readonly options: WorkerTypePreflightOptions) {}

	run(): void {
		const { sourceId, log } = this.options;
		let facts: SourceFacts | undefined;
		try {
			facts = this.options.lookup();
		} catch (error) {
			log.warn(this.warning(sourceId, `its declaration could not be verified (${describeError(error)})`));
			return;
		}
		if (facts === undefined) {
			log.warn(
				this.warning(
					sourceId,
					`its declaration could not be verified (source "${sourceId}" is not in the worker-sources registry this process reads; a daemon with another config directory is not visible from here)`
				)
			);
			return;
		}
		if (facts.plugin === undefined) {
			log.warn(
				this.warning(sourceId, `source "${sourceId}" has no plugin ref, so its workers have no worker type`)
			);
			return;
		}
		const type = facts.plugin.split('.')[0] ?? facts.plugin;
		log.info(
			`source "${sourceId}" is declared with plugin ${facts.plugin}: its workers have the worker type "${type}". A step is kept off host workers (injected steps included) only if the flow declares \`workerType: ${type}\`; without it routing is by labels and injected steps are NOT isolated.`
		);
	}

	private warning(sourceId: string, reason: string): string {
		return (
			`ISOLATION WARNING for source "${sourceId}": ${reason}. Label routing (\`labels: [sandbox]\`) is NOT isolating: a step injected by a model (provideSteps) carries no labels and can be run OUTSIDE the sandbox, on a host worker. ` +
			'Isolation against injected steps needs both the source declared with a plugin ref (flow worker source add <id> --plugin sandbox.<implementation> --plugins-dir <dir>) and the flow to declare `workerType: sandbox`.'
		);
	}
}
