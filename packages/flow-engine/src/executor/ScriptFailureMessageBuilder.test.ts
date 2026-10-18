import { describe, expect, it, vi } from 'vitest';

import { PROCESS_COUNT_COMMAND } from './NtStatusDescriber';
import { ScriptFailureMessageBuilder } from './ScriptFailureMessageBuilder';

const okCounter = {
	count: vi.fn().mockResolvedValue({ ok: true, counts: { 'bash.exe': 135, 'conhost.exe': 114, 'node.exe': 40 } }),
};

describe('ScriptFailureMessageBuilder', () => {
	it.each([1, 2, 127, 255, -1])(
		'keeps the exact historical message for ordinary exit code %d (win32)',
		async code => {
			const builder = new ScriptFailureMessageBuilder('win32', okCounter);
			await expect(
				builder.build({ exitCode: code, shellPath: 'C:\\bash.exe', workingDir: 'C:\\w' })
			).resolves.toBe(`Script exited with code ${code}`);
		}
	);

	it('keeps the exact historical message on non-Windows even for an NTSTATUS-looking code, without probing', async () => {
		const counter = { count: vi.fn() };
		const builder = new ScriptFailureMessageBuilder('linux', counter);
		await expect(builder.build({ exitCode: 3221225794 })).resolves.toBe('Script exited with code 3221225794');
		expect(counter.count).not.toHaveBeenCalled();
	});

	it('0xC0000142: hex + name, shell, cwd, hint and process counts', async () => {
		const builder = new ScriptFailureMessageBuilder('win32', okCounter);
		const message = await builder.build({
			exitCode: 3221225794,
			shellPath: 'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
			workingDir: 'C:\\work\\dir',
		});
		expect(message).toContain('Script exited with code 3221225794 (0xC0000142 STATUS_DLL_INIT_FAILED)');
		expect(message).toContain('Shell: C:\\Program Files\\Git\\usr\\bin\\bash.exe');
		expect(message).toContain('Cwd: C:\\work\\dir');
		expect(message).toContain('Hint: ');
		expect(message).toContain(PROCESS_COUNT_COMMAND);
		expect(message).toContain('Process counts: bash.exe=135, conhost.exe=114, node.exe=40');
	});

	it('0xC0000142: says explicitly that the process count is unavailable and why', async () => {
		const counter = { count: vi.fn().mockResolvedValue({ ok: false, error: 'tasklist timed out' }) };
		const message = await new ScriptFailureMessageBuilder('win32', counter).build({
			exitCode: 0xc0000142,
			shellPath: 'bash',
			workingDir: 'C:\\w',
		});
		expect(message).toContain('Process counts: unavailable (tasklist timed out)');
	});

	it('other known NTSTATUS: name, shell and cwd, but no hint and no process probe', async () => {
		const counter = { count: vi.fn() };
		const message = await new ScriptFailureMessageBuilder('win32', counter).build({
			exitCode: 0xc0000005,
			shellPath: 'C:\\bash.exe',
			workingDir: 'C:\\w',
		});
		expect(message).toBe(
			'Script exited with code 3221225477 (0xC0000005 STATUS_ACCESS_VIOLATION)\nShell: C:\\bash.exe\nCwd: C:\\w'
		);
		expect(counter.count).not.toHaveBeenCalled();
	});

	it('unknown NTSTATUS: hex only', async () => {
		const message = await new ScriptFailureMessageBuilder('win32', { count: vi.fn() }).build({
			exitCode: 0xc0000999,
			shellPath: 'x',
			workingDir: 'y',
		});
		expect(message.split('\n')[0]).toBe('Script exited with code 3221227929 (0xC0000999)');
	});

	it('states explicitly when the executor did not report the shell or cwd', async () => {
		const message = await new ScriptFailureMessageBuilder('win32', { count: vi.fn() }).build({
			exitCode: 0xc0000005,
		});
		expect(message).toContain('Shell: unknown (not reported by the executor)');
		expect(message).toContain('Cwd: unknown (not reported by the executor)');
	});
});

describe('ScriptFailureMessageBuilder - strict hint', () => {
	it('appends the one-line strict hint after the historical message', async () => {
		const builder = new ScriptFailureMessageBuilder('linux', okCounter);
		const message = await builder.build({ exitCode: 1, strictApplied: true });
		expect(message).toBe(
			'Script exited with code 1\nStep ran in strict mode (set -eu): add `strict: false` to the step to disable.'
		);
	});

	it('adds nothing when strict was not applied or not reported', async () => {
		const builder = new ScriptFailureMessageBuilder('linux', okCounter);
		await expect(builder.build({ exitCode: 1, strictApplied: false })).resolves.toBe('Script exited with code 1');
		await expect(builder.build({ exitCode: 1 })).resolves.toBe('Script exited with code 1');
	});

	it('keeps the NTSTATUS rendering and appends the hint last', async () => {
		const builder = new ScriptFailureMessageBuilder('win32', okCounter);
		const message = await builder.build({ exitCode: 3221225794, strictApplied: true });
		expect(message).toContain('0xC0000142');
		expect(message.split('\n').at(-1)).toContain('strict: false');
	});
});
