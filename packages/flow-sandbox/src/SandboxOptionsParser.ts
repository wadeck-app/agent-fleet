import { NetworkResourceRule } from './NetworkResourceRule';
import { SandboxError } from './SandboxError';

/** Fully resolved options of the sandbox layer: every field has a value except `image`. */
export interface SandboxOptions {
	/** CPUs per sandbox. */
	cpus: number;
	/** Memory per sandbox in binary units, lowercase (`2g`). */
	memory: string;
	maxConcurrentSandboxes: number;
	/** Minutes without a step before an idle sandbox is stopped. */
	idleStopMinutes: number;
	/** Alias used in flows -> host AWS profile. */
	profiles: Readonly<Record<string, string>>;
	/** Extra `host:port` rules opened for every sandbox, on top of what the tools need. */
	extraAllowedHosts: readonly string[];
	/** Template image for new sandboxes; the agent's stock image when absent. */
	image: string | undefined;
	/** True when the operator knowingly runs with `ssh.agentForwardingEnabled` on. */
	acceptSshAgentForwarding: boolean;
}

export const SANDBOX_OPTION_DEFAULTS = {
	cpus: 2,
	memory: '2g',
	maxConcurrentSandboxes: 4,
	idleStopMinutes: 5,
	acceptSshAgentForwarding: false,
} as const;

const KNOWN_KEYS = [
	'cpus',
	'memory',
	'maxConcurrentSandboxes',
	'idleStopMinutes',
	'profiles',
	'extraAllowedHosts',
	'image',
	'acceptSshAgentForwarding',
] as const;

/** 24 hours; also far below the longest delay a timer accepts. */
export const MAX_IDLE_STOP_MINUTES = 1440;
const PROFILE_ALIAS = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MEMORY = /^([1-9]\d*)([mMgG])$/;

function describeFound(value: unknown): string {
	return value === undefined ? 'nothing' : JSON.stringify(value);
}

/**
 * Validates the untyped `options:` block a config file declared for the sandbox plugins.
 *
 * Same stance as parseFileApprovalOptions: an unknown key (a typo such as `cpu`) is an error, not a
 * silent default, because the config file would claim a limit that is not applied.
 */
export class SandboxOptionsParser {
	parse(raw: unknown): SandboxOptions {
		if (raw === undefined || raw === null) return this.resolve({});
		if (typeof raw !== 'object' || Array.isArray(raw)) {
			throw this.error(`options must be an object, found ${describeFound(raw)}`);
		}
		// violations-suppress: ts/no-unsafe-type-cast this function exists to validate untyped config; every key is checked below
		const entries = Object.entries(raw as Record<string, unknown>);
		const known: readonly string[] = KNOWN_KEYS;
		const parsed: Record<string, unknown> = {};
		for (const [key, value] of entries) {
			if (!known.includes(key)) {
				throw this.error(
					`Unknown option "${key}". Supported options: ${KNOWN_KEYS.join(', ')}. ` +
						'Nothing was applied, so fix the name rather than assuming a default took effect.'
				);
			}
			parsed[key] = value;
		}
		return this.resolve(parsed);
	}

	private resolve(values: Record<string, unknown>): SandboxOptions {
		return {
			cpus: this.integer(values, 'cpus', SANDBOX_OPTION_DEFAULTS.cpus),
			memory: this.memory(values['memory']),
			maxConcurrentSandboxes: this.integer(
				values,
				'maxConcurrentSandboxes',
				SANDBOX_OPTION_DEFAULTS.maxConcurrentSandboxes
			),
			idleStopMinutes: this.idleStopMinutes(values),
			profiles: this.profiles(values['profiles']),
			extraAllowedHosts: this.hosts(values['extraAllowedHosts']),
			image: this.image(values['image']),
			acceptSshAgentForwarding: this.boolean(
				values,
				'acceptSshAgentForwarding',
				SANDBOX_OPTION_DEFAULTS.acceptSshAgentForwarding
			),
		};
	}

