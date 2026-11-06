import type { Clock } from './Clock';
import { SandboxError } from './SandboxError';
import { SandboxRequestValidator } from './SandboxRequestValidator';
import type {
	CopyInRequest,
	CopyOutRequest,
	CreateSandboxRequest,
	ExecRequest,
	ExecResult,
	NetworkRuleRequest,
	SandboxInfo,
	SandboxMount,
	SandboxRuntime,
	SecretRemoveRequest,
	SecretRequest,
	ServiceSecretRequest,
} from './SandboxRuntime';

export type SandboxMethod = keyof SandboxRuntime;

export interface FakeCall {
	method: SandboxMethod;
	request: unknown;
	/** Fake clock reading when the call started. */
	at: number;
}

export interface FakeSandboxState {
	name: string;
	agent: string;
	status: 'running' | 'stopped';
	mounts: readonly SandboxMount[];
	cpus: number;
	memory: string;
	image: string | undefined;
	createdAt: number;
	lastActivityAt: number;
	networkRules: Set<string>;
	secrets: Map<string, SecretRequest>;
	/** Built-in service secrets (service -> API key), as stored by setServiceSecret. */
	serviceSecrets: Map<string, string>;
	/** Sandbox path -> where it came from (`host:<path>` after copyIn, `seeded` after seedFile). */
	files: Map<string, string>;
}

export interface FakeExecContext {
	sandbox: FakeSandboxState;
	emitStdout: (text: string) => void;
	emitStderr: (text: string) => void;
}

export type FakeExecHandler = (request: ExecRequest, context: FakeExecContext) => Promise<ExecResult> | ExecResult;

export interface FakeSandboxRuntimeOptions {
	clock: Clock;
	/** What a command does. Default: succeed with empty output. */
	execHandler?: FakeExecHandler;
}

interface InjectedFailure {
	method: SandboxMethod;
	error: SandboxError;
	remaining: number;
	when: ((request: unknown) => boolean) | undefined;
}

const MIB_PER_UNIT = { m: 1, g: 1024 } as const;

/**
 * In-memory SandboxRuntime for the tests of the components built on top of it.
 *
 * Deterministic (time comes from the injected Clock), records every call, validates requests with the same
 * rules as SbxCliRuntime and reports the same error kinds, and can be told to fail. Nothing starts or
 * stops by itself: an idle stop is simulated with `simulateIdleStop`.
 */
export class FakeSandboxRuntime implements SandboxRuntime {
	private readonly clock: Clock;
	private execHandler: FakeExecHandler;
	private readonly validator = new SandboxRequestValidator();
	private readonly states = new Map<string, FakeSandboxState>();
	private readonly recorded: FakeCall[] = [];
	private readonly failures: InjectedFailure[] = [];

	constructor(options: FakeSandboxRuntimeOptions) {
		this.clock = options.clock;
		this.execHandler = options.execHandler ?? (() => ({ exitCode: 0, stdout: '', stderr: '' }));
	}

	// ---- test controls ----

	get calls(): readonly FakeCall[] {
		return this.recorded;
	}

	callsTo(method: SandboxMethod): FakeCall[] {
		return this.recorded.filter(call => call.method === method);
	}

	setExecHandler(handler: FakeExecHandler): void {
		this.execHandler = handler;
	}

	/** Makes the next `times` calls to `method` (matching `when`, if given) throw `error` after being recorded. */
	failNext(
		method: SandboxMethod,
		error: SandboxError,
		options: { times?: number; when?: (request: unknown) => boolean } = {}
	): void {
		this.failures.push({ method, error, remaining: options.times ?? 1, when: options.when });
	}

	/** The state of a sandbox; throws when it does not exist so a test never asserts on nothing. */
	state(name: string): FakeSandboxState {
		const state = this.states.get(name);
		if (state === undefined) {
			throw new Error(
				`FakeSandboxRuntime has no sandbox "${name}" (existing: ${[...this.states.keys()].join(', ') || 'none'})`
			);
		}
		return state;
	}

