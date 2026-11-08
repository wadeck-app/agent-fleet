import type { StepPlacement } from 'extension-points';
import { RequirementSyntax } from 'flow-engine';

import type { BoundStepWait } from './BoundStepWait.js';
import type { DeclaredGuarantees } from './DeclaredGuarantees.js';
import type { SourceContactErrors } from './SourceContactErrors.js';
import type { StepRouter } from './StepRouter.js';
import type { RegisteredWorker } from './WorkerRegistry.js';
import type { GuaranteeLookup, WorkerTypeLookup } from './WorkerTypeCatalog.js';

/** What the dispatcher knows about a step with requirements that no idle worker could take. */
export interface ShortageInputs {
	executionId: string;
	/** The step as routed; `requires` is not empty. */
	placement: StepPlacement;
	/** Every connected worker, idle or busy. */
	connected: RegisteredWorker[];
	guaranteesOf: GuaranteeLookup;
	typeOf: WorkerTypeLookup;
}

export type ShortageDecision = { action: 'wait'; sources: ReadonlySet<string> } | { action: 'fail'; reason: string };

/** At most this many workers or sources are named in a message. */
const MAX_NAMED = 3;
/** At most this many declared guarantees are listed in a message. */
const MAX_LISTED = 10;

/**
 * Decides what happens to a step with requirements that found no idle worker: keep it queued (a worker that meets them
 * exists, or one can still come), wait for one up to the bound, or fail it now because nothing can ever provide it.
 *
 * "Nothing can ever provide it" is only concluded from what was read: a source whose declaration is unknown (not read yet,
 * unreadable) keeps the step waiting for the bound, never failing it on a guess. Messages are made of fixed words and the
 * names the flow and the sources declared, never text a plugin wrote.
 */
export class RequirementShortage {
	constructor(
		private readonly router: Pick<StepRouter, 'refusalOf' | 'missingRequirementsOf' | 'refusesWorkspace'>,
		private readonly declared: Pick<DeclaredGuarantees, 'entries' | 'providersOfAll' | 'shortfalls' | 'unread'> &
			Partial<Pick<DeclaredGuarantees, 'workspacesOf' | 'acceptsWorkspace'>>,
		private readonly wait: BoundStepWait,
		private readonly contactErrors: Pick<SourceContactErrors, 'sinceFor'>
	) {}

	/** @returns `wait` with the ids of the declared sources worth asking for a worker, or `fail` with the reason. */
	assess(inputs: ShortageInputs): ShortageDecision {
		const { executionId, placement } = inputs;
		const required = placement.requires ?? [];

		const serving = inputs.connected.filter(worker => this.serves(placement, worker, inputs));
		if (serving.length > 0) {
			this.wait.decideRequirement({
				executionId,
				stepId: placement.stepId,
				required,
				connectedServing: serving.length,
				closest: () => [],
			});
			return { action: 'wait', sources: new Set() };
		}

		const providers = this.declared.providersOfAll(required);
		const eligible = providers.filter(
			sourceId => this.mayServe(placement, sourceId, inputs) && this.acceptsWorkspace(placement, sourceId)
		);
		const canStillAppear =
			eligible.length > 0 ||
			this.declared.unread().length > 0 ||
			inputs.connected.some(
				worker =>
					this.router.missingRequirementsOf(placement, worker, inputs.guaranteesOf).length === 0 &&
					!this.router.refusesWorkspace(placement, worker)
			);
		if (!canStillAppear) {
			this.wait.clearRequirement(executionId, placement.stepId);
			return { action: 'fail', reason: this.describeNoProvider(inputs, providers) };
		}

		const types = new Set(
			eligible.map(sourceId => inputs.typeOf(sourceId)).filter((type): type is string => type !== undefined)
		);
		const decision = this.wait.decideRequirement({
			executionId,
			stepId: placement.stepId,
			required,
			connectedServing: 0,
			closest: () => this.closestSentences(inputs),
			contactErrorsSince: since =>
				[...types].flatMap(type => this.contactErrors.sinceFor(type, inputs.typeOf)(since)),
		});
		return decision.action === 'fail' ? decision : { action: 'wait', sources: new Set(eligible) };
	}

	/** The step is handed to a worker: forget its wait. */
	placed(executionId: string, stepId: string): void {
		this.wait.clearRequirement(executionId, stepId);
	}

	/** A connected worker that meets the requirements, accepts the step and is allowed to take it (type, exclusivity). */
	private serves(placement: StepPlacement, worker: RegisteredWorker, inputs: ShortageInputs): boolean {
		return (
			this.mayServe(placement, worker.sourceId, inputs) &&
			this.router.missingRequirementsOf(placement, worker, inputs.guaranteesOf).length === 0 &&
			!this.router.refusesWorkspace(placement, worker) &&
			this.router.refusalOf(placement, worker) === undefined
		);
	}

