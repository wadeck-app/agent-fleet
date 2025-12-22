import React from 'react';

import { Button } from '@framework/components/primitives/Button';
import { cn } from '@framework/lib/utils';
import { Moon, Sun } from 'lucide-react';

export interface ThemeToggleEnhancedProps {
	theme: 'light' | 'dark';
	onToggle: () => void;
	className?: string;
	variant?: 'icon' | 'labeled' | 'switch';
}

/**
 * Enhanced Theme Toggle with multiple design options
 *
 * Variants:
 * 1. "icon" - Original icon-only button (default)
 * 2. "labeled" - Button with visible label
 * 3. "switch" - Toggle switch style
 */
export function ThemeToggleEnhanced({ theme, onToggle, className, variant = 'icon' }: ThemeToggleEnhancedProps) {
	const isDark = theme === 'dark';

	if (variant === 'switch') {
		return (
			<Button
				type="button"
				onClick={onToggle}
				variant="ghost"
				className={cn(
					`
       relative inline-flex h-9 w-16 items-center rounded-full p-0
       transition-colors
       hover:bg-transparent
     `,
					isDark ? 'bg-primary' : 'bg-muted',
					className
				)}
				aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
				title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
			>
				<span
					className={cn(
						`
        inline-flex size-7 items-center justify-center rounded-full
        bg-background shadow-sm transition-transform
      `,
						isDark ? 'translate-x-8' : 'translate-x-1'
					)}
				>
					{isDark ? (
						<Moon className="size-4 text-foreground" />
					) : (
						<Sun className={`size-4 text-foreground`} />
					)}
				</span>
			</Button>
		);
	}

	if (variant === 'labeled') {
		return (
			<Button
				type="button"
				onClick={onToggle}
				variant="ghost"
				className={cn('w-full justify-start gap-2', className)}
				aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
				title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
			>
				{isDark ? (
					<>
						<Moon className="size-4" />
						<span className="text-sm">Dark Mode</span>
					</>
				) : (
					<>
						<Sun className="size-4" />
						<span className="text-sm">Light Mode</span>
					</>
				)}
			</Button>
		);
	}

	// Default: icon variant
	return (
		<Button
			type="button"
			onClick={onToggle}
			variant="ghost"
			size="icon"
			className={className}
			aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
			title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
		>
			{isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
		</Button>
	);
}

/**
 * Compact toggle with animation
 */
export function ThemeToggleAnimated({ theme, onToggle, className }: Omit<ThemeToggleEnhancedProps, 'variant'>) {
	const isDark = theme === 'dark';

	return (
		<Button
			type="button"
			onClick={onToggle}
			variant="ghost"
			size="icon"
			className={cn('relative overflow-hidden', className)}
			aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
		>
			<div className="relative size-5">
				<Sun
					className={cn(
						'absolute inset-0 scale-100 rotate-0 transition-all',
						isDark &&
							`
       scale-0 rotate-90
     `
					)}
				/>
				<Moon
					className={cn(
						'absolute inset-0 scale-0 rotate-90 transition-all',
						isDark &&
							`
       scale-100 rotate-0
     `
					)}
				/>
			</div>
		</Button>
	);
}
