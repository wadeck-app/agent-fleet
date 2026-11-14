import type { Project } from '@wadeck-app/project-sdk';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { RegisteredProjectFixture } from '../test-utils/RegisteredProjectFixture';
import { FixedWorkspaceProviders } from '../workspace/FixedWorkspaceProviders';
import { DEFAULT_BOUND_STEP_WAIT_MS, type WorkerTypeRouting } from './BoundStepWait';
import { CommandHandler } from './CommandHandler';
import { DeclaredGuarantees } from './DeclaredGuarantees';
import { SourceContactErrors } from './SourceContactErrors';
import { WorkerTypeCatalog } from './WorkerTypeCatalog';

// Every handler a test builds, so afterEach can cancel its pending demand re-check. That timer is a
// real one (unref'd, 250ms) and, left running, fires during a LATER test -- after `mockReset` has
// wiped the registry mocks -- and throws from inside a timer, which vitest reports as an unhandled error.
const startedHandlers: CommandHandler[] = [];

type HandlerArguments = ConstructorParameters<typeof CommandHandler>;
/** Position of `workerRouting`, the last constructor parameter. */
const ROUTING_INDEX = 19;
/** Position of `hostToolsPolicy`. */
const HOST_TOOLS_POLICY_INDEX = 20;

/** No source declares a worker type; a fresh store per handler, nothing shared between tests. */
export function emptyWorkerRouting(): WorkerTypeRouting {
	return {
		workerTypes: new WorkerTypeCatalog({ list: () => [] }, { isRequirementOnly: () => false }),
		boundStepWaitMs: DEFAULT_BOUND_STEP_WAIT_MS,
		contactErrors: new SourceContactErrors(),
		declaredGuarantees: new DeclaredGuarantees(
			{ list: () => [] },
			{ declaredGuarantees: async () => [] },
			() => {}
		),
	};
}

/** Position of `workspaceProviders`. */
const WORKSPACE_PROVIDERS_INDEX = 9;
/** Position of `resolvePerFlowWorkspaceProvider`. */
const PER_FLOW_RESOLVER_INDEX = 11;

/**
 * The stub provider (`mockAllocate`/`mockRelease` of the file) given to every handler that does not name its own
 * `workspaceProviders`; set by {@link registerCommandHandlerHooks}. Absent: the handler uses the real built-in providers.
 */
let defaultWorkspaceProviders: FixedWorkspaceProviders | undefined;

/** CommandHandler requires every argument; a test names the ones it cares about and gets `undefined` / an empty routing for the rest. */
export function completeArguments(args: Partial<HandlerArguments>): HandlerArguments {
	const complete: unknown[] = Array.from({ length: HOST_TOOLS_POLICY_INDEX + 1 }, (_, index) => args[index]);
	// A test that gives a per-flow resolver is about the real providers (built-ins and config instances): no stub then.
	if (args[PER_FLOW_RESOLVER_INDEX] === undefined) {
		complete[WORKSPACE_PROVIDERS_INDEX] ??= defaultWorkspaceProviders;
	}
	complete[ROUTING_INDEX] ??= emptyWorkerRouting();
	complete[HOST_TOOLS_POLICY_INDEX] ??= {
		mode: 'warn',
		description: 'warning (validation.hostToolsUnderConfinedProfile=warn, default)',
	};
	return complete as HandlerArguments;
}

/** A plain CommandHandler (not tracked for cleanup) for a test that manages its own handlers. */
export function newCommandHandler(...args: Partial<HandlerArguments>): CommandHandler {
	return new CommandHandler(...completeArguments(args));
}

export class TrackedCommandHandler extends CommandHandler {
	constructor(...args: Partial<HandlerArguments>) {
		super(...completeArguments(args));
		startedHandlers.push(this);
	}
}

/** A daemon-forked worker, which the default acceptance rules let take any step. */
export function forkedWorker(ws: unknown) {
	return {
		ws,
		worker: {
			state: 'idle',
			workerId: 'w-test',
			pid: 1,
			labels: [] as string[],
			attachedProjectIds: [] as string[],
			attachedProjects: [] as string[],
			hasUserInterface: false,
			ephemeral: true,
			shellCapabilities: [] as string[],
		},
	};
}

/** Stands in for both WorkerRegistry and WorkerProvisioner, which CommandHandler now takes. */
export function createMockWorkerPool() {
	// listIdle() is derived from getIdle() so a test only has to say which socket is idle.
	const pool = {
		// WorkerRegistry surface
		describe: vi.fn().mockReturnValue({ workerId: 'w-test', sourceId: 'built-in:fork', features: [] as string[] }),
		remove: vi.fn(),
		getIdle: vi.fn().mockReturnValue(undefined),
		listIdle: vi.fn((): unknown[] => {
			const ws: unknown = pool.getIdle();
			return ws === undefined ? [] : [forkedWorker(ws)];
		}),
		markBusy: vi.fn(),
		markIdle: vi.fn(),
		disconnect: vi.fn(),
		hasBusyWorkers: vi.fn().mockReturnValue(false),
		send: vi.fn(),
		broadcast: vi.fn(),
		register: vi.fn(),
		summarize: vi.fn().mockReturnValue([]),
		// What a test says is connected through summarize() is what the acceptance rules are asked about.
		listConnected: vi.fn((): unknown[] => pool.summarize() as unknown[]),
		// WorkerProvisioner surface
		canProvision: vi.fn().mockReturnValue(false),
		planProvisioning: vi.fn().mockReturnValue({ fork: 0 }),
		provision: vi.fn().mockResolvedValue(undefined),
		registerWorker: vi.fn().mockReturnValue(true),
	};
	return pool;
}

