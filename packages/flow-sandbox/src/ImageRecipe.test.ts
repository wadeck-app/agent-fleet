import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// What the image recipe promises (image/Dockerfile): the model CLIs come from the committed lock, nothing is
// installed unpinned, and no dependency runs a lifecycle script at build time. The image itself is not built here.
const imageDirectory = fileURLToPath(new URL('../image/', import.meta.url));

function read(file: string): string {
	return fs.readFileSync(path.join(imageDirectory, file), 'utf8');
}

describe('image recipe', () => {
	it('pins the model CLIs exactly, in package.json and in the committed lock', () => {
		const manifest = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
		const lock = JSON.parse(read('package-lock.json')) as {
			packages: Record<string, { version?: string; dependencies?: Record<string, string> }>;
		};

		expect(manifest.dependencies).toEqual({ '@openai/codex': '0.149.1', 'opencode-ai': '1.19.4' });
		expect(lock.packages['']?.dependencies).toEqual(manifest.dependencies);
		expect(lock.packages['node_modules/@openai/codex']?.version).toBe('0.149.1');
		expect(lock.packages['node_modules/opencode-ai']?.version).toBe('1.19.4');
	});

	it('installs them with npm ci --ignore-scripts and never with an unpinned npm install', () => {
		const dockerfile = read('Dockerfile');

		expect(dockerfile).toContain('npm ci --ignore-scripts');
		expect(dockerfile).not.toMatch(/npm install/);
		// The one lifecycle script that is needed, by hand, from the lock-pinned package.
		expect(dockerfile).toContain('node node_modules/opencode-ai/postinstall.mjs');
	});
});
