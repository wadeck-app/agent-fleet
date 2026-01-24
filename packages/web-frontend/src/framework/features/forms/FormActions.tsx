import React from 'react';

import { Button } from '@framework/components/primitives/Button';

/**
 * ===========================================================================================
 * FORM ACTIONS - Pure UI Component
 * ===========================================================================================
 *
 * Renders action buttons for forms, supporting external form submission.
 * This component is context-agnostic and can be used in dialogs or pages.
 *
 * Features:
 * - External form submission via form attribute
 * - Multiple action types (submit, button, reset)
 * - Variant support for different button styles
 * - Disabled state handling
 *
 * Usage:
 * ```tsx
 * <FormActions
 *   actions={[
 *     { label: 'Save', type: 'submit', formId: 'my-form' },
 *     { label: 'Cancel', variant: 'outline', onClick: () => close() },
 *   ]}
 *   isSubmitting={isSubmitting}
 * />
 * ```
 *
 * ===========================================================================================
 */

export interface FormAction {
	label: string;
	onClick?: () => void;
	type?: 'submit' | 'button' | 'reset';
	variant?: 'default' | 'outline' | 'ghost' | 'destructive';
	disabled?: boolean;
	formId?: string; // For external form submission
}

export interface FormActionsProps {
	actions: FormAction[];
	isSubmitting?: boolean;
}

export function FormActions({ actions, isSubmitting }: FormActionsProps) {
	return (
		<>
			{actions.map((action, index) => (
				<Button
					key={index}
					type={action.type || 'button'}
					variant={action.variant || 'default'}
					onClick={action.onClick}
					disabled={action.disabled ?? isSubmitting}
					form={action.formId} // External form submission
				>
					{action.label}
				</Button>
			))}
		</>
	);
}
