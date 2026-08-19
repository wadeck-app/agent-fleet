#!/usr/bin/env node
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const os = require('os');

const PLATFORM_PKG = {
  'win32-x64':    '@wadeck/flow-cli-win32-x64',
  'darwin-arm64': '@wadeck/flow-cli-darwin-arm64',
  'darwin-x64':   '@wadeck/flow-cli-darwin-x64',
  'linux-x64':    '@wadeck/flow-cli-linux-x64',
};

const arch = os.arch() === 'arm64' ? 'arm64' : 'x64';
const key = `${process.platform}-${arch}`;
const pkgName = PLATFORM_PKG[key];
if (!pkgName) {
  process.stderr.write(`flow: unsupported platform ${key}\n`);
  process.exit(1);
}

const ext = process.platform === 'win32' ? '.exe' : '';
const launcherPath = require.resolve(`${pkgName}/flow${ext}`);
const bundlePath   = require.resolve('@wadeck/flow-cli/flow.cjs');

execFileSync(launcherPath, process.argv.slice(2), {
  stdio: 'inherit',
  env: { ...process.env, LAUNCHER_BUNDLE_OVERRIDE: bundlePath },
});
