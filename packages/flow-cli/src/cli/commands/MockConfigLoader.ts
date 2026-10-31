import type { FlowDefinition } from 'flow-engine/types';
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

import { formatCliError } from './CliErrorOutput';

/**
 * Loads `--mock-config <path>`: a YAML/JSON file mapping step id to an env overlay that
 * replaces that step's real execution via the existing mock-CLI convention
 * (`*_MOCK_PATH`/`*_MOCK_RESPONSE`/`*_MOCK_EXIT_CODE`). Fails loudly -- missing file, bad
 * syntax, or a step id absent from the flow are all caller errors, not silently ignored.
 */
export function loadMockConfig(mockConfigPath: string, flowFilePath: string): Record<string, Record<string, string>> {
	const resolvedPath = path.isAbsolute(mockConfigPath) ? mockConfigPath : path.resolve(process.cwd(), mockConfigPath);
	if (!fs.existsSync(resolvedPath)) {
		console.error(formatCliError(`Mock config file not found: ${resolvedPath}`));
		process.exit(2);
	}

	let parsed: unknown;
	try {
		const content = fs.readFileSync(resolvedPath, 'utf8');
		parsed = yaml.load(content, { schema: yaml.JSON_SCHEMA });
	} catch (err) {
		const detail = getErrorMessage(err);
		console.error(formatCliError(`Mock config file "${resolvedPath}" is not valid YAML/JSON. ${detail}`));
		process.exit(2);
	}

	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		console.error(
			formatCliError(`Mock config file "${resolvedPath}" must be an object mapping step id to env vars.`)
		);
		process.exit(2);
	}
	const mockEnv = parsed as Record<string, Record<string, string>>;

	let flow: FlowDefinition;
	try {
		const flowContent = fs.readFileSync(flowFilePath, 'utf8');
		flow = yaml.load(flowContent, { schema: yaml.JSON_SCHEMA }) as FlowDefinition;
	} catch (err) {
		console.error(
			formatCliError(
				`Could not read flow file "${flowFilePath}" to validate --mock-config step ids. ${getErrorMessage(err)}`
			)
		);
		process.exit(2);
	}

	const flowStepIds = new Set((flow?.steps ?? []).map(s => s.id));
	for (const stepId of Object.keys(mockEnv)) {
		if (!flowStepIds.has(stepId)) {
			console.error(
				formatCliError(
					`--mock-config references step '${stepId}', which does not exist in "${flowFilePath}". ` +
						`Known step ids: ${[...flowStepIds].join(', ')}`
				)
			);
			process.exit(2);
		}
	}

	return mockEnv;
}
