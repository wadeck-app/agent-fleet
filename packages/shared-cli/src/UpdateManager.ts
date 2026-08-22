import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { ConfigDir } from './ConfigDir.js';

export interface UpdateState {
	status: 'success' | 'rolled-back' | 'update-failed' | 'applying';
	newVersion?: string;
	previousVersion?: string;
	targetVersion?: string;
	reason?: string;
	timestamp: string;
}

export class UpdateManager {
	private readonly configDir: string;
	private readonly pkgName: string;

	constructor(pkgName: string, configDir?: string) {
		this.pkgName = pkgName;
		this.configDir = configDir ?? ConfigDir.get(pkgName.replace(/^@[^/]+\//, '').replace(/-cli$/, ''));
	}

	// Prefer the named updater; fall back to flow-updater.cjs (shared bundle handles both CLIs via UPDATER_PKG_NAME).
	scheduleBackgroundUpdate(bundlePath: string, updaterName = 'flow-updater.cjs'): void {
		const dir = path.dirname(bundlePath);
		const updaterPath = fs.existsSync(path.join(dir, updaterName))
			? path.join(dir, updaterName)
			: fs.existsSync(path.join(dir, 'flow-updater.cjs'))
				? path.join(dir, 'flow-updater.cjs')
				: null;
		// dev mode: no updater bundle built
		if (!updaterPath) return;
		const child = spawn(process.execPath, [updaterPath], {
			detached: true,
			stdio: 'ignore',
			env: { ...process.env, LAUNCHER_BUNDLE_OVERRIDE: bundlePath, UPDATER_PKG_NAME: this.pkgName },
		});
		child.unref();
	}

	readAndClearState(): UpdateState | null {
		const stateFile = path.join(this.configDir, 'update-state.json');
		try {
			const raw = fs.readFileSync(stateFile, 'utf-8');
			const state = JSON.parse(raw) as UpdateState;
			// Only clear terminal states (not 'applying' -- the updater is still running)
			if (state.status !== 'applying') {
				try {
					fs.unlinkSync(stateFile);
				} catch {
					// ignore
				}
			}
			return state;
		} catch {
			return null;
		}
	}
}
