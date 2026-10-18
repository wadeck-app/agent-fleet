import { describe, expect, it } from 'vitest';

import { NtStatusDescriber, PROCESS_COUNT_COMMAND } from './NtStatusDescriber';

describe('NtStatusDescriber', () => {
	describe('isNtStatus', () => {
		it.each([3221225794, 0xc0000005, 0xc0000000, 0xffffffff])('%d is an NTSTATUS', code => {
			expect(NtStatusDescriber.isNtStatus(code)).toBe(true);
		});

		it.each([0, 1, 2, 127, 255, 3221225471, -1, -1073741502, 0x100000000, 1.5, Number.NaN])(
			'%d is not an NTSTATUS (ordinary exit code, timeout marker, or out of 32-bit range)',
			code => {
				expect(NtStatusDescriber.isNtStatus(code)).toBe(false);
			}
		);
	});

	describe('format', () => {
		it.each([
			[0xc0000142, '0xC0000142 STATUS_DLL_INIT_FAILED'],
			[3221225794, '0xC0000142 STATUS_DLL_INIT_FAILED'],
			[0xc0000005, '0xC0000005 STATUS_ACCESS_VIOLATION'],
			[0xc0000135, '0xC0000135 STATUS_DLL_NOT_FOUND'],
			[0xc000013a, '0xC000013A STATUS_CONTROL_C_EXIT'],
			[0xc0000409, '0xC0000409 STATUS_STACK_BUFFER_OVERRUN'],
			[0xc00000fd, '0xC00000FD STATUS_STACK_OVERFLOW'],
			[0xc0000022, '0xC0000022 STATUS_ACCESS_DENIED'],
			[0xc0000017, '0xC0000017 STATUS_NO_MEMORY'],
		])('names the well-known status %d', (code, expected) => {
			expect(NtStatusDescriber.format(code)).toBe(expected);
		});

		it('renders an unknown NTSTATUS as zero-padded upper-case hex only', () => {
			expect(NtStatusDescriber.format(0xc0000999)).toBe('0xC0000999');
		});

		it('throws on a value that is not an NTSTATUS instead of guessing', () => {
			expect(() => NtStatusDescriber.format(1)).toThrow(/not an NTSTATUS/);
		});
	});

	describe('hint', () => {
		it('gives an actionable hint for 0xC0000142: resources, leaked processes, count command, worker restart', () => {
			const hint = NtStatusDescriber.hint(0xc0000142)!;
			expect(hint).toContain('failed to initialise');
			expect(hint).toContain('console/desktop-heap');
			expect(hint).toContain('bash.exe');
			expect(hint).toContain('conhost.exe');
			expect(hint).toContain(PROCESS_COUNT_COMMAND);
			expect(hint).toContain('restart the flow workers');
		});

		it('has no hint for other statuses', () => {
			expect(NtStatusDescriber.hint(0xc0000005)).toBeNull();
			expect(NtStatusDescriber.hint(0xc0000999)).toBeNull();
		});
	});
});
