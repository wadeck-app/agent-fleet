import * as os from 'node:os';
import * as path from 'node:path';

export class ConfigDir {
	static get(): string {
		const xdg = process.env['XDG_CONFIG_HOME'];
		if (xdg) return path.join(xdg, 'flow');
		if (process.platform === 'win32') {
			const appData = process.env['APPDATA'];
			if (appData) return path.join(appData, 'flow');
		}
		return path.join(process.env['HOME'] ?? os.homedir(), '.config', 'flow');
	}
}
