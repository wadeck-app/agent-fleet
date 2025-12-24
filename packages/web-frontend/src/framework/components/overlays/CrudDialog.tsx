import React, { type ReactNode } from 'react';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './Dialog';

/**
 * ===========================================================================================
 * CRUD DIALOG - Generic UI Component
 * ===========================================================================================
 *
 * Convenience wrapper around Dialog components for CRUD operations.
 * - Combines Dialog + DialogContent + DialogHeader + DialogTitle + DialogDescription
 * - Provides consistent styling and structure for all CRUD operations
 * - Configurable maxWidth and close button visibility
 *
 * ===========================================================================================
 */

export interface CrudDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description?: string;
	headerActions?: ReactNode;
	isRefreshing?: boolean;
	children: ReactNode;
	maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
	showCloseButton?: boolean;
}

const maxWidthClasses = {
	sm: 'max-w-sm',
	md: 'max-w-md',
	lg: 'max-w-lg',
	xl: 'max-w-xl',
	'2xl': 'max-w-2xl',
};

export function CrudDialog({
	open,
	onOpenChange,
	title,
	description,
	headerActions,
	isRefreshing = false,
	children,
	maxWidth = '2xl',
	showCloseButton = true,
}: CrudDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent showCloseButton={showCloseButton} className={maxWidthClasses[maxWidth]}>
				<DialogHeader className="border-b pb-4">
					<div className="flex items-center gap-2">
						<DialogTitle className="text-xl font-semibold">{title}</DialogTitle>
						{headerActions && <div className="flex items-center gap-2">{headerActions}</div>}
					</div>
					{description && <DialogDescription>{description}</DialogDescription>}
				</DialogHeader>
				<div
					className={`
       transition-all duration-200
       ${isRefreshing ? 'pointer-events-none opacity-50 blur-[1px]' : ''}
     `}
				>
					{children}
				</div>
			</DialogContent>
		</Dialog>
	);
}
