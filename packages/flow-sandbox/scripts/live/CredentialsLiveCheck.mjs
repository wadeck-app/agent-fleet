#!/usr/bin/env node

/**
 * GATED live acceptance of milestone M2: one real Bedrock call per model CLI (claude, opencode, codex) from a sandbox
 * that holds NO AWS key, then the session is resumed from a NEW sandbox. Never part of `npm test`, `npm run check` or CI.
 *
 * What it does, per tool: creates sandbox flow-sbx-m2-<tool>-a from the M0b image, wires it to a HostCredentialEndpoint
 * (SandboxCredentialAccess), runs one tiny prompt, scans the VM for AWS key material, removes the sandbox, creates
 * flow-sbx-m2-<tool>-b over the same mounts and resumes the session. Everything is removed in a `finally`.
 * It never changes a setting or a machine-wide policy; rules and secrets are scoped to its own sandboxes.
 *
 * Usage (from the repository root):
 *   SBX_LIVE=1 node --import tsx packages/flow-sandbox/scripts/live/CredentialsLiveCheck.mjs
 *
 * Env:
 *   SBX_LIVE=1                  required.
 *   M2_IMAGE                    template image, default flow-sandbox:m2 (must contain claude, codex and opencode).
 *   M2_CLAUDE_PROFILE           host AWS profile for claude and opencode. Default: AWS_PROFILE of this process.
 *   M2_CODEX_PROFILE            host AWS profile for codex. Default: the only profile of `aws configure list-profiles` whose name contains "codex".
 *   M2_REGION                   default: `aws configure get region --profile <claude profile>`.
 *   M2_TOOLS                    comma separated subset of claude,opencode,codex. Default all three.
 *   M2_CODEX_DISABLE_PLUGINS    "0" runs codex WITHOUT `--disable plugins` (default "1").
 *   M2_CODEX_GITHUB             "1" also opens github.com for codex (default "0").
 *   M2_CODEX_PINNED_VERSION     e.g. 0.149.1: install that @openai/codex under /home/agent/codex-pinned in EACH codex sandbox and use it
 *                               (the image's codex 0.164.0 cannot resume a session whose CODEX_HOME is on the mount, see RESULTS.md).
 *   M2_OUTPUT                   file receiving the JSON evidence. Default .claude/temp/poc-m2/live-results.json
 *   OPENAI_API_KEY / ANTHROPIC_API_KEY  only used to exercise the API-key secret path when ALREADY set; never asked for.
 *
 * Exit code: 0 all steps passed, 1 a step failed, 2 refused to run.
 */
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AwsCredentialExporter } from '../../src/AwsCredentialExporter.ts';
import { CodexBedrockSettings } from '../../src/CodexBedrockSettings.ts';
import { CredentialGlueInstaller } from '../../src/CredentialGlueInstaller.ts';
import { HostCredentialEndpoint } from '../../src/HostCredentialEndpoint.ts';
import { NodeCommandRunner } from '../../src/NodeCommandRunner.ts';
import { PathTranslator } from '../../src/PathTranslator.ts';
import { ProviderSecrets } from '../../src/ProviderSecrets.ts';
import { SandboxCredentialAccess } from '../../src/SandboxCredentialAccess.ts';
import { SandboxNetworkRules } from '../../src/SandboxNetworkRules.ts';
import { SbxCliRuntime } from '../../src/SbxCliRuntime.ts';
import { SbxPrerequisiteCheck } from '../../src/SbxPrerequisiteCheck.ts';
import { ToolStoreRedirect } from '../../src/ToolStoreRedirect.ts';

function refuse(message) {
	console.error(`CredentialsLiveCheck refused to run: ${message}`);
	process.exit(2);
}

if (process.env.SBX_LIVE !== '1') {
	refuse('set SBX_LIVE=1 to confirm that you want to create and remove real sandboxes and make real Bedrock calls.');
}
if (process.env.SBX_MOCK_PATH) {
	refuse('SBX_MOCK_PATH is set, so the runtime would talk to the mock and the result would not be live. Unset it.');
}

const repositoryRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const outputFile = process.env.M2_OUTPUT ?? path.join(repositoryRoot, '.claude', 'temp', 'poc-m2', 'live-results.json');
const image = process.env.M2_IMAGE ?? 'flow-sandbox:m2';
const tools = (process.env.M2_TOOLS ?? 'claude,opencode,codex').split(',').filter(Boolean);
const codexDisablePlugins = process.env.M2_CODEX_DISABLE_PLUGINS !== '0';
const codexNeedsGithub = process.env.M2_CODEX_GITHUB === '1';
const codexPinnedVersion = process.env.M2_CODEX_PINNED_VERSION;
const codexBinary = codexPinnedVersion ? '/home/agent/codex-pinned/bin/codex' : 'codex';

