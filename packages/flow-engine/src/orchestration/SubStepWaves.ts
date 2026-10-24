import type { SchedulerStep } from './FlowScheduler';
import { WAVES_SUB_STEP_STRATEGY } from './SubStepStrategyNames';

/**
 * Wave bookkeeping for parents using `subStepStrategy: waves`.
 *
 * A direct sub-step of such a parent is held by a synthetic dependency token (`wave:<parent>:<n>`) in
 * the scheduler's pendingDeps until its wave is released, so the scheduler's readiness, settling and
 * terminal checks need no wave special case. Tokens live only in pendingDeps (never in originalDeps),
 * which is why every place that rebuilds a child's pendingDeps must call {@link holdChild} afterwards.
 *
 * Nested sub-steps are never held: they wait for their own parent, which is itself a held direct child.
 */
export class SubStepWaves {
	/** Wave declared by each direct sub-step of a waves parent (kept for the life of the scheduler). */
	private readonly waveOf = new Map<string, number>();
	/** Wave currently running, per waves parent. Absent until the parent's own run completed. */
	private readonly currentWave = new Map<string, number>();

	constructor(
		private readonly steps: Map<string, SchedulerStep>,
		private readonly pendingDeps: Map<string, Set<string>>
	) {}

	isWavesParent(parentId: string): boolean {
		return this.steps.get(parentId)?.subStepStrategy === WAVES_SUB_STEP_STRATEGY;
	}

	/**
	 * Rejects a sub-step that cannot join its waves parent (no wave, bad wave, a wave already over).
	 * No-op for a step whose parent does not use waves.
	 */
	assertAdmissible(child: SchedulerStep): void {
		if (child.parent === undefined || !this.isWavesParent(child.parent)) {
			return;
		}
		const wave = child.wave;
		if (typeof wave !== 'number' || !Number.isInteger(wave) || wave < 0) {
			throw new Error(
				`FlowScheduler: sub-step "${child.id}" of "${child.parent}" (subStepStrategy: waves) needs a "wave" that is a non-negative integer, got ${JSON.stringify(wave)}. Add e.g. "wave: 1" to "${child.id}".`
			);
		}
		const current = this.currentWave.get(child.parent);
		if (current !== undefined && wave < current) {
			throw new Error(
				`FlowScheduler: sub-step "${child.id}" of "${child.parent}" declares wave ${wave} but wave ${current} is already running, so wave ${wave} can no longer start. Give it wave ${current} or later.`
			);
		}
	}

	/** Records the wave of a direct sub-step of a waves parent and holds it until that wave is released. */
	registerChild(child: SchedulerStep): void {
		if (child.parent === undefined || !this.isWavesParent(child.parent)) {
			return;
		}
		this.assertAdmissible(child);
		this.waveOf.set(child.id, child.wave as number);
		this.holdChild(child.id);
	}

	/**
	 * Adds the hold token to a direct sub-step of a waves parent unless its wave is already running or over.
	 * Call after (re)building the child's pendingDeps.
	 */
	holdChild(childId: string): void {
		const wave = this.waveOf.get(childId);
		const parentId = this.steps.get(childId)?.parent;
		if (wave === undefined || parentId === undefined) {
			return;
		}
		const current = this.currentWave.get(parentId);
		if (current === undefined || wave > current) {
			this.pendingDeps.get(childId)?.add(this.token(parentId, wave));
		}
	}

	/** Forgets the running wave: the parent starts over from its first wave (restart, loop reset). */
	reset(parentId: string): void {
		this.currentWave.delete(parentId);
	}

	/** The parent finished its own run: start the first wave of `children`. */
	releaseFirst(parentId: string, children: Set<string>): void {
		const first = this.sortedWaves(children)[0];
		if (first === undefined) {
			return;
		}
		this.release(parentId, first, children);
	}

	/** Makes `wave` the running wave and releases its held children. */
	release(parentId: string, wave: number, children: Set<string>): void {
		this.currentWave.set(parentId, wave);
		for (const childId of children) {
			if (this.waveOf.get(childId) === wave) {
				this.pendingDeps.get(childId)?.delete(this.token(parentId, wave));
			}
		}
	}

	/** The children whose outcome the strategy reasons about: the running wave only (all children for other parents). */
	scope(parentId: string, children: Set<string>): Set<string> {
		if (!this.isWavesParent(parentId)) {
			return children;
		}
		const current = this.requireCurrent(parentId);
		return new Set([...children].filter(c => this.waveOf.get(c) === current));
	}

	/** Wave state handed to the strategy, `undefined` for a parent that does not use waves. */
	strategyState(
		parentId: string,
		children: Set<string>
	): { currentWave: number; nextWave: number | undefined } | undefined {
		if (!this.isWavesParent(parentId)) {
			return undefined;
		}
		const current = this.requireCurrent(parentId);
		return { currentWave: current, nextWave: this.sortedWaves(children).find(w => w > current) };
	}

	/** Direct sub-steps of a later wave than the running one, with their wave. */
	laterWaveChildren(parentId: string, children: Set<string>): { id: string; wave: number }[] {
		const current = this.requireCurrent(parentId);
		return [...children]
			.map(id => ({ id, wave: this.waveOf.get(id) }))
			.filter((c): c is { id: string; wave: number } => c.wave !== undefined && c.wave > current);
	}

	currentWaveOf(parentId: string): number | undefined {
		return this.currentWave.get(parentId);
	}

	/** ` in wave N` for terminal messages of a waves parent, '' for any other parent. */
	failedWaveLabel(parentId: string): string {
		const current = this.currentWave.get(parentId);
		return this.isWavesParent(parentId) && current !== undefined ? ` in wave ${current}` : '';
	}

	private sortedWaves(children: Set<string>): number[] {
		const waves = new Set<number>();
		for (const childId of children) {
			const wave = this.waveOf.get(childId);
			if (wave !== undefined) {
				waves.add(wave);
			}
		}
		return [...waves].sort((a, b) => a - b);
	}

	private requireCurrent(parentId: string): number {
		const current = this.currentWave.get(parentId);
		if (current === undefined) {
			throw new Error(
				`FlowScheduler: waves parent "${parentId}" has no running wave: its sub-steps were evaluated before the parent completed. This is a scheduler bug.`
			);
		}
		return current;
	}

	private token(parentId: string, wave: number): string {
		return `wave:${parentId}:${wave}`;
	}
}
