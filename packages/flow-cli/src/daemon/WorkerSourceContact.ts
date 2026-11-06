import type { WorkerSourceProvider } from 'extension-points';
import { normalizeError } from 'shared-common/utils/getErrorMessage';

import { type CommandSourceOptions, CommandWorkerSource } from './CommandWorkerSource.js';
import { buildCommandWorkerType } from './CommandWorkerTypePlugin.js';
import { InboundWorkerSource } from './InboundWorkerSource.js';
import { buildInboundWorkerType } from './InboundWorkerTypePlugin.js';
import type { RegisteredRelay } from './RelayRegistry.js';
import { buildRelayWorkerType } from './RelayWorkerTypePlugin.js';
import type { ContactOutcome } from './SourceContactErrors.js';
import { FORK_PROVIDER_NAME, storedForkProviderMessage } from './WorkerSourceForkRule.js';
import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';
import type { WorkerTypeHost, WorkerTypeInstances } from './WorkerTypeInstances.js';

// Re-exported: the command source moved to its own file with its worker-type plugin.
export { CommandWorkerSource, InboundWorkerSource, type CommandSourceOptions };

/** The S1 implementations that ship with flow. */
const BUILT_IN_INBOUND = 'built-in:inbound';
const BUILT_IN_COMMAND = 'built-in:command';
const BUILT_IN_RELAY = 'built-in:relay';

/** What an implementation may need from the daemon to reach its source. */
export interface SourceProviderDependencies {
	/** Looks up the live connection for a source, for the relay provider (D#17). */
	findRelay?: (sourceId: string) => RegisteredRelay | undefined;
	/**
	 * Mints the one-shot credential a launched worker registers with (T-09).
	 *
	 * Optional so a command declared with its own `--token` keeps working; when absent, nothing is
	 * minted and the command is responsible for its own credential.
	 */
	issueLaunchToken?: (sourceId: string) => string;
	/** Told how each ask of a source ended, so the last error of a source can be shown when no worker of its type came. */
	contactOutcome?: ContactOutcome;
	/** Gives back a credential minted by `issueLaunchToken` when the launch it was for failed. */
	revokeLaunchToken?: (sourceId: string, token: string) => void;
	/** Builds and keeps the worker-type instance of each plugin source; without it a plugin source cannot be served. */
	workerTypes?: Pick<WorkerTypeInstances, 'get'>;
	/**
	 * True when the ask is not on behalf of a run bound to the source's type: a source whose instance declares itself
	 * exclusive is then built but NOT asked for a worker, because its workers serve nothing else (a sandbox started for no
	 * run would sit idle, or worse be mistaken for capacity). A source whose build fails is not asked either.
	 */
	skipExclusive?: boolean;
}

/**
 * Builds the S1 implementation named by a source entry.
 *
 * @throws on an unrecognised provider. There is deliberately no fallback: silently
 *         treating a typo as the inbound provider would look exactly like a worker that
 *         never turns up, which is the least debuggable failure available.
 */
export function resolveSourceProvider(
	provider: string,
	options: CommandSourceOptions,
	dependencies: SourceProviderDependencies = {},
	nudgeUrl?: string
): WorkerSourceProvider {
	switch (provider) {
		case BUILT_IN_INBOUND:
			// The same construction the inbound worker-type plugin uses.
			// Remove this case once resolution can be async (the plugin factory is async; this function is not).
			return buildInboundWorkerType(nudgeUrl).source;
		case BUILT_IN_COMMAND:
			// The same construction the command worker-type plugin uses.
			// Remove this case once resolution can be async (the plugin factory is async; this function is not).
			return buildCommandWorkerType(
				options,
				dependencies.issueLaunchToken,
				undefined,
				dependencies.revokeLaunchToken
			).source;
		case BUILT_IN_RELAY: {
			const { findRelay } = dependencies;
			if (findRelay === undefined) {
				// Refused rather than degraded: a relay source with no way to reach relays would
				// silently produce nothing, which is indistinguishable from a relay that is
				// merely offline.
				throw new Error(
					`provider ${BUILT_IN_RELAY} needs the daemon's relay registry, which was not supplied. This is a wiring mistake in the daemon, not a configuration error -- please report it.`
				);
			}
			// The same construction the relay worker-type plugin uses: one path for both ways of declaring a relay.
			// Remove this case once resolution can be async (the plugin factory is async; this function is not).
			return buildRelayWorkerType(findRelay).source;
		}
		default:
			throw new Error(
				`unknown worker source provider "${provider}". Supported in v1: ${BUILT_IN_INBOUND}, ${BUILT_IN_COMMAND}, ${BUILT_IN_RELAY}.`
			);
	}
}