	has(name: string): boolean {
		return this.states.has(name);
	}

	/** What sbx does by itself after ~30 s without a session: the sandbox stops. */
	simulateIdleStop(name: string): void {
		this.state(name).status = 'stopped';
	}

	seedFile(name: string, sandboxPath: string): void {
		this.state(name).files.set(sandboxPath, 'seeded');
	}

	// ---- SandboxRuntime ----

	async create(request: CreateSandboxRequest): Promise<void> {
		this.begin('create', request);
		this.validator.create(request);
		if (this.states.has(request.name)) {
			throw new SandboxError(
				'already-exists',
				`sandbox '${request.name}' already exists. Choose another name or remove the existing sandbox first.`,
				{
					sandbox: request.name,
				}
			);
		}
		const now = this.clock.now();
		this.states.set(request.name, {
			name: request.name,
			agent: request.agent,
			status: 'running',
			mounts: request.mounts,
			cpus: request.cpus,
			memory: request.memory.toLowerCase(),
			image: request.image,
			createdAt: now,
			lastActivityAt: now,
			networkRules: new Set(),
			secrets: new Map(),
			serviceSecrets: new Map(),
			files: new Map(),
		});
		await Promise.resolve();
	}

	async exec(request: ExecRequest): Promise<ExecResult> {
		this.begin('exec', request);
		this.validator.exec(request);
		const state = this.existing(request.sandbox);
		if (request.signal?.aborted === true) throw this.aborted();
		// sbx starts a stopped sandbox for an exec.
		state.status = 'running';
		state.lastActivityAt = this.clock.now();

		const context: FakeExecContext = {
			sandbox: state,
			emitStdout: text => request.onStdout?.(text),
			emitStderr: text => request.onStderr?.(text),
		};
		const result = await this.raceAbort(Promise.resolve(this.execHandler(request, context)), request.signal);
		state.lastActivityAt = this.clock.now();
		return result;
	}

	async stop(name: string): Promise<void> {
		this.begin('stop', name);
		this.validator.name(name);
		this.existing(name).status = 'stopped';
		await Promise.resolve();
	}

	async start(name: string): Promise<void> {
		this.begin('start', name);
		this.validator.name(name);
		const state = this.existing(name);
		state.status = 'running';
		state.lastActivityAt = this.clock.now();
		await Promise.resolve();
	}

	async remove(name: string): Promise<void> {
		this.begin('remove', name);
		this.validator.name(name);
		this.existing(name);
		// Rules, secrets and VM-local files are part of the state, so they go with it (as with sbx rm).
		this.states.delete(name);
		await Promise.resolve();
	}

	async list(): Promise<SandboxInfo[]> {
		this.begin('list', undefined);
		await Promise.resolve();
		return [...this.states.values()].map(state => {
			const memory = /^(\d+)([mg])$/.exec(state.memory);
			const unit = memory?.[2] === 'g' ? 'g' : 'm';
			return {
				name: state.name,
				agent: state.agent,
				status: state.status,
				workspaces: state.mounts.map(mount => mount.hostPath),
				cpus: state.cpus,
				memoryMib: Number(memory?.[1] ?? 0) * MIB_PER_UNIT[unit],
				createdAt: new Date(state.createdAt).toISOString(),
			};
		});
	}

	async copyIn(request: CopyInRequest): Promise<void> {
		this.begin('copyIn', request);
		this.validator.name(request.sandbox);
		const sandboxPath = this.validator.sandboxPath(request.sandboxPath);
		this.existing(request.sandbox).files.set(sandboxPath, `host:${request.hostPath}`);
		await Promise.resolve();
	}

