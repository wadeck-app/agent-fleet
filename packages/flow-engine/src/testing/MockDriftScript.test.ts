/**
 * Tests the pure logic of scripts/check-mock-drift.js (state classification, cache reading, report,
 * exit codes). The real `--version` probes are replaced by fakes, so no CLI needs to be installed.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { findRepoRoot } from './VersionBaseline';

interface CliSpec {
	name: string;
	forceEnvVar: string;
	suite: string;
	parse: (output: string) => string | null;
}
interface Result {
	name: string;
	state: string;
	ok: boolean;
	installed: string | null;
	command: string;
	detail: string;
}
interface Script {
	CLIS: CliSpec[];
	STATE: Record<string, string>;
	evaluate: (cli: CliSpec, probe: object, cache: object, allowMissing?: string[]) => Result;
	readCache: (dir: string, cli: string) => { version?: string | null; error?: string };
	checkAll: (dir: string, opts: { probe: (cli: string) => object; allowMissing?: string[] }) => Result[];
	formatReport: (results: Result[]) => string;
	parseAllowMissing: (value?: string) => string[];
	validateAllowMissing: (names: string[]) => void;
	verifyCommand: (cli: CliSpec) => string;
	main: (argv: string[], env: Record<string, string | undefined>) => number;
}

const script = (await import(
	pathToFileURL(join(findRepoRoot(__dirname), 'scripts', 'check-mock-drift.js')).href
)) as unknown as Script;

const VERSIONS: Record<string, string> = {
	claude: '2.1.302 (Claude Code)',
	opencode: '1.19.3',
	codex: 'codex-cli 0.163.0',
};
const cli = (name: string): CliSpec => script.CLIS.find(c => c.name === name)!;
const fakeProbe =
	(overrides: Record<string, object> = {}) =>
	(name: string) =>
		overrides[name] ?? { raw: VERSIONS[name] };

describe('check-mock-drift', () => {
	let dir: string;
	const writeCache = (name: string, version: string) =>
		writeFileSync(
			join(dir, `${name}-version-tested.json`),
			JSON.stringify({ testedVersion: version, testedAt: 't' })
		);
	const writeAll = () => Object.entries(VERSIONS).forEach(([name, v]) => writeCache(name, v));

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'mock-drift-'));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	describe('version parsers', () => {
		it('claude keeps the full output', () => {
			expect(cli('claude').parse(VERSIONS['claude']!)).toBe(VERSIONS['claude']);
			expect(cli('claude').parse('garbage')).toBeNull();
		});
		it('opencode takes the last line only', () => {
			expect(cli('opencode').parse('banner\n1.19.3')).toBe('1.19.3');
			expect(cli('opencode').parse('banner only')).toBeNull();
		});
		it('codex requires the codex-cli prefix', () => {
			expect(cli('codex').parse('codex-cli 0.163.0')).toBe('codex-cli 0.163.0');
			expect(cli('codex').parse('0.163.0')).toBeNull();
		});
	});

	describe('readCache', () => {
		it('returns null version when the file is missing', () => {
			expect(script.readCache(dir, 'codex').version).toBeNull();
		});
		it('reads testedVersion', () => {
			writeCache('codex', 'codex-cli 0.1.0');
			expect(script.readCache(dir, 'codex').version).toBe('codex-cli 0.1.0');
		});
		it('reports invalid JSON and a missing field as errors', () => {
			writeFileSync(join(dir, 'codex-version-tested.json'), '{nope');
			expect(script.readCache(dir, 'codex').error).toBeDefined();
			writeFileSync(join(dir, 'claude-version-tested.json'), '{}');
			expect(script.readCache(dir, 'claude').error).toContain('testedVersion');
		});
	});

	describe('evaluate', () => {
		const ok = { version: VERSIONS['codex'], testedAt: 't', file: 'f' };
		it('OK when installed equals cached', () => {
			const r = script.evaluate(cli('codex'), { raw: VERSIONS['codex'] }, ok);
			expect(r).toMatchObject({ state: 'OK', ok: true });
		});
		it('DRIFT when versions differ, with the exact command', () => {
			const r = script.evaluate(cli('codex'), { raw: 'codex-cli 0.164.0' }, ok);
			expect(r).toMatchObject({ state: 'DRIFT', ok: false });
			expect(r.command).toBe(
				'CODEX_INTEGRATION=1 npm run test --workspace=flow-engine -- StepRunner.codex.integration.test'
			);
		});
		it('NEVER-VERIFIED when there is no cache', () => {
			const r = script.evaluate(cli('claude'), { raw: VERSIONS['claude'] }, { version: null, file: 'f' });
			expect(r).toMatchObject({ state: 'NEVER-VERIFIED', ok: false });
		});
		it('CACHE-UNREADABLE when the cache is corrupt', () => {
			const r = script.evaluate(cli('claude'), { raw: VERSIONS['claude'] }, { error: 'bad', file: 'f' });
			expect(r).toMatchObject({ state: 'CACHE-UNREADABLE', ok: false });
		});
		it('UNPARSABLE when --version output is unexpected', () => {
			const r = script.evaluate(cli('codex'), { raw: 'weird' }, ok);
			expect(r).toMatchObject({ state: 'UNPARSABLE', ok: false });
			expect(r.detail).toContain('weird');
		});
		it('NOT-INSTALLED fails unless explicitly allowed', () => {
			const probe = { error: 'not found' };
			expect(script.evaluate(cli('codex'), probe, ok)).toMatchObject({ state: 'NOT-INSTALLED', ok: false });
			const allowed = script.evaluate(cli('codex'), probe, ok, ['codex']);
			expect(allowed).toMatchObject({ state: 'NOT-INSTALLED', ok: true });
			expect(allowed.detail).toContain('acknowledged');
		});
	});

	describe('allow-missing parsing', () => {
		it('splits and trims', () => {
			expect(script.parseAllowMissing(' codex, opencode ,')).toEqual(['codex', 'opencode']);
			expect(script.parseAllowMissing(undefined)).toEqual([]);
		});
		it('rejects unknown names loudly', () => {
			expect(() => script.validateAllowMissing(['codx'])).toThrow(/unknown CLI "codx"/);
		});
	});

	describe('formatReport', () => {
		it('lists commands only for failing CLIs', () => {
			writeAll();
			writeCache('codex', 'codex-cli 0.1.0');
			const report = script.formatReport(script.checkAll(dir, { probe: fakeProbe() }));
			expect(report).toContain('CODEX_INTEGRATION=1');
			expect(report).not.toContain('CLAUDE_INTEGRATION=1');
			expect(report).toContain('mocks:verify:run');
		});
		it('shows WARN for an acknowledged missing CLI and no command section', () => {
			writeAll();
			const results = script.checkAll(dir, {
				probe: fakeProbe({ codex: { error: 'nf' } }),
				allowMissing: ['codex'],
			});
			const report = script.formatReport(results);
			expect(report).toContain('WARN');
			expect(report).not.toContain('spend real tokens');
		});
	});

	describe('main', () => {
		beforeEach(() => {
			vi.spyOn(console, 'log').mockImplementation(() => {});
			vi.spyOn(console, 'error').mockImplementation(() => {});
		});

		it('skips with exit 0 in CI without touching anything', () => {
			expect(script.main(['--cache-dir', join(dir, 'missing')], { CI: 'true' })).toBe(0);
		});
		it('exits 2 on unknown arguments, a missing --cache-dir value, or a bad allow list', () => {
			expect(script.main(['--bogus'], {})).toBe(2);
			expect(script.main(['--cache-dir'], {})).toBe(2);
			expect(script.main(['--status'], { MOCK_DRIFT_ALLOW_MISSING: 'nope' })).toBe(2);
		});
		it('exits 1 when drifted and 0 for --status, using whatever CLIs are installed here', () => {
			// The directory is empty, so every installed CLI is NEVER-VERIFIED and every absent one NOT-INSTALLED.
			const empty = join(dir, 'empty');
			mkdirSync(empty);
			expect(script.main(['--cache-dir', empty], {})).toBe(1);
			expect(script.main(['--cache-dir', empty, '--status'], {})).toBe(0);
		});
	});
});
