import type { FlowDefinition, FlowStep } from 'flow-engine/types';

import { ExecutionMasks } from '../secrets/ExecutionMasks';
import { ExecutionSecrets } from '../secrets/ExecutionSecrets';
import { SecretProvider } from '../secrets/SecretProvider';

/**
 * The daemon's side of declared secrets: resolves them before a run starts, remembers them per
 * execution, hands each step only what it uses, and registers the execution's masker.
 *
 * Values live in memory only, for the daemon's lifetime (see {@link ExecutionMasks}).
 */
export class DaemonSecrets {
	private readonly executions = new Map<string, { flow: FlowDefinition; cwd: string; secrets: ExecutionSecrets }>();

	constructor(
		readonly masks: ExecutionMasks = new ExecutionMasks(),
		// The DAEMON's environment: `env://` references are read from it.
		private readonly env: Readonly<Record<string, string | undefined>> = process.env
	) {}

	/**
	 * Resolves every secret the flow uses. Called before an execution id, a workspace or a
	 * record exists, so a refusal leaves nothing behind.
	 *
	 * @throws SecretsResolutionFailedError listing every secret that could not be resolved
	 */
	prepare(flow: FlowDefinition, inputs: Readonly<Record<string, string>>, cwd: string): ExecutionSecrets {
		return ExecutionSecrets.resolve(flow, inputs, new SecretProvider(cwd, this.env));
	}

	/** Starts masking the execution and remembers what each step may receive. */
	activate(executionId: string, flow: FlowDefinition, secrets: ExecutionSecrets, cwd: string = process.cwd()): void {
		if (!secrets.declaresSecrets) {
			return;
		}
		this.executions.set(executionId, { flow, cwd, secrets });
		if (!secrets.isEmpty) {
			this.masks.register(executionId, secrets.masker);
		}
	}

	/** Secret values for one step's assignment, or undefined when it uses none. */
	valuesForStep(executionId: string, stepId: string): Record<string, string> | undefined {
		const values = this.executions.get(executionId)?.secrets.valuesForStep(stepId);
		return values !== undefined && Object.keys(values).length > 0 ? values : undefined;
	}

	/**
	 * Resolves the same references again for a resumed execution, so a rotated value is used and
	 * masked. Nothing was persisted: the references are the only thing kept.
	 *
	 * @throws SecretsResolutionFailedError when a reference no longer resolves; the execution stays resumable
	 */
	resume(executionId: string): void {
		const entry = this.executions.get(executionId);
		if (entry === undefined) {
			return;
		}
		const secrets = entry.secrets.reResolve(entry.flow, new SecretProvider(entry.cwd, this.env));
		this.activate(executionId, entry.flow, secrets, entry.cwd);
	}

	/** @throws Error when an injected step uses a declared secret */
	assertInjectable(executionId: string, step: FlowStep): void {
		this.executions.get(executionId)?.secrets.assertInjectable(step);
	}
}
