import type { SchedulerState } from './SchedulerState';
import type { SchedulerContext, SchedulerStep, SubStepRecord } from './SchedulerTypes';
import type { WavesExport } from './SubStepWaves';

/** Version written in every {@link SchedulerSnapshot}; `restore` refuses any other. */
export const SCHEDULER_SNAPSHOT_VERSION = 1;

type Outputs = Record<string, unknown>;

/**
 * Everything a {@link FlowScheduler} knows, as plain JSON (sets as arrays, maps as objects).
 * Written while a run is paused, read back by a restarted daemon.
 */
export interface SchedulerSnapshot {
	version: number;
	started: boolean;
	steps: Record<string, SchedulerStep>;
	originalDeps: Record<string, string[]>;
	reverseDeps: Record<string, string[]>;
	pendingDeps: Record<string, string[]>;
	completedSteps: string[];
	failedSteps: string[];
	inFlightSteps: string[];
	retryCount: Record<string, number>;
	loopIterations: Record<string, number>;
	outputs: Record<string, Outputs>;
	parentToChildren: Record<string, string[]>;
	childToParent: Record<string, string>;
	deferredOutcomes: Record<string, Outputs>;
	subStepLoopIterations: Record<string, number>;
	supersededSteps: string[];
	subStepFailedChildren: Record<string, Record<string, string>>;
	subStepFailedOutputs: Record<string, Record<string, Outputs>>;
	staticChildren: Record<string, string[]>;
	subStepRelaunchFeedback: Record<string, string>;
	skippedReasons: Record<string, string>;
	parentFailureMessages: Record<string, string>;
	requeuedSteps: string[];
	waves: WavesExport;
	context: {
		stepOutputs: Record<string, Outputs>;
		subStepErrors: Record<string, string[]>;
		subSteps: Record<string, SubStepRecord>;
	};
}

function mapToRecord<V, R>(map: ReadonlyMap<string, V>, convert: (value: V) => R): Record<string, R> {
	return Object.fromEntries([...map].map(([key, value]) => [key, convert(value)]));
}

const asArray = (set: ReadonlySet<string>): string[] => [...set];

/** Reads a parsed snapshot field by field, failing with the path of the first thing that is wrong. */
class SnapshotReader {
	constructor(private readonly raw: Record<string, unknown>) {}

	private static fail(path: string, expected: string): never {
		throw new Error(
			`FlowScheduler snapshot is invalid: "${path}" must be ${expected}. The snapshot file is damaged or was written by an incompatible version.`
		);
	}

	private static isObject(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null && !Array.isArray(value);
	}

	private field(path: string): unknown {
		return this.raw[path];
	}

	record<V>(path: string, convert: (value: unknown, valuePath: string) => V): Map<string, V> {
		const value = this.field(path);
		if (!SnapshotReader.isObject(value)) {
			SnapshotReader.fail(path, 'an object');
		}
		return new Map(Object.entries(value).map(([key, entry]) => [key, convert(entry, `${path}.${key}`)]));
	}

	list(path: string): string[] {
		return SnapshotReader.strings(this.field(path), path);
	}

	bool(path: string): boolean {
		const value = this.field(path);
		if (typeof value !== 'boolean') {
			SnapshotReader.fail(path, 'a boolean');
		}
		return value;
	}

	static strings(value: unknown, path: string): string[] {
		if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
			SnapshotReader.fail(path, 'a list of strings');
		}
		return value as string[];
	}

	static string(value: unknown, path: string): string {
		if (typeof value !== 'string') {
			SnapshotReader.fail(path, 'a string');
		}
		return value;
	}

	static number(value: unknown, path: string): number {
		if (typeof value !== 'number' || !Number.isFinite(value)) {
			SnapshotReader.fail(path, 'a number');
		}
		return value;
	}

	static object(value: unknown, path: string): Record<string, unknown> {
		if (!SnapshotReader.isObject(value)) {
			SnapshotReader.fail(path, 'an object');
		}
		return value;
	}
}

const readStrings = (value: unknown, path: string): string[] => SnapshotReader.strings(value, path);
const readString = (value: unknown, path: string): string => SnapshotReader.string(value, path);
const readNumber = (value: unknown, path: string): number => SnapshotReader.number(value, path);
const readObject = (value: unknown, path: string): Outputs => SnapshotReader.object(value, path);

