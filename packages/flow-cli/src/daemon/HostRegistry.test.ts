import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

import { HostRegistry } from './HostRegistry.js';

function fakeHost(name: string): WebSocket {
	return { name, readyState: 1, OPEN: 1, send: vi.fn(), terminate: vi.fn() } as unknown as WebSocket;
}

/** Accepts one source id and refuses everything else, standing in for the registry check. */
function onlySource(allowed: string) {
	return {
		verifySourceToken: (sourceId: string, token: string) => sourceId === allowed && token === 'right',
	};
}

describe('HostRegistry - registration (T-04, T-11)', () => {
	it('admits a host presenting the source credential', () => {
		const registry = new HostRegistry(onlySource('laptop'));
		const ws = fakeHost('h1');

		const result = registry.register(ws, {
			type: 'source_ready',
			sourceId: 'laptop',
			sourceToken: 'right',
			capacity: 2,
		});

		expect(result.ok).toBe(true);
		expect(registry.find('laptop')).toBeDefined();
	});

	it('refuses a host presenting the wrong credential, and does not record it', () => {
		const registry = new HostRegistry(onlySource('laptop'));

		const result = registry.register(fakeHost('h1'), {
			type: 'source_ready',
			sourceId: 'laptop',
			sourceToken: 'wrong',
			capacity: 2,
		});

		expect(result.ok).toBe(false);
		expect(registry.find('laptop')).toBeUndefined();
	});

	it('refuses a host claiming an undeclared source, naming the command to declare it', () => {
		const registry = new HostRegistry(onlySource('laptop'));

		const result = registry.register(fakeHost('h1'), {
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

	// Capacity is the host's own declaration and the daemon never exceeds it (D#19), so a
	// nonsensical value has to be refused rather than clamped into something invented.
	it('refuses a capacity that is not a positive integer', () => {
		const registry = new HostRegistry(onlySource('laptop'));
		const base = { type: 'source_ready' as const, sourceId: 'laptop', sourceToken: 'right' };

		expect(registry.register(fakeHost('a'), { ...base, capacity: 0 }).ok).toBe(false);
		expect(registry.register(fakeHost('b'), { ...base, capacity: -1 }).ok).toBe(false);
		expect(registry.register(fakeHost('c'), { ...base, capacity: 1.5 }).ok).toBe(false);
	});

	// A host reconnects after a restart; the newer connection is the one that can be reached.
	it('replaces an earlier connection for the same source', () => {
		const registry = new HostRegistry(onlySource('laptop'));
		const first = fakeHost('first');
		const second = fakeHost('second');
		const ready = { type: 'source_ready' as const, sourceId: 'laptop', sourceToken: 'right', capacity: 1 };

		registry.register(first, ready);
		registry.register(second, ready);

		expect(registry.find('laptop')?.ws).toBe(second);
		expect(registry.liveCount).toBe(1);
	});
});

describe('HostRegistry - lifetime', () => {
	it('forgets a host when its connection drops', () => {
		const registry = new HostRegistry(onlySource('laptop'));
		const ws = fakeHost('h1');
		registry.register(ws, { type: 'source_ready', sourceId: 'laptop', sourceToken: 'right', capacity: 1 });

		registry.remove(ws);

		expect(registry.find('laptop')).toBeUndefined();
	});

	it('ignores the removal of a connection it never admitted', () => {
		const registry = new HostRegistry(onlySource('laptop'));

		expect(() => registry.remove(fakeHost('stranger'))).not.toThrow();
	});

	// A connection is a host or a worker, never both: the two roles carry different
	// credentials, so treating one socket as both would erase that separation.
	it('reports whether a connection is a registered host', () => {
		const registry = new HostRegistry(onlySource('laptop'));
		const host = fakeHost('h1');
		registry.register(host, { type: 'source_ready', sourceId: 'laptop', sourceToken: 'right', capacity: 1 });

		expect(registry.isHost(host)).toBe(true);
		expect(registry.isHost(fakeHost('other'))).toBe(false);
	});
});
