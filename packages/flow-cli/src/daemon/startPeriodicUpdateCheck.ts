import { UpdateManager } from '@wadeck-app/shared-cli';
import { resolveOwnBundlePath } from '@wadeck-app/shared-cli/resolveOwnBundlePath';
import { readUpdateConfig } from '@wadeck-app/shared-updater';
import { fileURLToPath } from 'node:url';

import { FLOW_BUNDLE_NAME } from '../cli/FlowBundleName.js';
import { VERSION } from '../cli/version.js';
import { scheduleBackgroundUpdateForRelease } from '../updater/DevBuildGuard.js';

/**
 * Keeps this daemon's own updater cache fresh (`readUpdateConfig`/`readCache`, see `UpdateManager`).
 *
 * Same mechanism as the worker side's self-restart check (Part 2): schedule a
 * background update check now, then keep re-triggering it on the configured
 * cadence so this daemon's own `latestVersion` cache does not go stale across a
 * long-running process. Re-arming at exactly checkIntervalMs used to beat against
 * shared-updater's own cache.lastCheckedAt gate (same threshold, so the check
 * that finishes a few seconds after each tick made the NEXT tick land a hair
 * short of the gate -- it skipped every other tick, silently halving the real
 * cadence). UPDATER_SKIP_THROTTLE tells the spawned updater this caller already
 * owns its schedule, so the gate is not needed on top of it.
 *
 * Pure refresh, not a gate: `StepRouter`'s version preference degrades to "no preference"
 * when the cache is missing or stale, so a slow or failed check never blocks dispatch.
 *
 * @returns the unref'd timer, which the caller must clear on shutdown.
 */
export function startPeriodicUpdateCheck(daemonDir: string): ReturnType<typeof setInterval> {
	process.env['UPDATER_SKIP_THROTTLE'] = '1';
	const updateManager = new UpdateManager('@wadeck-app/flow-cli');
	const bundlePath = resolveOwnBundlePath(FLOW_BUNDLE_NAME, fileURLToPath(import.meta.url));
	const scheduleUpdateCheck = (): void => {
		// A dev build must never spawn a mutating `npm install -g` updater (incident 2026-10-25).
		scheduleBackgroundUpdateForRelease(updateManager, bundlePath, 'flow-updater.cjs', VERSION);
	};
	scheduleUpdateCheck();
	const timer = setInterval(scheduleUpdateCheck, readUpdateConfig(daemonDir).checkIntervalMs);
	timer.unref();
	return timer;
}
