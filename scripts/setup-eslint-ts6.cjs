/**
 * postinstall (and run again by scripts/check-eslint.js): link TypeScript 6 (installed as the "typescript-6" alias)
 * into the dependency tree of typescript-eslint, so that it resolves TypeScript 6 while everything else (tsc, vitest,
 * the build) keeps the TypeScript 7 installed at the root.
 * Required until typescript-eslint supports TypeScript 7 (its peer range is "typescript <6.1.0"). See .claude/docs/linting.md.
 *
 * Idempotent: a link already pointing at TypeScript 6 is left untouched. Pass --quiet to only print failures.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const quiet = process.argv.includes('--quiet');
const root = path.resolve(__dirname, '..');
const modules = path.join(root, 'node_modules');
const ts6Path = path.join(modules, 'typescript-6');

if (!fs.existsSync(ts6Path)) {
	console.error('setup-eslint-ts6: node_modules/typescript-6 not found. Run "npm install" at the repository root.');
	process.exit(1);
}

// Every package of typescript-eslint's tree that loads the compiler API (parser, type-aware rules, project service...)
const consumers = [
	'typescript-eslint',
	'ts-api-utils',
	...fs
		.readdirSync(path.join(modules, '@typescript-eslint'), { withFileTypes: true })
		.filter(entry => entry.isDirectory())
		.map(entry => path.join('@typescript-eslint', entry.name)),
];

for (const consumer of consumers) {
	const nodeModules = path.join(modules, consumer, 'node_modules');
	const link = path.join(nodeModules, 'typescript');

	if (fs.existsSync(link) && fs.realpathSync(link) === fs.realpathSync(ts6Path)) {
		continue;
	}

	fs.mkdirSync(nodeModules, { recursive: true });
	fs.rmSync(link, { recursive: true, force: true });
	// 'junction' needs no elevated privileges on Windows
	fs.symlinkSync(ts6Path, link, 'junction');
	if (!quiet) {
		console.log(`Linked typescript@6 -> ${link}`);
	}
}
