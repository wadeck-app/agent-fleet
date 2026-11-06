import type { RunMounts } from '../RunMounts';
import { SandboxError } from '../SandboxError';
import type { SandboxLog } from '../SandboxLog';
import { type JsonObject, isJsonObject, isNonEmptyString } from '../harness/HarnessMessages';
import type { ExecStepType } from './ExecSandboxPreparer';

export interface PreparedAssignment {
	assignmentId: string;
	stepId: string;
	executionId: string;
	stepType: ExecStepType;
	/** The step as the engine will run it, with the wrapper's environment merged in. Paths stay HOST paths. */
	stepConfig: JsonObject;
	executionContext: JsonObject;
	/** Environment variable names the step declares: its `env` (wrapper values merged in) and its `secrets`. */
	declaredEnvironmentNames: ReadonlySet<string>;
}

const WINDOWS_ABSOLUTE = /^[A-Za-z]:[\\/]/;

/**
 * Daemon to engine, in the exec variant. Unlike the relay variant nothing is translated here: the engine runs on the
 * HOST, so it keeps host paths and writes outputs and `.meta` files itself; only the processes it spawns move into the
 * VM, and the launcher translates their paths. What this does:
 * - requires the fields the engine needs and refuses a step type a sandbox cannot run (`user_intervention` needs a
 *   person, `subflow` is not supported);
 * - requires `workspaceDir` and `outputsDir` to lie inside the run's two mounts (links rejected): a path the VM cannot
 *   see would make every process of the step fail later with a less clear message;
 * - replaces `cwd` by the workspace when it is outside the mounts (it is normally the user's project directory, which is
 *   not mounted) and logs it; a Windows absolute `workingDir` / `flowWorkingDir` must be inside the mounts;
 * - merges the wrapper's environment into the step `env` (it wins; a differing flow value is reported);
 * - reports Windows-looking paths in `env` values and script text as warnings (never rewritten).
 */
export class ExecAssignment {
	constructor(
		private readonly options: {
			mounts: RunMounts;
			injectedEnv: (stepType: ExecStepType) => Readonly<Record<string, string>>;
			log: SandboxLog;
		}
	) {}

	prepare(raw: JsonObject): PreparedAssignment {
		const { assignmentId, stepId, stepConfig, executionContext } = this.parse(raw);
		const stepType = this.requireStepType(stepConfig, stepId);
		const { mounts, log } = this.options;
		mounts.toSandboxPath(String(executionContext['workspaceDir']), 'workspaceDir');
		mounts.toSandboxPath(String(executionContext['outputsDir']), 'outputsDir');

		const context: JsonObject = { ...executionContext };
		const cwd = executionContext['cwd'];
		if (typeof cwd === 'string' && !this.isInsideMounts(cwd)) {
			context['cwd'] = executionContext['workspaceDir'];
			log.info(
				`context.cwd "${cwd}" is outside the sandbox mounts; the step sees the workspace "${String(executionContext['workspaceDir'])}" instead (the project directory is not mounted).`
			);
		}
		if (typeof executionContext['flowWorkingDir'] === 'string') {
			this.requireMounted(executionContext['flowWorkingDir'], 'flowWorkingDir');
		}
		const step: JsonObject = { ...stepConfig, env: this.mergeEnv(stepConfig, stepType) };
		if (typeof stepConfig['workingDir'] === 'string') this.requireMounted(stepConfig['workingDir'], 'workingDir');
		this.warnAboutWindowsPaths(stepConfig, stepId);
		return {
			assignmentId,
			stepId,
			executionId: String(executionContext['executionId']),
			stepType,
			stepConfig: step,
			executionContext: context,
			declaredEnvironmentNames: this.declaredNames(step),
		};
	}

	private declaredNames(step: JsonObject): ReadonlySet<string> {
		const names = new Set(isJsonObject(step['env']) ? Object.keys(step['env']) : []);
		if (Array.isArray(step['secrets'])) {
			for (const secret of step['secrets']) if (typeof secret === 'string') names.add(secret);
		}
		return names;
	}

	private parse(raw: JsonObject): {
		assignmentId: string;
		stepId: string;
		stepConfig: JsonObject;
		executionContext: JsonObject;
	} {
		if (raw['type'] !== 'assign') {
			throw new SandboxError('invalid-argument', 'ExecAssignment can only prepare an "assign" message.');
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
					`The executionContext of step "${stepId}" has no ${field}: the step cannot be placed in the sandbox.`
				);
			}
		}
		return { assignmentId, stepId, stepConfig, executionContext };
	}

	private requireStepType(stepConfig: JsonObject, stepId: string): ExecStepType {
		const type = stepConfig['type'];
		if (type === 'model' || type === 'script') return type;
		throw new SandboxError(
			'invalid-argument',
			`Step "${stepId}" has type ${JSON.stringify(type)}, which a sandbox worker cannot run: only "model" and "script" steps are supported (a user_intervention step needs a person; route it to a worker without the "sandbox" label).`
		);
	}

	private isInsideMounts(hostPath: string): boolean {
		try {
			this.options.mounts.translator.toSandbox(hostPath, 'cwd');
			return true;
		} catch (error) {
			if (error instanceof SandboxError && error.kind === 'path-outside-mounts') return false;
			throw error;
		}
	}

	private requireMounted(value: string, label: string): void {
		if (WINDOWS_ABSOLUTE.test(value)) this.options.mounts.toSandboxPath(value, label);
	}

	private mergeEnv(stepConfig: JsonObject, stepType: ExecStepType): Record<string, string> {
		const own = isJsonObject(stepConfig['env']) ? stepConfig['env'] : {};
		const injected = this.options.injectedEnv(stepType);
		for (const [name, value] of Object.entries(injected)) {
			if (own[name] !== undefined && own[name] !== value) {
				this.options.log.warn(
					`step env ${name} is set by the sandbox wrapper; the value from the flow is ignored.`
				);
			}
		}
		const merged: Record<string, string> = {};
		for (const [name, value] of Object.entries(own)) {
			if (typeof value === 'string') merged[name] = value;
		}
		return { ...merged, ...injected };
	}

	private warnAboutWindowsPaths(stepConfig: JsonObject, stepId: string): void {
		const { translator } = this.options.mounts;
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
		for (const warning of warnings) this.options.log.warn(`step "${stepId}": ${warning.message}`);
	}
}
