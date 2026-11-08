import { normalizeError } from 'shared-common/utils/getErrorMessage';

import type { LogWriter } from '../storage/LogWriter';
import type { BoundStepRouting } from './BoundStepWait.js';
import type { ExclusiveLookup, GuaranteeLookup, WorkerTypeLookup } from './WorkerTypeCatalog.js';

/** Every worker is of no type. */
export const NO_TYPE: WorkerTypeLookup = () => undefined;

/** Every worker that names a source may be of an exclusive type: what is assumed when the sources cannot be read. */
const ANY_SOURCE_EXCLUSIVE: ExclusiveLookup = sourceId => sourceId !== undefined;

/** No source guarantees anything: what is assumed when the guarantees cannot be read (fail-closed). */
const NO_GUARANTEES: GuaranteeLookup = () => [];

/**
 * What the dispatcher reads from the declared worker sources (types, exclusivity, guarantees), each answering the safe way
 * when the sources cannot be read, and saying so ONCE per execution in its log: the same unreadable file would otherwise
 * be reported on every dispatch pass.
 */
export class DispatchLookups {
	private readonly typesReported = new Set<string>();
	private readonly exclusivityReported = new Set<string>();
	private readonly guaranteesReported = new Set<string>();

	constructor(
		private readonly workerTypes: BoundStepRouting['workerTypes'],
		private readonly logWriter: Pick<LogWriter, 'writeExecution'>
	) {}

	/** Forgets what was reported for an execution that is over. */
	forgetExecution(executionId: string): void {
		this.typesReported.delete(executionId);
		this.exclusivityReported.delete(executionId);
		this.guaranteesReported.delete(executionId);
	}

	/**
	 * Which type each worker is of. When the sources cannot be read no worker has a type: the step stays unplaced and
	 * fails after the bound.
	 */
	typeLookup(executionId: string): WorkerTypeLookup {
		try {
			return this.workerTypes.typeLookup();
		} catch (err) {
			this.reportSources(executionId, err);
			return NO_TYPE;
		}
	}

	/** The types some declared source stands for; none when the sources cannot be read. */
	knownTypes(executionId: string): string[] {
		try {
			return this.workerTypes.knownTypes();
		} catch (err) {
			this.reportSources(executionId, err);
			return [];
		}
	}

	/**
	 * Which workers are of an exclusive type. When that cannot be read, every worker that names a source counts as
	 * exclusive (fail-closed).
	 */
	exclusiveLookup(executionId: string): ExclusiveLookup {
		try {
			return this.workerTypes.exclusiveLookup();
		} catch (err) {
			if (!this.exclusivityReported.has(executionId)) {
				this.exclusivityReported.add(executionId);
				this.logWriter.writeExecution(
					executionId,
					`Cannot read the declared worker sources, so workers that come from a source are not offered steps of a run that is not bound to a worker type (they may be of an exclusive type): ${normalizeError(err).message}. Fix or remove the worker sources file (see: flow worker source list).`,
					'warning'
				);
			}
			return ANY_SOURCE_EXCLUSIVE;
		}
	}

	/**
	 * What the workers' sources guarantee. When it cannot be read no source guarantees anything (fail-closed): the step
	 * stays unplaced and fails after the bound.
	 */
	guaranteeLookup(executionId: string): GuaranteeLookup {
		const lookup = this.workerTypes.guaranteeLookup;
		if (lookup === undefined) {
			this.reportGuarantees(
				executionId,
				'this daemon has no guarantee source (a wiring mistake, please report it)'
			);
			return NO_GUARANTEES;
		}
		try {
			return lookup.call(this.workerTypes);
		} catch (err) {
			this.reportGuarantees(executionId, normalizeError(err).message);
			return NO_GUARANTEES;
		}
	}

	private reportGuarantees(executionId: string, cause: string): void {
		if (this.guaranteesReported.has(executionId)) {
			return;
		}
		this.guaranteesReported.add(executionId);
		this.logWriter.writeExecution(
			executionId,
			`Cannot tell what the declared worker sources guarantee, so no worker counts as meeting the requirements of a step and those steps cannot be placed: ${cause}. Fix or remove the worker sources file (see: flow worker source list).`,
			'warning'
		);
	}

	private reportSources(executionId: string, err: unknown): void {
		if (this.typesReported.has(executionId)) {
			return;
		}
		this.typesReported.add(executionId);
		this.logWriter.writeExecution(
			executionId,
			`Cannot read the declared worker sources, so no connected worker counts as being of the bound worker type and its steps cannot be placed: ${normalizeError(err).message}. Fix or remove the worker sources file (see: flow worker source list).`,
			'warning'
		);
	}
}
