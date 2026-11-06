import { flowConfigDir } from 'flow-cli/src/config/FlowConfigDir';
import { WorkerAdapter } from 'flow-cli/src/worker/WorkerAdapter';
import { StepRunner, type StepRunnerConfig } from 'flow-engine';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { AwsCredentialExporter } from '../AwsCredentialExporter';
import { CleanupStack } from '../CleanupStack';
import { CrashGuard } from '../CrashGuard';
import { HostCredentialEndpoint } from '../HostCredentialEndpoint';
import { LeftoverSandboxes } from '../LeftoverSandboxes';
import { NodeCommandRunner } from '../NodeCommandRunner';
import { PresenceDirectory } from '../PresenceDirectory';
import { isProcessAlive } from '../ProcessLiveness';
import { RunMounts } from '../RunMounts';
import { SandboxCapacity } from '../SandboxCapacity';
import { SandboxLifecycle } from '../SandboxLifecycle';
import type { SandboxLog } from '../SandboxLog';
import { SbxCliRuntime } from '../SbxCliRuntime';
import { SbxPrerequisiteCheck } from '../SbxPrerequisiteCheck';
import { StaleTempSweep } from '../StaleTempSweep';
import { SystemClock } from '../SystemClock';
import { SystemScheduler } from '../SystemScheduler';
import { WrapperLog } from '../WrapperLog';
import { WrapperPresence } from '../WrapperPresence';
import { DaemonLink } from '../harness/DaemonLink';
import { EnvironmentCommandRunner } from '../harness/EnvironmentCommandRunner';
import { HarnessConfigParser } from '../harness/HarnessConfig';
import { RelayRegistration } from '../harness/RelayRegistration';
import { ExecSandboxPreparer } from './ExecSandboxPreparer';
import { ExecWrapper, type StepExecutor } from './ExecWrapper';
import { FlowSourceLookup } from './FlowSourceLookup';
import { McpCallbackRules } from './McpCallbackRules';
import { SbxProcessLauncher } from './SbxProcessLauncher';
import { StepCommandTranslator } from './StepCommandTranslator';
import { VmEnvironmentFilter } from './VmEnvironmentFilter';
import { VmExecutableLookup } from './VmExecutableLookup';
import { VmFileStager } from './VmFileStager';
import { WorkerTypePreflight } from './WorkerTypePreflight';

/** Version string the wrapper reports to the daemon (`flow worker list`). */
const EXEC_VERSION = 'sandbox-exec-m7';

/**
 * Entry of the exec variant (milestone M7): `node --import tsx packages/flow-sandbox/scripts/ExecWrapper.mjs <options>`,
 * launched by a built-in:command source. The options are the ones of the relay harness (HarnessConfigParser).
 * Resolves when the wrapper is over; a configuration error or a failed prerequisite rejects with a message that says what
 * to do. The wiring itself has no unit test (like HarnessMain); the live check covers it.
 */
