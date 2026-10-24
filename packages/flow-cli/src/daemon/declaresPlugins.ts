import * as fs from 'node:fs';

import { parseFlowConfigFile } from './parseFlowConfigFile.js';

/**
 * True when a config file actually declares a `plugins:` section.
 *
 * Tested instead of mere file existence because the global config now lives at
 * `~/.config/flow/config.yml` (D#58) -- the same file that carries daemon
 * settings such as `queue:` and `autoUpdate:`. Keying on existence would make
 * every user who has ever set `queue.concurrency` fail with "No workspace
 * provider configured", since `resolveAll()` requires one by design (P-4).
 */
export function declaresPlugins(configPath: string): boolean {
	if (!fs.existsSync(configPath)) {
		return false;
	}
	// A config file that cannot be parsed is a hard error: guessing either way
	// would either hide the typo or blame a missing workspace provider for it.
	const raw = parseFlowConfigFile(configPath);
	return raw?.['plugins'] !== undefined;
}