export const VALID_FLOW_YAML = `\
id: test-flow
version: "1.0.0"
name: Test Flow
description: Test
workspace: in-place
inputs: {}
steps:
  - id: s1
    name: S1
    type: script
    script: echo hello
`;

export const TWO_STEP_FLOW_YAML = `\
id: two-step-flow
version: "1.0.0"
name: Two Step Flow
description: Two steps
workspace: in-place
inputs: {}
steps:
  - id: s1
    name: S1
    type: script
    script: echo hello
  - id: s2
    name: S2
    type: script
    script: echo world
    depends:
      - s1
`;

export const RETRY_FLOW_YAML = `\
id: retry-flow
version: "1.0.0"
name: Retry Flow
description: Flow with retry
workspace: in-place
inputs: {}
steps:
  - id: s1
    name: S1
    type: script
    script: echo hello
    retry:
      maxAttempts: 1
      backoff: linear
`;

export const INVALID_DEPS_FLOW_YAML = `\
id: test
version: "1.0.0"
name: x
description: x
workspace: in-place
inputs: {}
steps:
  - id: s1
    name: s1
    type: script
    script: echo
    depends:
      - nonexistent
`;

export const USER_INTERVENTION_FLOW_YAML = `\
id: test-flow
version: "1.0.0"
name: Test Flow
description: Test
workspace: in-place
inputs: {}
steps:
  - id: s1
    name: S1
    type: script
    script: echo hello
  - id: approve
    name: Approve
    type: user_intervention
    interventionType: approval
    depends:
      - s1
    approval:
      title: Approve
      description: Please review
`;

export let tmpDir: string;
export let daemonDir: string;
/** The project registered (through the SDK, in a throwaway registry) with `tmpDir` as its folder: every `handleRun({ cwd: tmpDir })` resolves to it. */
export let registeredProject: Project;
let projectRegistry: RegisteredProjectFixture;

/**
 * For test files that manage their own tmp dir: points this process at a throwaway project registry and registers `folder`
 * in it, so `handleRun({ cwd: folder })` resolves to the returned project. Call `dispose()` in afterEach.
 */
export async function registerFolderAsProject(folder: string): Promise<{ project: Project; dispose: () => void }> {
	const fixture = new RegisteredProjectFixture().useAsProcessEnv();
	try {
		const project = await fixture.register('test-project', { folder });
		return { project, dispose: () => fixture.dispose() };
	} catch (error) {
		fixture.dispose();
		throw error;
	}
}

export const mockExecStore = {
	create: vi.fn(),
	read: vi.fn().mockReturnValue({ steps: {} }),
	exists: vi.fn().mockReturnValue(false),
	markStepRunning: vi.fn(),
	markStepCompleted: vi.fn(),
	markStepFailed: vi.fn(),
	markStepSkipped: vi.fn(),
	markStepsPending: vi.fn(),
	markExecutionCompleted: vi.fn(),
	markExecutionFailed: vi.fn(),
	markExecutionResumed: vi.fn(),
	pruneOldExecutions: vi.fn(),
	update: vi.fn(),
};

export const mockLogWriter = {
	write: vi.fn(),
	writeExecution: vi.fn(),
};

/** State shared with the per-file vi.hoisted/vi.mock of 'node:os' and 'flow-engine' (hoisted per test file). */
export interface CommandHandlerHarnessMocks {
	mockAllocate: ReturnType<typeof vi.fn>;
	mockRelease: ReturnType<typeof vi.fn>;
	hoistedState: { actualHomedir: string };
}

/** Registers the tmpDir/daemonDir lifecycle and mock resets; call once at the top level of each test file. */
export function registerCommandHandlerHooks({
	mockAllocate,
	mockRelease,
	hoistedState,
}: CommandHandlerHarnessMocks): void {
	defaultWorkspaceProviders = new FixedWorkspaceProviders({
		allocate: (...allocateArguments: unknown[]) =>
			(mockAllocate as (...a: unknown[]) => unknown)(...allocateArguments),
		release: (...releaseArguments: unknown[]) => (mockRelease as (...a: unknown[]) => unknown)(...releaseArguments),
	} as never);
	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-handler-test-'));
		daemonDir = path.join(tmpDir, 'daemon');
		fs.mkdirSync(daemonDir, { recursive: true });
		projectRegistry = new RegisteredProjectFixture().useAsProcessEnv();
		registeredProject = await projectRegistry.register('harness-project', { folder: tmpDir });
		vi.clearAllMocks();
		vi.mocked(os.homedir).mockReturnValue(hoistedState.actualHomedir);
		// Under the real temp dir: the daemon creates the .meta/outputs folder next to the handle's path.
		mockAllocate.mockResolvedValue({ path: path.join(tmpDir, 'test-workspace'), id: 'ws-test-id' });
		mockRelease.mockResolvedValue(undefined);
	});

	afterEach(() => {
		// Must run before the mocks are reset/restored, see startedHandlers.
		for (const handler of startedHandlers.splice(0)) handler.stopBackgroundWork();
		vi.restoreAllMocks();
		projectRegistry.dispose();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});
}

export function makeHandler(workerPool = createMockWorkerPool()): CommandHandler {
	return new TrackedCommandHandler(
		daemonDir,
		workerPool as never,
		workerPool as never,
		undefined,
		mockExecStore as never,
		mockLogWriter as never
	);
}
