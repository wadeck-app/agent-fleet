/**
 * Shared Validation Types
 *
 * Common type definitions and enums used across all flow validators.
 * These types are shared by SchemaValidator, SemanticValidator,
 * TemplateValidator, GraphValidator, and the main FlowValidator orchestrator.
 */
/**
 * Validation issue codes for programmatic handling
 */
export var ValidationCode;
(function (ValidationCode) {
	// Schema errors
	ValidationCode['MISSING_FIELD'] = 'MISSING_FIELD';
	ValidationCode['INVALID_TYPE'] = 'INVALID_TYPE';
	ValidationCode['INVALID_VALUE'] = 'INVALID_VALUE';
	ValidationCode['DUPLICATE_ID'] = 'DUPLICATE_ID';
	ValidationCode['EMPTY_COLLECTION'] = 'EMPTY_COLLECTION';
	// Reference errors
	ValidationCode['UNDEFINED_STEP'] = 'UNDEFINED_STEP';
	ValidationCode['UNDEFINED_INPUT'] = 'UNDEFINED_INPUT';
	ValidationCode['UNDEFINED_OUTPUT'] = 'UNDEFINED_OUTPUT';
	ValidationCode['UNDEFINED_VARIABLE'] = 'UNDEFINED_VARIABLE';
	ValidationCode['UNDEFINED_FLOW'] = 'UNDEFINED_FLOW';
	// Semantic errors
	ValidationCode['CIRCULAR_DEPENDENCY'] = 'CIRCULAR_DEPENDENCY';
	ValidationCode['CIRCULAR_SUBFLOW_REFERENCE'] = 'CIRCULAR_SUBFLOW_REFERENCE';
	ValidationCode['UNREACHABLE_STEP'] = 'UNREACHABLE_STEP';
	ValidationCode['NO_TERMINAL_STEP'] = 'NO_TERMINAL_STEP';
	ValidationCode['TYPE_MISMATCH'] = 'TYPE_MISMATCH';
	// Template errors
	ValidationCode['INVALID_TEMPLATE_SYNTAX'] = 'INVALID_TEMPLATE_SYNTAX';
	ValidationCode['MALFORMED_EXPRESSION'] = 'MALFORMED_EXPRESSION';
	// Warnings
	ValidationCode['UNUSED_INPUT'] = 'UNUSED_INPUT';
	ValidationCode['UNUSED_OUTPUT'] = 'UNUSED_OUTPUT';
	ValidationCode['MISSING_OUTPUT'] = 'MISSING_OUTPUT';
})(ValidationCode || (ValidationCode = {}));
//# sourceMappingURL=ValidationTypes.js.map
