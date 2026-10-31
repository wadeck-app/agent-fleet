import { defaultRegistryDir, loadRegistry, resolveReference } from '@wadeck-app/project-sdk';
import { normalizeError } from 'shared-common/utils/getErrorMessage';

/**
 * The project id a command is scoped to: `-p/--project`, else `FLOW_PROJECT` (blank counts as unset), else none.
 * Only an explicit choice scopes: nothing is inferred from the cwd. An unresolved reference is reported with the place it
 * came from and exits 1; it never falls back to no scope.
 */
export function resolveProjectFilter(flag: string | undefined, env: NodeJS.ProcessEnv): string | undefined {
	const fromEnv = env['FLOW_PROJECT'];
	const envRef = fromEnv !== undefined && fromEnv.trim() !== '' ? fromEnv : undefined;
	const ref = flag ?? envRef;
	if (ref === undefined) {
		return undefined;
	}
	try {
		return resolveReference(loadRegistry(defaultRegistryDir(env)), ref).id;
	} catch (err) {
		const from = flag === undefined ? `FLOW_PROJECT="${ref}"` : `--project "${ref}"`;
		// violations-suppress: security/no-raw-err-in-cli the project-sdk error messages are written for users (they name the reference and the registered projects)
		console.error(`${from}: ${normalizeError(err).message}`);
		return process.exit(1);
	}
}
