import { SandboxError } from '../SandboxError';
import type { SandboxLog } from '../SandboxLog';
import {
	ASSIGNMENT_SCOPED_TYPES,
	type ActiveAssignment,
	type AssignmentScopedType,
	type JsonObject,
	MAX_FRAME_BYTES,
	isJsonObject,
	isNonEmptyString,
} from './HarnessMessages';
import type { ReturnedPaths } from './ReturnedPaths';

/** What the bridge does with one message that came from the inner worker. */
export type InsideDecision =
	/** Send `message` to the daemon. `terminal` is true for the step's outcome (`step_completed` / `step_failed`). */
	| { action: 'forward'; message: JsonObject; terminal: boolean }
	/** The step is over and the inner worker says it is free: the wrapper announces its OWN registration. */
	| { action: 'free' }
	/** Expected and harmless, not forwarded (the registration of a freshly started inner worker). */
	| { action: 'absorb'; reason: string }
	/** Not allowed: not forwarded, already logged. */
	| { action: 'drop'; reason: string };

export interface InsideMessageGuardOptions {
	log: SandboxLog;
	/** Translates the paths of a result; `undefined` until the run's mounts exist. */
	returnedPaths: () => ReturnedPaths | undefined;
	/** `inject_steps` carrying more steps than this is dropped. Default 50. */
	maxInjectedSteps?: number;
}

interface AssignmentState extends ActiveAssignment {
	started: boolean;
	finished: boolean;
}

const SCOPED = new Set<string>(ASSIGNMENT_SCOPED_TYPES);
const DEFAULT_MAX_INJECTED_STEPS = 50;

/**
 * The closed message set from the inside to the daemon (plan decision 21). Everything the inner worker says goes
 * through `handle`; the guard never trusts content it can recompute:
 * - allowed: `ready` (never forwarded as is: the wrapper sends its own registration), `log`, `step_started`,
 *   `step_progress`, `step_completed`, `step_failed`, and `inject_steps` only from a started MODEL step;
 * - an assignment-scoped message must name the active assignment (id, execution, step); a message about any other
 *   one, after the step finished, or while no step is active, is dropped;
 * - forwarded messages are REBUILT from the known fields, so an unexpected key never reaches the daemon;
 * - returned paths (`meta.session_file`, `meta.files_written`) are translated to host paths and must stay inside
 *   the run's mounts, see ReturnedPaths. A result whose `session_file` leaves them is replaced by a `step_failed`;
 * - a frame above the daemon's limit is dropped (the daemon would close the whole connection);
 * - every drop is logged with its reason and message type, never with the content.
 */
export class InsideMessageGuard {
	private assignment: AssignmentState | undefined;
	private readonly maxInjectedSteps: number;

	constructor(private readonly options: InsideMessageGuardOptions) {
		this.maxInjectedSteps = options.maxInjectedSteps ?? DEFAULT_MAX_INJECTED_STEPS;
	}

	/** The assignment about to be forwarded inside. */
	begin(assignment: ActiveAssignment): void {
		this.assignment = { ...assignment, started: false, finished: false };
	}

	/** Forgets the assignment (the inner worker was lost, or the wrapper answered for it). */
	end(): void {
		this.assignment = undefined;
	}

	/** True once the step's outcome was forwarded. */
	get finished(): boolean {
		return this.assignment?.finished === true;
	}

	handle(raw: string): InsideDecision {
		const size = Buffer.byteLength(raw, 'utf8');
		if (size > MAX_FRAME_BYTES) {
			return this.drop(`a ${size}-byte frame exceeds the ${MAX_FRAME_BYTES}-byte limit of the daemon`, undefined);
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			return this.drop('the frame is not valid JSON', undefined);
		}
		if (!isJsonObject(parsed) || typeof parsed['type'] !== 'string') {
			return this.drop('the frame is not a JSON object with a string "type"', undefined);
		}
		const type = parsed['type'];
		if (type === 'ready') return this.handleReady();
		if (!SCOPED.has(type)) {
			return this.drop(
				`the message type is not in the allow-list (${ASSIGNMENT_SCOPED_TYPES.join(', ')}, ready)`,
				type
			);
		}
		const refusal = this.scopeProblem(parsed);
		if (refusal !== undefined) return this.drop(refusal, type);
		return this.handleScoped(type as AssignmentScopedType, parsed, this.requireAssignment());
	}

	private handleReady(): InsideDecision {
		const assignment = this.assignment;
		if (assignment === undefined) return { action: 'absorb', reason: 'registration of the inner worker' };
		if (assignment.finished) {
			this.assignment = undefined;
			return { action: 'free' };
		}
		return this.drop('"ready" while a step is in progress', 'ready');
	}

	private scopeProblem(message: JsonObject): string | undefined {
		const assignment = this.assignment;
		if (assignment === undefined) return 'no assignment is active';
		if (message['assignmentId'] !== assignment.assignmentId) return 'the assignmentId is not the active one';
		if (message['executionId'] !== assignment.executionId) return 'the executionId is not the active one';
		if (message['stepId'] !== undefined && message['stepId'] !== assignment.stepId) {
			return 'the stepId is not the active one';
		}
		if (assignment.finished) return 'the step already reported its outcome';
		return undefined;
	}

	private requireAssignment(): AssignmentState {
		if (this.assignment === undefined) throw new Error('InsideMessageGuard: no active assignment');
		return this.assignment;
	}

