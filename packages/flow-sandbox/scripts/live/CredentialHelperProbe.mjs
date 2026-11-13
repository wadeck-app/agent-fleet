// Host-only experiment (no sbx, no sandbox): does git run a credential helper / askpass planted in a repository's .git/config?
// A repository stands for a pool slot whose .git/config the agent edited. An http server answers 401 with WWW-Authenticate so that git asks
// for credentials. Each case: baseline config, plant the vector, run git, look for the canary file the planted script writes.
// Usage (repository root): node --import tsx packages/flow-sandbox/scripts/live/CredentialHelperProbe.mjs
// Output: one JSON line per case on stdout. Host only: no sbx, no sandbox, no network beyond 127.0.0.1. Needs git and sh.
// NOT part of npm test (it runs real git processes against a local server).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { hardenedGit } from '../../../extension-points/src/HardenedGit.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cred-probe-'));
// The user's own git configuration (a credential manager, say) must not answer in place of the planted helper: empty global and system files.
fs.writeFileSync(path.join(root, 'empty.gitconfig'), '');
process.env.GIT_CONFIG_GLOBAL = path.join(root, 'empty.gitconfig');
process.env.GIT_CONFIG_SYSTEM = path.join(root, 'empty.gitconfig');
const posix = value => value.replaceAll('\\', '/');
const slot = path.join(root, 'slot');
const origin = path.join(root, 'origin');
const git = (args, cwd, options = {}) =>
	spawnSync('git', args, {
		cwd,
		encoding: 'utf8',
		windowsHide: true,
		timeout: 60_000,
		env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...options.env },
	});

fs.mkdirSync(origin);
git(['init', '-q'], origin);
fs.writeFileSync(path.join(origin, 'a.txt'), 'one\n');
git(['-c', 'user.email=t@e.invalid', '-c', 'user.name=t', 'add', '-A'], origin);
git(['-c', 'user.email=t@e.invalid', '-c', 'user.name=t', 'commit', '-q', '-m', 'init'], origin);
git(['clone', '-q', origin, slot], root);
const baseConfig = fs.readFileSync(path.join(slot, '.git', 'config'), 'utf8');

const requests = [];
const server = http.createServer((request, response) => {
	requests.push(`${request.method} ${request.url} auth=${request.headers.authorization ?? 'none'}`);
	response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="probe"' });
	response.end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/repo.git`;

const plant = path.join(root, 'plant.sh');
fs.writeFileSync(plant, ['#!/bin/sh', `echo "$*" >> "${posix(root)}/CANARY-$1.txt"`, 'exit 0'].join('\n'));
const canary = name => path.join(root, `CANARY-${name}.txt`);
const ran = name =>
	fs.existsSync(canary(name)) ? fs.readFileSync(canary(name), 'utf8').trim().replaceAll('\n', ' | ') : null;

const results = [];
async function runCase(label, config, args, { env, hardened } = {}) {
	fs.writeFileSync(path.join(slot, '.git', 'config'), `${baseConfig}\n[remote "probe"]\n\turl = ${url}\n${config}`);
	for (const name of ['credential', 'askpass', 'urlcredential']) fs.rmSync(canary(name), { force: true });
	requests.length = 0;
	let command = ['git', ...args];
	let environment = { ...process.env, ...env };
	if (hardened) {
		const built = hardenedGit(args, { env: environment });
		command = ['git', ...built.args];
		environment = built.env;
	}
	// ASYNCHRONOUS on purpose: the http server lives in THIS process, and a blocking spawnSync would keep it from ever answering git
	// (git would wait for a 401 that cannot come, and no credential helper would ever be asked: the "inconclusive" of the first experiment).
	const result = await new Promise(resolve => {
		const child = spawn(command[0], command.slice(1), {
			cwd: slot,
			windowsHide: true,
			env: { ...environment, SSH_ASKPASS: '', GIT_TERMINAL_PROMPT: '0' },
		});
		let stderr = '';
		child.stderr.on('data', chunk => (stderr += chunk));
		child.stdout.on('data', () => undefined);
		const timer = setTimeout(() => child.kill(), 20_000);
		child.on('close', status => {
			clearTimeout(timer);
			resolve({ status, stderr });
		});
	});
	const row = {
		label,
		exit: result.status,
		requestsSeen: requests.length,
		helperRan: ran('credential'),
		askpassRan: ran('askpass'),
		urlHelperRan: ran('urlcredential'),
		stderr: (result.stderr ?? '').trim().split('\n').slice(-2).join(' / '),
	};
	results.push(row);
	console.log(JSON.stringify(row));
}

const helper = `\t\thelper = !sh ${posix(plant)} credential\n`;
console.log(
	`git ${git(['--version'], root).stdout.trim()}; system/global helpers: ${git(['config', '--show-origin', '--get-all', 'credential.helper'], slot).stdout.trim().replaceAll('\n', ' ; ') || '(none)'}`
);

await runCase('control: no planted helper, plain fetch', '', ['fetch', 'probe']);
await runCase('credential.helper in .git/config, plain fetch', `[credential]\n${helper}`, ['fetch', 'probe']);
await runCase(
	'credential.<url>.helper in .git/config, plain fetch',
	`[credential "http://127.0.0.1:${port}"]\n\thelper = !sh ${posix(plant)} urlcredential\n`,
	['fetch', 'probe']
);
await runCase('core.askPass in .git/config, plain fetch', `[core]\n\taskPass = sh ${posix(plant)} askpass\n`, [
	'fetch',
	'probe',
]);
// An askPass must be an executable (git spawns the value as a program, not through a shell): a .bat on Windows, a script with the exec bit
// on POSIX (what an agent would plant). The POSIX form is the same git code path but was not run here (Windows host).
const askBat = path.join(root, process.platform === 'win32' ? 'askpass.bat' : 'askpass.sh');
const canaryPath = path.join(root, 'CANARY-askpass.txt');
fs.writeFileSync(
	askBat,
	process.platform === 'win32'
		? `@echo off\r\necho askpass-ran>> "${canaryPath}"\r\necho user\r\n`
		: `#!/bin/sh\necho askpass-ran >> "${canaryPath}"\necho user\n`
);
if (process.platform !== 'win32') fs.chmodSync(askBat, 0o755);
await runCase(
	'core.askPass = an executable in .git/config, plain fetch',
	`[core]
	askPass = ${posix(askBat)}
`,
	['fetch', 'probe']
);
await runCase(
	'core.askPass = an executable in .git/config, hardenedGit MUTATING fetch',
	`[core]
	askPass = ${posix(askBat)}
`,
	['fetch', 'probe'],
	{ hardened: true }
);
await runCase('credential.helper, plain git ls-remote', `[credential]\n${helper}`, ['ls-remote', 'probe']);
await runCase('credential.helper, hardenedGit MUTATING fetch', `[credential]\n${helper}`, ['fetch', 'probe'], {
	hardened: true,
});
await runCase('credential.helper, hardenedGit READING status', `[credential]\n${helper}`, ['status'], {
	hardened: true,
});
await runCase(
	'credential.helper but GIT_ASKPASS in the environment (not config)',
	`[credential]\n${helper}`,
	['fetch', 'probe'],
	{ env: { GIT_ASKPASS: `${posix(plant)}` } }
);

server.close();
console.log(
	JSON.stringify({
		summary: results.map(({ label, helperRan, askpassRan, urlHelperRan, requestsSeen }) => ({
			label,
			requestsSeen,
			ran: helperRan ?? askpassRan ?? urlHelperRan ?? null,
		})),
	})
);
fs.rmSync(root, { recursive: true, force: true });
