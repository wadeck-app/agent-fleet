import { useCallback, useEffect, useRef, useState } from 'react';

import { type FlowDefinition, FlowValidator, type ValidationResult } from '../types/flow-engine.types';

/**
 * Hook for real-time flow validation
 */
export function useFlowValidation(flowDefinition: FlowDefinition | null) {
	const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
	const validatorRef = useRef<FlowValidator>(new FlowValidator());

	const validate = useCallback(() => {
		if (!flowDefinition) {
			setValidationResult(null);
			return null;
		}

		const result = validatorRef.current.validate(flowDefinition);
		setValidationResult(result);
		return result;
	}, [flowDefinition]);

	// Real-time validation with debounce
	useEffect(() => {
		if (!flowDefinition) return;

		const timeout = setTimeout(() => {
			validate();
		}, 500);

		return () => clearTimeout(timeout);
	}, [flowDefinition, validate]);

	return { validationResult, validate };
}
