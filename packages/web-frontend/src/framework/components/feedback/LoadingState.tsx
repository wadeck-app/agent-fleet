import React from 'react';

import { LoadingDots, LoadingDotsSize } from '@framework/components/loading/LoadingDots';

/**
 * ===========================================================================================
 * LOADING STATE - Generic UI Component
 * ===========================================================================================
 *
 * Pure presentation component for showing loading states with an optional message.
 * - Zero business logic
 * - Uses LoadingDots component
 * - Customizable size and message
 *
 * ===========================================================================================
 */

export interface LoadingStateProps {
	message?: string;
	size?: LoadingDotsSize;
	className?: string;
}

export function LoadingState({ message = 'Loading...', size = 'large', className = '' }: LoadingStateProps) {
	return (
		<div
			className={`
    flex flex-col items-center justify-center py-12
    ${className}
  `}
		>
			<LoadingDots size={size} />
			{message && <p className="mt-4 text-sm text-muted-foreground">{message}</p>}
		</div>
	);
}
