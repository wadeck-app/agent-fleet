import * as React from 'react';

import { cn } from '@framework/lib/utils';
import { type VariantProps, cva } from 'class-variance-authority';

const pageContainerVariants = cva(
	// @formatter:off
	`mx-auto`,
	// @formatter:on
	{
		variants: {
			maxWidth: {
				sm: 'max-w-2xl',
				md: 'max-w-3xl',
				lg: 'max-w-4xl',
				xl: 'max-w-5xl',
				'2xl': 'max-w-6xl',
				'3xl': 'max-w-7xl',
				full: 'max-w-full',
			},
			spacing: {
				none: '',
				xs: 'space-y-2',
				sm: 'space-y-4',
				md: 'space-y-6',
				lg: 'space-y-8',
				xl: 'space-y-10',
			},
		},
		defaultVariants: {
			maxWidth: 'lg',
			spacing: 'md',
		},
	}
);

export type PageContainerProps = React.ComponentProps<'div'> &
	VariantProps<typeof pageContainerVariants> & {
		children: React.ReactNode;
	};

/**
 * PageContainer - A centered container with max-width and vertical spacing
 *
 * Provides consistent page-level content containers with responsive max-widths
 * and vertical spacing between child elements.
 *
 * @example
 * <PageContainer maxWidth="lg" spacing="md">
 *   <Card>...</Card>
 *   <Card>...</Card>
 * </PageContainer>
 *
 * @example
 * // Narrow content with tight spacing
 * <PageContainer maxWidth="sm" spacing="sm">
 *   <Form>...</Form>
 * </PageContainer>
 *
 * @example
 * // Wide content without automatic spacing
 * <PageContainer maxWidth="2xl" spacing="none">
 *   <CustomLayout>...</CustomLayout>
 * </PageContainer>
 */
function PageContainer({ className, maxWidth = 'lg', spacing = 'md', children, ...props }: PageContainerProps) {
	return (
		<div className={cn(pageContainerVariants({ maxWidth, spacing }), className)} {...props}>
			{children}
		</div>
	);
}

export { PageContainer, pageContainerVariants };
