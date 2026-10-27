import { ProjectOptionError, extractProjectOption } from '@wadeck-app/project-sdk';
import { Command, CommanderError } from 'commander';

import { singleProjectValue } from './SingleProjectOption';

const ENV_NAME = 'FLOW_PROJECT';

/** What both parsers are reduced to: the parsed selection, or the kind of error. */
type Outcome =
	| { kind: 'ok'; flag: string | undefined; env: string | undefined; rest: string[] }
	| { kind: 'error'; error: 'missing-value' | 'repeated' | 'unknown-option' | 'other'; detail: string };

interface Case {
	name: string;
	/** Arguments as the user types them after `flow`; the subcommand is `probe`. */
	argv: string[];
	env?: string;
	/** Set only for a reported, accepted difference: one-line reason, and the outcome of each side. */
	expectedDifference?: { reason: string; sdk: Outcome; flow: Outcome };
}

function ok(flag: string | undefined, env: string | undefined, rest: string[]): Outcome {
	return { kind: 'ok', flag, env, rest };
}

function fail(error: 'missing-value' | 'repeated' | 'unknown-option' | 'other'): Outcome {
	return { kind: 'error', error, detail: '' };
}

/** Error details (messages) are not compared: only the kind. */
function normalize(outcome: Outcome): Outcome {
	return outcome.kind === 'error' ? { ...outcome, detail: '' } : outcome;
}

function envOf(raw: string | undefined): NodeJS.ProcessEnv {
	return raw === undefined ? {} : { [ENV_NAME]: raw };
}

function runSdk(c: Case): Outcome {
	try {
		const option = extractProjectOption(c.argv, envOf(c.env), ENV_NAME);
		// The SDK returns the arguments with the subcommand: drop it to compare the same thing as flow.
		const withoutSubcommand = option.args.filter((arg, index) => !(arg === 'probe' && option.args.indexOf('probe') === index));
		// The SDK keeps the `--` marker in the arguments, commander removes it: same content after it, so compare without it.
		const marker = withoutSubcommand.indexOf('--');
		const rest = marker === -1 ? withoutSubcommand : withoutSubcommand.filter((_, index) => index !== marker);
		return ok(option.flag, option.env, rest);
	} catch (error) {
		if (error instanceof ProjectOptionError) {
			return { kind: 'error', error: error.kind, detail: error.message };
		}
		throw error;
	}
}

function runFlow(c: Case): Outcome {
	let flag: string | undefined;
	let rest: string[] = [];
	const program = new Command()
		.exitOverride()
		.configureOutput({ writeErr: () => {}, writeOut: () => {} })
		.argument('[ignored...]');
	program
		.command('probe')
		.argument('[rest...]')
		.option('-p, --project <ref>', 'project', singleProjectValue)
		.action((args: string[], options: { project?: string }) => {
			flag = options.project;
			rest = args;
		});
	try {
		program.parse(c.argv, { from: 'user' });
	} catch (error) {
		if (error instanceof CommanderError) {
			const kindByCode: Record<string, 'missing-value' | 'repeated' | 'unknown-option' | 'other'> = {
				'commander.optionMissingArgument': 'missing-value',
				'commander.unknownOption': 'unknown-option',
				// A value that looks like another option is a flag without value, as the SDK sees it.
				'commander.invalidArgument': error.message.includes('given twice')
					? 'repeated'
					: error.message.includes('looks like another option')
						? 'missing-value'
						: 'other',
			};
			return { kind: 'error', error: kindByCode[error.code] ?? 'other', detail: `${error.code}: ${error.message}` };
		}
		throw error;
	}
	// Same rule as ProjectScopeResolver.nonBlank (private there): a blank variable is unset.
	const raw = c.env;
	return ok(flag, raw === undefined || raw.trim() === '' ? undefined : raw, rest);
}

// @formatter:off
const cases: Case[] = [
	{ name: '-p after the subcommand', argv: ['probe', '-p', 'x'], },
	{ name: '--project after the subcommand', argv: ['probe', '--project', 'x'] },
	{ name: '--project=x', argv: ['probe', '--project=x'] },
	{ name: '-p between positional arguments', argv: ['probe', 'a', '-p', 'x', 'b'] },
	{ name: '-p before the subcommand', argv: ['-p', 'x', 'probe'], expectedDifference: { reason: "flow's -p is a subcommand option", sdk: ok('x', undefined, []), flow: fail('unknown-option') } },
	{ name: '--project=x before the subcommand', argv: ['--project=x', 'probe'], expectedDifference: { reason: "flow's -p is a subcommand option", sdk: ok('x', undefined, []), flow: fail('unknown-option') } },
	{ name: 'no flag', argv: ['probe', 'a'] },
	{ name: '-p without value (last argument)', argv: ['probe', '-p'] },
	{ name: '--project without value (last argument)', argv: ['probe', '--project'] },
	{ name: '-p followed by another flag', argv: ['probe', '-p', '--json'] },
	{ name: '--project= with empty value', argv: ['probe', '--project='] },
	{ name: 'repeated, same value', argv: ['probe', '-p', 'x', '-p', 'x'] },
	{ name: 'repeated, different values', argv: ['probe', '-p', 'a', '--project', 'b'] },
	{ name: 'repeated, mixed -p and --project=', argv: ['probe', '-p', 'a', '--project=b'] },
	{ name: 'flag after --', argv: ['probe', '--', '-p', 'x'] },
	{ name: 'flag before and after --', argv: ['probe', '-p', 'a', '--', '-p', 'b'] },
	{ name: 'value starting with a dash given with =', argv: ['probe', '--project=-x'], expectedDifference: { reason: "a project ref never starts with '-'; commander cannot tell `-p -x` from `--project=-x` in the value parser", sdk: ok('-x', undefined, []), flow: fail('missing-value') } },
	{ name: 'FLOW_PROJECT empty', argv: ['probe'], env: '' },
	{ name: 'FLOW_PROJECT blank', argv: ['probe'], env: '   ' },
	{ name: 'FLOW_PROJECT set, no flag', argv: ['probe'], env: 'envproj' },
	{ name: 'FLOW_PROJECT set and flag given', argv: ['probe', '-p', 'flagproj'], env: 'envproj' },
	{ name: 'FLOW_PROJECT blank and flag given', argv: ['probe', '-p', 'flagproj'], env: ' ' },
];
// @formatter:on

describe('SingleProjectOption conformance with the project SDK extractProjectOption', () => {
	it('the SDK extractProjectOption is importable', () => {
		if (typeof extractProjectOption !== 'function') {
			throw new Error('@wadeck-app/project-sdk does not export extractProjectOption: the conformance test cannot run');
		}
	});

	it.each(cases)('$name', (c) => {
		const sdk = normalize(runSdk(c));
		const flow = normalize(runFlow(c));
		if (c.expectedDifference !== undefined) {
			expect({ sdk, flow }).toEqual({ sdk: normalize(c.expectedDifference.sdk), flow: normalize(c.expectedDifference.flow) });
			expect(sdk).not.toEqual(flow);
		} else {
			expect(flow).toEqual(sdk);
		}
	});
});
