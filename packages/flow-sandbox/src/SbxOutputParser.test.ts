import { describe, expect, it } from 'vitest';

import { SbxOutputParser } from './SbxOutputParser';
import { failure } from './testing/ExpectedFailures';
import { SbxFixtures } from './testing/SbxFixtures';

const parser = new SbxOutputParser();
const fixtures = new SbxFixtures();

/** Every case must be refused as output-unparsable with the given text. */
function expectUnparsable(
	parse: (output: string) => unknown,
	cases: readonly (readonly [label: string, output: string, message: string])[]
): void {
	for (const [label, output, message] of cases) {
		const error = failure(() => parse(output), label);
		expect(error.kind, label).toBe('output-unparsable');
		expect(error.message, label).toContain(message);
	}
}

function policy(...rules: Record<string, unknown>[]): string {
	return JSON.stringify({ rules });
}

const globalAllow = (...resources: string[]): Record<string, unknown> => ({
	scope: 'global',
	resource_type: 'network',
	decision: 'allow',
	resources,
});

describe('SbxOutputParser.parseVersion', () => {
	it('reads the captured `sbx version` output and the variants of the banner', () => {
		expect(parser.parseVersion(fixtures.stdout('version'))).toEqual({
			version: '0.49.2',
			commit: '5d40fd43027b33ed1f1a39c14fb07e2503d6998f',
		});
		const cases: [string, string, { version: string; commit: string | undefined }][] = [
			[
				'a pre-release without commit',
				'sbx version v0.50.0-rc.1\n',
				{ version: '0.50.0-rc.1', commit: undefined },
			],
			['no leading v', 'sbx version 1.2.3 abcdef1\r\n', { version: '1.2.3', commit: 'abcdef1' }],
			[
				'a banner line before',
				'warning: x\nsbx version v0.49.2 5d40fd4\n',
				{ version: '0.49.2', commit: '5d40fd4' },
			],
		];
		for (const [label, output, expected] of cases) expect(parser.parseVersion(output), label).toEqual(expected);
	});

	it('rejects anything that is not a version line and shows the output', () => {
		for (const output of ['', 'hello', 'docker version 27.0.1', 'sbx version latest']) {
			const error = failure(() => parser.parseVersion(output), JSON.stringify(output));

			expect(error.kind, output).toBe('output-unparsable');
			expect(error.message, output).toContain('Expected a line like "sbx version v0.49.2 <commit>"');
			expect(error.message, output).toContain(`"${output.trim()}"`);
		}
	});
});

describe('SbxOutputParser.parseList', () => {
	it('reads the captured populated list, an empty list, and leaves absent optional fields absent', () => {
		const list = parser.parseList(fixtures.stdout('ls-json'));
		// Derived from the raw fixture so a re-capture (new sandbox name, date, agent) does not break the test.
		const raw = fixtures.json('ls-json') as Record<string, unknown>[];
		expect(
			raw.length,
			'the ls-json fixture must be populated: re-run scripts/CaptureSbxFixtures.mjs'
		).toBeGreaterThan(0);
		expect(list).toEqual(
			raw.map(entry => ({
				name: entry.name,
				agent: entry.agent,
				status: entry.status,
				workspaces: entry.workspaces,
				cpus: entry.cpus,
				memoryMib: entry.memory_mib,
				createdAt: entry.created_at,
			}))
		);

		expect(parser.parseList('[]\n')).toEqual([]);
		const [info] = parser.parseList(
			JSON.stringify([{ name: 'a-1', status: 'stopped', agent: 'shell', workspaces: [] }])
		);
		expect(info).toEqual({ name: 'a-1', status: 'stopped', agent: 'shell', workspaces: [] });
		expect('cpus' in (info ?? {})).toBe(false);
	});

	it('rejects malformed lists with the entry that is wrong, and truncates a long output in the message', () => {
		expectUnparsable(
			output => parser.parseList(output),
			[
				['not JSON', 'No sandboxes found', 'did not print valid JSON: "No sandboxes found"'],
				['an object', '{}', 'expected a JSON array'],
				['a non-object entry', '[1]', 'entry 0 is not an object'],
				[
					'an entry without name',
					'[{"status":"running","agent":"x","workspaces":[]}]',
					'entry 0 has no string "name"',
				],
				[
					'an entry without status',
					'[{"name":"a-1","agent":"x","workspaces":[]}]',
					'entry 0 has no string "status"',
				],
				[
					'an entry without agent',
					'[{"name":"a-1","status":"running","workspaces":[]}]',
					'entry 0 has no string "agent"',
				],
				[
					'workspaces that is not an array',
					'[{"name":"a-1","status":"running","agent":"x","workspaces":"C:\\\\x"}]',
					'entry 0 ("a-1") has no "workspaces" string array',
				],
				[
					'workspaces with a non-string',
					'[{"name":"a-1","status":"running","agent":"x","workspaces":[1]}]',
					'no "workspaces" string array',
				],
			]
		);

		const error = failure(() => parser.parseList('x'.repeat(500)));
		expect(error.message).toContain(`${'x'.repeat(200)}...`);
		expect(error.message).not.toContain('x'.repeat(201));
	});
});

