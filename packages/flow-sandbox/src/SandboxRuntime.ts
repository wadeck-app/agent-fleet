/**
 * The sandbox operations the rest of flow needs, independent of the tool behind them.
 * Implementations: SbxCliRuntime (real sbx) and FakeSandboxRuntime (tests of later milestones).
 *
 * Contract shared by both (checked by testing/SandboxRuntimeContract.ts):
 * - A missing sandbox is a SandboxError of kind 'not-found'; a duplicate name is 'already-exists'.
 * - Paths in `mounts` and copy host sides are HOST paths; `cwd` and sandbox-side copy paths are the paths
 *   as seen INSIDE the sandbox (translate with PathTranslator first).
 * - Network rules and secrets are always scoped to one sandbox. There is no API to add a machine-wide rule.
 * - `exec` on a stopped sandbox starts it first (sbx behaviour).
 * - Aborting an `exec` stops the HOST side only: sbx does not kill the process inside the sandbox.
 *   The caller must `stop` the sandbox when the process must really die.
 */

export interface SandboxMount {
	/** Absolute host directory. */
	hostPath: string;
	readOnly?: boolean;
}

export interface CreateSandboxRequest {
	/** Sandbox name: letters, digits, hyphens and periods, at least two characters, starting with a letter or digit. */
	name: string;
	/** sbx agent kind (for example `shell`, `claude`). Required: there is no hidden default. */
	agent: string;
	/** At least one. The first mount is the primary workspace. */
	mounts: readonly SandboxMount[];
	cpus: number;
	/** Binary units, for example `2g` or `512m`. */
	memory: string;
	/** Template image reference; the agent's stock image when omitted. */
	image?: string;
	/** Image pull policy; omitted means the sbx default. Use `never` for a locally saved template. */
	pull?: 'always' | 'missing' | 'never';
}

export interface ExecRequest {
	sandbox: string;
	/** The command and its arguments, run inside the sandbox without a shell. */
	command: readonly string[];
	/** Environment for the command. Passed through a private env file, never on the command line. */
	env?: Readonly<Record<string, string>>;
	/** Working directory inside the sandbox. */
	cwd?: string;
	/** Written to the command's standard input, then closed. */
	stdin?: string | Uint8Array;
	onStdout?: (chunk: string) => void;
	onStderr?: (chunk: string) => void;
	signal?: AbortSignal;
}

export interface ExecResult {
	/** Exit code of the command inside the sandbox. A non-zero code is a result, not an error. */
	exitCode: number;
	stdout: string;
	stderr: string;
}

export interface SandboxInfo {
	name: string;
	agent: string;
	/** Raw sbx status, for example `running` or `stopped`. */
	status: string;
	/** Host workspace directories, as reported by the tool. */
	workspaces: readonly string[];
	/** Absent when sbx does not report it (never defaulted). */
	cpus?: number;
	memoryMib?: number;
	createdAt?: string;
}

export interface NetworkRuleRequest {
	sandbox: string;
	/** `host:port` entries. Catch-all patterns are refused. */
	resources: readonly string[];
}

export interface SecretRequest {
	sandbox: string;
	/** Hosts WITHOUT a port (sbx limitation): the secret reaches every port of these hosts. */
	hosts: readonly string[];
	/** Environment variable that receives the placeholder inside the sandbox. */
	envVar: string;
	/** Caller-generated placeholder the sandbox sees; the proxy swaps in the real value. */
	placeholder: string;
	/** Shell command line whose standard output is the secret. The value never appears on a command line. */
	valueCommand: string;
}

/** Services of sbx built-in secrets (`sbx secret set --help`, sbx 0.49.2). */
export const SBX_SECRET_SERVICES = [
	'anthropic',
	'copilot',
	'cursor',
	'devin',
	'droid',
	'github',
	'google',
	'groq',
	'mistral',
	'nebius',
	'openai',
	'openrouter',
	'xai',
] as const;

export type SbxSecretService = (typeof SBX_SECRET_SERVICES)[number];

export interface ServiceSecretRequest {
	sandbox: string;
	service: SbxSecretService;
	/** The API key. Written to the standard input of sbx, never to a command line. */
	value: string;
}

export interface SecretRemoveRequest {
	sandbox: string;
	/** The placeholder passed to setSecret. */
	placeholder: string;
}

export interface CopyInRequest {
	sandbox: string;
	hostPath: string;
	sandboxPath: string;
}

export interface CopyOutRequest {
	sandbox: string;
	sandboxPath: string;
	hostPath: string;
}

export interface SandboxRuntime {
	create(request: CreateSandboxRequest): Promise<void>;
	exec(request: ExecRequest): Promise<ExecResult>;
	/** Stops the sandbox; its home directory and files survive, background processes do not. */
	stop(name: string): Promise<void>;
	/** Starts a stopped sandbox (no-op effect on a running one). */
	start(name: string): Promise<void>;
	/** Removes the sandbox and everything scoped to it (rules, secrets, VM-local files). */
	remove(name: string): Promise<void>;
	list(): Promise<SandboxInfo[]>;
	copyIn(request: CopyInRequest): Promise<void>;
	copyOut(request: CopyOutRequest): Promise<void>;
	allowNetwork(request: NetworkRuleRequest): Promise<void>;
	removeNetwork(request: NetworkRuleRequest): Promise<void>;
	setSecret(request: SecretRequest): Promise<void>;
	removeSecret(request: SecretRemoveRequest): Promise<void>;
	/** Stores an API key for a built-in sbx service, scoped to the sandbox (the proxy injects it, the VM never sees it). */
	setServiceSecret(request: ServiceSecretRequest): Promise<void>;
}