/**
 * The provider that obtains workers for an entry: its plugin instance (built once, then reused) when it names a
 * plugin, else the built-in one; undefined when the ask must skip an exclusive source (see `skipExclusive`). A plugin ref is
 * never read as a provider name, so an unknown provider still throws.
 */
async function providerOf(
	entry: WorkerSourceEntry,
	dependencies: SourceProviderDependencies
): Promise<WorkerSourceProvider | undefined> {
	if (entry.plugin === undefined) {
		// Said apart from "unknown provider": the user must remove the source, not fix a typo.
		if (entry.provider === FORK_PROVIDER_NAME) {
			throw new Error(storedForkProviderMessage(entry.sourceId));
		}
		return resolveSourceProvider(
			entry.provider,
			(entry.options ?? {}) as CommandSourceOptions,
			dependencies,
			entry.nudgeUrl
		);
	}
	const { workerTypes } = dependencies;
	if (workerTypes === undefined) {
		throw new Error(
			`source declares plugin "${entry.plugin}" but the daemon was not wired to load worker-type plugins. This is a wiring mistake in the daemon, not a configuration error -- please report it.`
		);
	}
	// Lent to built-in worker types only (WorkerTypeInstances): a plugin loaded from disk never sees it.
	const host: WorkerTypeHost = {
		...(dependencies.findRelay === undefined ? {} : { findRelay: dependencies.findRelay }),
		...(dependencies.issueLaunchToken === undefined ? {} : { issueLaunchToken: dependencies.issueLaunchToken }),
		...(dependencies.revokeLaunchToken === undefined ? {} : { revokeLaunchToken: dependencies.revokeLaunchToken }),
	};
	const instance = await workerTypes.get(entry, host);
	return dependencies.skipExclusive === true && instance.exclusive === true ? undefined : instance.source;
}

/** The message of whatever was thrown; a value whose message cannot be read must not reject the whole contact. */
function messageOf(err: unknown): string {
	try {
		return String(normalizeError(err).message);
	} catch {
		return 'an error whose message could not be read';
	}
}

/**
 * Asks every declared source to produce a worker, at daemon startup (D#54).
 *
 * The daemon pushes; a worker never polls. Nothing here pins the daemon (D#51) and
 * nothing waits for a worker to appear -- a source that produces none simply has no live
 * connection, and dispatch only ever targets live connections (D#4).
 *
 * One failing source never prevents the others from being contacted, and never passes
 * unnoticed: each failure is reported by source name (D#25).
 */
export async function contactDeclaredSources(
	entries: WorkerSourceEntry[],
	daemonEndpoint: string,
	report: (message: string) => void,
	dependencies: SourceProviderDependencies = {}
): Promise<void> {
	// Concurrently: a plugin source can hang while it loads or answers, and the sources after it must not wait for it.
	await Promise.all(
		entries.map(async entry => {
			try {
				const provider = await providerOf(entry, dependencies);
				if (provider === undefined) {
					return;
				}
				await provider.obtainWorker({
					daemonEndpoint,
					sourceId: entry.sourceId,
					projects: [],
				});
				dependencies.contactOutcome?.succeeded(entry.sourceId);
			} catch (err) {
				// Read once, for the report and the daemon log only: the outcome sink gets the fact of the failure, never the text.
				const message = messageOf(err);
				// Recording the failure must never cost the report: a sink that throws is itself reported.
				try {
					dependencies.contactOutcome?.failed(entry.sourceId);
				} catch (recordingError) {
					report(
						`could not record the contact failure of source "${entry.sourceId}": ${messageOf(recordingError)}`
					);
				}
				report(`could not obtain a worker from source "${entry.sourceId}": ${message}`);
			}
		})
	);
}
