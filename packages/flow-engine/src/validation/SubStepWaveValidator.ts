/**
 * Sub-Step Wave Validator
 *
 * Static rules for `subStepStrategy` and `wave`:
 * - `subStepStrategy` must be a known value (otherwise the scheduler throws mid-run);
 * - every direct sub-step of a `waves` parent declares a `wave` (non-negative integer, gaps allowed);
 * - `wave` is only valid on a direct sub-step of a `waves` parent (nested sub-steps inherit it);
 * - `depends` between sub-steps of different waves is redundant (earlier wave) or impossible (later wave).
 */
import { SUB_STEP_STRATEGY_NAMES, WAVES_SUB_STEP_STRATEGY } from '../orchestration/SubStepStrategyNames';
import type { FlowDefinition, FlowStep } from '../types';
import type { IssueCollector } from './ValidationTypes';
import { ValidationCode } from './ValidationTypes';

const DEFAULT_STRATEGY_LABEL = 'restart-on-first-failure (the default)';

export class SubStepWaveValidator {
	constructor(private issueCollector: IssueCollector) {}

	public validate(flow: FlowDefinition): void {
		const byId = new Map(flow.steps.map(s => [s.id, s]));
		this.validateStrategyNames(flow);
		for (const step of flow.steps) {
			this.validateWaveDeclaration(step, byId);
		}
		for (const parent of flow.steps.filter(s => s.subStepStrategy === WAVES_SUB_STEP_STRATEGY)) {
			const children = flow.steps.filter(s => s.parent === parent.id);
			this.validateSingleWave(parent, children);
			this.validateDependsAcrossWaves(parent, children, byId);
		}
	}

