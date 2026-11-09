/** A step of an injected batch that carries `host`, with the chain of ids from the batch down to it. */
export interface InjectedHostMarker {
	stepId: string;
	path: string;
}

/** Keys under which a step may carry step definitions of its own. */
const NESTED_STEP_KEYS = ['steps', 'subSteps'] as const;

/**
 * Steps a worker adds to a running execution (provideSteps) run in the run's confinement. `host` is how a script asks
 * to leave it, so an injected step, whatever its kind and depth, may only say `host: false` (or nothing): a model
 * steered by hostile content must not be able to write itself out of the sandbox. Any other value is refused, never
 * stripped or coerced ("true", a template, a number all count).
 */
export class InjectedHostMarkerGuard {
	static find(steps: readonly unknown[]): InjectedHostMarker[] {
		const found: InjectedHostMarker[] = [];
		InjectedHostMarkerGuard.collect(steps, [], found);
		return found;
	}

	/** The failure message for `find`'s result: which steps, why, and what to do. */
	static refusal(found: readonly InjectedHostMarker[]): string {
		const named = found.map(entry => `'${entry.stepId}' (${entry.path})`).join(', ');
		return (
			`provideSteps: refused, injected step(s) with \`host\`: ${named}. Injected steps run in the run's confinement and cannot ask to run on the worker's machine. ` +
			'Remove `host` from the injected steps; a step that must run outside the confinement has to be written in the flow definition.'
		);
	}

	private static collect(steps: readonly unknown[], chain: string[], found: InjectedHostMarker[]): void {
		for (const step of steps) {
			if (step === null || typeof step !== 'object' || Array.isArray(step)) {
				continue;
			}
			const record = step as Record<string, unknown>;
			const id = typeof record['id'] === 'string' ? record['id'] : '(no id)';
			const path = [...chain, id];
			if ('host' in record && record['host'] !== false) {
				found.push({ stepId: id, path: path.join(' > ') });
			}
			for (const key of NESTED_STEP_KEYS) {
				const nested = record[key];
				if (Array.isArray(nested)) {
					InjectedHostMarkerGuard.collect(nested, path, found);
				}
			}
		}
	}
}
