import type { RunMounts } from '../RunMounts';
import type { SandboxLog } from '../SandboxLog';
import { AssignmentFields } from '../harness/AssignmentFields';
import { type JsonObject, isJsonObject } from '../harness/HarnessMessages';
import type { ExecStepType } from './ExecSandboxPreparer';
import { UNC, WINDOWS_ABSOLUTE, flavorOf } from './HostPaths';

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
			/** The host's platform (default: this one): which paths count as absolute. Tests pass `win32` and `linux` on any host. */
			platform?: NodeJS.Platform;
		}
	) {}

	prepare(raw: JsonObject): PreparedAssignment {
		const { assignmentId, stepId, stepConfig, executionContext } = AssignmentFields.parse(raw, {
			notAssign: 'ExecAssignment can only prepare an "assign" message.',
			cannotPlace: 'the step cannot be placed in the sandbox.',
		});
		const stepType = AssignmentFields.requireStepType(stepConfig, stepId);
		const { mounts, log } = this.options;
		mounts.toSandboxPath(String(executionContext['workspaceDir']), 'workspaceDir');
		mounts.toSandboxPath(String(executionContext['outputsDir']), 'outputsDir');

		const context: JsonObject = { ...executionContext };
		const cwd = executionContext['cwd'];
		if (typeof cwd === 'string' && !AssignmentFields.isInsideMounts(mounts, cwd)) {
			context['cwd'] = executionContext['workspaceDir'];
			log.info(
				`context.cwd "${cwd}" is outside the sandbox mounts; the step sees the workspace "${String(executionContext['workspaceDir'])}" instead (the project directory is not mounted).`
			);
		}
		if (typeof executionContext['flowWorkingDir'] === 'string') {
			this.requireMounted(executionContext['flowWorkingDir'], 'flowWorkingDir');
		}
		const step: JsonObject = {
			...stepConfig,
			env: AssignmentFields.mergeEnv(stepConfig, this.options.injectedEnv(stepType), log),
		};
		if (typeof stepConfig['workingDir'] === 'string') this.requireMounted(stepConfig['workingDir'], 'workingDir');
		AssignmentFields.warnAboutWindowsPaths(mounts, stepConfig, stepId, log);
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

	/** An absolute path (in the syntax of the host, or Windows-looking on any host) must lie inside the mounts; a relative one is resolved against the workspace by the engine. */
	private requireMounted(value: string, label: string): void {
		const posixAbsolute = flavorOf(this.options.platform ?? process.platform) === 'posix' && value.startsWith('/');
		if (posixAbsolute || WINDOWS_ABSOLUTE.test(value) || UNC.test(value)) {
			this.options.mounts.toSandboxPath(value, label);
		}
	}
}
