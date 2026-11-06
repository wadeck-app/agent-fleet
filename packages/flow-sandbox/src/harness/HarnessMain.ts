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
import { BridgeTokenGuard } from './BridgeTokenGuard';
import { CredentialedSandboxPreparer } from './CredentialedSandboxPreparer';
import { DaemonLink } from './DaemonLink';
import { EnvironmentCommandRunner } from './EnvironmentCommandRunner';
import { HarnessBridge } from './HarnessBridge';
import { type HarnessConfig, HarnessConfigParser } from './HarnessConfig';
import { HarnessWrapper } from './HarnessWrapper';
import { SandboxInnerWorkerLauncher } from './InnerWorkerLauncher';
import { RelayRegistration } from './RelayRegistration';

/** Version string the harness reports to the daemon (`flow worker list`). */
const HARNESS_VERSION = 'sandbox-harness-m4';

/**
 * Entry of the development harness (M4): `node --import tsx packages/flow-sandbox/scripts/HarnessWrapper.mjs <options>`,
 * launched by a built-in:command source. Resolves when the harness is over; a configuration error or a failed
 * prerequisite rejects with a message that says what to do.
 */
export async function runHarness(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<void> {
	const config = new HarnessConfigParser().parse(argv, env, PresenceDirectory.defaultPath(os.homedir()));
	const log = new WrapperLog('harness', config.logFile);
	log.info(
		`starting: wrapper ${config.wrapperId}, source ${config.sourceId}, projects ${config.projectIds.join(',')}, labels ${config.labels.join(',')}, image ${config.image ?? '(agent default)'}`
	);
	// The daemon may start a second wrapper while the first one is still starting (it asks its sources again when a
	// worker is slow to arrive): the wrapper id is the lock, taken before anything slow happens.
	const presence = new WrapperPresence(config.presenceDirectory, isProcessAlive, process.pid);
	if (presence.isWrapperAlive(config.wrapperId)) {
		throw new Error(
			`A harness with wrapper id "${config.wrapperId}" is already running (presence file in ${config.presenceDirectory}). Only one wrapper per id may run; this launch exits. Use another --wrapper-id for a second harness.`
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

		const secretsDirectory = fs.mkdtempSync(
			path.join(os.tmpdir(), `flow-sbx-harness-secrets-${config.wrapperId}-`)
		);
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

		const tokens = new BridgeTokenGuard();
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

		let finish: () => void = () => undefined;
		const finished = new Promise<void>(resolve => (finish = resolve));
		const wrapper = new HarnessWrapper({
			registration: new RelayRegistration({
				attachedProjectIds: config.projectIds,
				attachedProjects: config.projectPaths,
				labels: config.labels,
				authToken: config.workerToken,
				sourceId: config.sourceId,
				pid: process.pid,
				version: HARNESS_VERSION,
			}),
			lifecycle,
			preparer: new CredentialedSandboxPreparer({
				runtime,
				endpoint,
				tokens,
				log,
				platform: process.platform,
				secretsDirectory,
				profileAlias: config.profileAlias,
				region: config.region,
				modelEnvironment: config.modelEnvironment,
				extraAllowedHosts: config.extraAllowedHosts,
			}),
			launcher: new SandboxInnerWorkerLauncher(runtime, log),
			log,
			createBridge: handlers => new HarnessBridge({ tokens, log, ...handlers }),
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
			'harness stopped; a sandbox of the run, if any, is left STOPPED: `leftover list`, then `leftover remove <name>`.'
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

export type { HarnessConfig };
