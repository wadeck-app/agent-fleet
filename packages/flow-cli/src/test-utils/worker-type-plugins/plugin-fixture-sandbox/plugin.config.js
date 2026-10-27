// Test fixture: a worker-type plugin written the way a third party must ship one -- plain, self-contained
// ES module JS, no imports. Tests read and steer it through `globalThis.__workerTypeFixture`.
//
// Implementations of the "worker-type" point:
//   sandbox  builds an instance that records every call
//   slow     like sandbox, but its factory resolves only when a test calls state.pendingBuilds.shift()()
//   hangs    whose factory never settles
//   throws   whose factory rejects
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
	};
	return globalThis.__workerTypeFixture;
}

function makeInstance(context) {
	const recorded = state();
	recorded.created.push(context);
	return {
		source: {
			obtainWorker: async request => {
				recorded.obtained.push({ sourceId: context.sourceId, request });
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
			invalid: {
				version: 1,
				provider: async () => ({ nothing: true }),
			},
		},
	},
};
