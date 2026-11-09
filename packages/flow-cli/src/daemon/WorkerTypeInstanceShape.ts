import type { WorkerTypeInstance } from 'extension-points';

import { LaunchCredentialSource } from './LaunchCredentialSource.js';

/** The same instance, its source wrapped so every ask carries a launch credential minted by the daemon. */
export function withLaunchCredential(
	instance: WorkerTypeInstance,
	host: {
		issueLaunchToken?: ((sourceId: string) => string) | undefined;
		revokeLaunchToken?: ((sourceId: string, token: string) => void) | undefined;
	}
): WorkerTypeInstance {
	return {
		...(instance.exclusive === undefined ? {} : { exclusive: instance.exclusive }),
		...(instance.guarantees === undefined ? {} : { guarantees: instance.guarantees }),
		...(instance.workspaces === undefined ? {} : { workspaces: instance.workspaces }),
		source: new LaunchCredentialSource(instance.source, host.issueLaunchToken, host.revokeLaunchToken),
		...(instance.run === undefined ? {} : { run: instance.run }),
		dispose: () => instance.dispose(),
	};
}

export function assertWorkerTypeInstance(candidate: unknown): asserts candidate is WorkerTypeInstance {
	const instance = candidate as Partial<WorkerTypeInstance> | null | undefined;
	if (typeof instance?.source?.obtainWorker !== 'function' || typeof instance.dispose !== 'function') {
		throw new Error(
			'its factory must resolve to { source: { obtainWorker() }, dispose() } (and optionally run: { onRunEnded() })'
		);
	}
	if (instance.run !== undefined && typeof instance.run.onRunEnded !== 'function') {
		throw new Error('its instance has a "run" without an onRunEnded() function');
	}
	if (instance.exclusive !== undefined && typeof instance.exclusive !== 'boolean') {
		throw new Error(
			`its instance has an "exclusive" that is not a boolean (got ${JSON.stringify(instance.exclusive)}). Fix: remove it (deprecated), and declare the guarantees of the source instead: a source that declares guarantees serves only steps that require them.`
		);
	}
}
