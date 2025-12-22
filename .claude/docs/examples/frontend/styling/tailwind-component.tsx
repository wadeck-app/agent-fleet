// @ts-nocheck - Example code, not compiled
// Tailwind Component Pattern with cn() utility
// Demonstrates proper use of Tailwind utilities and conditional class merging
import * as React from 'react';

import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Example: Using cn() for conditional class merging
 * - Merges multiple className strings
 * - Handles conditional classes
 * - Allows className prop override
 */

interface AlertProps {
	variant?: 'default' | 'success' | 'warning' | 'error';
	size?: 'sm' | 'md' | 'lg';
	children: React.ReactNode;
	className?: string;
}

export function Alert({ variant = 'default', size = 'md', children, className }: AlertProps) {
	return (
		<div
			className={cn(
				// Base styles (always applied)
				'rounded-lg border p-4 font-medium',
				// Variant styles (conditional)
				variant === 'default' && 'bg-background text-foreground border-border',
				variant === 'success' &&
					'bg-green-50 text-green-900 border-green-200 dark:bg-green-900/20 dark:text-green-100',
				variant === 'warning' &&
					'bg-yellow-50 text-yellow-900 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-100',
				variant === 'error' &&
					'bg-red-50 text-red-900 border-red-200 dark:bg-red-900/20 dark:text-red-100',
				// Size styles (conditional)
				size === 'sm' && 'text-sm p-3',
				size === 'md' && 'text-base p-4',
				size === 'lg' && 'text-lg p-6',
				// Allow override via className prop
				className
			)}
		>
			{children}
		</div>
	);
}

/**
 * Example: Complex conditional styling with multiple states
 */

interface ButtonProps {
	variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
	size?: 'sm' | 'md' | 'lg';
	disabled?: boolean;
	loading?: boolean;
	fullWidth?: boolean;
	children: React.ReactNode;
	onClick?: () => void;
	className?: string;
}

export function Button({
	variant = 'primary',
	size = 'md',
	disabled = false,
	loading = false,
	fullWidth = false,
	children,
	onClick,
	className,
}: ButtonProps) {
	return (
		<button
			disabled={disabled || loading}
			onClick={onClick}
			className={cn(
				// Base styles
				'inline-flex items-center justify-center rounded-md font-medium',
				'transition-colors duration-150',
				'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
				'disabled:pointer-events-none disabled:opacity-50',
				// Variant styles
				variant === 'primary' && [
					'bg-primary text-primary-foreground',
					'hover:bg-primary/90',
					'focus-visible:ring-primary',
				],
				variant === 'secondary' && [
					'bg-secondary text-secondary-foreground',
					'hover:bg-secondary/80',
					'focus-visible:ring-secondary',
				],
				variant === 'outline' && [
					'border border-input bg-transparent',
					'hover:bg-accent hover:text-accent-foreground',
					'focus-visible:ring-ring',
				],
				variant === 'ghost' && [
					'hover:bg-accent hover:text-accent-foreground',
					'focus-visible:ring-ring',
				],
				// Size styles
				size === 'sm' && 'h-8 px-3 text-xs',
				size === 'md' && 'h-10 px-4 text-sm',
				size === 'lg' && 'h-12 px-6 text-base',
				// Full width
				fullWidth && 'w-full',
				// Custom className override
				className
			)}
		>
			{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
			{children}
		</button>
	);
}

/**
 * Example: Using cn() with data attributes
 */

interface TabProps {
	active?: boolean;
	disabled?: boolean;
	children: React.ReactNode;
	onClick?: () => void;
	className?: string;
}

export function Tab({ active, disabled, children, onClick, className }: TabProps) {
	return (
		<button
			onClick={onClick}
			disabled={disabled}
			data-active={active}
			className={cn(
				// Base styles
				'px-4 py-2 text-sm font-medium rounded-md transition-colors',
				// State-based styles
				'hover:bg-muted hover:text-foreground',
				'data-[active=true]:bg-background data-[active=true]:text-foreground data-[active=true]:shadow-sm',
				'disabled:opacity-50 disabled:pointer-events-none',
				className
			)}
		>
			{children}
		</button>
	);
}

/**
 * Example: Avoiding common mistakes
 */

// ❌ BAD - Complex string concatenation
function BadButton({ variant, isActive, className }: any) {
	return (
		<button
			className={
				`btn ${variant === 'primary' ? 'bg-blue-500' : 'bg-gray-500'} ` +
				`${isActive ? 'ring-2' : ''} ${className || ''}`
			}
		>
			Click me
		</button>
	);
}

// ✅ GOOD - Using cn() for clean merging
function GoodButton({ variant, isActive, className }: any) {
	return (
		<button
			className={cn(
				'btn',
				variant === 'primary' ? 'bg-primary' : 'bg-secondary',
				isActive && 'ring-2 ring-ring',
				className
			)}
		>
			Click me
		</button>
	);
}

// ❌ BAD - Not allowing className override
function BadCard({ children }: any) {
	return <div className="rounded-lg border p-4">{children}</div>;
}

// ✅ GOOD - Accepting className prop with cn()
function GoodCard({ children, className }: any) {
	return <div className={cn('rounded-lg border p-4', className)}>{children}</div>;
}
