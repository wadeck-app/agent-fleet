import type { Project } from '@shared/api/projects.contract';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ManagePinnedProjectsDialog } from './ManagePinnedProjectsDialog';

const mockProjects: Project[] = [
	{
		id: 'project-1',
		name: 'Project Alpha',
		pinned: true,
		order: 0,
		workspaceIds: [],
		taskCount: 5,
		archived: false,
		version: 1,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	},
	{
		id: 'project-2',
		name: 'Project Gamma',
		pinned: false,
		order: 0,
		workspaceIds: [],
		taskCount: 8,
		archived: false,
		version: 1,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	},
];

describe('Debug - ManagePinnedProjectsDialog Rendering', () => {
	it('should render items in DOM', () => {
		render(
			<ManagePinnedProjectsDialog
				open={true}
				onOpenChange={vi.fn()}
				projects={mockProjects}
				pinnedProjects={mockProjects.filter(p => p.pinned)}
				onPin={vi.fn()}
				onUnpin={vi.fn()}
				onReorder={vi.fn()}
			/>
		);

		// Debug: Print entire DOM
		screen.debug(undefined, 50000);

		// Try to find items
		expect(screen.getByText('Pinned Projects')).toBeInTheDocument();
		expect(screen.getByText('Available Projects')).toBeInTheDocument();
	});
});
