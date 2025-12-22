// @ts-nocheck - Example code, not compiled
// Generic Reusable Component Pattern
// Pure UI with zero business logic, based on Shadcn/ui (Radix UI primitives)
import * as React from 'react';

import { Check, Loader2, X } from 'lucide-react';

import { Button as ShadcnButton } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ButtonProps {
	variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost';
	size?: 'sm' | 'default' | 'lg';
	disabled?: boolean;
	loading?: boolean;
	children: React.ReactNode;
	onClick?: () => void;
	className?: string;
}

/**
 * Generic Button component - wraps Shadcn/ui Button
 * - Zero business logic
 * - Based on Shadcn/ui Button (Radix UI primitive)
 * - Styled with Tailwind utilities
 * - Uses Lucide icons
 */
export function Button({
	variant = 'default',
	size = 'default',
	disabled = false,
	loading = false,
	children,
	onClick,
	className,
}: ButtonProps) {
	return (
		<ShadcnButton
			variant={variant}
			size={size}
			disabled={disabled || loading}
			onClick={onClick}
			className={cn(className)}
		>
			{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
			{children}
		</ShadcnButton>
	);
}

interface StatusBadgeProps {
	status: 'success' | 'error' | 'pending';
	children: React.ReactNode;
	className?: string;
}

/**
 * Generic StatusBadge component
 * - Pure presentation
 * - Uses Tailwind theme colors
 * - Uses Lucide icons for visual feedback
 */
export function StatusBadge({ status, children, className }: StatusBadgeProps) {
	const icons = {
		success: <Check className="h-3 w-3" />,
		error: <X className="h-3 w-3" />,
		pending: <Loader2 className="h-3 w-3 animate-spin" />,
	};

	return (
		<div
			className={cn(
				'inline-flex items-center gap-1.5 rounded-md px-2.5 py-0.5 text-xs font-medium',
				status === 'success' &&
					'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
				status === 'error' && 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
				status === 'pending' &&
					'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
				className
			)}
		>
			{icons[status]}
			{children}
		</div>
	);
}

interface GenericCardProps {
	title: string;
	children: React.ReactNode;
	actions?: React.ReactNode;
	className?: string;
}

/**
 * Generic Card component - wraps Shadcn/ui Card
 * - Composes Shadcn/ui Card components
 * - Styled with Tailwind utilities
 * - Reusable across features
 */
export function GenericCard({ title, children, actions, className }: GenericCardProps) {
	return (
		<Card className={cn('w-full', className)}>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-lg font-semibold">{title}</CardTitle>
				{actions && <div className="flex items-center gap-2">{actions}</div>}
			</CardHeader>
			<CardContent className="pt-4">{children}</CardContent>
		</Card>
	);
}
