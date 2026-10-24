import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveFlowReference } from './FlowReference';

describe('resolveFlowReference', () => {
	let root: string;

	beforeEach(() => {
		root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'flow-ref-')));
		fs.mkdirSync(path.join(root, '.flow'));
		fs.writeFileSync(path.join(root, '.flow', 'config.yml'), '');
	});
	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	it('an existing file runs as it is, relative paths resolved from the working directory', () => {
		fs.writeFileSync(path.join(root, 'my-flow.yml'), 'id: x');

		expect(resolveFlowReference('my-flow.yml', root)).toEqual({
			kind: 'file',
			flowFile: path.join(root, 'my-flow.yml'),
		});
	});

	it('an existing file wins even when its name contains an @', () => {
		fs.mkdirSync(path.join(root, '@scope'));
		fs.writeFileSync(path.join(root, '@scope', 'flow@1.0.0'), 'id: x');

		expect(resolveFlowReference('@scope/flow@1.0.0', root)).toMatchObject({ kind: 'file' });
	});

	it('an id is looked up in the project registry; the registry may not exist (snapshots can still serve it)', () => {
		expect(resolveFlowReference('my-flow', root)).toEqual({
			kind: 'registered',
			flowFile: path.join(root, '.flow', 'flows.yml'),
			flowId: 'my-flow',
			flowVersion: undefined,
		});
	});

	it('id@version pins the version', () => {
		expect(resolveFlowReference('my-flow@1.2.0-rc.1', root)).toMatchObject({
			kind: 'registered',
			flowId: 'my-flow',
			flowVersion: '1.2.0-rc.1',
		});
	});

	it.each(['my-flow@', 'my-flow@latest', 'my-flow@1.0', '@1.0.0'])('refuses the malformed reference %j', ref => {
		const result = resolveFlowReference(ref, root);
		expect(result.kind).toBe('error');
		expect((result as { error: string }).error).toMatch(/<flow-id>@MAJOR\.MINOR\.PATCH/);
	});

	it('surfaces the project resolver message when the working directory is in no project', () => {
		const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'flow-ref-none-')));
		try {
			const result = resolveFlowReference('my-flow', outside);
			expect(result.kind).toBe('error');
			expect((result as { error: string }).error).toContain("Flow 'my-flow' not found as a file");
		} finally {
			fs.rmSync(outside, { recursive: true, force: true });
		}
	});
});