const commandRunner = new NodeCommandRunner();

async function awsText(args) {
	const result = await commandRunner.run({ command: 'aws', args, timeoutMs: 30_000 });
	if (result.exitCode !== 0) throw new Error(`aws ${args.join(' ')} failed: ${result.stderr.trim()}`);
	return result.stdout.trim();
}

const claudeProfile = process.env.M2_CLAUDE_PROFILE ?? process.env.AWS_PROFILE;
if (!claudeProfile) refuse('no host AWS profile for claude/opencode: set M2_CLAUDE_PROFILE or AWS_PROFILE.');

const codexProfile = await (async () => {
	if (process.env.M2_CODEX_PROFILE) return process.env.M2_CODEX_PROFILE;
	const profiles = (await awsText(['configure', 'list-profiles'])).split(/\r?\n/).filter(name => /codex/i.test(name));
	if (profiles.length !== 1) {
		if (tools.includes('codex')) {
			refuse(
				`expected exactly one profile containing "codex" in \`aws configure list-profiles\`, found ${profiles.length}. Set M2_CODEX_PROFILE.`
			);
		}
		return claudeProfile;
	}
	return profiles[0];
})();
const region = process.env.M2_REGION ?? (await awsText(['configure', 'get', 'region', '--profile', claudeProfile]));
if (!region) refuse('no AWS region: set M2_REGION or configure one for the claude profile.');

const suffix = randomBytes(3).toString('hex');
const root = fs.mkdtempSync(path.join(os.tmpdir(), `flow-sbx-m2-${suffix}-`));
const secretsDirectory = path.join(root, 'secrets');
fs.mkdirSync(secretsDirectory);

const log = {
	info: message => console.log(`      log: ${message}`),
	warn: message => console.log(`      log WARN: ${message}`),
};
const runtime = new SbxCliRuntime();
const evidence = {
	startedAt: new Date().toISOString(),
	image,
	region,
	claudeProfile,
	codexProfile,
	codexDisablePlugins,
	codexNeedsGithub,
	codexPinnedVersion: codexPinnedVersion ?? null,
	tools: {},
	notes: [],
};
const createdSandboxes = new Set();
const results = [];

async function step(name, action) {
	const started = Date.now();
	try {
		const detail = await action();
		results.push({ name, ok: true });
		console.log(`PASS  ${name} (${Date.now() - started} ms)${detail ? ` - ${detail}` : ''}`);
	} catch (error) {
		results.push({ name, ok: false });
		console.log(`FAIL  ${name} (${Date.now() - started} ms)`);
		console.log(`      ${error instanceof Error ? error.message : String(error)}`);
	}
}

function expect(condition, message) {
	if (!condition) throw new Error(message);
}

async function timed(label, record, action) {
	const started = performance.now();
	try {
		return await action();
	} finally {
		record[label] = Math.round(performance.now() - started);
	}
}

function countFiles(directory) {
	if (!fs.existsSync(directory)) return 0;
	let count = 0;
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		count += entry.isDirectory() ? countFiles(path.join(directory, entry.name)) : 1;
	}
	return count;
}

// ---- shared endpoint ----

const endpoint = new HostCredentialEndpoint({
	source: new AwsCredentialExporter({ commandRunner }),
	profiles: { claude: claudeProfile, codex: codexProfile },
	log,
	wallClock: () => new Date(),
});

// ---- per-tool recipes (the verified PoC commands, see research-findings.md) ----

const PROMPT_FIRST = 'Remember the word PINEAPPLE. Reply with the single word OK and nothing else.';
const PROMPT_RESUME = 'Which word did I ask you to remember? Reply with that single word only.';

function bedrockEnvironment(alias) {
	return { AWS_PROFILE: alias, AWS_DEFAULT_REGION: region };
}

