import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { FakeClock } from './FakeClock';
import { FakeScheduler } from './FakeScheduler';
import { RunMounts } from './RunMounts';
import { SandboxCapacity } from './SandboxCapacity';
import { SandboxLifecycle } from './SandboxLifecycle';
import { rejection } from './testing/ExpectedFailures';
import { MockSbxHarness } from './testing/MockSbxHarness';
import { RecordingPresence } from './testing/RecordingPresence';
import { RecordingSandboxLog } from './testing/RecordingSandboxLog';

const disposers: (() => void)[] = [];
afterEach(() => {
	for (const dispose of disposers.splice(0)) dispose();
});

// `SbxCliRuntime.create` runs `bash -c true` after `sbx create` succeeded (it absorbs sbx's first-bash banner). When that fails
// (an image without bash) the sandbox EXISTS although create threw: the lifecycle must not leak it.
describe('SandboxLifecycle when the sandbox was created but its first command failed (image without bash)', () => {
	it('removes the half-created sandbox and holds nothing, so the next attempt can create it again', async () => {
		const harness = new MockSbxHarness('no-bash');
		disposers.push(() => harness.dispose());
		const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'flow-lifecycle-nobash-')));
		disposers.push(() => fs.rmSync(root, { recursive: true, force: true }));
		fs.mkdirSync(path.join(root, 'ws'));
		fs.mkdirSync(path.join(root, 'ws.meta'));
		const log = new RecordingSandboxLog();
		const runtime = harness.runtime();
		const mounts = new RunMounts({
			workspaceDir: path.join(root, 'ws'),
			workspaceMetaDir: path.join(root, 'ws.meta'),
			platform: process.platform,
			log,
		});
		const life = new SandboxLifecycle(
			{ wrapperId: 'w1', agent: 'shell', cpus: 2, memory: '2g', idleStopMinutes: 5 },
			{
				runtime,
				scheduler: new FakeScheduler(new FakeClock(Date.UTC(2026, 9, 27))),
				log,
				capacity: new SandboxCapacity(runtime, 4),
				presence: new RecordingPresence(),
			}
		);
		life.start();

		const error = await rejection(life.beginStep('run1', mounts));

		expect(error.kind).toBe('command-failed');
		expect(error.message).toContain('"bash -c true" failed');
		// The mock state is the truth: nothing is left, and the lifecycle holds no run.
		expect(await runtime.list()).toEqual([]);
		expect(harness.callsWithVerb('rm')).toHaveLength(1);
		expect(life.current()).toBeUndefined();
		expect(log.text()).toContain('the half-created sandbox was removed');
	});
});
