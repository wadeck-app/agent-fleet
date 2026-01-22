import { DynamicLucideIcon } from '@framework/components/icons/DynamicLucideIcon';
import { Button } from '@framework/components/primitives/Button';
import { cn } from '@framework/lib/utils';
import type { Project } from '@shared/api/projects.contract';
import { ArrowLeft } from 'lucide-react';

/**
 * ===========================================================================================
 * AVAILABLE PROJECT ITEM COMPONENT
 * ===========================================================================================
 *
 * Non-pinned project item with pin button.
 *
 * Features:
 * - Project icon and name display
 * - Arrow left button (←) to pin the project
 * - Hover effect
 * - Loading state during API calls
 *
 * Usage:
 *   <AvailableProjectItem
 *     project={project}
 *     onPin={handlePin}
 *     isLoading={false}
 *   />
 *
 * ===========================================================================================
 */

export interface AvailableProjectItemProps {
	/** Project to display */
	project: Project;
	/** Callback when pin button is clicked */
	onPin: (projectId: string) => void;
	/** Whether this item is in a loading state */
	isLoading?: boolean;
}

export function AvailableProjectItem({ project, onPin, isLoading = false }: AvailableProjectItemProps) {
	return (
		<div
			className={cn(
				'flex items-center gap-2 rounded-sm px-2 py-1.5 transition-colors',
				'hover:bg-accent',
				isLoading && 'pointer-events-none opacity-50'
			)}
		>
			{/* Pin Button (Arrow Left) - Positioned on the left */}
			<Button
				variant="ghost"
				size="icon-xs"
				onClick={e => {
					e.stopPropagation();
					onPin(project.id);
				}}
				disabled={isLoading}
				className={`
      opacity-70
      hover:opacity-100
    `}
				aria-label={`Pin ${project.name}`}
				title="Pin project"
			>
				<ArrowLeft className="size-5" />
			</Button>

			{/* Project Icon */}
			{project.icon && (
				<DynamicLucideIcon
					name={project.icon}
					color={project.iconColor || '#6366F1'}
					className={`
      h-4 w-4
    `}
				/>
			)}

			{/* Project Name */}
			<span className="flex-1 text-sm">{project.name}</span>
		</div>
	);
}
