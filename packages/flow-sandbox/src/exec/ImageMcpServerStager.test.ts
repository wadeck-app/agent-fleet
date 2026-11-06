import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ImageMcpServerStager } from './ImageMcpServerStager';

let root: string;

beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-stager-'));
});

afterEach(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

function fakeFlowCli(content: string | null): string {
	const flowCli = path.join(root, 'flow-cli');
	if (content !== null) {
		fs.mkdirSync(path.join(flowCli, 'src', 'worker'), { recursive: true });
		fs.writeFileSync(path.join(flowCli, 'src', 'worker', 'mcp-server.cjs'), content);
	}
	return flowCli;
}

describe('ImageMcpServerStager', () => {
	it('copies the engine file byte for byte, creating the target directory', () => {
		const target = new ImageMcpServerStager(fakeFlowCli('engine bytes\n')).stageInto(
			path.join(root, 'out', 'nested')
		);

		expect(target).toBe(path.join(root, 'out', 'nested', 'mcp-server.cjs'));
		expect(fs.readFileSync(target, 'utf8')).toBe('engine bytes\n');
	});

	it('fails with the missing path when the engine file is absent, and creates nothing', () => {
		const stager = new ImageMcpServerStager(fakeFlowCli(null));

		expect(() => stager.stageInto(path.join(root, 'out'))).toThrow(
			/mcp-server\.cjs does not exist.*flow-cli package is incomplete/
		);
		expect(fs.existsSync(path.join(root, 'out'))).toBe(false);
	});
});
