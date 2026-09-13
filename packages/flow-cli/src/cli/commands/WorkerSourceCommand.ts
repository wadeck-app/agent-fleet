import { ConfigDir } from '@wadeck-app/shared-cli';
import type { Command } from 'commander';
// normalizeError(...).message keeps the message bare: getErrorMessage() would render
// "[fail] Error: ...", double-prefixing the CLI's own marker.
import { normalizeError } from 'shared-common/utils/getErrorMessage';

// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { WorkerSourceRegistry } from '../../daemon/WorkerSourceRegistry';

// violations-suppress-end: ts/no-deep-relative

/** S1 implementations that ship with flow. */
const BUILT_IN_PROVIDERS = ['built-in:inbound', 'built-in:command', 'built-in:relay'] as const;

function parseMaxWorkers(raw: string): number {
	const value = Number(raw);
	if (!Number.isInteger(value) || value < 1) {
		throw new Error(`--max-workers must be a positive integer, got "${raw}"`);
	}
	return value;
}

/**
 * Reports a command failure and exits non-zero.
 *
 * The message is extracted here rather than inline at each call site: what reaches the
 * user is an authored, actionable sentence from WorkerSourceRegistry ("... is already
 * declared. Remove it first"), and for an unexpected failure the detail such as EACCES
 * is itself what they need to act on.
 */
function fail(err: unknown): never {
	const message = normalizeError(err).message;
	console.error(`[fail] ${message}`);
	process.exit(1);
}

/**
 * Collects the launch details a `built-in:command` entry needs, or nothing when none were given.
 *
 * Returns undefined rather than an empty object so a source declared without them stores no
 * `options` key at all; whether they are required for the chosen provider is the registry's call,
 * which is where the same rule applies to every caller and not just this CLI.
 */
function buildCommandOptions(options: {
	command?: string;
	arg?: string[];
	cwd?: string;
}): { command?: string; args?: string[]; cwd?: string } | undefined {
	const built = {
		...(options.command !== undefined ? { command: options.command } : {}),
		...(options.arg !== undefined && options.arg.length > 0 ? { args: options.arg } : {}),
		...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
	};
	return Object.keys(built).length > 0 ? built : undefined;
}

function parseLabels(raw: string | undefined): string[] {
	if (raw === undefined || raw.trim() === '') return [];
	// Comma-separated on the CLI, a list once stored -- matched as AND (D#7).
	return raw.split(',').map(label => label.trim());
}

/**
 * `flow worker source` -- declares, lists and removes worker sources.
 *
 * Without this the `command` S1 implementation is unreachable: nothing else can put an
 * entry in the registry (D#63).
 */
export function registerWorkerSourceCommand(program: Command): Command {
	const worker = program.command('worker').description('Run a worker, and manage worker sources');

	const source = worker.command('source').description('Declare and inspect the sources that can supply workers');

	source
		.command('add <sourceId>')
		.description('Declare a source of workers and print its registration token')
		.requiredOption(
			'--provider <provider>',
			`S1 implementation (${BUILT_IN_PROVIDERS.join(', ')}, or a plugin ref)`
		)
		.option('--labels <labels>', 'Comma-separated labels every worker from this source inherits', '')
		.option('--max-workers <n>', 'Maximum workers this source may supply', '1')
		// Without these, built-in:command could only be declared by hand-editing
		// worker-sources.json -- which is the unreachability this CLI exists to remove (D#63).
		.option(
			'--command <command>',
			'How built-in:command launches a worker, e.g. "flow worker --source <id> --token <token>"'
		)
		.option(
			'--arg <value>',
			'Argument appended to --command (repeatable)',
			(value: string, previous: string[] = []) => [...previous, value]
		)
		.option('--cwd <path>', 'Directory --command runs in (defaults to the daemon working directory)')
		.action(
			(
				sourceId: string,
				options: {
					provider: string;
					labels: string;
					maxWorkers: string;
					command?: string;
					arg?: string[];
					cwd?: string;
				}
			) => {
				try {
					const registry = new WorkerSourceRegistry(ConfigDir.get('flow'));
					const { token, sourceToken, entry } = registry.declare({
						sourceId,
						provider: options.provider,
						labels: parseLabels(options.labels),
						maxWorkers: parseMaxWorkers(options.maxWorkers),
						...(buildCommandOptions(options) !== undefined
							? { options: buildCommandOptions(options) }
							: {}),
					});

					console.log(`[ok] Declared worker source '${entry.sourceId}'`);
					console.log(`     provider   : ${entry.provider}`);
					console.log(`     labels     : ${entry.labels.length > 0 ? entry.labels.join(', ') : '(none)'}`);
					console.log(`     maxWorkers : ${String(entry.maxWorkers)}`);
					if (entry.options?.command !== undefined) {
						console.log(`     command    : ${entry.options.command}`);
					}
					console.log('');
					// Shown once by design: only the hashes are stored, so neither can be re-read.
					console.log(`     Worker token (shown once, store it now):`);
					console.log(`     ${token}`);
					console.log(
						`     Pass it to each worker: flow worker --source ${entry.sourceId} --token <worker token>`
					);
					console.log('');
					// Two credentials on purpose: a fake worker absorbs one step, a fake source
					// manufactures capacity across every project, so neither token works in the
					// other role (T-04, T-11).
					console.log(`     Source token (shown once, store it now):`);
					console.log(`     ${sourceToken}`);
					console.log(`     Only a relay registering *as* this source needs it. A worker cannot use it,`);
					console.log(`     and the worker token cannot be used to register as the source.`);
					console.log('');
					console.log(`     Declaring a source does not create a worker. It records how one can be`);
					console.log(`     obtained; a worker only becomes usable once it connects.`);
				} catch (err) {
					fail(err);
				}
			}
		);

	source
		.command('list')
		.description('List declared worker sources')
		.option('--json', 'Output as JSON')
		.action((options: { json?: boolean }) => {
			try {
				const entries = new WorkerSourceRegistry(ConfigDir.get('flow')).list();

				if (options.json) {
					console.log(JSON.stringify(entries, null, 2));
					return;
				}
				if (entries.length === 0) {
					console.log(
						'No worker sources declared. Add one with: flow worker source add <id> --provider <provider>'
					);
					return;
				}
				for (const entry of entries) {
					const labels = entry.labels.length > 0 ? entry.labels.join(', ') : '(none)';
					console.log(
						`${entry.sourceId}\t${entry.provider}\tmax=${String(entry.maxWorkers)}\tlabels=${labels}`
					);
				}
				// Declared is not the same as available: only a live connection proves that.
				console.log('');
				console.log('Declared sources describe intent. Use "flow worker list" to see live workers.');
			} catch (err) {
				fail(err);
			}
		});

	source
		.command('remove <sourceId>')
		.description('Remove a declared worker source')
		.action((sourceId: string) => {
			try {
				const removed = new WorkerSourceRegistry(ConfigDir.get('flow')).remove(sourceId);
				if (!removed) {
					console.error(`[fail] No worker source declared with id '${sourceId}'`);
					process.exit(1);
				}
				console.log(`[ok] Removed worker source '${sourceId}'`);
			} catch (err) {
				fail(err);
			}
		});

	// Returned so `flow worker start` can be attached to the same group.
	return worker;
}
