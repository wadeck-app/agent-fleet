import { describe, expect, it } from 'vitest';

import { RecordingSandboxLog } from '../testing/RecordingSandboxLog';
import { VmEnvironmentFilter } from './VmEnvironmentFilter';

const HOST: NodeJS.ProcessEnv = {
	ANTHROPIC_API_KEY: 'sk-host-secret',
	PATH: 'C:\\Windows',
	FLOW_WORKER_TOKEN: 'launch-token-secret',
	'CommonProgramFiles(x86)': 'C:\\Program Files (x86)\\Common Files',
	AWS_PROFILE: 'claude',
	SHARED: 'same',
};

describe('VmEnvironmentFilter host-only variables', () => {
	it('drops the host-only variables whatever their case, keeps the step variables, even when the step declares them', () => {
		const filtered = new VmEnvironmentFilter(HOST).filter({
			PATH: 'C:\\Git\\bin',
			Path: 'C:\\Windows',
			HOME: 'C:\\Users\\me',
			USERPROFILE: 'C:\\Users\\me',
			SystemRoot: 'C:\\Windows',
			TEMP: 'C:\\Temp',
			TMP: 'C:\\Temp',
			TMPDIR: '/tmp',
			FLOW_BASH_PATH: 'C:\\Git\\bin\\bash.exe',
			MY_FLAG: 'on',
		});
		expect(filtered.env).toEqual({ MY_FLAG: 'on' });
		expect(filtered.droppedHostOnly.sort()).toEqual(
			['FLOW_BASH_PATH', 'HOME', 'PATH', 'Path', 'SystemRoot', 'TEMP', 'TMP', 'TMPDIR', 'USERPROFILE'].sort()
		);

		// A Windows PATH means nothing in the VM, declared or not.
		const declared = new VmEnvironmentFilter(HOST).filter({ PATH: 'C:\\mine' }, new Set(['PATH']));
		expect(declared.env).toEqual({});
		expect(declared.droppedHostOnly).toEqual(['PATH']);
	});
});

describe('VmEnvironmentFilter ambient copies of the host environment', () => {
	it('drops what the engine copied from the host environment (script steps are not isolated by the engine)', () => {
		const filtered = new VmEnvironmentFilter(HOST).filter({
			FLOW_WORKER_TOKEN: 'launch-token-secret',
			ANTHROPIC_API_KEY: 'sk-host-secret',
			'CommonProgramFiles(x86)': 'C:\\Program Files (x86)\\Common Files',
			SHARED: 'same',
			DECLARED: 'x',
		});
		expect(filtered.env).toEqual({ DECLARED: 'x' });
		expect(filtered.droppedAmbient.sort()).toEqual(
			['ANTHROPIC_API_KEY', 'CommonProgramFiles(x86)', 'FLOW_WORKER_TOKEN', 'SHARED'].sort()
		);
	});

	it("keeps a declared variable even when its value equals the host's, and a variable whose value differs: the step chose it", () => {
		const declared = new VmEnvironmentFilter(HOST).filter({ AWS_PROFILE: 'claude' }, new Set(['AWS_PROFILE']));
		expect(declared.env).toEqual({ AWS_PROFILE: 'claude' });

		const differing = new VmEnvironmentFilter(HOST).filter({ ANTHROPIC_API_KEY: 'sk-step-own', SHARED: 'other' });
		expect(differing.env).toEqual({ ANTHROPIC_API_KEY: 'sk-step-own', SHARED: 'other' });
	});

	it('compares names without regard to case (Windows environment names)', () => {
		const filtered = new VmEnvironmentFilter(HOST).filter({ flow_worker_token: 'launch-token-secret' });
		expect(filtered.env).toEqual({});
		const declared = new VmEnvironmentFilter(HOST).filter(
			{ flow_worker_token: 'launch-token-secret' },
			new Set(['FLOW_WORKER_TOKEN'])
		);
		expect(declared.env).toEqual({ flow_worker_token: 'launch-token-secret' });
	});
});

