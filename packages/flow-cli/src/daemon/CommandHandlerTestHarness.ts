import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { CommandHandler } from './CommandHandler';

// Every handler a test builds, so afterEach can cancel its pending demand re-check. That timer is a
// real one (unref'd, 250ms) and, left running, fires during a LATER test -- after `mockReset` has
// wiped the registry mocks -- and throws from inside a timer, which vitest reports as an unhandled error.
const startedHandlers: CommandHandler[] = [];

export class TrackedCommandHandler extends CommandHandler {
	constructor(...args: ConstructorParameters<typeof CommandHandler>) {
		super(...args);
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
		describe: vi.fn().mockReturnValue({ workerId: 'w-test', sourceId: 'built-in:fork' }),
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
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
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
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
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
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
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
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
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
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
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

export const mockExecStore = {
	create: vi.fn(),
	read: vi.fn().mockReturnValue({ steps: {} }),
	exists: vi.fn().mockReturnValue(false),
	markStepRunning: vi.fn(),
	markStepCompleted: vi.fn(),
	markStepFailed: vi.fn(),
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
	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-handler-test-'));
		daemonDir = path.join(tmpDir, 'daemon');
		fs.mkdirSync(daemonDir, { recursive: true });
		vi.clearAllMocks();
		vi.mocked(os.homedir).mockReturnValue(hoistedState.actualHomedir);
		mockAllocate.mockResolvedValue({ path: '/tmp/test-workspace', id: 'ws-test-id' });
		mockRelease.mockResolvedValue(undefined);
	});

	afterEach(() => {
		// Must run before the mocks are reset/restored, see startedHandlers.
		for (const handler of startedHandlers.splice(0)) handler.stopBackgroundWork();
		vi.restoreAllMocks();
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
