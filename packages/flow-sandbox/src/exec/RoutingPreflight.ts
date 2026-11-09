import { describeError } from '../ErrorText';
import type { SandboxLog } from '../SandboxLog';
import type { SourceFacts } from './FlowSourceLookup';

export interface RoutingPreflightOptions {
	/** `FLOW_WORKER_SOURCE_ID`: the source that launched this wrapper. */
	sourceId: string;
	lookup: () => SourceFacts | undefined;
	log: SandboxLog;
}

/**
 * Startup statement about routing, from the one thing the wrapper can know: how its SOURCE was declared. The flow is out of
 * its sight (the daemon sends it single steps), so it cannot check `requires:` and never claims isolation.
 *
 * Why it matters: a step injected through the MCP `provideSteps` tool carries no labels, so under LABEL routing
 * (`labels: [sandbox]`, a `built-in:command` source) the daemon may run it on a host worker, outside the sandbox. Only
 * requirement routing (`requires: [sandbox]` in the flow, which injected steps inherit, and a source declared with
 * `--plugin sandbox.<impl>`, which declares guarantees) keeps every step on these workers.
 * - source with a plugin ref: info line saying steps arrive only with `requires`;
 * - source without one, not in the registry this process can read, or an unreadable registry: ONE warning.
 */
export class RoutingPreflight {
	constructor(private readonly options: RoutingPreflightOptions) {}

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
			log.warn(this.warning(sourceId, `source "${sourceId}" has no plugin ref, so it declares no guarantees`));
			return;
		}
		log.info(
			`source "${sourceId}" is declared with plugin ${facts.plugin}: it declares guarantees, so the daemon gives it only steps whose \`requires\` it fully guarantees (flow \`requires: [sandbox]\`; injected steps inherit it). A flow without \`requires\` never reaches it.`
		);
	}

	private warning(sourceId: string, reason: string): string {
		return (
			`ISOLATION WARNING for source "${sourceId}": ${reason}. Label routing (\`labels: [sandbox]\`) is NOT isolating: a step injected by a model (provideSteps) carries no labels and can be run OUTSIDE the sandbox, on a host worker. ` +
			'Isolation against injected steps needs both the source declared with a plugin ref (flow worker source add <id> --plugin sandbox.<implementation> --plugins-dir <dir>) and the flow to declare `requires: [sandbox]`.'
		);
	}
}