	private integer(values: Record<string, unknown>, key: string, fallback: number): number {
		const value = values[key];
		if (value === undefined) return fallback;
		if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
			throw this.error(`Option "${key}" must be a whole number of at least 1, found ${describeFound(value)}`);
		}
		return value;
	}

	/** Positive, and short enough to be a timer delay (a longer one would fire at once, silently). */
	private idleStopMinutes(values: Record<string, unknown>): number {
		const value = values['idleStopMinutes'];
		if (value === undefined) return SANDBOX_OPTION_DEFAULTS.idleStopMinutes;
		if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
			throw this.error(`Option "idleStopMinutes" must be a positive number, found ${describeFound(value)}`);
		}
		if (value > MAX_IDLE_STOP_MINUTES) {
			throw this.error(
				`Option "idleStopMinutes" must be at most ${MAX_IDLE_STOP_MINUTES} (24 hours), found ${describeFound(value)}`
			);
		}
		return value;
	}

	private boolean(values: Record<string, unknown>, key: string, fallback: boolean): boolean {
		const value = values[key];
		if (value === undefined) return fallback;
		if (typeof value !== 'boolean') {
			throw this.error(`Option "${key}" must be true or false, found ${describeFound(value)}`);
		}
		return value;
	}

	private memory(value: unknown): string {
		if (value === undefined) return SANDBOX_OPTION_DEFAULTS.memory;
		const match = typeof value === 'string' ? MEMORY.exec(value) : null;
		if (match?.[1] === undefined || match[2] === undefined) {
			throw this.error(
				`Option "memory" must look like "512m" or "2g" (binary units), found ${describeFound(value)}`
			);
		}
		const mebibytes = Number(match[1]) * (match[2].toLowerCase() === 'g' ? 1024 : 1);
		if (mebibytes < 512) {
			throw this.error(`Option "memory" must be at least 512m (the sbx minimum), found ${describeFound(value)}`);
		}
		return `${match[1]}${match[2].toLowerCase()}`;
	}

	private profiles(value: unknown): Readonly<Record<string, string>> {
		if (value === undefined) return {};
		if (typeof value !== 'object' || value === null || Array.isArray(value)) {
			throw this.error(
				`Option "profiles" must be an object of alias -> host profile name, found ${describeFound(value)}`
			);
		}
		const profiles: Record<string, string> = {};
		for (const [alias, profile] of Object.entries(value)) {
			if (!PROFILE_ALIAS.test(alias)) {
				throw this.error(
					`Profile alias "${alias}" is not valid: use letters, digits, ".", "_" or "-", starting with a letter or digit`
				);
			}
			if (typeof profile !== 'string' || profile.trim() === '' || /[\0\r\n]/.test(profile)) {
				throw this.error(
					`Profile "${alias}" must map to a non-empty host profile name, found ${describeFound(profile)}`
				);
			}
			profiles[alias] = profile;
		}
		return profiles;
	}

	private hosts(value: unknown): readonly string[] {
		if (value === undefined) return [];
		if (!Array.isArray(value)) {
			throw this.error(
				`Option "extraAllowedHosts" must be an array of "host:port" strings, found ${describeFound(value)}`
			);
		}
		return value.map((entry: unknown) => {
			const problem = typeof entry === 'string' ? NetworkResourceRule.problem(entry) : 'not a string';
			if (problem !== undefined || typeof entry !== 'string') {
				throw this.error(`Option "extraAllowedHosts" has an invalid entry ${describeFound(entry)}: ${problem}`);
			}
			return entry;
		});
	}

	private image(value: unknown): string | undefined {
		if (value === undefined) return undefined;
		if (typeof value !== 'string' || !/^\S+$/.test(value)) {
			throw this.error(
				`Option "image" must be an image reference without whitespace, found ${describeFound(value)}`
			);
		}
		return value;
	}

	private error(message: string): SandboxError {
		return new SandboxError('invalid-options', `[flow-sandbox] ${message}`);
	}
}
