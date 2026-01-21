import React from 'react';

import { Button } from '@framework/components/primitives/Button';

/**
 * ===========================================================================================
 * FORM CONTAINER - UI Component
 * ===========================================================================================
 *
 * Reusable form wrapper that provides consistent layout and structure.
 * Eliminates duplication of form structure across feature forms.
 *
 * Features:
 * - Consistent form styling
 * - Grid layout for fields
 * - Standard action buttons (submit/cancel)
 * - Disabled state handling
 *
 * ===========================================================================================
 */

export interface SecondaryAction {
	label: string;
	onClick: () => void;
	disabled?: boolean;
	variant?: 'default' | 'outline' | 'ghost';
}

export interface FormContainerProps {
	isSubmitting: boolean;
	onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
	onCancel: () => void;
	submitLabel: string;
	children: React.ReactNode;
	secondaryActions?: SecondaryAction[];
}

export function FormContainer({
	isSubmitting,
	onSubmit,
	onCancel,
	submitLabel,
	children,
	secondaryActions,
}: FormContainerProps) {
	return (
		<form onSubmit={onSubmit}>
			<div
				className={`
      grid gap-4
      md:grid-cols-2
    `}
			>
				{children}
			</div>

			<div className="mt-6 flex gap-3">
				<Button type="submit" disabled={isSubmitting}>
					{isSubmitting ? 'Saving...' : submitLabel}
				</Button>
				{secondaryActions?.map((action, index) => (
					<Button
						key={index}
						type="button"
						variant={action.variant || 'default'}
						onClick={action.onClick}
						disabled={action.disabled ?? isSubmitting}
					>
						{action.label}
					</Button>
				))}
				<Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
					Cancel
				</Button>
			</div>
		</form>
	);
}