/** Converts the bookkeeping of a scheduler to a {@link SchedulerSnapshot} and back. */
export class SchedulerSnapshotCodec {
	static capture(state: SchedulerState, context: SchedulerContext): SchedulerSnapshot {
		return {
			version: SCHEDULER_SNAPSHOT_VERSION,
			started: state.started,
			steps: mapToRecord(state.steps, step => step),
			originalDeps: mapToRecord(state.originalDeps, asArray),
			reverseDeps: mapToRecord(state.reverseDeps, asArray),
			pendingDeps: mapToRecord(state.pendingDeps, asArray),
			completedSteps: asArray(state.completedSteps),
			failedSteps: asArray(state.failedSteps),
			inFlightSteps: asArray(state.inFlightSteps),
			retryCount: mapToRecord(state.retryCount, n => n),
			loopIterations: mapToRecord(state.loopIterations, n => n),
			outputs: mapToRecord(state.outputs, o => o),
			parentToChildren: mapToRecord(state.parentToChildren, asArray),
			childToParent: mapToRecord(state.childToParent, p => p),
			deferredOutcomes: mapToRecord(state.deferredOutcomes, d => d.outputs),
			subStepLoopIterations: mapToRecord(state.subStepLoopIterations, n => n),
			supersededSteps: asArray(state.supersededSteps),
			subStepFailedChildren: mapToRecord(state.subStepFailedChildren, m => mapToRecord(m, e => e)),
			subStepFailedOutputs: mapToRecord(state.subStepFailedOutputs, m => mapToRecord(m, o => o)),
			staticChildren: mapToRecord(state.staticChildren, asArray),
			subStepRelaunchFeedback: mapToRecord(state.subStepRelaunchFeedback, f => f),
			skippedReasons: mapToRecord(state.skippedReasons, r => r),
			parentFailureMessages: mapToRecord(state.parentFailureMessages, m => m),
			requeuedSteps: asArray(state.requeuedSteps),
			waves: state.waves.exportState(),
			context: {
				stepOutputs: mapToRecord(context.stepOutputs, o => o),
				subStepErrors: mapToRecord(context.subStepErrors ?? new Map<string, string[]>(), e => [...e]),
				subSteps: mapToRecord(context.subSteps ?? new Map<string, SubStepRecord>(), s => s),
			},
		};
	}

