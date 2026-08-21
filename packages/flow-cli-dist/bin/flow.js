#!/usr/bin/env node
'use strict';
const { execFileSync } = require('child_process');
const os = require('os');

const PLATFORM_PKG = {
	'win32-x64': '@wadeck/flow-cli-win32-x64',
	'darwin-arm64': '@wadeck/flow-cli-darwin-arm64',
	'darwin-x64': '@wadeck/flow-cli-darwin-x64',
};

const arch = os.arch() === 'arm64' ? 'arm64' : 'x64';
const key = `${process.platform}-${arch}`;
const pkgName = PLATFORM_PKG[key];
if (!pkgName) {
	process.stderr.write(`flow: unsupported platform ${key}\n`);
	process.exit(1);
}

const ext = process.platform === 'win32' ? '.exe' : '';

let launcherPath;
try {
	launcherPath = require.resolve(`${pkgName}/flow${ext}`);
} catch {
	// Platform package missing (GitLab npm registry doesn't expose os/cpu in packument,
	// so npm can't auto-install optionalDependencies by platform). Install it now.
	process.stderr.write(`flow: installing platform package ${pkgName}...\n`);
	try {
		execFileSync('npm', ['install', '-g', pkgName], { stdio: 'inherit' });
		launcherPath = require.resolve(`${pkgName}/flow${ext}`);
	} catch {
		process.stderr.write(`flow: failed to install ${pkgName}. Run manually: npm install -g ${pkgName}\n`);
		process.exit(1);
	}
}

// Use __dirname so this works both when installed globally and as devDependency.
const bundlePath = require('path').join(__dirname, '..', 'flow.cjs');

execFileSync(launcherPath, process.argv.slice(2), {
	stdio: 'inherit',
	env: { ...process.env, LAUNCHER_BUNDLE_OVERRIDE: bundlePath },
});