	private validateStrategyNames(flow: FlowDefinition): void {
		const known: readonly string[] = SUB_STEP_STRATEGY_NAMES;
		for (const step of flow.steps) {
			if (step.subStepStrategy === undefined || known.includes(step.subStepStrategy)) {
				continue;
			}
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.SUB_STEP_STRATEGY_UNKNOWN,
				message: `Step '${step.id}' has an unknown subStepStrategy ${JSON.stringify(step.subStepStrategy)}; the run would fail as soon as a sub-step of '${step.id}' fails. Valid values: ${known.join(', ')}`,
				location: { stepId: step.id, field: 'subStepStrategy' },
				suggestion: `Use one of: ${known.join(', ')}`,
				context: { expected: known.join(' | '), actual: String(step.subStepStrategy) },
			});
		}
	}

	private validateWaveDeclaration(step: FlowStep, byId: Map<string, FlowStep>): void {
		const declared = (step as { wave?: unknown }).wave;
		const isWavesChild =
			step.parent !== undefined && byId.get(step.parent)?.subStepStrategy === WAVES_SUB_STEP_STRATEGY;

		if (declared === undefined) {
			if (isWavesChild) {
				this.addError(
					ValidationCode.SUB_STEP_WAVE_MISSING,
					step,
					`Sub-step '${step.id}' has no wave but its parent '${step.parent}' uses subStepStrategy: waves; add a wave to it, e.g. wave: 1`,
					`Add a wave to '${step.id}' (e.g. wave: 1); sub-steps with the same wave run in parallel, a higher wave starts after the lower one passed`
				);
			}
			return;
		}

		if (typeof declared !== 'number' || !Number.isInteger(declared) || declared < 0) {
			this.addError(
				ValidationCode.SUB_STEP_WAVE_INVALID,
				step,
				`Step '${step.id}' has an invalid wave ${JSON.stringify(declared) ?? String(declared)}: wave must be a non-negative integer`,
				'Use 0, 1, 2... (gaps such as 10, 20, 30 are fine: the value only orders the waves)'
			);
			return;
		}

		if (step.parent === undefined) {
			this.addError(
				ValidationCode.SUB_STEP_WAVE_WITHOUT_PARENT,
				step,
				`Step '${step.id}' declares wave ${declared} but is not a sub-step (no parent)`,
				`Remove wave from '${step.id}', or make it a sub-step of a parent that uses subStepStrategy: waves`
			);
			return;
		}

		const parent = byId.get(step.parent);
		if (parent?.subStepStrategy === WAVES_SUB_STEP_STRATEGY) {
			return;
		}

		const ancestor = this.closestWavesAncestorChild(step, byId);
		if (ancestor !== undefined) {
			this.addError(
				ValidationCode.SUB_STEP_WAVE_NESTED,
				step,
				`Sub-step '${step.id}' is nested under '${step.parent}' and cannot declare a wave: its wave is inherited from '${ancestor}'`,
				`Remove wave from '${step.id}'`
			);
			return;
		}

		const strategy = parent?.subStepStrategy ?? DEFAULT_STRATEGY_LABEL;
		this.addError(
			ValidationCode.SUB_STEP_WAVE_STRATEGY_MISMATCH,
			step,
			`Sub-step '${step.id}' declares wave ${declared} but its parent '${step.parent}' uses subStepStrategy ${strategy}, so the wave would be ignored`,
			`Set subStepStrategy: waves on '${step.parent}', or remove wave from '${step.id}'`
		);
	}

	/** The ancestor, direct sub-step of a waves parent, that `step` is nested under; undefined when there is none. */
	private closestWavesAncestorChild(step: FlowStep, byId: Map<string, FlowStep>): string | undefined {
		const visited = new Set<string>();
		let current: FlowStep | undefined = step.parent === undefined ? undefined : byId.get(step.parent);
		while (current !== undefined && !visited.has(current.id)) {
			visited.add(current.id);
			const parent: FlowStep | undefined = current.parent === undefined ? undefined : byId.get(current.parent);
			if (parent?.subStepStrategy === WAVES_SUB_STEP_STRATEGY) {
				return current.id;
			}
			current = parent;
		}
		return undefined;
	}

	private validateSingleWave(parent: FlowStep, children: FlowStep[]): void {
		const waves = new Set(children.map(c => this.validWave(c)).filter((w): w is number => w !== undefined));
		if (waves.size >= 2) {
			return;
		}
		this.issueCollector.addIssue({
			severity: 'warning',
			code: ValidationCode.SUB_STEP_WAVES_SINGLE_WAVE,
			message: `Step '${parent.id}' uses subStepStrategy: waves but its sub-steps declare ${String(waves.size)} distinct wave(s); waves only order sub-steps when there are at least 2`,
			location: { stepId: parent.id, field: 'subStepStrategy' },
			suggestion: `Use subStepStrategy: wait-all on '${parent.id}' (same behaviour for a single wave), or add a second wave`,
		});
	}

	private validateDependsAcrossWaves(parent: FlowStep, children: FlowStep[], byId: Map<string, FlowStep>): void {
		for (const child of children) {
			const childWave = this.validWave(child);
			if (childWave === undefined) {
				continue;
			}
			for (const dependencyId of child.depends ?? []) {
				const dependencyWave = this.waveUnder(parent.id, dependencyId, byId);
				if (dependencyWave === undefined || dependencyWave === childWave) {
					continue;
				}
				if (dependencyWave < childWave) {
					this.issueCollector.addIssue({
						severity: 'warning',
						code: ValidationCode.WAVE_REDUNDANT_DEPENDS,
						message: `Sub-step '${child.id}' (wave ${childWave}) depends on '${dependencyId}' of the earlier wave ${dependencyWave}: wave ${childWave} only starts after wave ${dependencyWave} fully passed`,
						location: { stepId: child.id, field: 'depends' },
						suggestion: `Remove '${dependencyId}' from the depends of '${child.id}'`,
					});
				} else {
					this.addError(
						ValidationCode.WAVE_LATER_DEPENDS,
						child,
						`Sub-step '${child.id}' (wave ${childWave}) depends on '${dependencyId}' of the later wave ${dependencyWave}, which only starts after wave ${childWave} passed: the dependency can never be satisfied`,
						`Remove '${dependencyId}' from the depends of '${child.id}', or give '${child.id}' a wave after ${dependencyWave}`,
						'depends'
					);
				}
			}
		}
	}

	/** Wave of `stepId` as seen from `parentId`: its own, or that of the ancestor that is a direct sub-step of `parentId`. */
	private waveUnder(parentId: string, stepId: string, byId: Map<string, FlowStep>): number | undefined {
		const visited = new Set<string>();
		let current = byId.get(stepId);
		while (current !== undefined && !visited.has(current.id)) {
			visited.add(current.id);
			if (current.parent === parentId) {
				return this.validWave(current);
			}
			current = current.parent === undefined ? undefined : byId.get(current.parent);
		}
		return undefined;
	}

	private validWave(step: FlowStep): number | undefined {
		const wave = (step as { wave?: unknown }).wave;
		return typeof wave === 'number' && Number.isInteger(wave) && wave >= 0 ? wave : undefined;
	}

	private addError(code: ValidationCode, step: FlowStep, message: string, suggestion: string, field = 'wave'): void {
		this.issueCollector.addIssue({
			severity: 'error',
			code,
			message,
			location: { stepId: step.id, field },
			suggestion,
		});
	}
}