	private handleScoped(type: AssignmentScopedType, message: JsonObject, assignment: AssignmentState): InsideDecision {
		const header = {
			type,
			assignmentId: assignment.assignmentId,
			executionId: assignment.executionId,
			stepId: assignment.stepId,
		};
		switch (type) {
			case 'log': {
				if (!isJsonObject(message['entry'])) return this.drop('"log" without an entry object', type);
				return { action: 'forward', message: { ...header, entry: message['entry'] }, terminal: false };
			}
			case 'step_started': {
				if (assignment.started) return this.drop('"step_started" sent twice', type);
				assignment.started = true;
				return { action: 'forward', message: header, terminal: false };
			}
			case 'step_progress': {
				return {
					action: 'forward',
					message: { ...header, ...this.pick(message, ['activity', 'lastCompletedTool', 'finalResultAt']) },
					terminal: false,
				};
			}
			case 'step_completed':
				return this.handleOutcome(header, message, assignment, ['output', 'meta', 'io', 'truncated']);
			case 'step_failed': {
				if (!isNonEmptyString(message['error'])) return this.drop('"step_failed" without an error text', type);
				return this.handleOutcome(header, message, assignment, [
					'error',
					'output',
					'stdout',
					'stderr',
					'io',
					'meta',
					'origin',
				]);
			}
			case 'inject_steps': {
				return this.handleInjection(message, assignment);
			}
			default: {
				const exhaustive: never = type;
				throw new Error(`Unhandled message type ${String(exhaustive)}`);
			}
		}
	}

	private handleInjection(message: JsonObject, assignment: AssignmentState): InsideDecision {
		if (assignment.stepType !== 'model') {
			return this.drop('"inject_steps" from a step that is not a model step', 'inject_steps');
		}
		if (!assignment.started) return this.drop('"inject_steps" before "step_started"', 'inject_steps');
		const steps = message['steps'];
		if (!Array.isArray(steps) || steps.length === 0 || !steps.every(isJsonObject)) {
			return this.drop('"inject_steps" without a non-empty list of step objects', 'inject_steps');
		}
		if (steps.length > this.maxInjectedSteps) {
			return this.drop(
				`"inject_steps" carries ${steps.length} steps, more than ${this.maxInjectedSteps}`,
				'inject_steps'
			);
		}
		return {
			action: 'forward',
			message: {
				type: 'inject_steps',
				assignmentId: assignment.assignmentId,
				executionId: assignment.executionId,
				steps,
			},
			terminal: false,
		};
	}

	private handleOutcome(
		header: JsonObject,
		message: JsonObject,
		assignment: AssignmentState,
		fields: string[]
	): InsideDecision {
		const type = String(header['type']);
		const picked = this.pick(message, fields);
		if (type === 'step_completed' && picked['output'] === undefined) picked['output'] = {};
		if (picked['output'] !== undefined && !isJsonObject(picked['output'])) {
			return this.drop(`"${type}" with an output that is not an object`, type);
		}
		if (picked['meta'] !== undefined) {
			const translated = this.translateMeta(picked['meta']);
			if (typeof translated === 'string') return this.refuseResult(header, assignment, translated);
			picked['meta'] = translated;
		}
		// `truncated` (what the worker cut to fit the frame) and `origin: 'engine'` (do not retry) are the worker's own
		// fields; nothing else is accepted in their place.
		if (picked['truncated'] !== undefined && !Array.isArray(picked['truncated'])) delete picked['truncated'];
		if (picked['origin'] !== undefined && picked['origin'] !== 'engine') delete picked['origin'];
		assignment.finished = true;
		return { action: 'forward', message: { ...header, ...picked }, terminal: true };
	}

	private translateMeta(meta: unknown): JsonObject | string {
		if (!isJsonObject(meta)) return 'The sandbox reported a meta that is not an object.';
		const returnedPaths = this.options.returnedPaths();
		if (returnedPaths === undefined) return 'The sandbox returned a result before its mounts were known.';
		try {
			const result = returnedPaths.translate(meta);
			for (const removed of result.removed) {
				this.options.log.warn(
					`bridge removed "${removed}" from files_written: it is outside the run's mounts (the count in files_written_count is unchanged).`
				);
			}
			return result.meta;
		} catch (error) {
			if (error instanceof SandboxError && error.kind === 'path-outside-mounts') return error.message;
			throw error;
		}
	}

	/** The outcome cannot be relayed as it is: tell the daemon the step failed, and say why. */
	private refuseResult(header: JsonObject, assignment: AssignmentState, reason: string): InsideDecision {
		const error = `The sandbox result was refused by the bridge: ${reason}`;
		this.options.log.warn(
			`bridge replaced "${String(header['type'])}" of step "${assignment.stepId}" by a failure: ${reason}`
		);
		assignment.finished = true;
		return {
			action: 'forward',
			message: {
				type: 'step_failed',
				assignmentId: assignment.assignmentId,
				executionId: assignment.executionId,
				stepId: assignment.stepId,
				error,
			},
			terminal: true,
		};
	}

	private pick(message: JsonObject, fields: string[]): JsonObject {
		const picked: JsonObject = {};
		for (const field of fields) {
			if (message[field] !== undefined) picked[field] = message[field];
		}
		return picked;
	}

	private drop(reason: string, type: string | undefined): InsideDecision {
		const about = type === undefined ? 'a frame' : `a "${type}" message`;
		this.options.log.warn(`bridge dropped ${about} from the sandbox: ${reason}.`);
		return { action: 'drop', reason };
	}
}
