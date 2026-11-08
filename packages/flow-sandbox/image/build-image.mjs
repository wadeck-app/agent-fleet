#!/usr/bin/env node

/**
 * Builds the flow sandbox template image (image/Dockerfile) and loads it into sbx. Host `docker build` is not
 * available on every machine (Windows containers mode), so the build runs inside a builder sandbox:
 *   builder sandbox -> docker build -> docker save -> sbx template load -> builder removed.
 *
 * Usage (from the repository root):
 *   node --import tsx packages/flow-sandbox/image/build-image.mjs [--tag flow-sandbox:m2]
 *
 * Needs: sbx signed in with a policy that lets the builder reach Docker Hub and the npm registry. The builder
 * is flow-sbx-image-builder-<random> (2 cpus, 2 GiB); the tar (about 1.3 GB) lives in a temp directory. Both are
 * removed in a finally block. Changes no setting and no machine-wide policy.
 */
import { randomBytes } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DockerImageId } from '../src/DockerImageId.ts';
import { ImageBuildPlan } from '../src/ImageBuildPlan.ts';
import { PathTranslator } from '../src/PathTranslator.ts';
import { SbxBinaryLocator } from '../src/SbxBinaryLocator.ts';
import { SbxCliRuntime } from '../src/SbxCliRuntime.ts';
import { SbxProcess } from '../src/SbxProcess.ts';

const imageDirectory = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const tagFlag = argv.indexOf('--tag');
const tag = tagFlag >= 0 ? argv[tagFlag + 1] : 'flow-sandbox:m2';
const argumentsValid = argv.length === 0 || (tagFlag === 0 && argv.length === 2);
if (!argumentsValid || !/^[a-z0-9._/-]+:[A-Za-z0-9._-]+$/.test(tag ?? '')) {
	console.error('Usage: build-image.mjs [--tag <name>:<version>]   (for example flow-sandbox:m2)');
	process.exit(2);
}

// Before any temp directory or sandbox exists: the bundles are build output and may simply not have been built.
try {
	ImageBuildPlan.assertBundles(path.join(imageDirectory, 'opt-flow'));
} catch (error) {
	console.error(error.message);
	process.exit(1);
}

const builder = `flow-sbx-image-builder-${randomBytes(4).toString('hex')}`;
const root = mkdtempSync(path.join(os.tmpdir(), 'flow-sbx-image-'));
const context = path.join(root, 'context');
const output = path.join(root, 'out');
mkdirSync(context);
mkdirSync(output);
cpSync(path.join(imageDirectory, 'Dockerfile'), path.join(context, 'Dockerfile'));
cpSync(path.join(imageDirectory, 'opt-flow'), path.join(context, 'opt-flow'), { recursive: true });
// The pinned model CLIs (Dockerfile: npm ci --ignore-scripts from this lock).
mkdirSync(path.join(context, 'tools'));
for (const file of ['package.json', 'package-lock.json']) {
	cpSync(path.join(imageDirectory, file), path.join(context, 'tools', file));
}
// Source-controlled file of the image (the others in opt-flow are build output of BuildInnerBundles.mjs); needed from flow-sandbox:m7.
cpSync(
	path.join(imageDirectory, 'mcp-callback-forwarder.cjs'),
	path.join(context, 'opt-flow', 'mcp-callback-forwarder.cjs')
);

const runtime = new SbxCliRuntime();
const translator = new PathTranslator({ workspaceDir: context, workspaceMetaDir: output, platform: process.platform });
let builderCreated = false;

function step(label) {
	console.log(`[${new Date().toISOString()}] ${label}`);
}

/**
 * Runs one command (an argument list, no shell) in the builder sandbox and returns its standard output.
 * With `tolerateFailure`, a failing command returns its error text instead of throwing (index.json is absent from classic archives).
 */
async function inBuilder(label, command, tolerateFailure = false) {
	step(label);
	const result = await runtime.exec({
		sandbox: builder,
		command,
		signal: AbortSignal.timeout(900_000),
	});
	if (result.exitCode !== 0 && tolerateFailure) return result.stderr || result.stdout;
	if (result.exitCode !== 0) {
		throw new Error(
			`${label} failed (exit ${result.exitCode}).\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
		);
	}
	return result.stdout;
}

try {
	step(`create builder sandbox ${builder}`);
	builderCreated = true;
	await runtime.create({
		name: builder,
		agent: 'claude',
		mounts: [{ hostPath: context }, { hostPath: output }],
		cpus: 2,
		memory: '2g',
	});
	const contextInVm = translator.toSandbox(context, 'context');
	const tarInVm = `${translator.toSandbox(output, 'output')}/image.tar`;
	await inBuilder('docker build', ImageBuildPlan.build(tag, contextInVm));
	// The id of what was built, then proof that the archive that is loaded holds exactly that image.
	const imageId = DockerImageId.parse(await inBuilder('read the image id', ImageBuildPlan.inspectId(tag)));
	await inBuilder('docker save', ImageBuildPlan.save(tag, tarInVm));
	DockerImageId.assertInArchive(
		imageId,
		await inBuilder('read the archive manifest', ImageBuildPlan.readManifest(tarInVm)),
		tag,
		// containerd image store: the image id is the digest listed here, not the config of manifest.json.
		await inBuilder('read the archive index', ImageBuildPlan.readIndex(tarInVm), true)
	);
	const tarPath = path.join(output, 'image.tar');
	step(`sbx template load (${Math.round(statSync(tarPath).size / 1e6)} MB)`);
	const binary = new SbxBinaryLocator({
		binaryPath: undefined,
		env: process.env,
		platform: process.platform,
		nodeExecutable: process.execPath,
	}).locate();
	const loaded = await new SbxProcess().run({
		binary,
		args: ['template', 'load', tarPath],
		env: process.env,
		timeoutMs: 600_000,
	});
	if (loaded.exitCode !== 0) {
		throw new Error(`sbx template load failed (exit ${loaded.exitCode}): ${loaded.stderr || loaded.stdout}`);
	}
	const listed = await new SbxProcess().run({
		binary,
		args: ['template', 'ls'],
		env: process.env,
		timeoutMs: 60_000,
	});
	const [repository, version] = tag.split(':');
	if (
		!listed.stdout.split('\n').some(line => line.includes(repository) && new RegExp(`\\s${version}\\s`).test(line))
	) {
		throw new Error(`The image ${tag} is not in \`sbx template ls\` after the load:\n${listed.stdout}`);
	}
	step(`image id ${imageId} (the saved archive holds it)`);
	step(`done: ${tag} is loaded. Create sandboxes with image "${tag}" and pull "never".`);
} finally {
	// A cleanup failure is reported loudly but never hides the build error.
	if (builderCreated) {
		await runtime
			.remove(builder)
			.catch(error =>
				console.error(`CLEANUP FAILED: run \`sbx rm --force ${builder}\` by hand: ${error.message}`)
			);
	}
	rmSync(root, { recursive: true, force: true });
}
