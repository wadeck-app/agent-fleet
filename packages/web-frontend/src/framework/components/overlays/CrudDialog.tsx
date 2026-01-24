import React, { type ReactNode } from 'react';

import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './Dialog';

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
	maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
	showCloseButton?: boolean;
	preventOutsideClick?: boolean;
}

const maxWidthClasses = {
	sm: 'sm:max-w-sm',
	md: 'sm:max-w-md',
	lg: 'sm:max-w-lg',
	xl: 'sm:max-w-xl',
	'2xl': 'sm:max-w-2xl',
	'3xl': 'sm:max-w-3xl',
	'4xl': 'sm:max-w-4xl',
	'5xl': 'sm:max-w-5xl',
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
	preventOutsideClick = false,
}: CrudDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				showCloseButton={showCloseButton}
				preventOutsideClick={preventOutsideClick}
				className={maxWidthClasses[maxWidth]}
			>
				<DialogHeader className="border-b pb-4">
					<div className="flex items-center gap-2">
						<DialogTitle className="text-xl font-semibold">{title}</DialogTitle>
						{headerActions && <div className="flex items-center gap-2">{headerActions}</div>}
					</div>
					{description && <DialogDescription>{description}</DialogDescription>}
				</DialogHeader>
				{/*
					IMPORTANT: Children should include DialogBody and DialogFooter as siblings
					This allows the footer to be fixed at the bottom while the body scrolls
				*/}
				{isRefreshing ? (
					<DialogBody
						className={`
       pointer-events-none opacity-50 blur-[1px] transition-all duration-200
     `}
					>
						{children}
					</DialogBody>
				) : (
					children
				)}
			</DialogContent>
		</Dialog>
	);
}
