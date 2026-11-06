import type { RunMounts } from '../RunMounts';
import { SandboxError } from '../SandboxError';
import type { SandboxLog } from '../SandboxLog';
import { type JsonObject, type SandboxStepType, isJsonObject, isNonEmptyString } from './HarnessMessages';

export interface ParsedAssignment {
	assignmentId: string;
	stepId: string;
	stepConfig: JsonObject;
	executionContext: JsonObject;
}

/** What differs between the two variants in the texts of a refused `assign`. */
export interface AssignmentWording {
	/** Complete message when the input is not an `assign`. */
	notAssign: string;
	/** Ends the message about a missing `executionContext` field, after "has no <field>: ". */
	cannotPlace: string;
}

/**
 * The parts of reading a daemon `assign` that the relay variant (AssignmentRewriter, which translates paths for the inner
 * worker) and the exec variant (ExecAssignment, which keeps host paths for the engine) share: the same checks, the same
 * merge of the wrapper's environment, the same warnings.
 */
export class AssignmentFields {
	/** The fields both variants need, or a SandboxError('invalid-argument') saying which one is missing. */
	static parse(raw: unknown, wording: AssignmentWording): ParsedAssignment {
		if (!isJsonObject(raw) || raw['type'] !== 'assign') {
			throw new SandboxError('invalid-argument', wording.notAssign);
		}
		const { assignmentId, stepId, stepConfig, executionContext } = raw;
		if (!isNonEmptyString(assignmentId) || !isNonEmptyString(stepId)) {
			throw new SandboxError('invalid-argument', 'The "assign" message has no assignmentId or stepId.');
		}
		if (!isJsonObject(stepConfig) || !isJsonObject(executionContext)) {
			throw new SandboxError(
				'invalid-argument',
				`The "assign" message of step "${stepId}" has no stepConfig or executionContext.`
			);
		}
		for (const field of ['executionId', 'workspaceDir', 'outputsDir']) {
			if (!isNonEmptyString(executionContext[field])) {
				throw new SandboxError(
					'invalid-argument',
					`The executionContext of step "${stepId}" has no ${field}: ${wording.cannotPlace}`
				);
			}
		}
		return { assignmentId, stepId, stepConfig, executionContext };
	}

	static requireStepType(stepConfig: JsonObject, stepId: string): SandboxStepType {
		const type = stepConfig['type'];
		if (type === 'model' || type === 'script') return type;
		throw new SandboxError(
			'invalid-argument',
			`Step "${stepId}" has type ${JSON.stringify(type)}, which a sandbox worker cannot run: only "model" and "script" steps are supported (a user_intervention step needs a person; route it to a worker without the "sandbox" label).`
		);
	}

	static isInsideMounts(mounts: RunMounts, hostPath: string): boolean {
		try {
			mounts.translator.toSandbox(hostPath, 'cwd');
			return true;
		} catch (error) {
			if (error instanceof SandboxError && error.kind === 'path-outside-mounts') return false;
			throw error;
		}
	}

	/** The step's own `env` (strings only) with the wrapper's values on top; a differing flow value is reported. */
	static mergeEnv(
		stepConfig: JsonObject,
		injected: Readonly<Record<string, string>>,
		log: SandboxLog
	): Record<string, string> {
		const own = isJsonObject(stepConfig['env']) ? stepConfig['env'] : {};
		for (const [name, value] of Object.entries(injected)) {
			if (own[name] !== undefined && own[name] !== value) {
				log.warn(`step env ${name} is set by the sandbox wrapper; the value from the flow is ignored.`);
			}
		}
		const merged: Record<string, string> = {};
		for (const [name, value] of Object.entries(own)) {
			if (typeof value === 'string') merged[name] = value;
		}
		return { ...merged, ...injected };
	}

	/** Windows-looking paths in `env` values and script text are reported, never rewritten. */
	static warnAboutWindowsPaths(mounts: RunMounts, stepConfig: JsonObject, stepId: string, log: SandboxLog): void {
		const { translator } = mounts;
		const env = isJsonObject(stepConfig['env'])
			? (Object.fromEntries(
					Object.entries(stepConfig['env']).filter(([, value]) => typeof value === 'string')
				) as Record<string, string>)
			: {};
		const warnings = [
			...translator.findWindowsPathsInEnv(env),
			...(typeof stepConfig['script'] === 'string'
				? translator.findWindowsPathsInScript(stepConfig['script'])
				: []),
		];
		for (const warning of warnings) log.warn(`step "${stepId}": ${warning.message}`);
	}
}
