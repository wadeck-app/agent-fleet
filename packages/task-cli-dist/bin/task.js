#!/usr/bin/env node
'use strict';
const { execFileSync } = require('child_process');
const os = require('os');

const PLATFORM_PKG = {
	'win32-x64': '@wadeck/task-cli-win32-x64',
	'darwin-arm64': '@wadeck/task-cli-darwin-arm64',
	'darwin-x64': '@wadeck/task-cli-darwin-x64',
	'linux-x64': '@wadeck/task-cli-linux-x64',
};

const arch = os.arch() === 'arm64' ? 'arm64' : 'x64';
const key = `${process.platform}-${arch}`;
const pkgName = PLATFORM_PKG[key];
if (!pkgName) {
	process.stderr.write(`task: unsupported platform ${key}\n`);
	process.exit(1);
}

const ext = process.platform === 'win32' ? '.exe' : '';

let launcherPath;
try {
	launcherPath = require.resolve(`${pkgName}/task${ext}`);
} catch {
	process.stderr.write(`task: platform package ${pkgName} is not installed.\nRun: npm install -g @wadeck/task-cli\n`);
	process.exit(1);
}

// Use __dirname so this works both when installed globally and as devDependency.
const bundlePath = require('path').join(__dirname, '..', 'task.cjs');

execFileSync(launcherPath, process.argv.slice(2), {
	stdio: 'inherit',
	env: { ...process.env, LAUNCHER_BUNDLE_OVERRIDE: bundlePath },
});
