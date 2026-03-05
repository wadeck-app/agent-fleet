import type { ReactNode } from 'react';

/**
 * ===========================================================================================
 * PIPELINE TOOLBAR
 * ===========================================================================================
 *
 * Simple toolbar wrapper for pipeline table controls.
 * Typically contains PipelineSearch, PipelineActions, etc.
 *
 * ===========================================================================================
 */

export interface PipelineToolbarProps {
	children: ReactNode;
}

export function PipelineToolbar({ children }: PipelineToolbarProps) {
	return <div className="flex items-center gap-2">{children}</div>;
}
