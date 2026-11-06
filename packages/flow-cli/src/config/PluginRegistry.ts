export interface PluginRegistryOptions<TPlugin> {
	/** Names the registry in error messages, e.g. "flow". */
	label: string;
	isValid: (value: unknown) => value is TPlugin;
	/** Shape a valid plugin has, quoted in the registration error. */
	shape: string;
}

/** Name/alias -> plugin map. Generic over the plugin contract; copies the semantics of queue's built-in registry. */
export class PluginRegistry<TPlugin> {
	private readonly plugins = new Map<string, TPlugin>();

	constructor(private readonly options: PluginRegistryOptions<TPlugin>) {}

	/**
	 * Registers `plugin` under `name` and `aliases`. Registering the identical object again is a no-op.
	 * Nothing is registered when the call throws.
	 * @throws when the plugin has the wrong shape, a name is empty, or a name/alias belongs to a different object
	 */
	register(name: string, plugin: TPlugin, aliases: string[] = []): void {
		const { label, isValid, shape } = this.options;
		if (!isValid(plugin)) {
			throw new Error(`[${label}] Plugin for "${name}" does not conform to the plugin contract (expected ${shape}).`);
		}
		const names = [name, ...aliases];
		for (const candidate of names) {
			if (candidate === '') {
				throw new Error(`[${label}] Plugin "${name}" has an empty name or alias: names must be non-empty.`);
			}
			const existing = this.plugins.get(candidate);
			if (existing !== undefined && existing !== plugin) {
				throw new Error(
					`[${label}] Plugin name/alias "${candidate}" is already registered with a different plugin object.`
				);
			}
		}
		for (const candidate of names) {
			this.plugins.set(candidate, plugin);
		}
	}

	lookup(name: string): TPlugin | undefined {
		return this.plugins.get(name);
	}

	/** Sorted names and aliases. */
	list(): string[] {
		return Array.from(this.plugins.keys()).sort();
	}

	clear(): void {
		this.plugins.clear();
	}
}
