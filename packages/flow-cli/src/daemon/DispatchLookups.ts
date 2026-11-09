import { normalizeError } from 'shared-common/utils/getErrorMessage';

import type { LogWriter } from '../storage/LogWriter';
import type { BoundStepRouting } from './BoundStepWait.js';
import type { GuaranteeLookup, RequirementOnlyLookup } from './WorkerTypeCatalog.js';

/** Every worker that names a source may come from a requirement-only source: what is assumed when the sources cannot be read. */
const ANY_SOURCE_REQUIREMENT_ONLY: RequirementOnlyLookup = sourceId => sourceId !== undefined;

/** No source guarantees anything: what is assumed when the guarantees cannot be read (fail-closed). */
const NO_GUARANTEES: GuaranteeLookup = () => [];

/**
 * What the dispatcher reads from the declared worker sources (requirement-only sources, guarantees), each answering the
 * safe way when the sources cannot be read, and saying so ONCE per execution in its log: the same unreadable file would
 * otherwise be reported on every dispatch pass.
 */
export class DispatchLookups {
	private readonly requirementOnlyReported = new Set<string>();
	private readonly guaranteesReported = new Set<string>();

	constructor(
		private readonly workerTypes: BoundStepRouting['workerTypes'],
		private readonly logWriter: Pick<LogWriter, 'writeExecution'>
	) {}

	/** Forgets what was reported for an execution that is over. */
	forgetExecution(executionId: string): void {
		this.requirementOnlyReported.delete(executionId);
		this.guaranteesReported.delete(executionId);
	}

	/**
	 * Which workers come from a requirement-only source. When that cannot be read, every worker that names a source counts
	 * as one (fail-closed).
	 */
	requirementOnlyLookup(executionId: string): RequirementOnlyLookup {
		try {
			return this.workerTypes.requirementOnlyLookup();
		} catch (err) {
			if (!this.requirementOnlyReported.has(executionId)) {
				this.requirementOnlyReported.add(executionId);
				this.logWriter.writeExecution(
					executionId,
					`Cannot read the declared worker sources, so workers that come from a source are not offered steps that require nothing (they may come from a requirement-only source): ${normalizeError(err).message}. Fix or remove the worker sources file (see: flow worker source list).`,
					'warning'
				);
			}
			return ANY_SOURCE_REQUIREMENT_ONLY;
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
}
