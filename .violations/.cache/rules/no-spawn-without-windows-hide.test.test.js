import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rule } from 'file:///C:/Workspace_Tooling/agent-fleet/.violations/.cache/rules/no-spawn-without-windows-hide.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const tmp = join(tmpdir(), 'violations-test-spawn-wh');
function file(name, content) {
    const p = join(tmp, name);
    writeFileSync(p, content);
    return p;
}
describe('no-spawn-without-windows-hide', () => {
    before(() => mkdirSync(tmp, { recursive: true }));
    after(() => rmSync(tmp, { recursive: true, force: true }));
    it('flags spawn without windowsHide', async () => {
        const f = file('bad.ts', `
const child = spawn(command, args, {
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: false,
});
`);
        const violations = await rule.check([f], {});
        assert.equal(violations.length, 1);
        assert.ok(violations[0].message.includes('windowsHide'));
    });
    it('passes spawn with windowsHide:true', async () => {
        const f = file('good.ts', `
const child = spawn(command, args, {
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
  shell: false,
});
`);
        const violations = await rule.check([f], {});
        assert.equal(violations.length, 0);
    });
    it('passes spawn with stdio:inherit (interactive, intentional)', async () => {
        const f = file('interactive.ts', `
const child = spawn(command, args, {
  stdio: 'inherit',
  shell: false,
});
`);
        const violations = await rule.check([f], {});
        assert.equal(violations.length, 0);
    });
});
