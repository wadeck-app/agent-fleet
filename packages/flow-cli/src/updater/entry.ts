// flow-updater entry point — bundled separately as flow-updater.cjs.
// Must NOT import any flow runtime modules.
import { runUpdater, execNpm } from '@wadeck-app/shared-updater';
import { ConfigDir } from '@wadeck-app/shared-cli/ConfigDir';
import { join } from 'node:path';

declare const __FLOW_CLI_VERSION__: string;

const PKG_NAME = '@wadeck-app/flow-cli';
const configDir = process.env['FLOW_CONFIG_DIR'] ?? ConfigDir.get('flow');
const currentVersion = typeof __FLOW_CLI_VERSION__ !== 'undefined' ? __FLOW_CLI_VERSION__ : '0.0.0-dev';

try {
	const npmRoot = execNpm(['root', '-g'], { timeout: 10_000 }).trim();
	const selfCheckCmd = `${process.execPath} ${join(npmRoot, PKG_NAME, 'flow.cjs')} cli self-check`;
	process.env['UPDATER_SELF_CHECK_CMD'] = selfCheckCmd;
} catch {
	// Skip self-check if npm root unavailable.
}

runUpdater({
	pkgName: PKG_NAME,
	configDir,
	currentVersion,
	strategy: 'without-daemon',
}).catch(err => {
	process.stderr.write(`[flow-updater] fatal: ${err}\n`);
	process.exit(1);
});
