import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

import { RelayRegistry } from './RelayRegistry.js';

function fakeRelay(name: string): WebSocket {
	return { name, readyState: 1, OPEN: 1, send: vi.fn(), terminate: vi.fn() } as unknown as WebSocket;
}

/** Accepts one source id and refuses everything else, standing in for the registry check. */
function onlySource(allowed: string) {
	return {
		verifySourceToken: (sourceId: string, token: string) => sourceId === allowed && token === 'right',
	};
}

describe('RelayRegistry - registration (T-04, T-11)', () => {
	it('admits a relay presenting the source credential', () => {
		const registry = new RelayRegistry(onlySource('laptop'));
		const ws = fakeRelay('r1');

		const result = registry.register(ws, {
			type: 'source_ready',
			sourceId: 'laptop',
			sourceToken: 'right',
			capacity: 2,
		});

		expect(result.ok).toBe(true);
		expect(registry.find('laptop')).toBeDefined();
	});

	it('refuses a relay presenting the wrong credential, and does not record it', () => {
		const registry = new RelayRegistry(onlySource('laptop'));

		const result = registry.register(fakeRelay('r1'), {
			type: 'source_ready',
			sourceId: 'laptop',
			sourceToken: 'wrong',
			capacity: 2,
		});

		expect(result.ok).toBe(false);
		expect(registry.find('laptop')).toBeUndefined();
	});

	it('refuses a relay claiming an undeclared source, naming the command to declare it', () => {
		const registry = new RelayRegistry(onlySource('laptop'));

		const result = registry.register(fakeRelay('r1'), {
			type: 'source_ready',
			sourceId: 'unknown',
			sourceToken: 'right',
			capacity: 1,
		});

		expect(result.ok).toBe(false);
		const reason = result.ok ? '' : result.reason;
		expect(reason).toContain('unknown');
		expect(reason).toContain('flow worker source add');
	});

	// Capacity is the relay's own declaration and the daemon never exceeds it (D#19), so a
	// nonsensical value has to be refused rather than clamped into something invented.
	it('refuses a capacity that is not a positive integer', () => {
		const registry = new RelayRegistry(onlySource('laptop'));
		const base = { type: 'source_ready' as const, sourceId: 'laptop', sourceToken: 'right' };

		expect(registry.register(fakeRelay('a'), { ...base, capacity: 0 }).ok).toBe(false);
		expect(registry.register(fakeRelay('b'), { ...base, capacity: -1 }).ok).toBe(false);
		expect(registry.register(fakeRelay('c'), { ...base, capacity: 1.5 }).ok).toBe(false);
	});

	// A relay reconnects after a restart; the newer connection is the one that can be reached.
	it('replaces an earlier connection for the same source', () => {
		const registry = new RelayRegistry(onlySource('laptop'));
		const first = fakeRelay('first');
		const second = fakeRelay('second');
		const ready = { type: 'source_ready' as const, sourceId: 'laptop', sourceToken: 'right', capacity: 1 };

		registry.register(first, ready);
		registry.register(second, ready);

		expect(registry.find('laptop')?.ws).toBe(second);
		expect(registry.liveCount).toBe(1);
	});
});

describe('RelayRegistry - lifetime', () => {
	it('forgets a relay when its connection drops', () => {
		const registry = new RelayRegistry(onlySource('laptop'));
		const ws = fakeRelay('r1');
		registry.register(ws, { type: 'source_ready', sourceId: 'laptop', sourceToken: 'right', capacity: 1 });

		registry.remove(ws);

		expect(registry.find('laptop')).toBeUndefined();
	});

	it('ignores the removal of a connection it never admitted', () => {
		const registry = new RelayRegistry(onlySource('laptop'));

		expect(() => registry.remove(fakeRelay('stranger'))).not.toThrow();
	});

	// A connection is a relay or a worker, never both: the two roles carry different
	// credentials, so treating one socket as both would erase that separation.
	it('reports whether a connection is a registered relay', () => {
		const registry = new RelayRegistry(onlySource('laptop'));
		const relay = fakeRelay('r1');
		registry.register(relay, { type: 'source_ready', sourceId: 'laptop', sourceToken: 'right', capacity: 1 });

		expect(registry.isRelay(relay)).toBe(true);
		expect(registry.isRelay(fakeRelay('other'))).toBe(false);
	});
});