export async function runExecWrapper(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<void> {
	const config = new HarnessConfigParser('ExecWrapper.mjs').parse(
		argv,
		env,
		PresenceDirectory.defaultPath(os.homedir())
	);
	// The launch credential was read into the config: no program started from here on inherits it.
	delete env['FLOW_WORKER_TOKEN'];
	const log = new WrapperLog('exec', config.logFile);
	log.info(
		`starting: wrapper ${config.wrapperId}, source ${config.sourceId}, projects ${config.projectIds.join(',')}, labels ${config.labels.join(',')}, image ${config.image ?? '(agent default)'}`
	);
	// What the wrapper can know about its routing: how its source was declared (never the flow). One line, a warning unless the source has a plugin ref.
	new WorkerTypePreflight({
		sourceId: config.sourceId,
		lookup: () => new FlowSourceLookup(flowConfigDir()).find(config.sourceId),
		log,
	}).run();
	// The daemon may start a second wrapper while the first one is still starting: the wrapper id is the lock.
	const presence = new WrapperPresence(config.presenceDirectory, isProcessAlive, process.pid);
	if (presence.isWrapperAlive(config.wrapperId)) {
		throw new Error(
			`An exec wrapper with wrapper id "${config.wrapperId}" is already running (presence file in ${config.presenceDirectory}). Only one wrapper per id may run; this launch exits. Use another --wrapper-id for a second wrapper.`
		);
	}
	// What a hard-killed earlier wrapper left in the temp directory (secret directories) goes now, each removal logged.
	new StaleTempSweep({ tempDirectory: os.tmpdir(), presence, clock: new SystemClock(), log }).run();
	presence.publish(config.wrapperId, undefined);
	// Everything acquired from here on is released by this stack, whatever fails later (prerequisites, startup, run).
	const cleanup = new CleanupStack(log);
	// A crash (uncaught exception, unhandled rejection) must not leave the VM running or the port and secrets behind.
	new CrashGuard({
		source: { on: (event, listener) => process.on(event, listener) },
		cleanup,
		log,
		exit: code => process.exit(code),
	}).install();
	cleanup.add('withdraw the presence file', () => presence.withdraw(config.wrapperId));
	try {
		const runtime = new SbxCliRuntime();
		await requirePrerequisites(runtime, log, config.acceptSshAgentForwarding);
		const leftovers = new LeftoverSandboxes(runtime, new SystemClock(), log, presence);
		await leftovers.reportAtStart();
		await leftovers.reapOwn(config.wrapperId, new Set());

		const secretsDirectory = fs.mkdtempSync(path.join(os.tmpdir(), `flow-sbx-exec-secrets-${config.wrapperId}-`));
		cleanup.add('remove the secrets directory', () =>
			fs.rmSync(secretsDirectory, { recursive: true, force: true })
		);
		const endpoint = new HostCredentialEndpoint({
			source: new AwsCredentialExporter({
				commandRunner: new EnvironmentCommandRunner(new NodeCommandRunner(), config.awsEnvironment),
			}),
			profiles: { [config.profileAlias]: config.hostProfile },
			log,
			wallClock: () => new Date(),
		});
		await endpoint.start();
		cleanup.add('stop the credential endpoint', () => endpoint.stop());

		const lifecycle = new SandboxLifecycle(
			{
				wrapperId: config.wrapperId,
				agent: config.agent,
				cpus: config.cpus,
				memory: config.memory,
				idleStopMinutes: config.idleStopMinutes,
				...(config.image === undefined ? {} : { image: config.image }),
				...(config.pull === undefined ? {} : { pull: config.pull }),
			},
			{
				runtime,
				scheduler: new SystemScheduler(),
				log,
				capacity: new SandboxCapacity(runtime, config.maxConcurrentSandboxes),
				presence,
			}
		);

		const lookup = new VmExecutableLookup(runtime);
		const mcpRules = new McpCallbackRules(runtime, log);
		const hostEnvironment = new VmEnvironmentFilter(process.env);

		let finish: () => void = () => undefined;
		const finished = new Promise<void>(resolve => (finish = resolve));
		const wrapper = new ExecWrapper({
			registration: new RelayRegistration({
				attachedProjectIds: config.projectIds,
				attachedProjects: config.projectPaths,
				labels: config.labels,
				authToken: config.workerToken,
				sourceId: config.sourceId,
				pid: process.pid,
				version: EXEC_VERSION,
			}),
			lifecycle,
			preparer: new ExecSandboxPreparer({
				runtime,
				endpoint,
				log,
				platform: process.platform,
				secretsDirectory,
				profileAlias: config.profileAlias,
				region: config.region,
				modelEnvironment: config.modelEnvironment,
				extraAllowedHosts: config.extraAllowedHosts,
			}),
			createExecutor: async ({ sandbox, mounts, stopSandbox, ensureRunning, declaredEnvironmentNames }) => {
				await lookup.prime(sandbox);
				const launcher = new SbxProcessLauncher({
					runtime,
					sandbox,
					translator: new StepCommandTranslator({
						mounts,
						stager: new VmFileStager({
							runtime,
							log,
							hostTempDirectory: os.tmpdir(),
							hostNodePath: process.execPath,
							platform: process.platform,
						}),
						environment: hostEnvironment,
						hostNodePath: process.execPath,
						log,
						declaredEnvironmentNames,
					}),
					lookup,
					mcpRules,
					log,
					stopSandbox,
					ensureRunning,
				});
				// The same engine as `flow worker`: WorkerAdapter + StepRunner, with the sandbox launcher as the one injection point.
				const adapter = new WorkerAdapter(mcpServers => {
					const stepRunnerConfig = {
						interactive: false,
						processLauncher: launcher,
						...(mcpServers.length > 0 ? { mcpServers } : {}),
					} as StepRunnerConfig;
					return new StepRunner(stepRunnerConfig);
				});
				const executor: StepExecutor = {
					execute: (stepConfig, executionContext, send) =>
						adapter.execute(
							stepConfig as unknown as Parameters<WorkerAdapter['execute']>[0],
							executionContext as unknown as Parameters<WorkerAdapter['execute']>[1],
							send as unknown as Parameters<WorkerAdapter['execute']>[2]
						) as unknown as ReturnType<StepExecutor['execute']>,
				};
				return executor;
			},
			log,
			createDaemon: handlers => new DaemonLink({ url: config.daemonUrl, log, ...handlers }),
			createMounts: (workspaceDir, workspaceMetaDir) =>
				new RunMounts({ workspaceDir, workspaceMetaDir, platform: process.platform, log }),
			now: () => Date.now(),
			onFinished: () => finish(),
		});

		for (const signal of ['SIGINT', 'SIGTERM'] as const) {
			process.on(signal, () => {
				void wrapper.shutdown(`received ${signal}`).then(() => finish());
			});
		}
		cleanup.add('shut the wrapper down', () => wrapper.shutdown('exit'));
		await wrapper.start();
		await finished;
	} finally {
		await cleanup.runAll();
		log.info(
			'exec wrapper stopped; a sandbox of the run, if any, is left STOPPED: `leftover list`, then `leftover remove <name>`.'
		);
	}
}

async function requirePrerequisites(
	runtime: SbxCliRuntime,
	log: SandboxLog,
	acceptSshAgentForwarding: boolean
): Promise<void> {
	const report = await new SbxPrerequisiteCheck(runtime, { acceptSshAgentForwarding }).run();
	for (const finding of report.findings) {
		if (finding.severity === 'warning' || finding.severity === 'error')
			log.warn(`${finding.id}: ${finding.message}`);
		else log.info(`${finding.id}: ${finding.message}`);
	}
	if (!report.ok) {
		throw new Error('The sandbox prerequisites are not met (see the findings above); nothing was started.');
	}
}
