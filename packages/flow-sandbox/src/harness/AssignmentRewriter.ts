import type { RunMounts } from '../RunMounts';
import { SandboxError } from '../SandboxError';
import type { SandboxLog } from '../SandboxLog';
import { AssignmentFields } from './AssignmentFields';
import { type ActiveAssignment, type JsonObject, type SandboxStepType } from './HarnessMessages';

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
		const { assignmentId, stepId, stepConfig, executionContext } = AssignmentFields.parse(raw, {
			notAssign: 'The bridge can only rewrite an "assign" message.',
			cannotPlace: 'the bridge cannot place the step in the sandbox.',
		});
		const stepType = AssignmentFields.requireStepType(stepConfig, stepId);
		this.refuseHostMarker(raw, stepConfig, stepId);
		const requires = this.requiresOf(raw);
		const paths = this.translateContext(executionContext);
		const context: JsonObject = { ...executionContext, ...paths };
		if (typeof executionContext['flowWorkingDir'] === 'string') {
			context['flowWorkingDir'] = this.translateWorkingDirectory(
				executionContext['flowWorkingDir'],
				'flowWorkingDir'
			);
		}
		const step: JsonObject = {
			...stepConfig,
			env: AssignmentFields.mergeEnv(stepConfig, this.options.injectedEnv(stepType), this.options.log),
		};
		if (typeof stepConfig['workingDir'] === 'string') {
			step['workingDir'] = this.translateWorkingDirectory(stepConfig['workingDir'], 'workingDir');
		}
		AssignmentFields.warnAboutWindowsPaths(this.options.mounts, stepConfig, stepId, this.options.log);
		return {
			message: {
				type: 'assign',
				assignmentId,
				stepId,
				stepConfig: step,
				executionContext: context,
				...(requires === undefined ? {} : { requires }),
			},
			active: {
				assignmentId,
				executionId: String(executionContext['executionId']),
				stepId,
				stepType,
			},
		};
	}

	/** The additive `requires` of the daemon message, forwarded as a copy; anything but a list of strings is refused, never dropped. */
	private requiresOf(raw: unknown): string[] | undefined {
		const requires = (raw as JsonObject)['requires'];
		if (requires === undefined) return undefined;
		if (!Array.isArray(requires) || !requires.every(item => typeof item === 'string')) {
			throw new SandboxError(
				'invalid-argument',
				'The "requires" of the assign message must be a list of strings; the step is not run.'
			);
		}
		return [...(requires as string[])];
	}

	/** This variant runs every step in the VM through an inner worker; it cannot serve `host: true`, so it says so instead of running the step in the VM. */
	private refuseHostMarker(raw: unknown, stepConfig: JsonObject, stepId: string): void {
		if ((raw as JsonObject)['host'] === undefined && stepConfig['host'] !== true) return;
		throw new SandboxError(
			'invalid-argument',
			`Step "${stepId}" is marked host: true, which runs a script on the wrapper's machine. The relay harness cannot do that; use the exec wrapper (the sandbox.exec worker type), or remove host: true.`
		);
	}

	private translateContext(context: JsonObject): JsonObject {
		const { mounts } = this.options;
		const [workspace, meta] = mounts.sandboxMounts();
		if (workspace === undefined || meta === undefined) throw new Error('RunMounts must have two mounts');
		const workspaceDir = String(context['workspaceDir']);
		const outputsDir = String(context['outputsDir']);
		const cwd = context['cwd'];
		const cwdInside = typeof cwd === 'string' && AssignmentFields.isInsideMounts(mounts, cwd);
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

	private translateWorkingDirectory(value: string, label: string): string {
		if (!WINDOWS_ABSOLUTE.test(value)) return value;
		return this.options.mounts.toSandboxPath(value, label);
	}
}
