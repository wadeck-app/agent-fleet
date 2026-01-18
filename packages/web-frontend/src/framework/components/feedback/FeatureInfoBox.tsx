import * as React from 'react';

import { cn } from '@framework/lib/utils';

export interface FeatureInfoBoxProps {
	title: string;
	children: React.ReactNode;
	className?: string;
}

/**
 * FeatureInfoBox - A styled container for displaying debug or feature information
 *
 * Provides a consistent muted background box for displaying development/debug info.
 * Commonly used to show active feature states, cache info, filter values, etc.
 *
 * @example
 * <FeatureInfoBox title="Active Features">
 *   <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
 *     <div>Search: {searchQuery}</div>
 *     <div>Sort: {sortConfig}</div>
 *   </div>
 * </FeatureInfoBox>
 */
function FeatureInfoBox({ title, children, className }: FeatureInfoBoxProps) {
	return (
		<div
			className={cn(
				// @formatter:off
				`mb-4 rounded-lg border border-border bg-muted/50 p-4 text-sm`,
				// @formatter:on
				className
			)}
		>
			<strong>{title}</strong>
			{children}
		</div>
	);
}

export { FeatureInfoBox };
