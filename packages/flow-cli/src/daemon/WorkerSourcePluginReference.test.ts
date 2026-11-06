import { describe, expect, it } from 'vitest';

import { PLUGIN_REF, WorkerSourcePluginReference } from './WorkerSourcePluginReference.js';

const reference = new WorkerSourcePluginReference(typeRef => typeRef === 'plugins.relay.default');

const base = { sourceId: 'box', provider: 'free-label', labels: [], maxWorkers: 1 };

describe('PLUGIN_REF', () => {
	it.each(['relay.default', 'a-b_c.d-e_f'])('accepts %s', ref => {
		expect(PLUGIN_REF.test(ref)).toBe(true);
	});

	it.each(['relay', 'a.b.c', 'plugins.relay.default', '../x.y', 'a.b ', ''])('refuses %j', ref => {
		expect(PLUGIN_REF.test(ref)).toBe(false);
	});
});

describe('WorkerSourcePluginReference', () => {
	it('knows a built-in by exact match, typed plain or as a type reference', () => {
		expect(reference.isBuiltinRef('relay.default')).toBe(true);
		expect(reference.isBuiltinRef('plugins.relay.default')).toBe(true);
		expect(reference.isBuiltinRef('relay.defualt')).toBe(false);
		expect(reference.isBuiltinRef('Relay.Default')).toBe(false);
		expect(reference.isBuiltinRef('plugins.foo.bar')).toBe(false);
	});

	it('normalizes only a built-in typed as a type reference', () => {
		expect(reference.normalize({ ...base, plugin: 'plugins.relay.default' }).plugin).toBe('relay.default');
		expect(reference.normalize({ ...base, plugin: 'plugins.foo.bar' }).plugin).toBe('plugins.foo.bar');
		expect(reference.normalize({ ...base, plugin: 'foo.bar' }).plugin).toBe('foo.bar');
		expect(reference.normalize(base)).toBe(base);
	});

	it('accepts a source with neither plugin nor directory', () => {
		expect(() => {
			reference.validate(base);
		}).not.toThrow();
	});

	it('accepts a built-in without a directory but refuses any other ref without one', () => {
		expect(() => {
			reference.validate({ ...base, plugin: 'relay.default' });
		}).not.toThrow();
		expect(() => {
			reference.validate({ ...base, plugin: 'foo.bar' });
		}).toThrow(/names plugin "foo.bar" but no pluginsDir/);
	});

	it('names what was typed in every refusal', () => {
		expect(() => {
			reference.validate({ ...base, plugin: 'plugins.foo.bar', pluginsDir: process.cwd() });
		}).toThrow('got "plugins.foo.bar".');
		expect(() => {
			reference.validate({ ...base, plugin: 'plugins.relay.default', provider: 'built-in:x' });
		}).toThrow('("plugins.relay.default")');
	});

	it('refuses a directory without a plugin, and a relative directory', () => {
		expect(() => {
			reference.validate({ ...base, pluginsDir: process.cwd() });
		}).toThrow(/without a plugin/);
		expect(() => {
			reference.validate({ ...base, plugin: 'relay.default', pluginsDir: 'rel/dir' });
		}).toThrow(/must be an absolute path/);
	});
});