	async copyOut(request: CopyOutRequest): Promise<void> {
		this.begin('copyOut', request);
		this.validator.name(request.sandbox);
		const sandboxPath = this.validator.sandboxPath(request.sandboxPath);
		const state = this.existing(request.sandbox);
		if (!state.files.has(sandboxPath)) {
			throw new SandboxError(
				'command-failed',
				`${sandboxPath}: no such file or directory in sandbox "${request.sandbox}"`,
				{
					sandbox: request.sandbox,
				}
			);
		}
		await Promise.resolve();
	}

	async allowNetwork(request: NetworkRuleRequest): Promise<void> {
		this.begin('allowNetwork', request);
		this.validator.name(request.sandbox);
		const resources = this.validator.resources(request.resources);
		const state = this.existing(request.sandbox);
		for (const resource of resources) state.networkRules.add(resource);
		await Promise.resolve();
	}

	async removeNetwork(request: NetworkRuleRequest): Promise<void> {
		this.begin('removeNetwork', request);
		this.validator.name(request.sandbox);
		const resources = this.validator.resources(request.resources);
		const state = this.existing(request.sandbox);
		if (!resources.some(resource => state.networkRules.has(resource))) {
			throw new SandboxError('command-failed', `no matching network rule for sandbox "${request.sandbox}"`, {
				sandbox: request.sandbox,
			});
		}
		for (const resource of resources) state.networkRules.delete(resource);
		await Promise.resolve();
	}

	async setSecret(request: SecretRequest): Promise<void> {
		this.begin('setSecret', request);
		this.validator.secret(request);
		this.existing(request.sandbox).secrets.set(request.placeholder, request);
		await Promise.resolve();
	}

	async setServiceSecret(request: ServiceSecretRequest): Promise<void> {
		this.begin('setServiceSecret', request);
		this.validator.serviceSecret(request);
		this.existing(request.sandbox).serviceSecrets.set(request.service, request.value);
		await Promise.resolve();
	}

	async removeSecret(request: SecretRemoveRequest): Promise<void> {
		this.begin('removeSecret', request);
		this.validator.name(request.sandbox);
		this.validator.placeholder(request.placeholder);
		const state = this.existing(request.sandbox);
		if (!state.secrets.delete(request.placeholder)) {
			throw new SandboxError('command-failed', `no matching secret for sandbox "${request.sandbox}"`, {
				sandbox: request.sandbox,
			});
		}
		await Promise.resolve();
	}

	// ---- internals ----

	private begin(method: SandboxMethod, request: unknown): void {
		this.recorded.push({ method, request, at: this.clock.now() });
		const failure = this.failures.find(
			candidate =>
				candidate.method === method &&
				candidate.remaining > 0 &&
				(candidate.when === undefined || candidate.when(request))
		);
		if (failure !== undefined) {
			failure.remaining -= 1;
			throw failure.error;
		}
	}

	private existing(name: string): FakeSandboxState {
		const state = this.states.get(name);
		if (state === undefined) {
			throw new SandboxError(
				'not-found',
				`Sandbox "${name}" does not exist (sbx: error: sandbox '${name}' not found). It may have been removed or never created; list sandboxes with "sbx ls".`,
				{ sandbox: name }
			);
		}
		return state;
	}

	private aborted(): SandboxError {
		return new SandboxError(
			'aborted',
			'The sbx command was aborted. The host-side process was killed, but sbx does NOT stop a process already ' +
				'running inside the sandbox: stop the sandbox if that process must end.'
		);
	}

	private raceAbort(work: Promise<ExecResult>, signal: AbortSignal | undefined): Promise<ExecResult> {
		if (signal === undefined) return work;
		return new Promise<ExecResult>((resolve, reject) => {
			const onAbort = (): void => reject(this.aborted());
			signal.addEventListener('abort', onAbort, { once: true });
			work.then(
				result => {
					signal.removeEventListener('abort', onAbort);
					resolve(result);
				},
				(error: unknown) => {
					signal.removeEventListener('abort', onAbort);
					reject(error instanceof Error ? error : new Error(String(error)));
				}
			);
		});
	}
}
