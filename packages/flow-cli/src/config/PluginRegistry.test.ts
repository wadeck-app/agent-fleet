import { beforeEach, describe, expect, it } from 'vitest';

import { PluginRegistry } from './PluginRegistry';

interface Dummy {
	id: string;
}

function isDummy(value: unknown): value is Dummy {
	return typeof value === 'object' && value !== null && typeof (value as Dummy).id === 'string';
}

describe('PluginRegistry', () => {
	let registry: PluginRegistry<Dummy>;

	beforeEach(() => {
		registry = new PluginRegistry<Dummy>({ label: 'test', isValid: isDummy, shape: '{ id: string }' });
	});

	it('resolves a plugin by its name and by each alias', () => {
		const plugin = { id: 'a' };
		registry.register('alpha', plugin, ['a', 'first']);

		expect(registry.lookup('alpha')).toBe(plugin);
		expect(registry.lookup('a')).toBe(plugin);
		expect(registry.lookup('first')).toBe(plugin);
		expect(registry.lookup('unknown')).toBeUndefined();
	});

	it('lists names and aliases sorted', () => {
		registry.register('zeta', { id: 'z' }, ['b']);
		registry.register('alpha', { id: 'a' });

		expect(registry.list()).toEqual(['alpha', 'b', 'zeta']);
	});

	describe('conflicts', () => {
		it('throws when a name is taken by a different object, naming the name', () => {
			registry.register('alpha', { id: 'a' });

			expect(() => registry.register('alpha', { id: 'a' })).toThrow(/"alpha".*already registered.*different/);
		});

		it('throws when an alias is taken by the name of a different object, naming the alias', () => {
			registry.register('alpha', { id: 'a' });

			expect(() => registry.register('beta', { id: 'b' }, ['alpha'])).toThrow(/"alpha".*already registered/);
		});

		it('throws when an alias is taken by the alias of a different object', () => {
			registry.register('alpha', { id: 'a' }, ['shared']);

			expect(() => registry.register('beta', { id: 'b' }, ['shared'])).toThrow(/"shared".*already registered/);
		});

		it('throws when a new name is an existing alias of a different object', () => {
			registry.register('alpha', { id: 'a' }, ['shared']);

			expect(() => registry.register('shared', { id: 'b' })).toThrow(/"shared".*already registered/);
		});

		it('registers nothing of a rejected call, even the names that were free', () => {
			registry.register('alpha', { id: 'a' });

			expect(() => registry.register('beta', { id: 'b' }, ['free', 'alpha'])).toThrow();
			expect(registry.list()).toEqual(['alpha']);
		});

		it('is a no-op to register the identical object again, and adds its new aliases', () => {
			const plugin = { id: 'a' };
			registry.register('alpha', plugin, ['a']);

			expect(() => registry.register('alpha', plugin, ['more'])).not.toThrow();
			expect(registry.list()).toEqual(['a', 'alpha', 'more']);
		});
	});

	describe('shape validation', () => {
		it('rejects an invalid plugin, naming the module and the expected shape', () => {
			expect(() => registry.register('bad', { nope: 1 } as unknown as Dummy)).toThrow(
				/"bad".*does not conform.*\{ id: string \}/
			);
			expect(registry.list()).toEqual([]);
		});

		it('rejects an empty name or alias', () => {
			expect(() => registry.register('', { id: 'a' })).toThrow(/non-empty/);
			expect(() => registry.register('ok', { id: 'a' }, [''])).toThrow(/non-empty/);
		});
	});

	it('clear empties the registry', () => {
		registry.register('alpha', { id: 'a' });
		registry.clear();

		expect(registry.list()).toEqual([]);
		expect(registry.lookup('alpha')).toBeUndefined();
	});
});
