import type { RunEndEvent } from 'extension-points';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute directory holding `plugin-fixture-sandbox/` (see plugin.config.js there for the implementations). */
export const FIXTURE_PLUGINS_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)), 'worker-type-plugins');

/** Everything the fixture plugin records, and the switches that make it fail. */
export interface WorkerTypeFixtureState {
	created: { sourceId: string; options: unknown }[];
	obtained: { sourceId: string; request: unknown }[];
	runEnded: { sourceId: string; event: RunEndEvent }[];
	disposed: string[];
	failDispose: boolean;
	failRunEnded: boolean;
}

/** The fixture's recorder, reset to empty. Call in `beforeEach`: the plugin module itself is cached by the importer. */
export function resetWorkerTypeFixture(): WorkerTypeFixtureState {
	const fresh: WorkerTypeFixtureState = {
		created: [],
		obtained: [],
		runEnded: [],
		disposed: [],
		failDispose: false,
		failRunEnded: false,
	};
	(globalThis as { __workerTypeFixture?: WorkerTypeFixtureState }).__workerTypeFixture = fresh;
	return fresh;
}
