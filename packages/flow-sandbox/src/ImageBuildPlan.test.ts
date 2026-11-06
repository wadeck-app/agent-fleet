import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ImageBuildPlan } from './ImageBuildPlan';
import { eachRow } from './testing/EachRow';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('ImageBuildPlan', () => {
	it("builds the docker commands as argument lists: a quote in the path (a user name like O'Brien) stays inside one argument", () => {
		const context = "/c/Users/O'Brien/AppData/Local/Temp/flow-sbx-image-x/context";
		const tar = "/c/Users/O'Brien/AppData/Local/Temp/flow-sbx-image-x/out/image.tar";

		const commands = [
			ImageBuildPlan.build('flow-sandbox:m9', context),
			ImageBuildPlan.inspectId('flow-sandbox:m9'),
			ImageBuildPlan.save('flow-sandbox:m9', tar),
			ImageBuildPlan.readManifest(tar),
		];

		expect(commands[0]).toEqual(['docker', 'build', '-t', 'flow-sandbox:m9', context]);
		expect(commands[2]).toEqual(['docker', 'save', 'flow-sandbox:m9', '-o', tar]);
		expect(commands[3]).toEqual(['tar', '-xOf', tar, 'manifest.json']);
		for (const command of commands) expect(command).not.toContain('-c');
	});

	it('refuses a build when (each case), pointing to BuildInnerBundles.mjs', () =>
		eachRow(
			[
				{
					label: 'the folder does not exist',
					present: undefined,
					missing: ['worker.cjs', 'mcp-server.cjs', 'inner-bridge.cjs'],
				},
				{
					label: 'a bundle is missing',
					present: ['worker.cjs', 'mcp-server.cjs'],
					missing: ['inner-bridge.cjs'],
				},
			],
			({ present, missing }) => {
				const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-image-plan-'));
				roots.push(root);
				const folder = path.join(root, 'opt-flow');
				if (present !== undefined) {
					fs.mkdirSync(folder);
					for (const file of present) fs.writeFileSync(path.join(folder, file), '//');
				}

				expect(() => ImageBuildPlan.assertBundles(folder)).toThrow(
					new RegExp(
						`${missing.join(', ')}.*node --import tsx packages/flow-sandbox/scripts/BuildInnerBundles\\.mjs`
					)
				);
			}
		));

	it('accepts a folder with the three bundles', () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-image-plan-'));
		roots.push(root);
		for (const file of ['worker.cjs', 'mcp-server.cjs', 'inner-bridge.cjs'])
			fs.writeFileSync(path.join(root, file), '//');

		expect(() => ImageBuildPlan.assertBundles(root)).not.toThrow();
	});
});