function recipe(tool, store, codexModelArguments) {
	switch (tool) {
		case 'claude':
			return {
				alias: 'claude',
				env: {
					...bedrockEnvironment('claude'),
					CLAUDE_CODE_USE_BEDROCK: '1',
					// The model env var of this very session (see the environment of the process that runs Claude Code).
					...(process.env.ANTHROPIC_DEFAULT_SONNET_MODEL
						? { ANTHROPIC_DEFAULT_SONNET_MODEL: process.env.ANTHROPIC_DEFAULT_SONNET_MODEL }
						: {}),
				},
				first: () => ['claude', '-p', PROMPT_FIRST, '--model', 'sonnet', '--output-format', 'json'],
				resume: id => [
					'claude',
					'-p',
					PROMPT_RESUME,
					'--model',
					'sonnet',
					'--output-format',
					'json',
					'--resume',
					id,
				],
				sessionId: stdout => /"session_id"\s*:\s*"([^"]+)"/.exec(stdout)?.[1],
			};
		case 'opencode': {
			const model = 'amazon-bedrock/us.anthropic.claude-sonnet-5-5';
			return {
				alias: 'claude',
				env: bedrockEnvironment('claude'),
				first: () => ['opencode', 'run', '-m', model, '--format', 'json', PROMPT_FIRST],
				resume: id => ['opencode', 'run', '-m', model, '--format', 'json', '-s', id, PROMPT_RESUME],
				sessionId: stdout => /"sessionID"\s*:\s*"([^"]+)"/.exec(stdout)?.[1],
			};
		}
		case 'codex': {
			const common = [
				codexBinary,
				'exec',
				...store.codexExecOptions,
				...codexModelArguments,
				'--skip-git-repo-check',
				'--json',
			];
			return {
				alias: 'codex',
				env: bedrockEnvironment('codex'),
				first: () => [...common, PROMPT_FIRST],
				resume: id => [...common, 'resume', id, PROMPT_RESUME],
				sessionId: stdout => /"thread_id"\s*:\s*"([^"]+)"/.exec(stdout)?.[1],
			};
		}
		default:
			throw new Error(`unknown tool ${tool}`);
	}
}

// ---- VM scan: no AWS key material anywhere ----

const KEY_REGEX =
	'AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|aws_secret_access_key|aws_session_token|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|AWS_ACCESS_KEY_ID';
const SCAN_SCRIPT = [
	'p=$(cat)',
	'echo "== env variables matching the key pattern (names only)"',
	`env | grep -E '${KEY_REGEX}' | cut -d= -f1`,
	'echo "== env variables containing an exact host credential (names only)"',
	'env | grep -F -f <(printf "%s\\n" "$p") | cut -d= -f1',
	'echo "== files matching the key pattern"',
	`find /home/agent /tmp "$@" -xdev -type f -size -4M -not -path '*/node_modules/*' -not -path '/home/agent/.local/lib/*' -print0 2>/dev/null | xargs -0 -r grep -IlE '${KEY_REGEX}' 2>/dev/null`,
	'echo "== files containing an exact host credential"',
	`find /home/agent /tmp "$@" -xdev -type f -size -4M -not -path '*/node_modules/*' -not -path '/home/agent/.local/lib/*' -print0 2>/dev/null | xargs -0 -r grep -IlF -f <(printf "%s\\n" "$p") 2>/dev/null`,
	'echo "== end"',
].join('\n');

async function scanForKeys(sandbox, mounts, hostProfile, control = {}) {
	const credentials = await new AwsCredentialExporter({ commandRunner }).export(hostProfile);
	const patterns = [
		credentials.AccessKeyId,
		credentials.SecretAccessKey,
		(credentials.SessionToken ?? '').slice(0, 80),
		...(control.extraPatterns ?? []),
	].filter(value => value.length >= 16);
	expect(patterns.length >= 2, 'the host did not return enough credential material to scan for');
	const result = await runtime.exec({
		sandbox,
		command: ['bash', '-c', SCAN_SCRIPT, 'scan', ...mounts],
		stdin: patterns.join('\n'),
		env: control.env,
	});
	expect(result.exitCode === 0, `the scan itself failed (exit ${result.exitCode}): ${result.stderr}`);
	const sections = result.stdout
		.split(/^== /m)
		.slice(1)
		.map(section => {
			const [title, ...lines] = section.split('\n');
			return { title: title.trim(), hits: lines.filter(line => line.trim() !== '' && line.trim() !== '== end') };
		});
	const sectionTitles = sections.map(section => section.title);
	expect(sectionTitles.length === 5, `scan output has an unexpected shape: ${JSON.stringify(sectionTitles)}`);
	const findings = sections.filter(section => section.title !== 'end' && section.hits.length > 0);
	return { findings, report: sections };
}

