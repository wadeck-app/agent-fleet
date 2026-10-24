// CLI-specific flow file validator. Wraps the flow-engine FlowValidator with
// file I/O, YAML parsing, and CLI-friendly exit codes.
import { type DefinitionSnapshotStore, FlowCoreError, assessFileVersion } from 'flow-core';
import { FlowValidator as EngineFlowValidator, ValidationCode } from 'flow-engine';
import type { ValidationIssue } from 'flow-engine';
import type { FlowDefinition } from 'flow-engine/types';
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

export interface CliValidationError {
	type: string;
	message: string;
	path: string;
}

export type ValidateResult =
	| { exit: 0; version: string; warnings: string[] }
	| { exit: 1; errors: CliValidationError[] }
	| { exit: 2; message: string }
	| { exit: 3; errors: CliValidationError[] }
	// The file is a flow registry (flows.yml format), not a single flow. The CLI maps it to process exit code 1.
	| { exit: 4; message: string; flowIds: string[]; includes: string[] };

const SURFACED_WARNING_CODES: ReadonlySet<ValidationCode> = new Set([ValidationCode.SUB_STEP_SIBLING_DEPENDENCY]);

// Same reserved key as FlowRegistry.loadProjectFlows
const REGISTRY_INCLUDES_KEY = 'includes';

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Mirrors the FlowRegistry loader format: a registry is a top-level map of flow ids (each value a flow body with a
 * `steps` list) and/or the reserved `includes:` key. A single flow has its own top-level `steps`.
 */
function describeRegistry(filePath: string, parsed: object): ValidateResult | undefined {
	if (!isPlainObject(parsed)) {
		throw new Error(`Expected a YAML mapping for ${filePath}`);
	}
	const raw = parsed;
	const hasIncludes = REGISTRY_INCLUDES_KEY in raw;
	const entries = Object.entries(raw).filter(([key]) => key !== REGISTRY_INCLUDES_KEY);
	const isFlowMap =
		!('steps' in raw) &&
		entries.length > 0 &&
		entries.every(([, value]) => isPlainObject(value) && Array.isArray(value['steps']));
	if (!hasIncludes && !isFlowMap) {
		return undefined;
	}
	const includesValue = raw[REGISTRY_INCLUDES_KEY];
	return {
		exit: 4,
		message:
			`${filePath} is a flow registry (it ${hasIncludes ? 'has `includes:`' : 'lists flows'}), not a single flow definition. ` +
			'Validate a flow with: flow validate <path-to-flow-file>',
		flowIds: isFlowMap ? entries.map(([key]) => key) : [],
		includes: Array.isArray(includesValue) ? includesValue.map(String) : [],
	};
}

/**
 * `versions` is where the snapshots of earlier runs live: it lets the validation say what a run would do with the
 * flow's version (refuse a changed content under the same version, run an older version as new...).
 */
export function validateFlowFile(filePath: string, versions: DefinitionSnapshotStore): ValidateResult {
	if (!fs.existsSync(filePath)) {
		return { exit: 2, message: `File not found: ${filePath}` };
	}

	let content: string;
	try {
		content = fs.readFileSync(filePath, 'utf8');
	} catch {
		// Raw OS error detail (path, permission code) suppressed -- not exposed to terminal.
		return { exit: 2, message: 'Flow file could not be read.' };
	}

	let flow: FlowDefinition;
	try {
		const raw = yaml.load(content, { schema: yaml.JSON_SCHEMA });
		if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
			return {
				exit: 3,
				errors: [
					{
						type: 'parse_error',
						message: `Invalid YAML: expected an object, got ${Array.isArray(raw) ? 'array' : typeof raw}`,
						path: '',
					},
				],
			};
		}
		const registry = describeRegistry(filePath, raw);
		if (registry) {
			return registry;
		}
		flow = raw as FlowDefinition;
	} catch {
		// exit 3 = YAML parse error. D34 defines exit 1 (validation errors) and exit 2
		// (file not found). Exit 3 is an intentional extension: a YAML parse error is
		// distinct from a semantic validation error and callers need to differentiate
		// the two failure modes.
		// Raw js-yaml exception suppressed (may contain file content excerpts).
		// Use 'flow validate' for detailed output.
		return {
			exit: 3,
			errors: [
				{ type: 'parse_error', message: `YAML parse error -- run 'flow validate' for details.`, path: '' },
			],
		};
	}

	const validator = new EngineFlowValidator(undefined);
	const result = validator.validate(flow);

	if (result.summary.errors > 0) {
		const errors = result.issues.filter((i: ValidationIssue) => i.severity === 'error').map(issueToCliError);
		return { exit: 1, errors };
	}

	let assessment;
	try {
		assessment = assessFileVersion(versions, flow.id, flow, filePath);
	} catch (err) {
		if (err instanceof FlowCoreError) {
			return { exit: 1, errors: [{ type: 'version', message: getErrorMessage(err), path: 'version' }] };
		}
		throw err;
	}
	if (assessment.errors.length > 0) {
		return {
			exit: 1,
			errors: assessment.errors.map(message => ({ type: 'version', message, path: 'version' })),
		};
	}
	// Only the warning codes in SURFACED_WARNING_CODES are reported: the other engine warnings (missing step name, no inputs...) stay out of the CLI output
	const flowWarnings = result.issues
		.filter((i: ValidationIssue) => i.severity === 'warning' && SURFACED_WARNING_CODES.has(i.code))
		.map(issueToWarning);
	return { exit: 0, version: assessment.version, warnings: [...assessment.warnings, ...flowWarnings] };
}

function issueToWarning(issue: ValidationIssue): string {
	return issue.suggestion ? `${issue.message}. Fix: ${issue.suggestion}` : issue.message;
}

function issueToCliError(issue: ValidationIssue): CliValidationError {
	return {
		type: validationCodeToType(issue.code),
		message: issue.message,
		path: issue.location?.path ?? issue.location?.stepId ?? '',
	};
}

function validationCodeToType(code: ValidationCode): string {
	switch (code) {
		case ValidationCode.MISSING_FIELD:
		case ValidationCode.INVALID_TYPE:
		case ValidationCode.INVALID_VALUE:
		case ValidationCode.DUPLICATE_ID:
		case ValidationCode.EMPTY_COLLECTION:
		case ValidationCode.TYPE_MISMATCH:
		case ValidationCode.INCOMPATIBLE_PROVIDER_MODEL:
			return 'schema';
		case ValidationCode.UNDEFINED_INPUT:
		case ValidationCode.UNDEFINED_OUTPUT:
		case ValidationCode.UNDEFINED_VARIABLE:
		case ValidationCode.UNDEFINED_FLOW:
			return 'input';
		case ValidationCode.UNDEFINED_STEP:
		case ValidationCode.UNREACHABLE_STEP:
		case ValidationCode.NO_TERMINAL_STEP:
			return 'graph';
		case ValidationCode.CIRCULAR_DEPENDENCY:
		case ValidationCode.CIRCULAR_SUBFLOW_REFERENCE:
			return 'cycle';
		case ValidationCode.INVALID_TEMPLATE_SYNTAX:
		case ValidationCode.MALFORMED_EXPRESSION:
		case ValidationCode.UNDECLARED_OUTPUT_KEY:
			return 'template';
		case ValidationCode.UNUSED_INPUT:
		case ValidationCode.UNUSED_OUTPUT:
		case ValidationCode.MISSING_OUTPUT:
		case ValidationCode.AUTO_DISCOVERED_INPUT:
			return 'input';
		default:
			throw new Error(`Unknown ValidationCode: ${String(code as string)}`);
	}
}
