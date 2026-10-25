// A release is stamped by CI as YYYY.MM.DD-BBB-xxxxxxxx: zero-padded build number (3+ digits) and an
// 8-char lowercase hex commit hash. Anything else (0.0.0, 0.0.0-dev, 0.1.0, the tsx fallback
// YYYY.MM.DD-HHMMSS-count-HASH of cli/version.ts) is a repo-built dev bundle. Strict on purpose: a false
// "release" lets a dev build run `npm install -g`, a false "dev" only makes an update refuse loudly.
const CALVER_RE = /^\d{4}\.(0[1-9]|1[0-2])\.(0[1-9]|[12]\d|3[01])-\d{3,}-[0-9a-f]{8}$/;

export function isCalVer(version: string | undefined | null): boolean {
	return typeof version === 'string' && CALVER_RE.test(version);
}

/**
 * Actionable message printed (and logged) when a non-release build is asked to update. Such a build
 * must never touch the global install: an interrupted `npm install -g` leaves the CLI uninstalled
 * (incident 2026-10-25, integration tests ran `cli update` from a repo-built bundle).
 */
export function devBuildRefusalMessage(binary: string, version: string): string {
	return (
		`dev build ${version}: refusing to update the global install of ${binary}; ` +
		`this is a repo-built bundle, not a CalVer release. Use the installed binary's \`${binary} cli update\` instead.`
	);
}

/** Minimal slice of UpdateManager, so the guard is testable without spawning anything. */
export interface BackgroundUpdateScheduler {
	scheduleBackgroundUpdate(bundlePath: string, updaterName?: string): void;
}

/**
 * Schedules the background updater only for a CalVer release. A dev build never spawns an updater:
 * that child would be a mutating `npm install -g` launched from a repo checkout.
 *
 * @returns true when the updater was scheduled.
 */
export function scheduleBackgroundUpdateForRelease(
	scheduler: BackgroundUpdateScheduler,
	bundlePath: string,
	updaterName: string,
	version: string
): boolean {
	if (!isCalVer(version)) {
		return false;
	}
	scheduler.scheduleBackgroundUpdate(bundlePath, updaterName);
	return true;
}
