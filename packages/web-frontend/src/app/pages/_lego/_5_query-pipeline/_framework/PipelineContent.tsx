import type { ReactNode } from 'react';

interface PipelineContentProps {
	children: ReactNode;
}

/**
 * Content wrapper for query-pipeline pages.
 * Provides consistent layout structure with flex column and gap.
 */
export function PipelineContent({ children }: PipelineContentProps) {
	return <div className="flex h-full flex-col gap-4">{children}</div>;
}
