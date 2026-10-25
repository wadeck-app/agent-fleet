import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Safety net: the shared project SDK has no off switch, it reads `$XDG_CONFIG_HOME/project`, else `<home>/.config/project`.
// Pointing XDG_CONFIG_HOME at a throwaway directory for every test file means no test can read or write the real
// registry of the machine running the tests (nor the real flow config dir, which hangs off the same variable).
// A test that needs a registry builds its own with RegisteredProjectFixture.
const throwawayConfigHome = mkdtempSync(join(tmpdir(), 'flow-cli-test-xdg-'));
process.env['XDG_CONFIG_HOME'] = throwawayConfigHome;

// Removed when the test worker ends (best effort: a worker killed hard leaves it in the OS temp dir).
process.on('exit', () => {
	rmSync(throwawayConfigHome, { recursive: true, force: true });
});
