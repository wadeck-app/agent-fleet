// violations-suppress: ts/no-inline-subcomponent tightly-coupled primitive sub-parts belong in the same file
import React from 'react';

/**
 * ===========================================================================================
 * LEGACY COMPONENTS - For backward compatibility
 * ===========================================================================================
 */
import { DialogFooter } from '@framework/components/overlays/Dialog';
import { Button } from '@framework/components/primitives/Button';
import { cn } from '@framework/lib/utils';

/**
 * ===========================================================================================
 * FORM CONTAINER - Pure Form Wrapper Component
 * ===========================================================================================
 *
 * Provides a pure form wrapper with an ID for external submission.
 * This component is context-agnostic and works in both pages and dialogs.
 *
 * Features:
 * - Pure form wrapper with customizable ID
 * - Grid layout for fields
 * - External submission support via form attribute
 * - No UI decisions (buttons, footer, etc.)
 *
 * Usage:
 * ```tsx
 * <DialogBody>
 *   <FormContainer id="my-form" onSubmit={handleSubmit}>
 *     <TextField ... />
 *     <SelectField ... />
 *   </FormContainer>
 * </DialogBody>
 * <DialogFooter>
 *   <FormActions actions={[...]} formId="my-form" />
 * </DialogFooter>
 * ```
 *
 * ===========================================================================================
 */

export interface FormContainerProps {
	id: string; // Form ID for external submission
	onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
	children: React.ReactNode;
	className?: string;
	disableDefaultLayout?: boolean; // Set to true to disable default grid layout
}

export function FormContainer({ id, onSubmit, children, className, disableDefaultLayout }: FormContainerProps) {
	const defaultLayoutClasses = disableDefaultLayout ? '' : 'grid gap-4 md:grid-cols-2';
	return (
		<form id={id} onSubmit={onSubmit} className={cn(defaultLayoutClasses, className)} noValidate>
			{children}
		</form>
	);
}

/**
 * @deprecated Use FormActions component instead
 */
export interface SecondaryAction {
	label: string;
	onClick: () => void;
	disabled?: boolean;
	variant?: 'default' | 'outline' | 'ghost';
}

/**
 * @deprecated Use new FormContainer + FormActions pattern
 */
export interface FormContainerLegacyProps {
	isSubmitting: boolean;
	onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
	onCancel: () => void;
	submitLabel: string;
	children: React.ReactNode;
	secondaryActions?: SecondaryAction[];
}

/**
 * @deprecated Use new FormContainer + FormActions pattern
 * This component is kept for backward compatibility only.
 *
 * ALL production components have been migrated to the new pattern.
 * This component should NOT be used in new code.
 *
 * Migration guide:
 * ```tsx
 * // Old:
 * <FormContainerLegacy onSubmit={...} onCancel={...} submitLabel="Save">
 *   {fields}
 * </FormContainerLegacy>
 *
 * // New:
 * <DialogBody>
 *   <FormContainer id="my-form" onSubmit={...}>
 *     {fields}
 *   </FormContainer>
 * </DialogBody>
 * <DialogFooter>
 *   <FormActions actions={[...]} />
 * </DialogFooter>
 * ```
 *
 * Migrated components:
 * - CreateProjectDialog 
 * - EditProjectDialog 
 * - CreateWorkspaceDialog 
 * - EditWorkspaceDialog 
 * - BookForm 
 * - IngredientForm 
 */
export function FormContainerLegacy({
	isSubmitting,
	onSubmit,
	onCancel,
	submitLabel,
	children,
	secondaryActions,
}: FormContainerLegacyProps) {
	return (
		<form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
			{/* Scrollable content area */}
			<div className="-mx-4 flex-1 overflow-y-auto px-4">
				<div
					className={`
      grid gap-4
      md:grid-cols-2
    `}
				>
					{children}
				</div>
			</div>

			{/* Fixed footer with buttons */}
			<DialogFooter>
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
			</DialogFooter>
		</form>
	);
}
