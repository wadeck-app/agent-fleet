// CLI-specific flow file validator. Wraps the flow-engine FlowValidator with
// file I/O, YAML parsing, and CLI-friendly exit codes.
import type { FlowDefinition } from 'flow-engine/types';
import { FlowValidator as EngineFlowValidator, ValidationCode } from 'flow-engine';
import type { ValidationIssue } from 'flow-engine';
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';

export interface CliValidationError {
	type: string;
	message: string;
	path: string;
}

export type ValidateResult =
	| { exit: 0 }
	| { exit: 1; errors: CliValidationError[] }
	| { exit: 2; message: string }
	| { exit: 3; errors: CliValidationError[] };

export function validateFlowFile(filePath: string): ValidateResult {
	if (!fs.existsSync(filePath)) {
		return { exit: 2, message: `File not found: ${filePath}` };
	}

	let content: string;
	try {
		content = fs.readFileSync(filePath, 'utf8');
	} catch (err) {
		// Raw OS error detail (path, permission code) suppressed — not exposed to terminal.
		return { exit: 2, message: 'Flow file could not be read.' };
	}

	let flow: FlowDefinition;
	try {
		const raw = yaml.load(content, { schema: yaml.JSON_SCHEMA });
		if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
			return {
				exit: 3,
				errors: [{ type: 'parse_error', message: `Invalid YAML: expected an object, got ${Array.isArray(raw) ? 'array' : typeof raw}`, path: '' }],
			};
		}
		flow = raw as FlowDefinition;
	} catch (err) {
		// exit 3 = YAML parse error. D34 defines exit 1 (validation errors) and exit 2
		// (file not found). Exit 3 is an intentional extension: a YAML parse error is
		// distinct from a semantic validation error and callers need to differentiate
		// the two failure modes.
		// Raw js-yaml exception suppressed (may contain file content excerpts).
		// Use 'flow validate' for detailed output.
		return {
			exit: 3,
			errors: [{ type: 'parse_error', message: `YAML parse error — run 'flow validate' for details.`, path: '' }],
		};
	}

	const validator = new EngineFlowValidator(undefined);
	const result = validator.validate(flow);

	if (result.summary.errors > 0) {
		const errors = result.issues.filter((i: ValidationIssue) => i.severity === 'error').map(issueToCliError);
		return { exit: 1, errors };
	}

	return { exit: 0 };
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
