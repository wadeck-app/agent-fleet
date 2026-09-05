'use strict';
const fs = require('fs');
const path = require('path');

// Node.js built-in modules that need 'node:' prefix
const builtins = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
  'events', 'fs', 'http', 'http2', 'https', 'inspector', 'module', 'net',
  'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring',
  'readline', 'repl', 'stream', 'string_decoder', 'timers', 'tls',
  'trace_events', 'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib'
]);

const files = fs.readFileSync('C:/Workspace_Tooling/agent-fleet/files-node-builtin.txt', 'utf8').trim().split('\n');

let totalFixed = 0;

for (const filePath of files) {
  if (!fs.existsSync(filePath)) continue;
  const content = fs.readFileSync(filePath, 'utf8');

  // Fix import/require statements
  let fixed = content;

  // ESM: import x from 'module' or import 'module' or import type x from 'module'
  fixed = fixed.replace(/from\s+'([^']+)'/g, (match, mod) => {
    const base = mod.split('/')[0];
    if (builtins.has(base) && !mod.startsWith('node:')) {
      return `from 'node:${mod}'`;
    }
    return match;
  });

  fixed = fixed.replace(/from\s+"([^"]+)"/g, (match, mod) => {
    const base = mod.split('/')[0];
    if (builtins.has(base) && !mod.startsWith('node:')) {
      return `from "node:${mod}"`;
    }
    return match;
  });

  // CJS: require('module')
  fixed = fixed.replace(/require\('([^']+)'\)/g, (match, mod) => {
    const base = mod.split('/')[0];
    if (builtins.has(base) && !mod.startsWith('node:')) {
      return `require('node:${mod}')`;
    }
    return match;
  });

  fixed = fixed.replace(/require\("([^"]+)"\)/g, (match, mod) => {
    const base = mod.split('/')[0];
    if (builtins.has(base) && !mod.startsWith('node:')) {
      return `require("node:${mod}")`;
    }
    return match;
  });

  if (fixed !== content) {
    fs.writeFileSync(filePath, fixed, 'utf8');
    totalFixed++;
    process.stdout.write(`Fixed: ${path.basename(filePath)}\n`);
  }
}

process.stdout.write(`\nDone: fixed ${totalFixed} files\n`);
