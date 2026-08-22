import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export class ConfigDir {
	// Always uses ~/.config/<appName> (XDG on Linux/macOS, same convention on Windows).
	// XDG_CONFIG_HOME is respected if set.
	static get(appName: string): string {
		const xdg = process.env['XDG_CONFIG_HOME'];
		if (xdg) return path.join(xdg, appName);
		return path.join(os.homedir(), '.config', appName);
	}

	// One-time migration from legacy paths to ~/.config/<appName>.
	// Checks %APPDATA%\<appName> (Windows legacy) and ~/.<appName> (old dot-dir pattern).
	static migrateIfNeeded(appName: string): void {
		const newDir = ConfigDir.get(appName);
		if (fs.existsSync(newDir)) return;

		const candidates: string[] = [];
		const appData = process.env['APPDATA'];
		if (appData) candidates.push(path.join(appData, appName));
		candidates.push(path.join(os.homedir(), `.${appName}`));

		for (const oldDir of candidates) {
			if (fs.existsSync(oldDir)) {
				try {
					fs.mkdirSync(path.dirname(newDir), { recursive: true });
					fs.renameSync(oldDir, newDir);
					process.stderr.write(`[${appName}] Config migrated: ${oldDir} → ${newDir}\n`);
				} catch {
					// Non-fatal: cross-device move or permissions issue
				}
				return;
			}
		}
	}
}
