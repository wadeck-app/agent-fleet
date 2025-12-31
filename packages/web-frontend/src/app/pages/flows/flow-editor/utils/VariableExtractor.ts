import type { FlowDefinition, FlowStep, VariableType } from '../types/flow-engine.types';

/**
 * Represents a variable port on a node
 */
export interface VariablePort {
	/** Unique ID for the handle (e.g., "input-varName" or "output-varName") */
	id: string;
	/** Variable name (e.g., "userName") */
	name: string;
	/** Variable type */
	type: VariableType;
	/** Port direction */
	direction: 'input' | 'output';
	/** Whether this output is required */
	required?: boolean;
	/** Whether type is uncertain (output not defined in source step) */
	uncertain?: boolean;
}

/**
 * Node with extracted variable ports
 */
export interface NodeWithPorts {
	stepId: string;
	inputPorts: VariablePort[];
	outputPorts: VariablePort[];
}

/**
 * Parsed variable reference from template
 */
interface VariableReference {
	type: 'input' | 'step' | 'task';
	path: string[];
}

/**
 * Extract output ports from step.output configuration
 */
export function extractOutputPorts(step: FlowStep): VariablePort[] {
	if (!step.output) return [];

	return Object.entries(step.output).map(([name, config]) => ({
		id: `output-${name}`,
		name,
		type: config.type,
		direction: 'output' as const,
		required: config.required,
	}));
}

/**
 * Parse variable expression from template (e.g., "inputs.userName" or "steps.step1.outputs.result")
 */
function parseVariableExpression(expression: string): VariableReference | null {
	const parts = expression.split('.');

	if (parts[0] === 'inputs') {
		return { type: 'input', path: parts.slice(1) };
	} else if (parts[0] === 'steps') {
		return { type: 'step', path: parts.slice(1) };
	} else if (parts[0] === 'task') {
		return { type: 'task', path: parts.slice(1) };
	}

	return null;
}

/**
 * Extract input ports by parsing template variables in prompts/scripts
 * Uses regex: /\$\{\{\s*([^}]+)\s*\}\}/g
 */
export function extractInputPorts(step: FlowStep, flowDefinition: FlowDefinition): VariablePort[] {
	const templateRegex = /\$\{\{\s*([^}]+)\s*\}\}/g;
	const references = new Set<string>();

	// Get text to scan based on step type
	let text = '';
	if (step.type === 'model') {
		text = step.prompt || '';
	} else if (step.type === 'script') {
		text = step.script || '';
	} else if (step.type === 'subflow') {
		// SubFlow inputs are in step.inputs object values
		text = Object.values(step.inputs).join(' ');
	}

	// Extract all variable references
	let match;
	while ((match = templateRegex.exec(text)) !== null) {
		const expression = match[1].trim();
		const parsed = parseVariableExpression(expression);

		if (parsed) {
			references.add(JSON.stringify(parsed));
		}
	}

	// Convert to VariablePort array
	const ports: VariablePort[] = [];

	for (const refStr of references) {
		const ref: VariableReference = JSON.parse(refStr);

		if (ref.type === 'input') {
			// Flow input reference: ${{ inputs.userName }}
			const inputName = ref.path[0];
			const inputType = flowDefinition.inputs[inputName] || 'string';

			ports.push({
				id: `input-flow-${inputName}`,
				name: `inputs.${inputName}`,
				type: inputType,
				direction: 'input',
			});
		} else if (ref.type === 'step') {
			// Step output reference: ${{ steps.stepId.outputs.varName }}
			if (ref.path.length < 3) continue; // Invalid format

			const [sourceStepId, , outputVar] = ref.path;

			// Find source step to get output type
			const sourceStep = flowDefinition.steps.find(s => s.id === sourceStepId);
			const outputConfig = sourceStep?.output?.[outputVar];
			const outputType = outputConfig?.type || 'string';
			const uncertain = !outputConfig; // Mark as uncertain if output not defined

			ports.push({
				id: `input-step-${sourceStepId}-${outputVar}`,
				name: `steps.${sourceStepId}.outputs.${outputVar}`,
				type: outputType,
				direction: 'input',
				uncertain,
			});
		}
		// Note: We skip 'task' type references as they're not data flow connections
	}

	return ports;
}

/**
 * Extract all variable ports for all steps in a flow
 */
export function extractAllPorts(flowDefinition: FlowDefinition): Map<string, NodeWithPorts> {
	const portsMap = new Map<string, NodeWithPorts>();

	for (const step of flowDefinition.steps) {
		portsMap.set(step.id, {
			stepId: step.id,
			inputPorts: extractInputPorts(step, flowDefinition),
			outputPorts: extractOutputPorts(step),
		});
	}

	return portsMap;
}
