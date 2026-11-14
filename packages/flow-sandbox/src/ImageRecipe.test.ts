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

	// The project declares engines node >= 24; the base image has the distribution's Node 22. The distribution Node stays (other packages
	// depend on it) and is shadowed by /usr/local/bin.
	it('installs Node 24 from the official tarball, version and sha256 pinned and verified, never through a piped script', () => {
		const dockerfile = read('Dockerfile');

		expect(dockerfile).toMatch(/^ARG NODE_VERSION=24\.\d+\.\d+$/m);
		expect(dockerfile).toMatch(/^ARG NODE_SHA256=[0-9a-f]{64}$/m);
		expect(dockerfile).toContain('https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.gz');
		expect(dockerfile).toMatch(/sha256sum -c/);
		expect(dockerfile).not.toMatch(/\|\s*(sudo\s+)?(ba)?sh\b/);
		// Before the model CLIs: they are installed and their postinstall runs with the Node the image ships.
		expect(dockerfile.indexOf('NODE_VERSION')).toBeLessThan(dockerfile.indexOf('npm ci --ignore-scripts'));
	});

	it('installs them with npm ci --ignore-scripts and never with an unpinned npm install', () => {
		const dockerfile = read('Dockerfile');

		expect(dockerfile).toContain('npm ci --ignore-scripts');
		expect(dockerfile).not.toMatch(/npm install/);
		// The one lifecycle script that is needed, by hand, from the lock-pinned package.
		expect(dockerfile).toContain('node node_modules/opencode-ai/postinstall.mjs');
	});
});