// ---- one tool end to end ----

async function runTool(tool) {
	const record = { tool, timingsMs: {}, files: {} };
	evidence.tools[tool] = record;
	const toolRoot = path.join(root, tool);
	const workspace = path.join(toolRoot, 'ws');
	const meta = path.join(toolRoot, 'ws.meta');
	fs.mkdirSync(workspace, { recursive: true });
	fs.mkdirSync(path.join(meta, 'outputs'), { recursive: true });
	const translator = new PathTranslator({
		workspaceDir: workspace,
		workspaceMetaDir: meta,
		platform: process.platform,
	});
	const redirect = new ToolStoreRedirect({
		translator,
		workspaceMetaDir: meta,
		platform: process.platform,
		codexDisablePlugins,
	});
	const store = redirect.prepare(tool);
	const codexModelArguments =
		tool === 'codex'
			? CodexBedrockSettings.arguments({ model: 'openai.gpt-5.6-terra', profileAlias: 'codex', region })
			: [];
	const tr = recipe(tool, store, codexModelArguments);
	const mounts = [translator.toSandbox(workspace, 'workspace'), translator.toSandbox(meta, 'meta')];
	const cwd = translator.toSandbox(workspace, 'cwd');

	const access = new SandboxCredentialAccess({
		runtime,
		endpoint,
		networkRules: new SandboxNetworkRules(runtime, log),
		glue: new CredentialGlueInstaller(runtime),
		translator,
		tempDirectory: secretsDirectory,
		log,
	});

	let sessionId;
	let firstHandle;
	let resumeHandle;

	async function inSandbox(suffixLetter, command) {
		const sandbox = `flow-sbx-m2-${tool}-${suffixLetter}`;
		const timings = (record.timingsMs[suffixLetter] = {});
		await timed('createMs', timings, async () => {
			createdSandboxes.add(sandbox);
			await runtime.create({
				name: sandbox,
				agent: 'claude',
				mounts: [{ hostPath: workspace }, { hostPath: meta }],
				cpus: 2,
				memory: '2g',
				image,
				pull: 'never',
			});
		});
		const handle = await timed('attachMs', timings, () =>
			access.attach({
				sandbox,
				aliases: [tr.alias],
				region,
				// M2_CODEX_RULES_AS=claude opens only the Claude hosts for codex, to find out whether the mantle host is really needed.
				tools: [tool === 'codex' && process.env.M2_CODEX_RULES_AS ? process.env.M2_CODEX_RULES_AS : tool],
				codexNeedsGithub,
			})
		);
		const env = { ...store.env, ...handle.env, ...tr.env };
		if (tool === 'codex' && codexPinnedVersion) {
			await timed('codexInstallMs', timings, async () => {
				const install = await runtime.exec({
					sandbox,
					command: [
						'npm',
						'install',
						'-g',
						'--prefix',
						'/home/agent/codex-pinned',
						`@openai/codex@${codexPinnedVersion}`,
					],
				});
				expect(
					install.exitCode === 0,
					`installing codex ${codexPinnedVersion} in ${sandbox} failed: ${install.stderr.slice(0, 500)}`
				);
			});
		}
		const filesBefore = { store: countFiles(store.hostDirectory), workspace: countFiles(workspace) };
		const result = await timed('callMs', timings, () =>
			runtime.exec({ sandbox, command: command(), env, cwd, signal: AbortSignal.timeout(300_000) })
		);
		record.files[suffixLetter] = {
			storeBefore: filesBefore.store,
			storeAfter: countFiles(store.hostDirectory),
			workspaceBefore: filesBefore.workspace,
			workspaceAfter: countFiles(workspace),
		};
		return { sandbox, result, handle };
	}

	await step(`${tool}: first call from a sandbox without AWS keys (Bedrock, real)`, async () => {
		const { sandbox, result, handle } = await inSandbox('a', tr.first);
		firstHandle = handle;
		record.first = {
			exitCode: result.exitCode,
			stdout: result.stdout.slice(0, 4000),
			stderr: result.stderr.slice(0, 2000),
		};
		expect(
			result.exitCode === 0,
			`exit ${result.exitCode}; stderr: ${result.stderr.slice(0, 1500)} stdout: ${result.stdout.slice(0, 500)}`
		);
		expect(/\bOK\b/i.test(result.stdout), `no "OK" in the answer: ${result.stdout.slice(0, 800)}`);
		sessionId = tr.sessionId(result.stdout);
		expect(sessionId !== undefined, `no session id found in the output: ${result.stdout.slice(0, 800)}`);
		record.sessionId = sessionId;

		const scan = await scanForKeys(sandbox, mounts, tr.alias === 'codex' ? codexProfile : claudeProfile);
		record.keyScan = scan.report;
		expect(scan.findings.length === 0, `AWS key material found in the VM: ${JSON.stringify(scan.findings)}`);
		if (!evidence.scanControl) {
			// Positive control: the scan must FIND planted look-alikes in all three places, otherwise a clean result proves nothing.
			const hostProfileOfTool = tr.alias === 'codex' ? codexProfile : claudeProfile;
			await runtime.exec({
				sandbox,
				command: [
					'bash',
					'-c',
					'printf "AKIAABCDEFGHIJKLMNOP\n" > /tmp/flow-scan-canary-1.txt; printf "CANARY_EXACT_VALUE_123456\n" > /home/agent/flow-scan-canary-2.txt',
				],
			});
			const control = await scanForKeys(sandbox, mounts, hostProfileOfTool, {
				extraPatterns: ['CANARY_EXACT_VALUE_123456'],
				env: { FLOW_SCAN_CANARY: 'AKIAABCDEFGHIJKLMNOP' },
			});
			await runtime.exec({
				sandbox,
				command: ['rm', '-f', '/tmp/flow-scan-canary-1.txt', '/home/agent/flow-scan-canary-2.txt'],
			});
			const titles = control.findings.map(finding => finding.title);
			evidence.scanControl = { titles, report: control.report };
			expect(
				titles.length === 3 &&
					titles.includes('env variables matching the key pattern (names only)') &&
					titles.includes('files matching the key pattern') &&
					titles.includes('files containing an exact host credential'),
				`the scan control did not detect the planted canaries: ${JSON.stringify(control.report)}`
			);
		}
		const t = record.timingsMs.a;
		return `session ${sessionId}; create ${t.createMs} ms, attach ${t.attachMs} ms, call ${t.callMs} ms; store files ${record.files.a.storeAfter}; scan clean`;
	});

	if (tool === 'claude' && evidence.tools[tool].first?.exitCode === 0) {
		await step('claude: stop and restart of the first sandbox keeps credential access working', async () => {
			const sandbox = 'flow-sbx-m2-claude-a';
			const stopTimings = (record.timingsMs.stopStart = {});
			await timed('stopMs', stopTimings, () => runtime.stop(sandbox));
			await timed('startMs', stopTimings, () => runtime.start(sandbox));
			// The VM files and the sbx secret survive stop/start: the script must still get credentials.
			const probe = await runtime.exec({
				sandbox,
				command: [
					'bash',
					'-c',
					'/home/agent/.flow-credentials/credential-process.sh "$1" > /dev/null; echo "exit=$?"',
					'probe',
					tr.alias,
				],
				env: firstHandle.env,
			});
			record.stopStartProbe = { stdout: probe.stdout.slice(0, 500), stderr: probe.stderr.slice(0, 500) };
			expect(
				probe.stdout.trim() === 'exit=0',
				`credential_process failed after stop/start: ${probe.stdout} ${probe.stderr}`
			);
			return `stop ${stopTimings.stopMs} ms, start ${stopTimings.startMs} ms; credential_process still works`;
		});
	}

	if (sessionId !== undefined) {
		// The first sandbox goes away; its grant, rule and secret go with it. The session must survive on the mount.
		await runtime.remove(`flow-sbx-m2-${tool}-a`);
		createdSandboxes.delete(`flow-sbx-m2-${tool}-a`);
		// The sandbox is gone: detach only cleans the host side (grant, secret file); the missing sandbox is expected.
		await firstHandle.detach();
		await step(`${tool}: resume the session from a NEW sandbox`, async () => {
			const { result, handle } = await inSandbox('b', () => tr.resume(sessionId));
			resumeHandle = handle;
			record.resume = {
				exitCode: result.exitCode,
				stdout: result.stdout.slice(0, 4000),
				stderr: result.stderr.slice(0, 2000),
			};
			expect(result.exitCode === 0, `exit ${result.exitCode}; stderr: ${result.stderr.slice(0, 1500)}`);
			expect(
				/PINEAPPLE/i.test(result.stdout),
				`the resumed session did not answer PINEAPPLE: ${result.stdout.slice(0, 800)}`
			);
			const t = record.timingsMs.b;
			return `create ${t.createMs} ms, attach ${t.attachMs} ms, call ${t.callMs} ms`;
		});
		// Remove the second sandbox now so its rules cannot be confused with those of the next tool's sandboxes.
		await runtime.remove(`flow-sbx-m2-${tool}-b`);
		createdSandboxes.delete(`flow-sbx-m2-${tool}-b`);
		if (resumeHandle !== undefined) await resumeHandle.detach();
	}
}

