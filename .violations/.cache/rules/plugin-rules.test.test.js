import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rule } from 'file:///C:/Workspace_Tooling/agent-fleet/.violations/.cache/rules/plugin-rules.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
async function withTempPlugin(pluginId, configContent, fn) {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-rules-test-'));
    const pluginDir = path.join(base, `plugin-${pluginId}`);
    await fs.mkdir(pluginDir, { recursive: true });
    const configFile = path.join(pluginDir, 'plugin.config.ts');
    try {
        await fs.writeFile(configFile, configContent, 'utf8');
        await fn(pluginDir, configFile);
    }
    finally {
        await fs.rm(base, { recursive: true }).catch(() => { });
    }
}
describe('plugin-rules', () => {
    it('flags env var interpolation in manifest', async () => {
        await withTempPlugin('test', `
export default {
  pluginId: 'test',
  manifestVersion: '1',
  token: '\${process.env.TOKEN}',
};
    `, async (dir, file) => {
            const violations = await rule.check([file]);
            const envVarViolation = violations.find(v => v.message.includes('PLUGIN-007'));
            assert.ok(envVarViolation, 'should flag env var interpolation (PLUGIN-007)');
        });
    });
    it('passes for valid manifest without env vars or sensitive literals', async () => {
        await withTempPlugin('clean', `
export default {
  pluginId: 'clean',
  manifestVersion: '1',
};
    `, async (dir, file) => {
            const violations = await rule.check([file]);
            // PLUGIN-001 won't fire because the file exists in this dir.
            // PLUGIN-004 may fire if registry not found — that's OK, just check no PLUGIN-007.
            const plugin007 = violations.filter(v => v.message.includes('PLUGIN-007'));
            assert.strictEqual(plugin007.length, 0, 'should not flag clean manifest');
        });
    });
    it('returns array (smoke test — no crash on empty files list)', async () => {
        const violations = await rule.check([]);
        assert.ok(Array.isArray(violations));
    });
});
