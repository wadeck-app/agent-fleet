import React from 'react';

/**
 * ===========================================================================================
 * FLOW EDITOR LAYOUT - Domain Component
 * ===========================================================================================
 *
 * Layout component for the flow editor page.
 * Extracts structural layout from FlowEditorPage to reduce CSS in page-level components.
 *
 * **Responsibilities:**
 * - Structural layout for toolbar, canvas, properties panel, and right panel
 * - Loading overlay rendering
 * - Minimal CSS (structural only)
 *
 * **Grade: A+ (Target)**
 * - 8-10 structural CSS classes only
 * - Zero business logic
 * - Pure presentation/composition
 *
 * ===========================================================================================
 */

export interface FlowEditorLayoutProps {
	toolbar: React.ReactNode;
	canvas: React.ReactNode;
	propertiesPanel?: React.ReactNode;
	rightPanel: React.ReactNode;
	loading?: boolean;
}

export function FlowEditorLayout({ toolbar, canvas, propertiesPanel, rightPanel, loading }: FlowEditorLayoutProps) {
	return (
		<div className="flex h-[calc(100vh-12rem)] flex-col rounded-lg border bg-card">
			{/* Toolbar */}
			{toolbar}

			{/* Main Content Area */}
			<div className="flex min-h-0 flex-1 overflow-hidden">
				{/* Canvas */}
				<div className="relative flex min-h-0 flex-1 flex-col">
					{canvas}
					{loading && (
						<div
							className={`
         absolute inset-0 z-50 flex items-center justify-center bg-background/80
         backdrop-blur-sm
       `}
						>
							<div className="text-muted-foreground">Loading flow...</div>
						</div>
					)}
				</div>

				{/* Properties Panel - Conditionally rendered */}
				{propertiesPanel}

				{/* Right Panel (YAML + Validation) */}
				<div className="relative">
					{rightPanel}
					{loading && (
						<div
							className={`
         absolute inset-0 z-50 flex items-center justify-center bg-background/80
         backdrop-blur-sm
       `}
						>
							<div className="text-muted-foreground">Loading...</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
