import { SecretUsageAnalyzer } from 'flow-engine';
import type { FlowDefinition } from 'flow-engine/types';
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';

// violations-suppress: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { SecretProvider } from '../../secrets/SecretProvider';

/**
 * D27: refuses, at CLI time and with exit code 2 in the caller, a `type: password` input given
 * as anything but a reference. The daemon applies the same rule (SecretProvider) and is the
 * authority; this only spares a round trip and keeps the literal off the wire.
 *
 * The message never contains the value. Returns null when the flow cannot be read (the daemon
 * reports that) or when every secret input given is a reference.
 */
export function checkSecretInputs(flowFilePath: string, inputs: Record<string, string>): string | null {
	let flow: FlowDefinition;
	try {
		flow = yaml.load(fs.readFileSync(flowFilePath, 'utf8'), { schema: yaml.JSON_SCHEMA }) as FlowDefinition;
	} catch {
		return null;
	}
	if (!flow || typeof flow !== 'object') {
		return null;
	}

	for (const name of new SecretUsageAnalyzer().secretInputNames(flow)) {
		const value = inputs[name];
		if (value !== undefined && !SecretProvider.isAcceptedReference(value)) {
			return (
				`Input '${name}' is a secret (type: password) and must be given as a reference, not a value ` +
				`(a value on the command line ends up in shell history and logs): ` +
				`-i ${name}=env://VARIABLE_NAME or -i ${name}=file://./path/to/file.`
			);
		}
	}
	return null;
}
