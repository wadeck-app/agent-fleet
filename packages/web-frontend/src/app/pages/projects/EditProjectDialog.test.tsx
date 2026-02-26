import type { Project } from '@shared/api/projects.contract';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EditProjectDialog } from './EditProjectDialog';

// Mock dependencies
vi.mock('@framework/features/toast/ToastContext', () => ({
	useToast: () => ({
		showToast: vi.fn(),
	}),
}));

vi.mock('./projects.api', () => ({
	projectsApi: {
		updateProject: vi.fn().mockResolvedValue({ id: 'project-1', version: 2 }),
	},
}));

describe('EditProjectDialog', () => {
	const mockProject: Project = {
		id: 'project-1',
		name: 'Test Project',
		description: 'Test Description',
		icon: 'FolderKanban',
		iconColor: '#6366F1',
		gitRepositoryUrl: 'https://github.com/user/repo.git',
		gitDefaultBranch: 'main',
		workspaceIds: [],
		taskCount: 0,
		archived: false,
		pinned: false,
		order: 0,
		version: 1,
		createdAt: '2024-01-01T00:00:00Z',
		updatedAt: '2024-01-01T00:00:00Z',
	};

	const defaultProps = {
		project: mockProject,
		open: true,
		onOpenChange: vi.fn(),
		onSuccess: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('rendering', () => {
		it('should render with all fields pre-populated including git fields', () => {
			render(<EditProjectDialog {...defaultProps} />);

			// Check title and description
			expect(screen.getByText('Edit Project')).toBeInTheDocument();
			expect(screen.getByText('Update project details')).toBeInTheDocument();

			// Check all fields are present and pre-populated
			expect(screen.getByLabelText(/Name/i)).toHaveValue('Test Project');
			expect(screen.getByLabelText(/Description/i)).toHaveValue('Test Description');
			expect(screen.getByLabelText(/Git Repository URL/i)).toHaveValue('https://github.com/user/repo.git');
			expect(screen.getByLabelText(/Default Branch/i)).toHaveValue('main');
		});

		it('should render with empty git fields when project has no git data', () => {
			const projectWithoutGit = {
				...mockProject,
				gitRepositoryUrl: undefined,
				gitDefaultBranch: undefined,
			};

			render(<EditProjectDialog {...defaultProps} project={projectWithoutGit} />);

			expect(screen.getByLabelText(/Git Repository URL/i)).toHaveValue('');
			expect(screen.getByLabelText(/Default Branch/i)).toHaveValue('');
		});

		it('should render action buttons', () => {
			render(<EditProjectDialog {...defaultProps} />);

			expect(screen.getByRole('button', { name: /Save Changes/i })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
		});

		it('should not render when open is false', () => {
			render(<EditProjectDialog {...defaultProps} open={false} />);

			expect(screen.queryByText('Edit Project')).not.toBeInTheDocument();
		});

		it('should render icon preview with current values', () => {
			render(<EditProjectDialog {...defaultProps} />);

			expect(screen.getByText('Preview:')).toBeInTheDocument();
		});

		it('should not render when project is null', () => {
			render(<EditProjectDialog {...defaultProps} project={null} />);

			// Dialog content should not be visible
			expect(screen.queryByLabelText(/Name/i)).not.toBeInTheDocument();
		});
	});

	describe('validation', () => {
		it('should show validation error when name is cleared', async () => {
			const user = userEvent.setup();
			const onSuccess = vi.fn();

			render(<EditProjectDialog {...defaultProps} onSuccess={onSuccess} />);

			// Clear the name field
			const nameInput = screen.getByLabelText(/Name/i);
			await user.clear(nameInput);

			// Try to submit
			const submitButton = screen.getByRole('button', { name: /Save Changes/i });
			await user.click(submitButton);

			// Should show validation error
			await waitFor(() => {
				expect(screen.getByText('Name is required')).toBeInTheDocument();
			});

			expect(onSuccess).not.toHaveBeenCalled();
		});

		it('should validate repository URL format when updated', async () => {
			const user = userEvent.setup();
			const onSuccess = vi.fn();

			render(<EditProjectDialog {...defaultProps} onSuccess={onSuccess} />);

			// Update to invalid URL
			const repoUrlInput = screen.getByLabelText(/Git Repository URL/i);
			await user.clear(repoUrlInput);
			await user.type(repoUrlInput, 'not-a-valid-url');

			// Try to submit
			const submitButton = screen.getByRole('button', { name: /Save Changes/i });
			await user.click(submitButton);

			// Should show validation error
			await waitFor(() => {
				expect(screen.getByText('Must be a valid URL')).toBeInTheDocument();
			});

			expect(onSuccess).not.toHaveBeenCalled();
		});

		it('should accept valid repository URL update', async () => {
			const user = userEvent.setup();
			const { projectsApi } = await import('./projects.api');

			render(<EditProjectDialog {...defaultProps} />);

			// Update to new valid URL
			const repoUrlInput = screen.getByLabelText(/Git Repository URL/i);
			await user.clear(repoUrlInput);
			await user.type(repoUrlInput, 'https://github.com/new-user/new-repo.git');

			// Submit form
			const submitButton = screen.getByRole('button', { name: /Save Changes/i });
			await user.click(submitButton);

			// Should submit successfully
			await waitFor(() => {
				expect(projectsApi.updateProject).toHaveBeenCalled();
			});
		});

		it('should validate name length', async () => {
			const user = userEvent.setup();
			const onSuccess = vi.fn();

			render(<EditProjectDialog {...defaultProps} onSuccess={onSuccess} />);

			// Update name to be too long (>100 characters)
			const nameInput = screen.getByLabelText(/Name/i);
			fireEvent.change(nameInput, { target: { value: 'a'.repeat(101) } });

			// Try to submit
			const submitButton = screen.getByRole('button', { name: /Save Changes/i });
			await user.click(submitButton);

			// Should show validation error
			await waitFor(() => {
				expect(screen.getByText('Name must be less than 100 characters')).toBeInTheDocument();
			});

			expect(onSuccess).not.toHaveBeenCalled();
		});

		it('should validate description length', async () => {
			const user = userEvent.setup();
			const onSuccess = vi.fn();

			render(<EditProjectDialog {...defaultProps} onSuccess={onSuccess} />);

			// Update description to be too long (>500 characters)
			const descriptionInput = screen.getByLabelText(/Description/i);
			await user.clear(descriptionInput);
			await user.paste('a'.repeat(501));

			// Try to submit
			const submitButton = screen.getByRole('button', { name: /Save Changes/i });
			await user.click(submitButton);

			// Should show validation error
			await waitFor(() => {
				expect(screen.getByText('Description must be less than 500 characters')).toBeInTheDocument();
			});

			expect(onSuccess).not.toHaveBeenCalled();
		});
	});

	describe('git fields updates', () => {
		it('should include updated git fields in PATCH request', async () => {
			const user = userEvent.setup();
			const { projectsApi } = await import('./projects.api');

			render(<EditProjectDialog {...defaultProps} />);

			// Update git fields
			const repoUrlInput = screen.getByLabelText(/Git Repository URL/i);
			fireEvent.change(repoUrlInput, { target: { value: 'https://github.com/updated/repo.git' } });

			const branchInput = screen.getByLabelText(/Default Branch/i);
			await user.clear(branchInput);
			await user.type(branchInput, 'develop');

			// Submit form
			const submitButton = screen.getByRole('button', { name: /Save Changes/i });
			await user.click(submitButton);

			// Should call API with updated git fields
			await waitFor(() => {
				expect(projectsApi.updateProject).toHaveBeenCalledWith(
					'project-1',
					expect.objectContaining({
						gitRepositoryUrl: 'https://github.com/updated/repo.git',
						gitDefaultBranch: 'develop',
						version: 1,
					})
				);
			});
		});

		it('should allow clearing git repository URL', async () => {
			const user = userEvent.setup();
			const { projectsApi } = await import('./projects.api');

			render(<EditProjectDialog {...defaultProps} />);

			// Clear git repository URL
			const repoUrlInput = screen.getByLabelText(/Git Repository URL/i);
			await user.clear(repoUrlInput);

			// Submit form
			const submitButton = screen.getByRole('button', { name: /Save Changes/i });
			await user.click(submitButton);

			// Should call API with undefined git repository URL
			await waitFor(() => {
				expect(projectsApi.updateProject).toHaveBeenCalledWith(
					'project-1',
					expect.objectContaining({
						gitRepositoryUrl: undefined,
					})
				);
			});
		});

		it('should allow clearing default branch', async () => {
			const user = userEvent.setup();
			const { projectsApi } = await import('./projects.api');

			render(<EditProjectDialog {...defaultProps} />);

			// Clear default branch
			const branchInput = screen.getByLabelText(/Default Branch/i);
			await user.clear(branchInput);

			// Submit form
			const submitButton = screen.getByRole('button', { name: /Save Changes/i });
			await user.click(submitButton);

			// Should call API with undefined branch
			await waitFor(() => {
				expect(projectsApi.updateProject).toHaveBeenCalledWith(
					'project-1',
					expect.objectContaining({
						gitDefaultBranch: undefined,
					})
				);
			});
		});

		it('should allow clearing both git fields', async () => {
			const user = userEvent.setup();
			const { projectsApi } = await import('./projects.api');

			render(<EditProjectDialog {...defaultProps} />);

			// Clear both git fields
			const repoUrlInput = screen.getByLabelText(/Git Repository URL/i);
			await user.clear(repoUrlInput);

			const branchInput = screen.getByLabelText(/Default Branch/i);
			await user.clear(branchInput);

			// Submit form
			const submitButton = screen.getByRole('button', { name: /Save Changes/i });
			await user.click(submitButton);

			// Should call API with both fields undefined
			await waitFor(() => {
				expect(projectsApi.updateProject).toHaveBeenCalledWith(
					'project-1',
					expect.objectContaining({
						gitRepositoryUrl: undefined,
						gitDefaultBranch: undefined,
					})
				);
			});
		});

		it('should trim whitespace from git fields', async () => {
			const user = userEvent.setup();
			const { projectsApi } = await import('./projects.api');

			render(<EditProjectDialog {...defaultProps} />);

			// Update git fields with whitespace
			const repoUrlInput = screen.getByLabelText(/Git Repository URL/i);
			await user.clear(repoUrlInput);
			await user.type(repoUrlInput, '  https://github.com/updated/repo.git  ');

			const branchInput = screen.getByLabelText(/Default Branch/i);
			await user.clear(branchInput);
			await user.type(branchInput, '  feature/new  ');

			// Submit form
			const submitButton = screen.getByRole('button', { name: /Save Changes/i });
			await user.click(submitButton);

			// Should call API with trimmed values
			await waitFor(() => {
				expect(projectsApi.updateProject).toHaveBeenCalledWith(
					'project-1',
					expect.objectContaining({
						gitRepositoryUrl: 'https://github.com/updated/repo.git',
						gitDefaultBranch: 'feature/new',
					})
				);
			});
		});

		it('should populate git fields with existing values', () => {
			render(<EditProjectDialog {...defaultProps} />);

			// Git fields should be pre-filled
			expect(screen.getByLabelText(/Git Repository URL/i)).toHaveValue('https://github.com/user/repo.git');
			expect(screen.getByLabelText(/Default Branch/i)).toHaveValue('main');
		});

		it('should handle project with null git repository URL', () => {
			const projectWithNullGit = {
				...mockProject,
				gitRepositoryUrl: null as any,
				gitDefaultBranch: null as any,
			};

			render(<EditProjectDialog {...defaultProps} project={projectWithNullGit} />);

			expect(screen.getByLabelText(/Git Repository URL/i)).toHaveValue('');
			expect(screen.getByLabelText(/Default Branch/i)).toHaveValue('');
		});
	});

	describe('form submission', () => {
		it('should submit with updated fields', async () => {
			const user = userEvent.setup();
			const { projectsApi } = await import('./projects.api');
			const onSuccess = vi.fn();

			render(<EditProjectDialog {...defaultProps} onSuccess={onSuccess} />);

			// Update some fields
			const nameInput = screen.getByLabelText(/Name/i);
			await user.clear(nameInput);
			await user.type(nameInput, 'Updated Project');

			const descriptionInput = screen.getByLabelText(/Description/i);
			await user.clear(descriptionInput);
			await user.type(descriptionInput, 'Updated Description');

			// Submit form
			const submitButton = screen.getByRole('button', { name: /Save Changes/i });
			await user.click(submitButton);

			// Should call API with updated data
			await waitFor(() => {
				expect(projectsApi.updateProject).toHaveBeenCalledWith(
					'project-1',
					expect.objectContaining({
						name: 'Updated Project',
						description: 'Updated Description',
						version: 1,
					})
				);
			});

			// Should call onSuccess and close dialog
			expect(onSuccess).toHaveBeenCalledTimes(1);
		});

		it('should include version in update request', async () => {
			const user = userEvent.setup();
			const { projectsApi } = await import('./projects.api');

			render(<EditProjectDialog {...defaultProps} />);

			// Submit without changes (just to verify version is included)
			const submitButton = screen.getByRole('button', { name: /Save Changes/i });
			await user.click(submitButton);

			// Should include version from original project
			await waitFor(() => {
				expect(projectsApi.updateProject).toHaveBeenCalledWith(
					'project-1',
					expect.objectContaining({
						version: 1,
					})
				);
			});
		});

		it('should show loading state during submission', async () => {
			const user = userEvent.setup();
			const { projectsApi } = await import('./projects.api');

			// Make API call take some time
			(projectsApi.updateProject as any).mockImplementation(
				() => new Promise(resolve => setTimeout(() => resolve({ id: 'project-1', version: 2 }), 100))
			);

			render(<EditProjectDialog {...defaultProps} />);

			// Submit form
			const submitButton = screen.getByRole('button', { name: /Save Changes/i });
			await user.click(submitButton);

			// Button should be disabled during submission
			await waitFor(() => {
				expect(submitButton).toBeDisabled();
			});
		});
	});

	describe('dialog controls', () => {
		it('should call onOpenChange when cancel button is clicked', async () => {
			const user = userEvent.setup();
			const onOpenChange = vi.fn();

			render(<EditProjectDialog {...defaultProps} onOpenChange={onOpenChange} />);

			const cancelButton = screen.getByRole('button', { name: /Cancel/i });
			await user.click(cancelButton);

			expect(onOpenChange).toHaveBeenCalledWith(false);
		});

		it('should close dialog on successful submission', async () => {
			const user = userEvent.setup();
			const onOpenChange = vi.fn();
			const onSuccess = vi.fn();

			render(<EditProjectDialog {...defaultProps} onOpenChange={onOpenChange} onSuccess={onSuccess} />);

			// Submit form
			const submitButton = screen.getByRole('button', { name: /Save Changes/i });
			await user.click(submitButton);

			// Should close dialog
			await waitFor(() => {
				expect(onOpenChange).toHaveBeenCalledWith(false);
				expect(onSuccess).toHaveBeenCalledTimes(1);
			});
		});

		it('should not close dialog on submission error', async () => {
			const user = userEvent.setup();
			const { projectsApi } = await import('./projects.api');
			const onOpenChange = vi.fn();

			// Mock API to throw an error
			(projectsApi.updateProject as any).mockRejectedValueOnce(new Error('Failed'));

			render(<EditProjectDialog {...defaultProps} onOpenChange={onOpenChange} />);

			// Submit form
			const submitButton = screen.getByRole('button', { name: /Save Changes/i });
			await user.click(submitButton);

			// Wait for error handling
			await waitFor(() => {
				expect(projectsApi.updateProject).toHaveBeenCalled();
			});

			// Dialog should remain open
			expect(onOpenChange).not.toHaveBeenCalledWith(false);
		});
	});

	describe('initial data', () => {
		it('should load all project fields correctly', () => {
			render(<EditProjectDialog {...defaultProps} />);

			expect(screen.getByLabelText(/Name/i)).toHaveValue('Test Project');
			expect(screen.getByLabelText(/Description/i)).toHaveValue('Test Description');
			expect(screen.getByLabelText(/Git Repository URL/i)).toHaveValue('https://github.com/user/repo.git');
			expect(screen.getByLabelText(/Default Branch/i)).toHaveValue('main');
		});

		it('should handle project with minimal data', () => {
			const minimalProject: Project = {
				id: 'project-2',
				name: 'Minimal Project',
				description: undefined,
				icon: undefined,
				iconColor: undefined,
				gitRepositoryUrl: undefined,
				gitDefaultBranch: undefined,
				workspaceIds: [],
				taskCount: 0,
				archived: false,
				pinned: false,
				order: 0,
				version: 1,
				createdAt: '2024-01-01T00:00:00Z',
				updatedAt: '2024-01-01T00:00:00Z',
			};

			render(<EditProjectDialog {...defaultProps} project={minimalProject} />);

			expect(screen.getByLabelText(/Name/i)).toHaveValue('Minimal Project');
			expect(screen.getByLabelText(/Description/i)).toHaveValue('');
			expect(screen.getByLabelText(/Git Repository URL/i)).toHaveValue('');
			expect(screen.getByLabelText(/Default Branch/i)).toHaveValue('');
		});

		it('should handle different version numbers', () => {
			const projectV5 = { ...mockProject, version: 5 };

			render(<EditProjectDialog {...defaultProps} project={projectV5} />);

			// Should render with the higher version
			expect(screen.getByLabelText(/Name/i)).toHaveValue('Test Project');
		});
	});

	describe('layout and scrolling', () => {
		it('should render form with correct structure for scrolling', () => {
			render(<EditProjectDialog {...defaultProps} />);

			// Find the form element
			const form = document.querySelector('form');
			expect(form).toBeInTheDocument();

			// Verify the form has the grid layout classes
			expect(form).toHaveClass('grid', 'gap-4', 'md:grid-cols-2');

			// Verify DialogBody exists with proper scrolling classes
			const dialogBody = document.querySelector('[data-slot="dialog-body"]');
			expect(dialogBody).toBeInTheDocument();
			expect(dialogBody).toHaveClass('flex-1', 'overflow-y-auto');
		});
	});

	describe('edge cases', () => {
		it('should handle rapid open/close cycles', () => {
			const { rerender } = render(<EditProjectDialog {...defaultProps} open={true} />);

			expect(screen.getByText('Edit Project')).toBeInTheDocument();

			rerender(<EditProjectDialog {...defaultProps} open={false} />);
			expect(screen.queryByText('Edit Project')).not.toBeInTheDocument();

			rerender(<EditProjectDialog {...defaultProps} open={true} />);
			expect(screen.getByText('Edit Project')).toBeInTheDocument();
		});

		it('should handle project updates between renders', () => {
			const { rerender } = render(<EditProjectDialog {...defaultProps} />);

			expect(screen.getByLabelText(/Name/i)).toHaveValue('Test Project');

			const updatedProject = { ...mockProject, name: 'Updated Name', version: 2 };
			rerender(<EditProjectDialog {...defaultProps} project={updatedProject} />);

			expect(screen.getByLabelText(/Name/i)).toHaveValue('Updated Name');
		});

		it('should not submit when project is null', async () => {
			const user = userEvent.setup();
			const { projectsApi } = await import('./projects.api');

			render(<EditProjectDialog {...defaultProps} project={null} />);

			// Try to find submit button (should not exist)
			const submitButton = screen.queryByRole('button', { name: /Save Changes/i });
			expect(submitButton).not.toBeInTheDocument();

			// API should not be called
			expect(projectsApi.updateProject).not.toHaveBeenCalled();
		});
	});
});
