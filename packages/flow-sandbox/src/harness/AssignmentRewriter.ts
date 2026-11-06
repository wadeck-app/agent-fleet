import type { RunMounts } from '../RunMounts';
import { SandboxError } from '../SandboxError';
import type { SandboxLog } from '../SandboxLog';
import {
	type ActiveAssignment,
	type JsonObject,
	type SandboxStepType,
	isJsonObject,
	isNonEmptyString,
} from './HarnessMessages';

export interface AssignmentRewriterOptions {
	mounts: RunMounts;
	/** Environment the wrapper owns for a step type (credentials, tool stores). It overrides the step's own values. */
	injectedEnv: (stepType: SandboxStepType) => Readonly<Record<string, string>>;
	log: SandboxLog;
}

export interface RewrittenAssignment {
	/** The `assign` to send to the inner worker. */
	message: JsonObject;
	active: ActiveAssignment;
}

const WINDOWS_ABSOLUTE = /^[A-Za-z]:[\\/]/;

/**
 * Daemon to inside: the `assign` message is the only one that is forwarded, rebuilt from its known fields, with
 * - `workspaceDir`, `outputsDir` and `cwd` translated to the paths the sandbox sees (outside the mounts = refused,
 *   except `cwd`, see below), and a Windows absolute `workingDir` / `flowWorkingDir` translated the same way;
 * - the wrapper's environment merged into the step `env` (it wins over the step's own value of the same name);
 * - Windows-looking paths in `env` values and in script text reported as warnings, never rewritten.
 *
 * `cwd` is the directory `flow run` was started from, normally the user's project, which is NOT mounted: it is
 * replaced by the sandbox workspace and the replacement is logged, so `${{ context.cwd }}` never names a host path
 * the sandbox cannot open.
 */
export class AssignmentRewriter {
	constructor(private readonly options: AssignmentRewriterOptions) {}

	rewrite(raw: unknown): RewrittenAssignment {
		const { assignmentId, stepId, stepConfig, executionContext } = this.parse(raw);
		const stepType = this.requireStepType(stepConfig, stepId);
		const paths = this.translateContext(executionContext);
		const context: JsonObject = { ...executionContext, ...paths };
		if (typeof executionContext['flowWorkingDir'] === 'string') {
			context['flowWorkingDir'] = this.translateWorkingDirectory(
				executionContext['flowWorkingDir'],
				'flowWorkingDir'
			);
		}
		const step: JsonObject = { ...stepConfig, env: this.mergeEnv(stepConfig, stepType) };
		if (typeof stepConfig['workingDir'] === 'string') {
			step['workingDir'] = this.translateWorkingDirectory(stepConfig['workingDir'], 'workingDir');
		}
		this.warnAboutWindowsPaths(stepConfig, stepId);
		return {
			message: { type: 'assign', assignmentId, stepId, stepConfig: step, executionContext: context },
			active: {
				assignmentId,
				executionId: String(executionContext['executionId']),
				stepId,
				stepType,
			},
		};
	}

	private parse(raw: unknown): {
		assignmentId: string;
		stepId: string;
		stepConfig: JsonObject;
		executionContext: JsonObject;
	} {
		if (!isJsonObject(raw) || raw['type'] !== 'assign') {
			throw new SandboxError('invalid-argument', 'The bridge can only rewrite an "assign" message.');
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
					`The executionContext of step "${stepId}" has no ${field}: the bridge cannot place the step in the sandbox.`
				);
			}
		}
		return { assignmentId, stepId, stepConfig, executionContext };
	}

	private requireStepType(stepConfig: JsonObject, stepId: string): SandboxStepType {
		const type = stepConfig['type'];
		if (type === 'model' || type === 'script') return type;
		throw new SandboxError(
			'invalid-argument',
			`Step "${stepId}" has type ${JSON.stringify(type)}, which a sandbox worker cannot run: only "model" and "script" steps are supported (a user_intervention step needs a person; route it to a worker without the "sandbox" label).`
		);
	}

	private translateContext(context: JsonObject): JsonObject {
		const { mounts } = this.options;
		const [workspace, meta] = mounts.sandboxMounts();
		if (workspace === undefined || meta === undefined) throw new Error('RunMounts must have two mounts');
		const workspaceDir = String(context['workspaceDir']);
		const outputsDir = String(context['outputsDir']);
		const cwd = context['cwd'];
		const cwdInside = typeof cwd === 'string' && this.isInsideMounts(cwd);
		const translated = mounts.translator.translateExecutionContext({
			workspaceDir,
			outputsDir,
			workspaceMetaDir: meta.hostPath,
			...(cwdInside ? { cwd } : {}),
		});
		if (typeof cwd === 'string' && !cwdInside) {
			this.options.log.info(
				`context.cwd "${cwd}" is outside the sandbox mounts; the sandbox sees the workspace "${translated.workspaceDir}" instead (the project directory is not mounted).`
			);
		}
		// Link check on the paths the step will really use.
		mounts.toSandboxPath(workspaceDir, 'workspaceDir');
		mounts.toSandboxPath(outputsDir, 'outputsDir');
		return {
			workspaceDir: translated.workspaceDir,
			outputsDir: translated.outputsDir,
			cwd: translated.cwd ?? translated.workspaceDir,
		};
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

	private translateWorkingDirectory(value: string, label: string): string {
		if (!WINDOWS_ABSOLUTE.test(value)) return value;
		return this.options.mounts.toSandboxPath(value, label);
	}

	private mergeEnv(stepConfig: JsonObject, stepType: SandboxStepType): Record<string, string> {
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
