import * as fs from 'node:fs';
import * as path from 'node:path';

import type { Clock } from './Clock';
import { describeError } from './ErrorText';
import type { SandboxLog } from './SandboxLog';

export interface StaleTempSweepOptions {
	tempDirectory: string;
	presence: { isWrapperAlive(wrapperId: string): boolean; hasLiveWrapper(): boolean };
	clock: Clock;
	log: SandboxLog;
	/** A directory younger than this is never touched. Default 24 h. */
	maxAgeMs?: number;
}

/** `flow-sbx-(exec|harness)-secrets-<wrapperId>-<random>`: the private directory of one wrapper (ExecMain, HarnessMain). */
const WRAPPER_SECRETS = /^flow-sbx-(?:exec|harness)-secrets-([a-z0-9]{1,12})-[A-Za-z0-9]{6}$/;
/** `flow-sandbox-env-<random>`: the env file of one `sbx exec` (PrivateEnvFile). */
const EXEC_ENV = /^flow-sandbox-env-[A-Za-z0-9]{6}$/;

/**
 * A wrapper that is killed hard (not through its crash handler: a power cut, a task kill) leaves its secret directories
 * in the temp directory, and on Windows nothing but the account's temp folder protects them. At startup a wrapper
 * removes what is clearly dead:
 * - a wrapper secrets directory older than the limit whose wrapper id has no live presence file;
 * - an env directory older than the limit while NO wrapper is alive (the name carries no wrapper id and a step, hence
 *   its `sbx exec`, can run for hours: with a live wrapper around it is left alone).
 * Only real directories with exactly these names are touched; every removal and every failure is logged.
 */
export class StaleTempSweep {
	constructor(private readonly options: StaleTempSweepOptions) {}

	/** Returns the names removed. Never throws. */
	run(): string[] {
		const { tempDirectory, presence, clock, log } = this.options;
		const maxAgeMs = this.options.maxAgeMs ?? 24 * 3_600_000;
		let names: string[];
		try {
			names = fs.readdirSync(tempDirectory);
		} catch (error) {
			log.warn(`stale temp sweep: could not read the temp directory ${tempDirectory}: ${describeError(error)}`);
			return [];
		}
		const removed: string[] = [];
		let anyWrapperAlive: boolean | undefined;
		for (const name of names) {
			const secrets = WRAPPER_SECRETS.exec(name);
			if (secrets === null && !EXEC_ENV.test(name)) continue;
			const directory = path.join(tempDirectory, name);
			try {
				const stat = fs.lstatSync(directory);
				if (!stat.isDirectory() || clock.now() - stat.mtimeMs < maxAgeMs) continue;
				if (secrets?.[1] !== undefined) {
					if (presence.isWrapperAlive(secrets[1])) continue;
				} else {
					anyWrapperAlive ??= presence.hasLiveWrapper();
					if (anyWrapperAlive) continue;
				}
				fs.rmSync(directory, { recursive: true, force: true });
				removed.push(name);
				log.info(
					`stale temp sweep: removed stale ${name} (older than ${Math.round(maxAgeMs / 3_600_000)} h, its wrapper is not running).`
				);
			} catch (error) {
				log.warn(
					`stale temp sweep: could not remove ${directory}: ${describeError(error)}. Remove it by hand.`
				);
			}
		}
		return removed;
	}
}