describe('SbxOutputParser.parseDiagnose', () => {
	it('reads the captured report with its statuses, and treats missing message, detail and hint as empty strings', () => {
		const report = parser.parseDiagnose(fixtures.stdout('diagnose-json'));

		expect(report.checks).toHaveLength(17);
		expect(report.checks.find(check => check.name === 'Authentication')).toEqual({
			name: 'Authentication',
			status: 'pass',
			message: 'authenticated',
			detail: '',
			hint: '',
		});
		expect(new Set(report.checks.map(check => check.status))).toEqual(new Set(['pass', 'warn', 'skip']));
		expect(report.checks.find(check => check.name === 'Binary version')?.hint).toContain(
			'Download the latest release'
		);
		expect(parser.parseDiagnose('{"checks":[{"name":"x","status":"pass"}]}').checks).toEqual([
			{ name: 'x', status: 'pass', message: '', detail: '', hint: '' },
		]);
	});

	it('rejects malformed reports', () => {
		expectUnparsable(
			output => parser.parseDiagnose(output),
			[
				['not JSON', 'oops', 'did not print valid JSON'],
				['no checks', '{"version":"1.0"}', 'expected an object with a "checks" array'],
				['a non-object check', '{"checks":[3]}', 'check 0 is not an object'],
				['a check without name', '{"checks":[{"status":"pass"}]}', 'entry 0 has no string "name"'],
				['a check without status', '{"checks":[{"name":"x"}]}', 'entry 0 has no string "status"'],
			]
		);
	});
});

describe('SbxOutputParser.parseNetworkPolicy', () => {
	it('reads the captured balanced policy as restricted with its 195 allowed hosts', () => {
		expect(parser.parseNetworkPolicy(fixtures.stdout('policy-ls-json'))).toEqual({
			mode: 'restricted',
			allowedResourceCount: 195,
			deniedResourceCount: 0,
		});
	});

	it('reports deny-all when no global network rule allows anything, ignoring other scopes and resource types', () => {
		const output = policy(
			{ scope: 'global', resource_type: 'filesystem:write', decision: 'allow', resources: ['**'] },
			{ scope: 'sandbox:x', resource_type: 'network', decision: 'allow', resources: ['api.example.com:443'] }
		);

		expect(parser.parseNetworkPolicy(output)).toEqual({
			mode: 'deny-all',
			allowedResourceCount: 0,
			deniedResourceCount: 0,
		});
		expect(parser.parseNetworkPolicy(policy())).toMatchObject({ mode: 'deny-all' });
	});

	it('reports allow-all for a global allow of any catch-all, and counts deny resources without letting them make it allow-all', () => {
		for (const resource of ['**', '*', '**:*', '*:*']) {
			expect(parser.parseNetworkPolicy(policy(globalAllow('github.com:443', resource))), resource).toMatchObject({
				mode: 'allow-all',
				allowedResourceCount: 2,
			});
		}
		const output = policy(globalAllow('a.example.com:443'), {
			scope: 'global',
			resource_type: 'network',
			decision: 'deny',
			resources: ['**', 'b.example.com:443'],
		});

		expect(parser.parseNetworkPolicy(output)).toEqual({
			mode: 'restricted',
			allowedResourceCount: 1,
			deniedResourceCount: 2,
		});
	});

	it('rejects malformed policies', () => {
		expectUnparsable(
			output => parser.parseNetworkPolicy(output),
			[
				['not JSON', 'x', 'did not print valid JSON'],
				['no rules', '{}', 'expected an object with a "rules" array'],
				['a non-object rule', '{"rules":[1]}', 'rule 0 is not an object'],
				[
					'resources that is not a string array',
					policy({ scope: 'global', resource_type: 'network', decision: 'allow', resources: [1] }),
					'rule 0 has no "resources" string array',
				],
				[
					'an unknown decision',
					policy({ scope: 'global', resource_type: 'network', decision: 'ask', resources: ['a:1'] }),
					'rule 0 has decision "ask", expected "allow" or "deny"',
				],
			]
		);
	});
});

describe('SbxOutputParser.parseSettings', () => {
	it('reads the captured settings, ssh agent forwarding being on by default', () => {
		const settings = parser.parseSettings(fixtures.stdout('settings-ls-json'));

		expect(settings.get('ssh.agentForwardingEnabled')).toBe(true);
		expect(settings.get('kit.allowedSources')).toEqual(['docker.io/']);
		expect(settings.get('daemon.log.maxBackups')).toBe(3);
		expect(settings.has('no.such.key')).toBe(false);
	});

	it('rejects malformed settings', () => {
		expectUnparsable(
			output => parser.parseSettings(output),
			[
				['not JSON', 'x', 'did not print valid JSON'],
				['an object', '{}', 'expected a JSON array'],
				['an entry without key', '[{"value":1}]', 'entry 0 has no "key" and "value"'],
				['an entry without value', '[{"key":"a"}]', 'entry 0 has no "key" and "value"'],
			]
		);
	});
});
