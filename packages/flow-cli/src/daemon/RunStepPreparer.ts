import { logsDirOf } from 'flow-core';
import { TemplateRenderer } from 'flow-engine';
import type { FlowDefinition, FlowStep } from 'flow-engine';

import type { AssignableStep, ClientCommand, DaemonResponse, ExecutionContext } from '../ipc/Protocol';
import type { LogWriter } from '../storage/LogWriter';
import { writeDaemonLog } from './DaemonLog.js';

type RunCommandMessage = Extract<ClientCommand, { type: 'run' }>;

/**
 * Confirms a step is one the daemon can hand to a worker.
 *
 * This used to be a `.filter()` keeping `model` and `script`, which meant a
 * `user_intervention` step was **dropped**: the execution ran, reported success, and simply
 * never asked the question. That was survivable only while such a flow was refused outright
 * (D#37 has since lifted that), and it is the kind of silence a filter invites -- so an
 * unexpected type now throws, and `handleRun` turns it into a refused run.
 */
function assertAssignable(step: FlowStep): AssignableStep {
	if (step.type === 'model' || step.type === 'script' || step.type === 'user_intervention') {
		return step as AssignableStep;
	}
	throw new Error(
		`Step "${step.id}" is of type "${step.type}", which the daemon cannot dispatch. Supported types: model, script, user_intervention.`
	);
}

/** Turns the steps of an accepted flow into the steps handed to workers: flow-wide env and labels, then the mock overlay. */
export class RunStepPreparer {
	constructor(
		private readonly daemonDir: string,
		private readonly logWriter: LogWriter
	) {}

	/**
	 * --mock-config step ids are already validated against the flow at CLI time
	 * (RunCommand.loadMockConfig), but only an id, not a type: a step id that names a
	 * `user_intervention` step has no `env` to overlay. Checked before any workspace
	 * or execution-store allocation, so this is a refused run rather than a leak.
	 *
	 * @returns the refusal, or undefined when every mocked step can take an overlay.
	 */
	refuseUnmockableTargets(flow: FlowDefinition, mockEnv: RunCommandMessage['mockEnv']): DaemonResponse | undefined {
		if (!mockEnv) {
			return undefined;
		}
		for (const stepId of Object.keys(mockEnv)) {
			const step = flow.steps.find((s: FlowStep) => s.id === stepId);
			if (step && step.type !== 'model' && step.type !== 'script') {
				return {
					type: 'error',
					code: 'VALIDATION_FAILED',
					message: `--mock-config references step '${stepId}', which is of type '${step.type}' and has no env to overlay (only 'model' and 'script' steps can be mocked).`,
				};
			}
		}
		return undefined;
	}

	/** Each step's dependencies; a sub-step implicitly depends on its parent step. */
	dependencies(flow: FlowDefinition): Map<string, string[]> {
		return new Map<string, string[]>(
			flow.steps.map((s: FlowStep) => {
				const explicit = s.depends ?? [];
				return [s.id, s.parent && !explicit.includes(s.parent) ? [...explicit, s.parent] : explicit];
			})
		);
	}

	/** The steps to schedule, with the flow's `env:` and `labels:` merged in and the mock overlay applied. */
	prepareSteps(
		flow: FlowDefinition,
		cmd: RunCommandMessage,
		executionId: string,
		context: ExecutionContext
	): AssignableStep[] {
		const resolvedGlobalEnv = this.resolveGlobalEnv(flow, cmd.cwd, context);

		// Flow-level `labels:` (Proposal 4) are unioned into every step's own `labels:`, never
		// overriding them -- a step with unrelated labels (e.g. `gpu`) must keep the flow-wide
		// pin, or a forgotten per-step `labels:` would silently fall back to "any worker".
		const flowLabels = flow.labels ?? [];
		const assignable = (
			resolvedGlobalEnv || flowLabels.length > 0
				? flow.steps.map((s: FlowStep) => {
						const withEnv =
							resolvedGlobalEnv && (s.type === 'script' || s.type === 'model')
								? {
										...s,
										env: {
											...resolvedGlobalEnv,
											...((s as { env?: Record<string, string> }).env ?? {}),
										},
									}
								: s;
						if (flowLabels.length === 0) {
							return withEnv;
						}
						const stepLabels = (withEnv as { labels?: string[] }).labels ?? [];
						return { ...withEnv, labels: [...new Set([...flowLabels, ...stepLabels])] };
					})
				: flow.steps
		).map((s: FlowStep) => assertAssignable(s));

		this.overlayMockEnv(assignable, cmd, executionId);
		return assignable;
	}

	/** Resolves global flow env templates (context.* available: cwd, projectDir, workspaceDir). */
	private resolveGlobalEnv(
		flow: FlowDefinition,
		cwd: string,
		context: ExecutionContext
	): Record<string, string> | undefined {
		if (!flow.env) {
			return undefined;
		}
		const templateRenderer = new TemplateRenderer();
		const templateCtx = {
			inputs: context.inputs,
			stepOutputs: new Map<string, Record<string, unknown>>(),
			taskMetadata: {},
			context: { cwd, projectDir: cwd, workspaceDir: context.workspaceDir },
		};
		return Object.fromEntries(
			Object.entries(flow.env as Record<string, string>).map(([k, v]) => [
				k,
				templateRenderer.render(v, templateCtx, false),
			])
		);
	}

	/**
	 * --mock-config overlay: merged last, so it outranks both the flow's global `env:` and
	 * the step's own declared `env:`. Always loud (D#55-equivalent): a mocked run must never
	 * be mistaken for a real one later, so every overridden step gets a visible banner in
	 * both the daemon log and the execution log.
	 */
	private overlayMockEnv(assignable: AssignableStep[], cmd: RunCommandMessage, executionId: string): void {
		if (!cmd.mockEnv) {
			return;
		}
		for (const step of assignable) {
			const overlay = cmd.mockEnv[step.id];
			if (!overlay) {
				continue;
			}
			// Step type (model/script) was already confirmed by refuseUnmockableTargets, before any allocation.
			if (step.type !== 'model' && step.type !== 'script') {
				continue;
			}
			step.env = { ...(step.env ?? {}), ...overlay };
			const banner = `MOCK: step '${step.id}' output replaced by ${cmd.mockConfigPath ?? '--mock-config'}`;
			writeDaemonLog(logsDirOf(this.daemonDir), 'info', `[warn] ${banner}`);
			this.logWriter.writeExecution(executionId, `[warn] ${banner}`, 'info');
		}
	}
}
