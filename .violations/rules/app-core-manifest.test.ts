import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, it } from 'node:test';

// The .js re-export carries no types, and a .d.ts next to it would be taken for a rule without test.
// @ts-expect-error TS7016: untyped re-export, typed below from the SDK
import { rule as untypedRule } from './app-core-manifest.js';

// The rule is the SDK's own; this checks that it is wired the way the runner loads it (a `rule` export of the right shape).
const rule = untypedRule as typeof import('@wadeck-app/app-core-sdk/violations').rule;

const dirs: string[] = [];

function manifest(content: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'violations-manifest-'));
	dirs.push(dir);
	const file = path.join(dir, 'manifest.json');
	fs.writeFileSync(file, content);
	return file;
}

afterEach(() => {
	for (const dir of dirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

describe('app-core-sdk/manifest-valid', () => {
	it('has the shape the runner expects of a rule', () => {
		assert.equal(rule.id, 'app-core-sdk/manifest-valid');
		assert.ok(rule.defaultScope.includes('**/manifest.json'));
		assert.equal(rule.defaultSeverity, 'error');
	});

	it('accepts a source manifest', async () => {
		const file = manifest(
			JSON.stringify({
				id: 'ok',
				extensionPoints: [
					{
						kind: 'widget',
						slot: 'dashboard',
						view: { type: 'inline', value: { $type: 'Badge', label: 'x' } },
					},
				],
			})
		);
		assert.deepEqual(await rule.check([file]), []);
	});

	it('reports every problem with its path, the cross-field rules of app-core included', async () => {
		const file = manifest(
			JSON.stringify({
				id: 'ok',
				extensionPoints: [{ kind: 'page', slot: 'flow:nav', width: 2, view: { type: 'inline', value: {} } }],
			})
		);
		const messages = (await rule.check([file])).map(v => v.message);
		assert.ok(messages.some(m => m.startsWith('extensionPoints.0.label:')));
		assert.ok(messages.some(m => m.startsWith('extensionPoints.0.width:')));
	});

	it("says a manifest.json is not valid JSON, and leaves a manifest.json that is not app-core's alone", async () => {
		assert.ok((await rule.check([manifest('{ nope')]))[0]?.message.includes('is not valid JSON'));
		assert.deepEqual(
			await rule.check([manifest(JSON.stringify({ name: 'a browser extension', manifest_version: 3 }))]),
			[]
		);
	});
});
