import React from 'react';

import { Button } from '@framework/components/primitives/Button';

/**
 * ===========================================================================================
 * EMPTY STATE - Generic UI Component
 * ===========================================================================================
 *
 * Pure presentation component for showing empty states.
 * - Zero business logic
 * - Uses shadcn Button component (Radix Nova style)
 * - Customizable with icon, title, description, and action
 *
 * ===========================================================================================
 */

// @formatter:off
interface EmptyStateAction {
	label: string;
	onClick: () => void;
	variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link';
}

// Base props without action
interface BaseEmptyStateProps {
	icon?: React.ReactNode;
	title: string;
	description?: string;
	className?: string;
}

// Discriminated union: with action or without action
type EmptyStateWithAction = BaseEmptyStateProps & {
	action: EmptyStateAction;
};

type EmptyStateWithoutAction = BaseEmptyStateProps & {
	action?: never;
};

export type EmptyStateProps = EmptyStateWithAction | EmptyStateWithoutAction;
// @formatter:on

export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
	return (
		<div
			className={`
     flex flex-col items-center justify-center p-12 text-center
     ${className}
   `}
		>
			{icon && <div className="mb-4 text-muted-foreground">{icon}</div>}
			<h3 className="mb-2 text-lg font-semibold text-foreground">{title}</h3>
			{description && <p className="mb-6 max-w-md text-sm text-muted-foreground">{description}</p>}
			{action && (
				<Button onClick={action.onClick} variant={action.variant || 'default'}>
					{action.label}
				</Button>
			)}
		</div>
	);
}
