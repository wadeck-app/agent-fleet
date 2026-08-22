const __importMetaUrl = require('url').pathToFileURL(__filename).href;
('use strict');
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
	for (var name in all) __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
	if ((from && typeof from === 'object') || typeof from === 'function') {
		for (let key of __getOwnPropNames(from))
			if (!__hasOwnProp.call(to, key) && key !== except)
				__defProp(to, key, {
					get: () => from[key],
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable,
				});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (
	(target = mod != null ? __create(__getProtoOf(mod)) : {}),
	__copyProps(
		// If the importer is in node compatibility mode or this is not an ESM
		// file that has been converted to a CommonJS file using a Babel-
		// compatible transform (i.e. "__esModule" has not been set), then set
		// "default" to the CommonJS "module.exports" for node compatibility.
		isNodeMode || !mod || !mod.__esModule ? __defProp(target, 'default', { value: mod, enumerable: true }) : target,
		mod
	)
);
var __toCommonJS = mod => __copyProps(__defProp({}, '__esModule', { value: true }), mod);

// dist/updater/UpdaterMain.js
var UpdaterMain_exports = {};
__export(UpdaterMain_exports, {
	main: () => main,
	parseCheckInterval: () => parseCheckInterval,
	semverLte: () => semverLte,
	tryAcquireLock: () => tryAcquireLock,
});
module.exports = __toCommonJS(UpdaterMain_exports);
var import_node_child_process = require('node:child_process');
var fs = __toESM(require('node:fs'), 1);
var path2 = __toESM(require('node:path'), 1);
var import_node_util = require('node:util');

// ../shared-cli/src/ConfigDir.ts
var os = __toESM(require('node:os'), 1);
var path = __toESM(require('node:path'), 1);
var ConfigDir = class {
	static get() {
		const xdg = process.env['XDG_CONFIG_HOME'];
		if (xdg) return path.join(xdg, 'flow');
		if (process.platform === 'win32') {
			const appData = process.env['APPDATA'];
			if (appData) return path.join(appData, 'flow');
		}
		return path.join(process.env['HOME'] ?? os.homedir(), '.config', 'flow');
	}
};

// dist/updater/UpdaterMain.js
var execFileAsync = (0, import_node_util.promisify)(import_node_child_process.execFile);
var PKG_NAME = process.env['UPDATER_PKG_NAME'] ?? '@wadeck/flow-cli';
var VERSION_RE = /^\d+\.\d+\.\d+([-+][\w.-]+)?$/;
function semverLte(a, b) {
	const parse = v => {
		const core = v.split(/[-+]/)[0] ?? v;
		const [maj = '0', min = '0', pat = '0'] = core.split('.');
		return [parseInt(maj, 10), parseInt(min, 10), parseInt(pat, 10)];
	};
	const [aMaj, aMin, aPat] = parse(a);
	const [bMaj, bMin, bPat] = parse(b);
	if (aMaj !== bMaj) return aMaj < bMaj;
	if (aMin !== bMin) return aMin < bMin;
	return aPat <= bPat;
}
function getLockPath(configDir) {
	return path2.join(configDir, '.update.lock');
}
function getCachePath(configDir) {
	return path2.join(configDir, '.update-cache.json');
}
function getStatePath(configDir) {
	return path2.join(configDir, 'update-state.json');
}
function getLogPath(configDir) {
	return path2.join(configDir, 'update-log.txt');
}
function appendLog(logFile, message) {
	try {
		const line = `[${/* @__PURE__ */ new Date().toISOString()}] ${message}
`;
		fs.appendFileSync(logFile, line, 'utf-8');
	} catch {}
}
function writeState(statePath, state) {
	try {
		fs.mkdirSync(path2.dirname(statePath), { recursive: true });
		fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
	} catch {}
}
function parseCheckInterval(value) {
	const match = /^(\d+)([mhd])$/.exec(value.trim());
	if (!match) {
		return 30 * 60 * 1e3;
	}
	const num = parseInt(match[1], 10);
	switch (match[2]) {
		case 'm':
			return num * 60 * 1e3;
		case 'h':
			return num * 60 * 60 * 1e3;
		case 'd':
			return num * 24 * 60 * 60 * 1e3;
		default:
			return 30 * 60 * 1e3;
	}
}
function readConfig(configDir) {
	const configFile = path2.join(configDir, 'config.yml');
	const defaults = {
		channel: 'edge',
		checkIntervalMs: 30 * 60 * 1e3,
		disabled: false,
	};
	if (!fs.existsSync(configFile)) return defaults;
	try {
		const raw = fs.readFileSync(configFile, 'utf-8');
		const channelMatch = /^\s*channel:\s*['"]?(\S+?)['"]?\s*$/m.exec(raw);
		const intervalMatch = /^\s*checkInterval:\s*['"]?(\S+?)['"]?\s*$/m.exec(raw);
		const disabledMatch = /^\s*disabled:\s*(true|false)\s*$/m.exec(raw);
		return {
			channel: channelMatch?.[1] ?? defaults.channel,
			checkIntervalMs: intervalMatch?.[1] ? parseCheckInterval(intervalMatch[1]) : defaults.checkIntervalMs,
			disabled: disabledMatch?.[1] === 'true',
		};
	} catch {
		return defaults;
	}
}
function tryAcquireLock(lockFile) {
	try {
		const fd = fs.openSync(lockFile, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY);
		fs.writeSync(fd, String(process.pid));
		fs.closeSync(fd);
		return true;
	} catch (err) {
		const nodeErr = err;
		if (nodeErr.code === 'EEXIST') {
			try {
				const existingPid = parseInt(fs.readFileSync(lockFile, 'utf-8').trim(), 10);
				if (!isNaN(existingPid)) {
					try {
						process.kill(existingPid, 0);
						return false;
					} catch {}
				}
				fs.unlinkSync(lockFile);
				const fd = fs.openSync(lockFile, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY);
				fs.writeSync(fd, String(process.pid));
				fs.closeSync(fd);
				return true;
			} catch {
				return false;
			}
		}
		return false;
	}
}
async function main() {
	const configDir = ConfigDir.get();
	fs.mkdirSync(configDir, { recursive: true });
	const lockFile = getLockPath(configDir);
	const logFile = getLogPath(configDir);
	let lockAcquired = false;
	try {
		lockAcquired = tryAcquireLock(lockFile);
		if (!lockAcquired) {
			return;
		}
		const config = readConfig(configDir);
		if (config.disabled) {
			return;
		}
		const force = process.env['UPDATER_FORCE'] === '1';
		const cachePath = getCachePath(configDir);
		if (!force && fs.existsSync(cachePath)) {
			try {
				const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
				if (Date.now() - cache.checkedAt < config.checkIntervalMs) {
					return;
				}
			} catch {}
		}
		try {
			fs.writeFileSync(cachePath, JSON.stringify({ checkedAt: Date.now() }), 'utf-8');
		} catch {}
		const statePath = getStatePath(configDir);
		const timestamp = /* @__PURE__ */ new Date().toISOString();
		let latestVersion;
		try {
			const { stdout } = await execFileAsync('npm', ['view', PKG_NAME, `dist-tags.${config.channel}`], {
				timeout: 15e3,
			});
			latestVersion = stdout.trim();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			const reason = msg.includes('EUNAUTHORIZED') || msg.includes('401') ? 'auth' : 'network';
			writeState(statePath, { status: 'update-failed', reason, timestamp });
			appendLog(logFile, `Update check failed: ${msg}`);
			return;
		}
		if (!VERSION_RE.test(latestVersion)) {
			writeState(statePath, { status: 'update-failed', reason: 'invalid-version', timestamp });
			return;
		}
		let currentVersion;
		try {
			currentVersion = '1.0.0';
		} catch {
			return;
		}
		if (semverLte(latestVersion, currentVersion)) {
			return;
		}
		writeState(statePath, {
			status: 'applying',
			previousVersion: currentVersion,
			targetVersion: latestVersion,
			timestamp,
		});
		try {
			await execFileAsync('npm', ['install', '-g', `${PKG_NAME}@${latestVersion}`], { timeout: 12e4 });
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			const reason = msg.includes('EUNAUTHORIZED') || msg.includes('401') ? 'auth' : 'install-failed';
			writeState(statePath, {
				status: 'update-failed',
				reason,
				targetVersion: latestVersion,
				timestamp,
			});
			appendLog(logFile, `Install failed for ${latestVersion}: ${msg}`);
			return;
		}
		try {
			const appName = PKG_NAME.replace('@wadeck/', '');
			const cliName = appName.replace('-cli', '');
			const bundleFile = `${cliName}.cjs`;
			const { stdout: npmRootOut } = await execFileAsync('npm', ['root', '-g'], { timeout: 1e4 });
			const globalBundlePath = path2.join(npmRootOut.trim(), PKG_NAME, bundleFile);
			(0, import_node_child_process.execFileSync)(process.execPath, [globalBundlePath, 'cli', 'self-check'], {
				stdio: 'pipe',
				timeout: 15e3,
				env: { ...process.env, CLI_SELF_CHECK_QUIET: '1' },
			});
			writeState(statePath, {
				status: 'success',
				newVersion: latestVersion,
				previousVersion: currentVersion,
				timestamp,
			});
		} catch (healthErr) {
			const msg = healthErr instanceof Error ? healthErr.message : String(healthErr);
			try {
				await execFileAsync('npm', ['install', '-g', `${PKG_NAME}@${currentVersion}`], { timeout: 12e4 });
			} catch {}
			writeState(statePath, {
				status: 'rolled-back',
				reason: 'self-check-failed',
				previousVersion: currentVersion,
				targetVersion: latestVersion,
				timestamp,
			});
			appendLog(logFile, `Self-check failed after updating to ${latestVersion}, rolled back: ${msg}`);
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		appendLog(logFile, `Unexpected updater error: ${msg}`);
	} finally {
		if (lockAcquired) {
			try {
				fs.unlinkSync(lockFile);
			} catch {}
		}
	}
}
var isEntryPoint =
	process.argv[1] !== void 0 &&
	(process.argv[1].endsWith('UpdaterMain.js') ||
		process.argv[1].endsWith('UpdaterMain.ts') ||
		process.argv[1].endsWith('flow-updater.cjs'));
if (isEntryPoint) {
	main().catch(() => {
		process.exit(1);
	});
}
// Annotate the CommonJS export names for ESM import in node:
0 &&
	(module.exports = {
		main,
		parseCheckInterval,
		semverLte,
		tryAcquireLock,
	});