// ---- API-key provider path: only when a key is already present ----

async function apiKeyStep() {
	const provider = process.env.ANTHROPIC_API_KEY ? 'anthropic' : process.env.OPENAI_API_KEY ? 'openai' : undefined;
	if (provider === undefined) {
		evidence.apiKeyProvider =
			'NOT RUN: no ANTHROPIC_API_KEY or OPENAI_API_KEY in the environment (and none is created or requested).';
		console.log(`SKIP  api-key provider: ${evidence.apiKeyProvider}`);
		return;
	}
	await step(
		`api-key provider (${provider}): store the secret for a sandbox only (the model call is NOT attempted)`,
		async () => {
			const sandbox = 'flow-sbx-m2-apikey';
			createdSandboxes.add(sandbox);
			const dir = path.join(root, 'apikey');
			fs.mkdirSync(dir);
			await runtime.create({
				name: sandbox,
				agent: 'claude',
				mounts: [{ hostPath: dir }],
				cpus: 2,
				memory: '2g',
				image,
				pull: 'never',
			});
			await new ProviderSecrets(runtime, process.env, log).install({ sandbox, provider });
			evidence.apiKeyProvider = `secret stored scoped to ${sandbox}; model call not attempted (the placeholder mechanism of built-in services is not documented)`;
		}
	);
}

