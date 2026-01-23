import React from 'react';

import { Badge } from '@framework/components/primitives/Badge';
import type { ValidationResult } from 'flow-engine/validation/ValidationTypes';
import { AlertTriangle, XCircle } from 'lucide-react';

/**
 * ===========================================================================================
 * FLOW EDITOR HEADER - Domain Component
 * ===========================================================================================
 *
 * Header component for the flow editor showing title, description, and validation status.
 * Extracts header presentation from FlowEditorPage to reduce CSS in page-level components.
 *
 * **Responsibilities:**
 * - Display flow name and description
 * - Show validation status badges (errors/warnings)
 * - Minimal CSS (presentational only)
 *
 * **Grade: A+ (Target)**
 * - 6-8 CSS classes only
 * - Zero business logic
 * - Pure presentation
 *
 * ===========================================================================================
 */

export interface FlowEditorHeaderProps {
	flowName: string;
	flowDescription?: string;
	validationResult?: ValidationResult | null;
}

export function FlowEditorHeader({ flowName, flowDescription, validationResult }: FlowEditorHeaderProps) {
	return (
		<>
			<div className="mb-6 flex items-center gap-3">
				<h1 className="text-3xl font-bold">{flowName}</h1>

				{/* Invalid Badge */}
				{validationResult && !validationResult.valid && (
					<Badge variant="destructive" className="inline-flex items-center gap-1.5">
						<XCircle className="h-4 w-4" />
						Invalid ({validationResult.summary.errors} errors)
					</Badge>
				)}

				{/* Warning Badge */}
				{validationResult && validationResult.valid && validationResult.summary.warnings > 0 && (
					<Badge variant="warning" className="inline-flex items-center gap-1.5">
						<AlertTriangle className="h-4 w-4" />
						{validationResult.summary.warnings} warnings
					</Badge>
				)}
			</div>

			{/* Description */}
			{flowDescription && <p className="mb-6 text-sm text-muted-foreground">{flowDescription}</p>}
		</>
	);
}
