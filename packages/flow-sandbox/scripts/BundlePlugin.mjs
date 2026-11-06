#!/usr/bin/env node

/**
 * `npm run bundle --workspace flow-sandbox`: builds the sandbox plugin artifact into packages/flow-sandbox/dist-plugin/
 * (ignored by git). Point the daemon at it:
 *   flow worker source add <id> --provider sandbox --plugin sandbox.exec --plugins-dir <absolute path of dist-plugin> \
 *     --option projects=<ids> --option region=us-east-1 --option profiles=claude=<aws profile>
 * Env: BUNDLE_VERSION  version stamped into the bundle (default 0.0.0-sandbox-plugin).
 * See the README, "Plugin".
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PluginBundler } from '../src/PluginBundler.ts';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist-plugin');
const artifact = await new PluginBundler().bundle(out);
for (const [name, size] of Object.entries(artifact.files)) {
	console.log(`${name}: ${(size / 1024).toFixed(0)} KB`);
}
console.log(`plugin directory for --plugins-dir: ${out}`);