// ---- main ----

async function main() {
	console.log(
		`M2 live check; image ${image}; region ${region}; claude profile ${claudeProfile}; codex profile ${codexProfile}; temp ${root}`
	);
	const report = await new SbxPrerequisiteCheck(runtime, { acceptSshAgentForwarding: true }).run();
	for (const finding of report.findings) console.log(`      [${finding.severity}] ${finding.id}: ${finding.message}`);
	if (report.findings.some(f => ['binary-missing', 'version-mismatch', 'version-unreadable'].includes(f.id))) {
		throw new Error('The prerequisite check found no usable pinned sbx; nothing else can run.');
	}
	const policyBefore = await runtime.readNetworkPolicy();
	await endpoint.start();
	console.log(`      credential endpoint on 127.0.0.1:${endpoint.port}`);

	for (const tool of tools) await runTool(tool);
	await apiKeyStep();

	await step('no machine-wide network rule was added by any of the above', async () => {
		const policyAfter = await runtime.readNetworkPolicy();
		expect(
			policyAfter.mode === policyBefore.mode &&
				policyAfter.allowedResourceCount === policyBefore.allowedResourceCount,
			`before ${JSON.stringify(policyBefore)}, after ${JSON.stringify(policyAfter)}`
		);
	});
}

try {
	await main();
} catch (error) {
	results.push({ name: 'setup', ok: false });
	console.log(`FAIL  setup: ${error instanceof Error ? error.message : String(error)}`);
} finally {
	await endpoint.stop();
	for (const sandbox of createdSandboxes) {
		try {
			await runtime.remove(sandbox);
			console.log(`cleanup: sandbox ${sandbox} removed`);
		} catch (error) {
			if (error?.kind !== 'not-found') {
				console.log(
					`CLEANUP FAILED for ${sandbox}: ${error instanceof Error ? error.message : String(error)}. Remove it with: sbx rm --force ${sandbox}`
				);
			}
		}
	}
	evidence.finishedAt = new Date().toISOString();
	evidence.results = results;
	fs.mkdirSync(path.dirname(outputFile), { recursive: true });
	fs.writeFileSync(outputFile, `${JSON.stringify(evidence, null, 2)}\n`);
	console.log(`evidence written to ${outputFile}`);
	fs.rmSync(root, { recursive: true, force: true });
}

const failed = results.filter(result => !result.ok);
console.log(
	`${results.length - failed.length}/${results.length} steps passed${failed.length ? `; failed: ${failed.map(f => f.name).join('; ')}` : ''}`
);
process.exit(failed.length === 0 ? 0 : 1);
