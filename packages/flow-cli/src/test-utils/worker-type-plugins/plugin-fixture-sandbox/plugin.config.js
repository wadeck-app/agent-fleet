// Test fixture: a worker-type plugin written the way a third party must ship one -- plain, self-contained
// ES module JS, no imports. Tests read and steer it through `globalThis.__workerTypeFixture`.
//
// Implementations of the "worker-type" point:
//   sandbox  builds an instance that records every call
//   slow     like sandbox, but its factory resolves only when a test calls state.pendingBuilds.shift()()
//   hangs    whose factory never settles
//   throws   whose factory rejects
//   configerror  whose factory rejects with an error NAMED PluginConfigurationError (a plain Error: a plugin from disk cannot import the class)
//   exclusive  like sandbox, but the instance declares exclusive: true
//   exclusiveconfined  exclusive, and guarantees exclusive-only (manifest and instance)
//   badexclusive  like sandbox, but exclusive is the string 'yes' (refused)
//   invalid  whose factory returns something that is not a worker-type instance

function state() {
	// Tests replace it with a fresh one (see WorkerTypeFixture.ts); this default only serves a manual import.
	globalThis.__workerTypeFixture ??= {
		created: [],
		obtained: [],
		runEnded: [],
		disposed: [],
		pendingBuilds: [],
		failDispose: false,
		hangDispose: false,
		failRunEnded: false,
		failObtain: false,
		failObtainEmbeddingRequest: false,
	};
	return globalThis.__workerTypeFixture;
}

function makeInstance(context, extra = {}) {
	const recorded = state();
	recorded.created.push(context);
	return {
		...extra,
		source: {
			obtainWorker: async request => {
				recorded.obtained.push({ sourceId: context.sourceId, request });
				if (recorded.failObtainEmbeddingRequest) {
					throw new Error(`obtain failed for ${JSON.stringify(request)}`);
				}
				if (recorded.failObtain) {
					throw new Error('fixture obtain failure: docker is not running');
				}
				if (recorded.obtainReturns !== undefined) {
					return recorded.obtainReturns.value;
				}
			},
		},
		run: {
			onRunEnded: async event => {
				recorded.runEnded.push({ sourceId: context.sourceId, event });
				if (recorded.failRunEnded) {
					throw new Error('fixture onRunEnded failure');
				}
			},
		},
		dispose: async () => {
			recorded.disposed.push(context.sourceId);
			if (recorded.hangDispose) {
				await new Promise(() => {});
			}
			if (recorded.failDispose) {
				throw new Error('fixture dispose failure');
			}
		},
	};
}

export const manifest = {
	pluginId: 'fixture-sandbox',
	manifestVersion: '1',
	implementations: {
		'worker-type': {
			sandbox: {
				version: 1,
				provider: async context => makeInstance(context),
			},
			slow: {
				version: 1,
				provider: context =>
					new Promise(resolve => {
						state().pendingBuilds.push(() => resolve(makeInstance(context)));
					}),
			},
			hangs: {
				version: 1,
				provider: () => new Promise(() => {}),
			},
			throws: {
				version: 1,
				provider: async () => {
					throw new Error('fixture factory failure');
				},
			},
			configerror: {
				version: 1,
				provider: async () => {
					const error = new Error('fixture says the options are wrong. Fix: change them.');
					error.name = 'PluginConfigurationError';
					throw error;
				},
			},
			exclusive: {
				version: 1,
				provider: async context => makeInstance(context, { exclusive: true }),
			},
			badexclusive: {
				version: 1,
				provider: async context => makeInstance(context, { exclusive: 'yes' }),
			},
			confined: {
				version: 1,
				guarantees: ['sandbox', 'fs=confined', 'env=clean'],
				provider: async context => makeInstance(context, { guarantees: ['fs=confined', 'env=clean'] }),
			},
			exclusiveconfined: {
				version: 1,
				guarantees: ['exclusive-only'],
				provider: async context => makeInstance(context, { exclusive: true, guarantees: ['exclusive-only'] }),
			},
			overclaim: {
				version: 1,
				guarantees: ['fs=confined'],
				provider: async context => makeInstance(context, { guarantees: ['fs=confined', 'net=filtered'] }),
			},
			badguarantees: {
				version: 1,
				guarantees: ['fs=confined'],
				provider: async context => makeInstance(context, { guarantees: 'fs=confined' }),
			},
			badmanifestguarantees: {
				version: 1,
				guarantees: ['fs = confined'],
				provider: async context => makeInstance(context),
			},
			undeclaredguarantees: {
				version: 1,
				provider: async context => makeInstance(context, { guarantees: ['fs=confined'] }),
			},
			invalid: {
				version: 1,
				provider: async () => ({ nothing: true }),
			},
		},
	},
};
