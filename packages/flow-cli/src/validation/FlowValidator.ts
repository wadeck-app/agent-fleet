import type { FlowDefinition } from 'flow-engine/src/types.js';
import { FlowValidator as EngineFlowValidator, ValidationCode } from 'flow-engine/src/validation/FlowValidator.js';
import type { ValidationIssue } from 'flow-engine/src/validation/FlowValidator.js';
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
		return { exit: 2, message: `Cannot read file: ${String(err)}` };
	}

	let flow: FlowDefinition;
	try {
		flow = yaml.load(content) as FlowDefinition;
	} catch (err) {
		// exit 3 = YAML parse error. D34 defines exit 1 (validation errors) and exit 2
		// (file not found). Exit 3 is an intentional extension: a YAML parse error is
		// distinct from a semantic validation error and callers need to differentiate
		// the two failure modes.
		return {
			exit: 3,
			errors: [{ type: 'parse_error', message: `YAML parse error: ${String(err)}`, path: '' }],
		};
	}

	const validator = new EngineFlowValidator(undefined);
	const result = validator.validate(flow);

	if (result.summary.errors > 0) {
		const errors = result.issues.filter(i => i.severity === 'error').map(issueToCliError);
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
		default: {
			const _exhaustive: never = code;
			throw new Error(`Unknown ValidationCode: ${String(_exhaustive)}`);
		}
	}
}
