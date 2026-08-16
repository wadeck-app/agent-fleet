/**
 * Output Extractor
 *
 * Extracts and transforms outputs from step results based on configuration.
 * Supports:
 * - Regex pattern extraction
 * - Type conversion
 * - Transform functions (parseJSON, parseInt, etc.)
 * - Default values
 * - Required field validation
 */
import type { OutputVariableConfig, StepOutput, TransformFunction, VariableType } from '../types';

/**
 * Output extraction error
 */
export class OutputExtractionError extends Error {
	constructor(
		message: string,
		public variableName: string,
		public stepId: string
	) {
		super(`Output extraction error for '${variableName}' in step '${stepId}': ${message}`);
		this.name = 'OutputExtractionError';
	}
}

/**
 * Output Extractor class
 */
export class OutputExtractor {
	/**
	 * Extract outputs from raw output text based on configuration
	 *
	 * @param rawOutput - Raw text output (stdout, response, etc.)
	 * @param config - Output configuration
	 * @param stepId - Step ID (for error messages)
	 * @param additionalContext - Additional values to include (like exitCode, stderr)
	 * @returns Extracted and transformed outputs
	 */
	public extract(
		rawOutput: string,
		config: StepOutput | undefined,
		stepId: string,
		additionalContext?: Record<string, any>
	): Record<string, any> {
		if (!config) {
			// No output config, return just the raw output and additional context
			return {
				rawOutput,
				...additionalContext,
			};
		}

		const outputs: Record<string, any> = { ...additionalContext };

		// Extract each configured output variable
		for (const [varName, varConfig] of Object.entries(config)) {
			try {
				const value = this.extractVariable(varName, varConfig, rawOutput, stepId, additionalContext);
				outputs[varName] = value;
			} catch (error) {
				if (varConfig.required) {
					throw error;
				} else if (varConfig.default !== undefined) {
					outputs[varName] = varConfig.default;
				} else {
					// Optional field without default, skip it
					console.warn(`Failed to extract optional field '${varName}':`, error);
				}
			}
		}

		return outputs;
	}

	/**
	 * Extract a single variable
	 */
	private extractVariable(
		varName: string,
		config: OutputVariableConfig,
		rawOutput: string,
		stepId: string,
		additionalContext?: Record<string, any>
	): any {
		let value: any;

		if (config.jsonpath && config.pattern) {
			throw new OutputExtractionError(`'jsonpath' and 'pattern' are mutually exclusive`, varName, stepId);
		}

		// If 'from' is specified, extract from the specified source path
		if (config.from) {
			value = this.extractFromPath(config.from, additionalContext, varName, stepId);
		}
		// Check if it's in additionalContext (for script steps: exitCode, stderr, etc.)
		else if (additionalContext && varName in additionalContext) {
			value = additionalContext[varName];
		}
		// Extract using JSONPath expression
		else if (config.jsonpath) {
			value = this.extractWithJsonPath(config.jsonpath, rawOutput, varName, stepId);
		}
		// Extract using regex pattern
		else if (config.pattern) {
			value = this.extractWithPattern(config.pattern, rawOutput, varName, stepId);
		}
		// No pattern, use entire raw output
		else {
			value = rawOutput;
		}

		// Apply transform if specified
		if (config.transform) {
			value = this.applyTransform(config.transform, value, varName, stepId);
		}

		// Type conversion
		value = this.convertType(value, config.type, varName, stepId);

		return value;
	}

	/**
	 * Extract value from a path like 'intervention.approved'
	 */
	private extractFromPath(
		path: string,
		additionalContext: Record<string, any> | undefined,
		varName: string,
		stepId: string
	): any {
		if (!additionalContext) {
			throw new OutputExtractionError(
				`Cannot extract from path '${path}': no context available`,
				varName,
				stepId
			);
		}

		const parts = path.split('.');
		let current: any = additionalContext;

		for (const part of parts) {
			if (current == null || typeof current !== 'object') {
				throw new OutputExtractionError(
					`Cannot navigate path '${path}': reached non-object at '${part}'`,
					varName,
					stepId
				);
			}

			if (!(part in current)) {
				throw new OutputExtractionError(`Path '${path}' not found: missing '${part}'`, varName, stepId);
			}

			current = current[part];
		}

		return current;
	}

	/**
	 * Extract value from JSON output using a dot-notation JSONPath (e.g. '$.status', '$.nested.field').
	 */
	private extractWithJsonPath(jsonpath: string, rawOutput: string, varName: string, stepId: string): unknown {
		let parsed: unknown;
		try {
			parsed = JSON.parse(rawOutput.trim());
		} catch {
			throw new OutputExtractionError(
				`Cannot apply jsonpath '${jsonpath}': output is not valid JSON`,
				varName,
				stepId
			);
		}

		if (!jsonpath.startsWith('$.')) {
			throw new OutputExtractionError(`Invalid jsonpath '${jsonpath}': must start with '$.'`, varName, stepId);
		}

		const parts = jsonpath.slice(2).split('.');
		let current: unknown = parsed;

		for (const part of parts) {
			if (current == null || typeof current !== 'object') {
				throw new OutputExtractionError(
					`jsonpath '${jsonpath}' failed: reached non-object before '${part}'`,
					varName,
					stepId
				);
			}
			if (!(part in (current as Record<string, unknown>))) {
				throw new OutputExtractionError(
					`jsonpath '${jsonpath}' failed: key '${part}' not found`,
					varName,
					stepId
				);
			}
			current = (current as Record<string, unknown>)[part];
		}

		return current;
	}

