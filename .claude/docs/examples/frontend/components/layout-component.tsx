// @ts-nocheck - Example code, not compiled
// Layout Component Pattern
// Handles structural positioning and responsive behavior with Tailwind
import * as React from 'react';

import { cn } from '@/lib/utils';

interface MainLayoutProps {
	children: React.ReactNode;
	sidebar?: React.ReactNode;
	header?: React.ReactNode;
	className?: string;
}

/**
 * Main Layout component
 * - Handles structural positioning with Tailwind utilities
 * - Manages responsive behavior (mobile-first)
 * - Reusable across multiple pages
 * - No business logic
 */
export function MainLayout({ children, sidebar, header, className }: MainLayoutProps) {
	return (
		<div className={cn('min-h-screen bg-background', className)}>
			{/* Header */}
			{header && (
				<header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
					<div className="container mx-auto px-4 py-4">{header}</div>
				</header>
			)}

			{/* Main container with sidebar */}
			<div className="container mx-auto flex flex-col gap-6 px-4 py-6 lg:flex-row">
				{/* Sidebar - responsive: full width on mobile, fixed width on desktop */}
				{sidebar && (
					<aside className="w-full shrink-0 lg:w-64 xl:w-72">
						<div className="sticky top-20 space-y-4">{sidebar}</div>
					</aside>
				)}

				{/* Main content area */}
				<main className="min-w-0 flex-1">{children}</main>
			</div>
		</div>
	);
}

interface GridLayoutProps {
	children: React.ReactNode;
	columns?: 1 | 2 | 3 | 4;
	gap?: 2 | 4 | 6 | 8;
	className?: string;
}

/**
 * Grid Layout component
 * - Responsive grid layout using Tailwind
 * - Mobile-first: 1 column on mobile, N columns on desktop
 * - Configurable columns and gap
 */
export function GridLayout({ children, columns = 3, gap = 6, className }: GridLayoutProps) {
	const gridCols = {
		1: 'grid-cols-1',
		2: 'grid-cols-1 md:grid-cols-2',
		3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
		4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
	};

	const gridGap = {
		2: 'gap-2',
		4: 'gap-4',
		6: 'gap-6',
		8: 'gap-8',
	};

	return <div className={cn('grid', gridCols[columns], gridGap[gap], className)}>{children}</div>;
}

interface StackLayoutProps {
	children: React.ReactNode;
	direction?: 'vertical' | 'horizontal';
	spacing?: 2 | 4 | 6 | 8;
	align?: 'start' | 'center' | 'end';
	className?: string;
}

/**
 * Stack Layout component
 * - Flexbox-based stacking layout
 * - Supports vertical (default) and horizontal stacking
 * - Configurable spacing and alignment
 */
export function StackLayout({
	children,
	direction = 'vertical',
	spacing = 4,
	align = 'start',
	className,
}: StackLayoutProps) {
	const flexDirection = direction === 'vertical' ? 'flex-col' : 'flex-row';

	const gap = {
		2: 'gap-2',
		4: 'gap-4',
		6: 'gap-6',
		8: 'gap-8',
	};

	const alignItems = {
		start: 'items-start',
		center: 'items-center',
		end: 'items-end',
	};

	return (
		<div className={cn('flex', flexDirection, gap[spacing], alignItems[align], className)}>
			{children}
		</div>
	);
}

interface ContainerProps {
	children: React.ReactNode;
	size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
	className?: string;
}

/**
 * Container component
 * - Centers content with max-width constraints
 * - Responsive padding
 * - Multiple size options
 */
export function Container({ children, size = 'lg', className }: ContainerProps) {
	const maxWidth = {
		sm: 'max-w-screen-sm',
		md: 'max-w-screen-md',
		lg: 'max-w-screen-lg',
		xl: 'max-w-screen-xl',
		full: 'max-w-full',
	};

	return (
		<div className={cn('mx-auto w-full px-4 sm:px-6 lg:px-8', maxWidth[size], className)}>
			{children}
		</div>
	);
}
