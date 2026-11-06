import { describe, expect, it } from 'vitest';

import { BRIDGE_TOKEN_HEADER, BridgeTokenGuard } from './BridgeTokenGuard';

const TOKEN = 'a'.repeat(48);

describe('BridgeTokenGuard', () => {
	it('accepts the expected token and replaces it when a new one is expected', () => {
		const guard = new BridgeTokenGuard();
		guard.expect(TOKEN);

		expect(guard.verify(TOKEN)).toEqual({ ok: true });

		guard.expect('c'.repeat(48));

		expect(guard.verify(TOKEN).ok).toBe(false);
		expect(guard.verify('c'.repeat(48)).ok).toBe(true);
	});

	it('refuses every other presented value with the reason', () => {
		const cases: [string, string | string[] | undefined, string][] = [
			['a wrong token of the same length', 'b'.repeat(48), 'is wrong'],
			['a shorter token', 'a'.repeat(47), 'is wrong'],
			['a longer token', `${TOKEN}x`, 'is wrong'],
			['the placeholder text itself', 'flow-ph-0123456789abcdef', 'did not substitute it'],
			['an empty value', '', 'is wrong'],
			['no header', undefined, 'no x-flow-bridge-token header'],
			['two headers', [TOKEN, TOKEN], 'more than one'],
		];
		for (const [label, presented, reason] of cases) {
			const guard = new BridgeTokenGuard();
			guard.expect(TOKEN);

			const verdict = guard.verify(presented);

			expect(verdict.ok, label).toBe(false);
			expect(verdict.ok === false && verdict.reason, label).toContain(reason);
		}
	});

	it('refuses everything before a token is expected and after revoke', () => {
		const guard = new BridgeTokenGuard();
		expect(guard.verify(TOKEN).ok).toBe(false);

		guard.expect(TOKEN);
		guard.revoke();

		const verdict = guard.verify(TOKEN);
		expect(verdict.ok === false && verdict.reason).toContain('no bridge token is expected');
	});

	it('refuses a weak token, and names the header the proxy substitutes', () => {
		expect(() => new BridgeTokenGuard().expect('short')).toThrow('at least 16 characters');
		expect(BRIDGE_TOKEN_HEADER).toBe('x-flow-bridge-token');
	});
});