	/**
	 * Replaces the bookkeeping of a never-started scheduler with the snapshot.
	 * The snapshot is read completely before anything is changed, so a damaged one leaves the scheduler untouched.
	 *
	 * @throws Error naming the first invalid field, or the unsupported version
	 */
	static apply(state: SchedulerState, context: SchedulerContext, snapshot: unknown): void {
		if (state.started) {
			throw new Error('FlowScheduler.restore: the scheduler already started; restore into a new FlowScheduler.');
		}
		const raw = SnapshotReader.object(snapshot, 'snapshot');
		if (raw['version'] !== SCHEDULER_SNAPSHOT_VERSION) {
			throw new Error(
				`FlowScheduler snapshot has version ${JSON.stringify(raw['version'])}, this daemon reads version ${String(SCHEDULER_SNAPSHOT_VERSION)}. It was written by another flow version: re-run the flow instead.`
			);
		}
		const reader = new SnapshotReader(raw);
		const setsOf = (value: unknown, path: string): Set<string> => new Set(readStrings(value, path));
		const read = {
			started: reader.bool('started'),
			steps: reader.record('steps', (v, p) => {
				const step = readObject(v, p) as SchedulerStep;
				if (readString(step['id'], `${p}.id`) === '') {
					throw new Error(`FlowScheduler snapshot is invalid: "${p}.id" must not be empty.`);
				}
				return step;
			}),
			originalDeps: reader.record('originalDeps', setsOf),
			reverseDeps: reader.record('reverseDeps', setsOf),
			pendingDeps: reader.record('pendingDeps', setsOf),
			completedSteps: new Set(reader.list('completedSteps')),
			failedSteps: new Set(reader.list('failedSteps')),
			inFlightSteps: new Set(reader.list('inFlightSteps')),
			retryCount: reader.record('retryCount', readNumber),
			loopIterations: reader.record('loopIterations', readNumber),
			outputs: reader.record('outputs', readObject),
			parentToChildren: reader.record('parentToChildren', setsOf),
			childToParent: reader.record('childToParent', readString),
			deferredOutcomes: reader.record('deferredOutcomes', (v, p) => ({
				type: 'completed' as const,
				outputs: readObject(v, p),
			})),
			subStepLoopIterations: reader.record('subStepLoopIterations', readNumber),
			supersededSteps: new Set(reader.list('supersededSteps')),
			subStepFailedChildren: reader.record(
				'subStepFailedChildren',
				(v, p) => new Map(Object.entries(readObject(v, p)).map(([k, e]) => [k, readString(e, `${p}.${k}`)]))
			),
			subStepFailedOutputs: reader.record(
				'subStepFailedOutputs',
				(v, p) => new Map(Object.entries(readObject(v, p)).map(([k, o]) => [k, readObject(o, `${p}.${k}`)]))
			),
			staticChildren: reader.record('staticChildren', setsOf),
			subStepRelaunchFeedback: reader.record('subStepRelaunchFeedback', readString),
			skippedReasons: reader.record('skippedReasons', readString),
			parentFailureMessages: reader.record('parentFailureMessages', readString),
			requeuedSteps: new Set(reader.list('requeuedSteps')),
		};
		const wavesRaw = readObject(raw['waves'], 'waves');
		const waves: WavesExport = {
			waveOf: Object.fromEntries(
				Object.entries(readObject(wavesRaw['waveOf'], 'waves.waveOf')).map(([k, v]) => [
					k,
					readNumber(v, `waves.waveOf.${k}`),
				])
			),
			currentWave: Object.fromEntries(
				Object.entries(readObject(wavesRaw['currentWave'], 'waves.currentWave')).map(([k, v]) => [
					k,
					readNumber(v, `waves.currentWave.${k}`),
				])
			),
		};
		const contextRaw = readObject(raw['context'], 'context');
		const contextRead = {
			stepOutputs: new SnapshotReader(contextRaw).record('stepOutputs', readObject),
			subStepErrors: new SnapshotReader(contextRaw).record('subStepErrors', readStrings),
			subSteps: new SnapshotReader(contextRaw).record('subSteps', (v, p) => {
				const record = readObject(v, p);
				readObject(record['outputs'], `${p}.outputs`);
				readString(record['status'], `${p}.status`);
				return record as unknown as SubStepRecord;
			}),
		};

		// Everything is valid: now replace the state
		SchedulerSnapshotCodec.replace(state.steps, read.steps);
		SchedulerSnapshotCodec.replace(state.originalDeps, read.originalDeps);
		SchedulerSnapshotCodec.replace(state.reverseDeps, read.reverseDeps);
		SchedulerSnapshotCodec.replace(state.pendingDeps, read.pendingDeps);
		SchedulerSnapshotCodec.replaceSet(state.completedSteps, read.completedSteps);
		SchedulerSnapshotCodec.replaceSet(state.failedSteps, read.failedSteps);
		SchedulerSnapshotCodec.replaceSet(state.inFlightSteps, read.inFlightSteps);
		SchedulerSnapshotCodec.replace(state.retryCount, read.retryCount);
		SchedulerSnapshotCodec.replace(state.loopIterations, read.loopIterations);
		SchedulerSnapshotCodec.replace(state.outputs, read.outputs);
		state.started = read.started;
		SchedulerSnapshotCodec.replace(state.parentToChildren, read.parentToChildren);
		SchedulerSnapshotCodec.replace(state.childToParent, read.childToParent);
		SchedulerSnapshotCodec.replace(state.deferredOutcomes, read.deferredOutcomes);
		SchedulerSnapshotCodec.replace(state.subStepLoopIterations, read.subStepLoopIterations);
		SchedulerSnapshotCodec.replaceSet(state.supersededSteps, read.supersededSteps);
		SchedulerSnapshotCodec.replace(state.subStepFailedChildren, read.subStepFailedChildren);
		SchedulerSnapshotCodec.replace(state.subStepFailedOutputs, read.subStepFailedOutputs);
		SchedulerSnapshotCodec.replace(state.staticChildren, read.staticChildren);
		SchedulerSnapshotCodec.replace(state.subStepRelaunchFeedback, read.subStepRelaunchFeedback);
		SchedulerSnapshotCodec.replace(state.skippedReasons, read.skippedReasons);
		SchedulerSnapshotCodec.replace(state.parentFailureMessages, read.parentFailureMessages);
		SchedulerSnapshotCodec.replaceSet(state.requeuedSteps, read.requeuedSteps);
		state.waves.importState(waves);
		SchedulerSnapshotCodec.replace(context.stepOutputs, contextRead.stepOutputs);
		context.subStepErrors ??= new Map();
		SchedulerSnapshotCodec.replace(context.subStepErrors, contextRead.subStepErrors);
		context.subSteps ??= new Map();
		SchedulerSnapshotCodec.replace(context.subSteps, contextRead.subSteps);
	}

	private static replace<V>(target: Map<string, V>, source: ReadonlyMap<string, V>): void {
		target.clear();
		for (const [key, value] of source) {
			target.set(key, value);
		}
	}

	private static replaceSet(target: Set<string>, source: ReadonlySet<string>): void {
		target.clear();
		for (const value of source) {
			target.add(value);
		}
	}
}
