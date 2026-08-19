// UpdaterMain.ts -- background auto-update entry point
// This module is bundled separately as flow-updater.cjs.
// It must NOT import any flow runtime modules (FlowExecutor, StepRunner, etc.)
// Allowed: node:fs, node:path, node:child_process, node:os, semver

import { execFile, execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import semver from 'semver';

import { getConfigDir } from './configDir.js';

const execFileAsync = promisify(execFile);

// Injected by esbuild at bundle time via define; falls back to a dev placeholder.
declare const __FLOW_CLI_VERSION__: string;

const PKG_NAME = '@wadeck/flow-cli';
const VERSION_RE = /^\d+\.\d+\.\d+([-+][\w.-]+)?$/;

interface UpdateState {
	status: 'success' | 'rolled-back' | 'update-failed' | 'applying';
	newVersion?: string;
	previousVersion?: string;
	targetVersion?: string;
	reason?: string;
	timestamp: string;
}

interface UpdateCache {
	checkedAt: number;
}

interface UpdateConfig {
	channel: string;
	checkIntervalMs: number;
	disabled: boolean;
}

function getLockPath(configDir: string): string {
	return path.join(configDir, '.update.lock');
}

function getCachePath(configDir: string): string {
	return path.join(configDir, '.update-cache.json');
}

function getStatePath(configDir: string): string {
	return path.join(configDir, 'update-state.json');
}

function getLogPath(configDir: string): string {
	return path.join(configDir, 'update-log.txt');
}

function appendLog(logFile: string, message: string): void {
	try {
		const line = `[${new Date().toISOString()}] ${message}\n`;
		fs.appendFileSync(logFile, line, 'utf-8');
	} catch {
		// ignore log write errors
	}
}

function writeState(statePath: string, state: UpdateState): void {
	try {
		fs.mkdirSync(path.dirname(statePath), { recursive: true });
		fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
	} catch {
		// ignore state write errors
	}
}

function parseCheckInterval(value: string): number {
	const match = /^(\d+)([mhd])$/.exec(value.trim());
	if (!match) {
		// Default to 30 minutes if unparseable
		return 30 * 60 * 1000;
	}
	const num = parseInt(match[1]!, 10);
	switch (match[2]) {
		case 'm':
			return num * 60 * 1000;
		case 'h':
			return num * 60 * 60 * 1000;
		case 'd':
			return num * 24 * 60 * 60 * 1000;
		default:
			return 30 * 60 * 1000;
	}
}

function readConfig(configDir: string): UpdateConfig {
	const configFile = path.join(configDir, 'config.yml');
	const defaults: UpdateConfig = {
		channel: 'edge',
		checkIntervalMs: 30 * 60 * 1000,
		disabled: false,
	};

	if (!fs.existsSync(configFile)) return defaults;

	try {
		const raw = fs.readFileSync(configFile, 'utf-8');
		// Minimal YAML parsing -- only extract update.channel, update.checkInterval, update.disabled
		// without importing a YAML library (to keep the bundle lean)
		const channelMatch = /^\s*channel:\s*['"]?(\S+?)['"]?\s*$/m.exec(raw);
		const intervalMatch = /^\s*checkInterval:\s*['"]?(\S+?)['"]?\s*$/m.exec(raw);
		const disabledMatch = /^\s*disabled:\s*(true|false)\s*$/m.exec(raw);

		return {
			channel: channelMatch?.[1] ?? defaults.channel,
			checkIntervalMs: intervalMatch?.[1] ? parseCheckInterval(intervalMatch[1]) : defaults.checkIntervalMs,
			disabled: disabledMatch?.[1] === 'true',
		};
	} catch {
		return defaults;
	}
}

function tryAcquireLock(lockFile: string): boolean {
	try {
		const fd = fs.openSync(lockFile, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY);
		fs.writeSync(fd, String(process.pid));
		fs.closeSync(fd);
		return true;
	} catch (err: unknown) {
		const nodeErr = err as NodeJS.ErrnoException;
		if (nodeErr.code === 'EEXIST') {
			// Check if the PID in the lock file is still alive
			try {
				const existingPid = parseInt(fs.readFileSync(lockFile, 'utf-8').trim(), 10);
				if (!isNaN(existingPid)) {
					try {
						// process.kill(pid, 0) throws if process doesn't exist
						process.kill(existingPid, 0);
						// Process is alive -- another updater is running
						return false;
					} catch {
						// Process is dead -- stale lock
					}
				}
				// Remove stale lock and retry once
				fs.unlinkSync(lockFile);
				const fd = fs.openSync(lockFile, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY);
				fs.writeSync(fd, String(process.pid));
				fs.closeSync(fd);
				return true;
			} catch {
				return false;
			}
		}
		return false;
	}
}

async function main(): Promise<void> {
	const configDir = getConfigDir();
	fs.mkdirSync(configDir, { recursive: true });

	const lockFile = getLockPath(configDir);
	const logFile = getLogPath(configDir);
	let lockAcquired = false;

	try {
		// Step 1: Acquire lock
		lockAcquired = tryAcquireLock(lockFile);
		if (!lockAcquired) {
			process.exit(0);
		}

		// Step 2: Read config
		const config = readConfig(configDir);
		if (config.disabled) {
			process.exit(0);
		}

		// Step 3: Check cache
		const cachePath = getCachePath(configDir);
		if (fs.existsSync(cachePath)) {
			try {
				const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as UpdateCache;
				if (Date.now() - cache.checkedAt < config.checkIntervalMs) {
					process.exit(0);
				}
			} catch {
				// Cache unreadable -- proceed
			}
		}
		// Update cache timestamp
		try {
			fs.writeFileSync(cachePath, JSON.stringify({ checkedAt: Date.now() }), 'utf-8');
		} catch {
			// ignore
		}

		// Step 4: Check latest version
		const statePath = getStatePath(configDir);
		const timestamp = new Date().toISOString();
		let latestVersion: string;
		try {
			const { stdout } = await execFileAsync(
				'npm',
				['view', PKG_NAME, `dist-tags.${config.channel}`],
				{ timeout: 15000 }
			);
			latestVersion = stdout.trim();
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			const reason = msg.includes('EUNAUTHORIZED') || msg.includes('401') ? 'auth' : 'network';
			writeState(statePath, { status: 'update-failed', reason, timestamp });
			appendLog(logFile, `Update check failed: ${msg}`);
			process.exit(0);
		}

		// Step 5: Validate version string
		if (!VERSION_RE.test(latestVersion)) {
			writeState(statePath, { status: 'update-failed', reason: 'invalid-version', timestamp });
			process.exit(1);
		}

		// Step 6: Compare versions
		let currentVersion: string;
		try {
			currentVersion = __FLOW_CLI_VERSION__;
		} catch {
			// Dev mode -- cannot determine current version, skip update
			process.exit(0);
		}

		if (semver.lte(latestVersion, currentVersion)) {
			process.exit(0);
		}

		// Step 7: Apply update
		writeState(statePath, {
			status: 'applying',
			previousVersion: currentVersion,
			targetVersion: latestVersion,
			timestamp,
		});

		try {
			await execFileAsync(
				'npm',
				['install', '-g', `${PKG_NAME}@${latestVersion}`],
				{ timeout: 120000 }
			);
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			writeState(statePath, {
				status: 'update-failed',
				reason: 'install-failed',
				targetVersion: latestVersion,
				timestamp,
			});
			appendLog(logFile, `Install failed for ${latestVersion}: ${msg}`);
			process.exit(0);
		}

		// Step 8: Health check
		try {
			execFileSync(
				'npm',
				['exec', '--package=@wadeck/flow-cli', '--', 'flow', 'cli', 'self-check'],
				{
					stdio: 'pipe',
					timeout: 15000,
					env: { ...process.env, FLOW_SELF_CHECK_QUIET: '1' },
				}
			);
			// Self-check passed
			writeState(statePath, {
				status: 'success',
				newVersion: latestVersion,
				previousVersion: currentVersion,
				timestamp,
			});
		} catch (healthErr: unknown) {
			// Self-check failed -- roll back
			const msg = healthErr instanceof Error ? healthErr.message : String(healthErr);
			try {
				await execFileAsync(
					'npm',
					['install', '-g', `${PKG_NAME}@${currentVersion}`],
					{ timeout: 120000 }
				);
			} catch {
				// rollback failure -- we still report the rolled-back state
			}
			writeState(statePath, {
				status: 'rolled-back',
				reason: 'self-check-failed',
				previousVersion: currentVersion,
				targetVersion: latestVersion,
				timestamp,
			});
			appendLog(logFile, `Self-check failed after updating to ${latestVersion}, rolled back: ${msg}`);
		}
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		appendLog(logFile, `Unexpected updater error: ${msg}`);
	} finally {
		if (lockAcquired) {
			try {
				fs.unlinkSync(lockFile);
			} catch {
				// ignore
			}
		}
	}
}

// Top-level: run immediately (this is always the entry point)
main().catch(() => {
	process.exit(1);
});