describe('VmEnvironmentFilter misc', () => {
	it('ignores undefined values and an absent environment, and flags values that look like Windows paths while forwarding them unchanged', () => {
		const filter = new VmEnvironmentFilter(HOST);
		expect(filter.filter({ A: undefined, B: 'b' }).env).toEqual({ B: 'b' });
		expect(filter.filter(undefined).env).toEqual({});

		const filtered = filter.filter({ OUT: 'C:\\work\\out', URL: 'https://example.com/a' });
		expect(filtered.windowsPathNames).toEqual(['OUT']);
		expect(filtered.env['OUT']).toBe('C:\\work\\out');
	});

	it('reports in one line, as a warning only when Windows paths are involved', () => {
		const filter = new VmEnvironmentFilter(HOST);
		const log = new RecordingSandboxLog();
		filter.report(filter.filter({ PATH: 'x', ANTHROPIC_API_KEY: 'sk-host-secret' }), log, 'ctx');
		filter.report(filter.filter({ OUT: 'C:\\w' }), log, 'ctx2');
		filter.report(filter.filter({ PLAIN: '1' }), log, 'ctx3');
		expect(log.lines).toHaveLength(2);
		expect(log.lines[0]).toMatch(
			/^info: ctx: host-only variables not forwarded: PATH; 1 variable\(s\) copied from the host environment and not declared by the step were not forwarded \(ANTHROPIC_API_KEY\)$/
		);
		expect(log.lines[1]).toMatch(/^warn: ctx2: .*Windows paths.*: OUT$/);
	});

	it('never prints a value, whichever way the variable was dropped or flagged (names only)', () => {
		const filter = new VmEnvironmentFilter(HOST);
		const log = new RecordingSandboxLog();
		const environment = {
			// host-only: dropped
			PATH: 'C:\\Users\\me\\HOST-ONLY-PATH-VALUE\\bin',
			HOME: 'HOST-ONLY-HOME-VALUE',
			// ambient copies of the host environment: dropped
			ANTHROPIC_API_KEY: 'sk-host-secret',
			FLOW_WORKER_TOKEN: 'launch-token-secret',
			SHARED: 'same',
			// forwarded but flagged: a Windows path value
			OUT: 'C:\\FLAGGED-WINDOWS-PATH-VALUE\\out',
			// forwarded and not flagged
			PLAIN: 'FORWARDED-PLAIN-VALUE',
		};

		const filtered = filter.filter(environment);
		filter.report(filtered, log, 'ctx');
		const description = filter.describe(filtered);

		expect(filtered.droppedHostOnly.sort()).toEqual(['HOME', 'PATH']);
		expect(filtered.droppedAmbient.sort()).toEqual(['ANTHROPIC_API_KEY', 'FLOW_WORKER_TOKEN', 'SHARED']);
		expect(description).toContain('HOME,PATH');
		expect(description).toContain('ANTHROPIC_API_KEY,FLOW_WORKER_TOKEN,SHARED');
		expect(description).toContain('OUT');
		for (const text of [log.text(), description ?? '']) {
			for (const value of [
				...Object.values(environment).filter(value => value !== 'same'),
				'HOST-ONLY-PATH-VALUE',
				'sk-host-secret',
				'launch-token-secret',
				'FLAGGED-WINDOWS-PATH-VALUE',
			]) {
				expect(text, value).not.toContain(value);
			}
		}
	});

	it('shortens a long list of ambient names in the log line', () => {
		const names = Array.from({ length: 30 }, (_, index) => `AMBIENT_${String(index).padStart(2, '0')}`);
		const host = Object.fromEntries(names.map(name => [name, 'v']));
		const filter = new VmEnvironmentFilter(host);
		const line = filter.describe(filter.filter(host));
		expect(line).toMatch(/^30 variable\(s\) copied/);
		expect(line).toContain('AMBIENT_00');
		expect(line).toMatch(/,\.\.\.\)$/);
		expect(line).not.toContain('AMBIENT_29');
	});
});