	/**
	 * Extract value using regex pattern
	 */
	private extractWithPattern(pattern: string, text: string, varName: string, stepId: string): string {
		const regex = new RegExp(pattern, 'm');
		const match = regex.exec(text);

		if (!match) {
			throw new OutputExtractionError(`Pattern '${pattern}' did not match in output`, varName, stepId);
		}

		// Return first capturing group if exists, otherwise entire match
		return match[1] !== undefined ? match[1] : match[0];
	}

	/**
	 * Apply transform function
	 */
	private applyTransform(transform: TransformFunction | string, value: any, varName: string, stepId: string): any {
		try {
			switch (transform) {
				case 'parseJSON':
					return JSON.parse(String(value));

				case 'parseYAML':
					// For now, simple YAML parsing (would need js-yaml for complex cases)
					throw new OutputExtractionError('parseYAML not yet implemented', varName, stepId);

				case 'parseInt':
					const intValue = parseInt(String(value), 10);
					if (isNaN(intValue)) {
						throw new Error(`Cannot parse '${value}' as integer`);
					}
					return intValue;

				case 'parseFloat':
					const floatValue = parseFloat(String(value));
					if (isNaN(floatValue)) {
						throw new Error(`Cannot parse '${value}' as float`);
					}
					return floatValue;

				case 'parseBoolean':
					return this.parseBoolean(value);

				case 'trim':
					return String(value).trim();

				case 'toLowerCase':
					return String(value).toLowerCase();

				case 'toUpperCase':
					return String(value).toUpperCase();

				case 'split':
					return String(value)
						.split('\n')
						.filter(line => line.trim());

				default:
					// Custom transform function name
					throw new OutputExtractionError(`Unknown transform function: ${transform}`, varName, stepId);
			}
		} catch (error) {
			throw new OutputExtractionError(
				`Transform '${transform}' failed: ${error instanceof Error ? error.message : String(error)}`,
				varName,
				stepId
			);
		}
	}

	/**
	 * Parse boolean from various formats
	 */
	private parseBoolean(value: any): boolean {
		if (typeof value === 'boolean') {
			return value;
		}

		const str = String(value).toLowerCase().trim();

		if (['true', 'yes', '1', 'y', 'on'].includes(str)) {
			return true;
		}

		if (['false', 'no', '0', 'n', 'off', ''].includes(str)) {
			return false;
		}

		throw new Error(`Cannot parse '${value}' as boolean`);
	}

	/**
	 * Convert value to target type
	 */
	private convertType(value: any, targetType: VariableType, varName: string, stepId: string): any {
		// If value is already the right type, return as-is
		if (typeof value === targetType) {
			return value;
		}

		// If target is object and value is already object, ok
		if (targetType === 'object' && typeof value === 'object' && value !== null) {
			return value;
		}

		try {
			switch (targetType) {
				// Base types
				case 'string':
					return String(value);

				case 'number':
				case 'integer':
				case 'percentage':
				case 'duration':
					const num = Number(value);
					if (isNaN(num)) {
						throw new Error(`Cannot convert to number`);
					}
					// For integer, round to nearest integer
					return targetType === 'integer' ? Math.round(num) : num;

				case 'boolean':
					return this.parseBoolean(value);

				case 'object':
				case 'array':
				case 'keyvalue':
					// Try to parse as JSON if it's a string
					if (typeof value === 'string') {
						return JSON.parse(value);
					}
					return value;

				// Text types - treat as string
				case 'text':
				case 'url':
				case 'markdown':
				case 'regex':
				case 'password':
					return String(value);

				// Selection types - keep as-is
				case 'enum':
				case 'multi-enum':
				case 'priority':
					return value;

				// File/folder types - treat as string paths
				case 'file':
				case 'folder':
					return String(value);

				// Date types - keep as ISO string
				case 'date':
				case 'datetime':
					return String(value);

				default:
					return value;
			}
		} catch (error) {
			throw new OutputExtractionError(
				`Type conversion to '${targetType}' failed: ${error instanceof Error ? error.message : String(error)}`,
				varName,
				stepId
			);
		}
	}

	/**
	 * Validate that required outputs are present
	 */
	public validateRequired(outputs: Record<string, any>, config: StepOutput | undefined, stepId: string): void {
		if (!config) return;

		for (const [varName, varConfig] of Object.entries(config)) {
			if (varConfig.required && !(varName in outputs)) {
				throw new OutputExtractionError(`Required output '${varName}' is missing`, varName, stepId);
			}
		}
	}
}