	/**	 * Whether the workers of this source may take the step at all: for a bound run the type it is bound to. Otherwise any source:	 * asking for guarantees is an explicit opt-in, so exclusivity (which keeps a source off steps that ask for nothing) is not applied.	 */ private mayServe(
		placement: StepPlacement,
		sourceId: string | undefined,
		inputs: ShortageInputs
	): boolean {
		return placement.boundWorkerType === undefined || inputs.typeOf(sourceId) === placement.boundWorkerType;
	}

	/** Whether a declared source accepts the workspace kind of the step's run (its manifest; a stub without that knowledge restricts nothing). */
	private acceptsWorkspace(placement: StepPlacement, sourceId: string): boolean {
		return this.declared.acceptsWorkspace?.(sourceId, placement.workspaceKind) ?? true;
	}

	private describeWorkspaceRefusal(head: string, kind: string | undefined, providers: string[]): string {
		const kindsOf = (sourceId: string): string[] => this.declared.workspacesOf?.(sourceId) ?? [];
		const sources = providers.map(sourceId => `${sourceId} (${kindsOf(sourceId).join(', ')})`).join(', ');
		const accepted = [...new Set(providers.flatMap(kindsOf))].sort();
		return (
			`${head} the only declared sources that can provide them accept other workspace kinds: ${sources}, ` +
			`but the workspace kind of this run is ${kind === undefined ? 'unknown' : `"${kind}"`}. ` +
			`Fix: change "workspace:" in the flow to one of ${accepted.join(', ')}, or remove the requirement.`
		);
	}

	private describeNoProvider(inputs: ShortageInputs, providers: string[]): string {
		const { placement } = inputs;
		const required = placement.requires ?? [];
		const head = `Step "${placement.stepId}" requires ${required.join(', ')}, but`;
		const known = this.declared.entries();

		if (providers.length > 0 && providers.every(sourceId => !this.acceptsWorkspace(placement, sourceId))) {
			return this.describeWorkspaceRefusal(head, placement.workspaceKind, providers);
		}
		if (providers.length > 0) {
			return `${head} the only declared sources that can provide them (${providers.join(', ')}) are not of the worker type this run is bound to ("${placement.boundWorkerType ?? 'none'}"). Fix the workerType of the flow, or declare a source of that type that provides them.`;
		}

		const unknown = required.filter(entry => !known.includes(entry));
		if (unknown.length === 0) {
			return (
				`${head} no single declared source provides all of them. ${this.closestSources(required).join(' ')} ` +
				`A step runs on one worker, so one source has to guarantee the whole set: split the requirements between steps, or declare a source that provides them all (flow worker source list).`
			);
		}
		const hints = unknown.map(entry => {
			const near = RequirementSyntax.closest(entry, known);
			return near.length === 0
				? `"${entry}"`
				: `"${entry}" (Did you mean ${near.map(candidate => `"${candidate}"`).join(' or ')}?)`;
		});
		const listed = known.slice(0, MAX_LISTED).join(', ');
		const more = known.length > MAX_LISTED ? `, and ${String(known.length - MAX_LISTED)} more` : '';
		return (
			`${head} no declared worker source provides ${hints.join(', ')}. ` +
			(known.length === 0
				? 'No declared source lists any guarantee. '
				: `Guarantees declared by the sources: ${listed}${more}. `) +
			`Declare a source whose plugin lists it under guarantees (flow worker source list), or fix the requirement.`
		);
	}

	private closestSentences(inputs: ShortageInputs): string[] {
		const { placement } = inputs;
		const workers = inputs.connected
			.map(worker => ({
				worker,
				missing: this.router.missingRequirementsOf(placement, worker, inputs.guaranteesOf),
			}))
			.filter(({ missing }) => missing.length > 0)
			.sort((a, b) => a.missing.length - b.missing.length)
			.slice(0, MAX_NAMED)
			.map(({ worker, missing }) => `${worker.workerId} lacks ${missing.join(', ')}`);
		const sources = this.closestSources(placement.requires ?? []);
		return [...(workers.length === 0 ? [] : [`Closest connected workers: ${workers.join('; ')}.`]), ...sources];
	}

	private closestSources(required: string[]): string[] {
		const sources = this.declared
			.shortfalls(required)
			.filter(({ missing }) => missing.length > 0)
			.slice(0, MAX_NAMED)
			.map(({ sourceId, missing }) => `${sourceId} lacks ${missing.join(', ')}`);
		return sources.length === 0 ? [] : [`Closest declared sources: ${sources.join('; ')}.`];
	}
}
