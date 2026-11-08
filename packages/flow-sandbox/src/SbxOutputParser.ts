import { SandboxError } from './SandboxError';
import type { SandboxInfo } from './SandboxRuntime';
import type { NetworkMode, NetworkPolicySummary, SbxDiagnoseReport, SettingValue } from './SbxIntrospection';

/** Rule resources that allow every host. */
const CATCH_ALL_RESOURCES = new Set(['**', '*', '**:*', '*:*', '**:**', '*:**']);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function excerpt(text: string): string {
	const trimmed = text.trim();
	return trimmed.length > 200 ? `${trimmed.slice(0, 200)}...` : trimmed;
}

/**
 * Turns sbx output into typed values. Anything unexpected is a SandboxError('output-unparsable') that
 * names the command and quotes the output: sbx is 0.x and its JSON shapes have changed before, so a
 * silent default here would hide a broken integration.
 */
export class SbxOutputParser {
	parseVersion(output: string): { version: string; commit: string | undefined } {
		const match = /^sbx version v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)(?:[ \t]+([0-9a-f]{7,40}))?\s*$/m.exec(
			output
		);
		if (match?.[1] === undefined) {
			throw new SandboxError(
				'output-unparsable',
				`Cannot read the sbx version from \`sbx version\` output: "${excerpt(output)}". ` +
					'Expected a line like "sbx version v0.51.0 <commit>". The sbx output format changed or this is not sbx: ' +
					'check which executable is used (binaryPath option / SBX_PATH).'
			);
		}
		return { version: match[1], commit: match[2] };
	}

	parseList(output: string): SandboxInfo[] {
		const command = 'sbx ls --json';
		const parsed = this.parseJson(output, command);
		if (!Array.isArray(parsed)) {
			throw this.unparsable(command, output, 'expected a JSON array');
		}
		return parsed.map((entry: unknown, index) => {
			if (!isRecord(entry)) {
				throw this.unparsable(command, output, `entry ${index} is not an object`);
			}
			const name = this.requireString(entry, 'name', command, output, index);
			const status = this.requireString(entry, 'status', command, output, index);
			const agent = this.requireString(entry, 'agent', command, output, index);
			const workspaces = entry['workspaces'];
			if (!Array.isArray(workspaces) || !workspaces.every((w): w is string => typeof w === 'string')) {
				throw this.unparsable(command, output, `entry ${index} ("${name}") has no "workspaces" string array`);
			}
			const info: SandboxInfo = { name, status, agent, workspaces };
			if (typeof entry['cpus'] === 'number') info.cpus = entry['cpus'];
			if (typeof entry['memory_mib'] === 'number') info.memoryMib = entry['memory_mib'];
			if (typeof entry['created_at'] === 'string') info.createdAt = entry['created_at'];
			return info;
		});
	}

	parseDiagnose(output: string): SbxDiagnoseReport {
		const command = 'sbx diagnose --json';
		const parsed = this.parseJson(output, command);
		if (!isRecord(parsed) || !Array.isArray(parsed['checks'])) {
			throw this.unparsable(command, output, 'expected an object with a "checks" array');
		}
		const checks = parsed['checks'].map((check: unknown, index) => {
			if (!isRecord(check)) {
				throw this.unparsable(command, output, `check ${index} is not an object`);
			}
			return {
				name: this.requireString(check, 'name', command, output, index),
				status: this.requireString(check, 'status', command, output, index),
				message: this.optionalString(check['message']),
				detail: this.optionalString(check['detail']),
				hint: this.optionalString(check['hint']),
			};
		});
		return { checks };
	}

	parseNetworkPolicy(output: string): NetworkPolicySummary {
		const command = 'sbx policy ls --json';
		const parsed = this.parseJson(output, command);
		if (!isRecord(parsed) || !Array.isArray(parsed['rules'])) {
			throw this.unparsable(command, output, 'expected an object with a "rules" array');
		}
		let allowed = 0;
		let denied = 0;
		let allowsEverything = false;
		parsed['rules'].forEach((rule: unknown, index) => {
			if (!isRecord(rule)) {
				throw this.unparsable(command, output, `rule ${index} is not an object`);
			}
			// Only machine-wide network rules describe the baseline: filesystem rules and per-sandbox rules are separate.
			if (rule['resource_type'] !== 'network' || rule['scope'] !== 'global') return;
			const resources = rule['resources'];
			if (!Array.isArray(resources) || !resources.every((r): r is string => typeof r === 'string')) {
				throw this.unparsable(command, output, `rule ${index} has no "resources" string array`);
			}
			if (rule['decision'] === 'allow') {
				allowed += resources.length;
				if (resources.some(resource => CATCH_ALL_RESOURCES.has(resource))) allowsEverything = true;
			} else if (rule['decision'] === 'deny') {
				denied += resources.length;
			} else {
				throw this.unparsable(
					command,
					output,
					`rule ${index} has decision ${JSON.stringify(rule['decision'])}, expected "allow" or "deny"`
				);
			}
		});
		let mode: NetworkMode = 'restricted';
		if (allowsEverything) mode = 'allow-all';
		else if (allowed === 0) mode = 'deny-all';
		return { mode, allowedResourceCount: allowed, deniedResourceCount: denied };
	}

	parseSettings(output: string): Map<string, SettingValue> {
		const command = 'sbx settings ls --json';
		const parsed = this.parseJson(output, command);
		if (!Array.isArray(parsed)) {
			throw this.unparsable(command, output, 'expected a JSON array');
		}
		const settings = new Map<string, SettingValue>();
		parsed.forEach((entry: unknown, index) => {
			if (!isRecord(entry) || typeof entry['key'] !== 'string' || !('value' in entry)) {
				throw this.unparsable(command, output, `entry ${index} has no "key" and "value"`);
			}
			// violations-suppress: ts/no-unsafe-type-cast the value is any JSON value by definition of the settings list
			settings.set(entry['key'], entry['value'] as SettingValue);
		});
		return settings;
	}

	private parseJson(output: string, command: string): unknown {
		try {
			return JSON.parse(output);
		} catch (error) {
			throw new SandboxError(
				'output-unparsable',
				`\`${command}\` did not print valid JSON: "${excerpt(output)}". ` +
					'sbx may have failed halfway or its output format changed; run the command by hand to see why.',
				{ cause: error }
			);
		}
	}

	private requireString(
		source: Record<string, unknown>,
		field: string,
		command: string,
		output: string,
		index: number
	): string {
		const value = source[field];
		if (typeof value !== 'string' || value === '') {
			throw this.unparsable(command, output, `entry ${index} has no string "${field}"`);
		}
		return value;
	}

	private optionalString(value: unknown): string {
		return typeof value === 'string' ? value : '';
	}

	private unparsable(command: string, output: string, reason: string): SandboxError {
		return new SandboxError(
			'output-unparsable',
			`Cannot read \`${command}\` output (${reason}): "${excerpt(output)}". ` +
				'The sbx output format differs from the pinned version: run the gated live check and refresh the fixtures.'
		);
	}
}
