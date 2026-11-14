/** One thing wrong with a step of an injected batch, with the chain of ids from the batch down to it. */
export interface InjectedStepViolation {
	stepId: string;
	path: string;
	/** Human-readable: the offending key or type, e.g. "key `mcpServers`" or 'type "subflow"'. */
	problem: string;
}

/** Keys under which a step may carry step definitions of its own. */
const NESTED_STEP_KEYS = ['steps', 'subSteps'] as const;

const ALLOWED_TYPES = ['script', 'model'] as const;

/**
 * Steps a worker adds to a running execution (provideSteps) are written by a model that may be steered by hostile
 * content, so they are limited to what the advertised tool schema describes. Anything else (mcpServers, toolHooks,
 * permission mode, working directory, ...) is a privileged setting that belongs to the flow definition. The whole
 * batch is refused, never stripped or coerced. `host` is handled by InjectedHostMarkerGuard, which owns its message.
 */
export class InjectedStepGuard {
	/** Step types an injected step may have; the provideSteps tool schema (flow-cli mcp-server.cjs) must advertise the same. */
	static readonly ALLOWED_TYPES: readonly string[] = ALLOWED_TYPES;

	static readonly ALLOWED_KEYS: readonly string[] = [
		'id',
		'type',
		'name',
		'parent',
		'depends',
		'wave',
		'script',
		'model',
		'provider',
		'prompt',
		'env',
		'onFailure',
		'retry',
		'timeout',
		'tools',
		'output',
		'log',
		'toolLog',
		'when',
		'requires',
		'profile',
		'steps',
		'subSteps',
	];

	static find(steps: readonly unknown[]): InjectedStepViolation[] {
		const found: InjectedStepViolation[] = [];
		InjectedStepGuard.collect(steps, [], found);
		return found;
	}

	/** The failure message for `find`'s result: which steps, why, and what to do. */
	static refusal(found: readonly InjectedStepViolation[]): string {
		const named = found.map(entry => `'${entry.stepId}' (${entry.path}): ${entry.problem}`).join('; ');
		return (
			`provideSteps: refused, injected step(s) not allowed: ${named}. ` +
			`Injected steps must have type ${ALLOWED_TYPES.map(type => `'${type}'`).join(' or ')} and may only carry: ${InjectedStepGuard.ALLOWED_KEYS.join(', ')} ` +
			'(`skipPermissions` only as false, `host` only as false). ' +
			'Privileged settings (mcpServers, toolHooks, permission mode, working directory, ...) belong to the flow definition, not to a step added while the flow runs. ' +
			'Remove the listed keys, or move the step to the flow definition.'
		);
	}

	private static collect(steps: readonly unknown[], chain: string[], found: InjectedStepViolation[]): void {
		for (const step of steps) {
			if (step === null || typeof step !== 'object' || Array.isArray(step)) {
				continue;
			}
			const record = step as Record<string, unknown>;
			const id = typeof record['id'] === 'string' ? record['id'] : '(no id)';
			const path = [...chain, id];
			const report = (problem: string): void => {
				found.push({ stepId: id, path: path.join(' > '), problem });
			};

			const type = record['type'];
			if (!(ALLOWED_TYPES as readonly unknown[]).includes(type)) {
				report(type === undefined ? 'type is missing' : `type ${JSON.stringify(type)}`);
			}
			for (const key of Object.keys(record)) {
				if (key === 'host' || InjectedStepGuard.ALLOWED_KEYS.includes(key)) {
					continue;
				}
				if (key === 'skipPermissions' && record[key] === false) {
					continue;
				}
				report(`key \`${key}\``);
			}
			for (const key of NESTED_STEP_KEYS) {
				const nested = record[key];
				if (Array.isArray(nested)) {
					InjectedStepGuard.collect(nested, path, found);
				}
			}
		}
	}
}
