import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
	CreateProject,
	Project,
	ProjectBoardData,
	ProjectStatusConfig,
	ProjectsData,
	ProjectsListResponse,
	UpdateProject,
} from '@app/shared/api/projects.contract';
import { DEFAULT_STATUS_CONFIG } from '@app/shared/api/projects.contract';

import type { ProjectsService } from '../services/ProjectsService';
import type { RouteWrapperFunc } from '../utils/fastify-wrapper';
import ProjectsController from './ProjectsController';

/**
 * ===========================================================================================
 * PROJECTS CONTROLLER TESTS
 * ===========================================================================================
 *
 * Test Strategy:
 * - Mock ProjectsService (unit test — no Fastify instance)
 * - Capture route handlers via a mock `add` function
 * - Invoke handlers directly with synthetic request objects
 * - Assert delegation to service and correct response shape
 *
 * ===========================================================================================
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProject(overrides?: Partial<Project>): Project {
	return {
		id: 'proj-1',
		name: 'Test Project',
		workspaceIds: [],
		taskCount: 0,
		archived: false,
		pinned: false,
		order: 0,
		version: 1,
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-01T00:00:00Z',
		...overrides,
	};
}

function makeStatusConfig(overrides?: Partial<ProjectStatusConfig>): ProjectStatusConfig {
	return {
		statuses: [
			{ id: 'todo', label: 'To Do', terminal: false },
			{ id: 'done', label: 'Done', terminal: true },
		],
		transitions: [{ from: 'todo', to: 'done' }],
		...overrides,
	};
}

/**
 * Captures all route handlers registered via configureRoutes into a typed map.
 */
function captureRoutes(
	controller: ProjectsController
): Map<string, (req: Record<string, unknown>) => Promise<unknown>> {
	const handlers = new Map<string, (req: Record<string, unknown>) => Promise<unknown>>();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const mockAdd = vi.fn((method: string, path: string, handler: any) => {
		handlers.set(`${method} ${path}`, handler);
	});

	controller.configureRoutes(mockAdd as unknown as RouteWrapperFunc<typeof ProjectsController.routes>);

	return handlers;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProjectsController', () => {
	let mockService: ProjectsService;
	let controller: ProjectsController;
	let handlers: Map<string, (req: Record<string, unknown>) => Promise<unknown>>;

	beforeEach(() => {
		mockService = {
			getProjectsData: vi.fn(),
			getProjectsList: vi.fn(),
			create: vi.fn(),
			bulkDelete: vi.fn(),
			getById: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
			addWorkspaces: vi.fn(),
			getProjectBoard: vi.fn(),
			getStatusConfig: vi.fn(),
			saveStatusConfig: vi.fn(),
		} as unknown as ProjectsService;

		controller = new ProjectsController(mockService);
		handlers = captureRoutes(controller);
	});

	// -------------------------------------------------------------------------
	// Route registration
	// -------------------------------------------------------------------------

	describe('configureRoutes — registers all expected routes', () => {
		it('registers GET /api/projects/', () => {
			expect(handlers.has('GET /api/projects/')).toBe(true);
		});

		it('registers POST /api/projects/', () => {
			expect(handlers.has('POST /api/projects/')).toBe(true);
		});

		it('registers DELETE /api/projects/', () => {
			expect(handlers.has('DELETE /api/projects/')).toBe(true);
		});

		it('registers GET /api/projects/:id', () => {
			expect(handlers.has('GET /api/projects/:id')).toBe(true);
		});

		it('registers PATCH /api/projects/:id', () => {
			expect(handlers.has('PATCH /api/projects/:id')).toBe(true);
		});

		it('registers DELETE /api/projects/:id', () => {
			expect(handlers.has('DELETE /api/projects/:id')).toBe(true);
		});

		it('registers POST /api/projects/:id/workspaces', () => {
			expect(handlers.has('POST /api/projects/:id/workspaces')).toBe(true);
		});

		it('registers GET /api/projects/:id/board', () => {
			expect(handlers.has('GET /api/projects/:id/board')).toBe(true);
		});

		it('registers GET /api/projects/:projectId/status-config', () => {
			expect(handlers.has('GET /api/projects/:projectId/status-config')).toBe(true);
		});

		it('registers PUT /api/projects/:projectId/status-config', () => {
			expect(handlers.has('PUT /api/projects/:projectId/status-config')).toBe(true);
		});
	});

	// -------------------------------------------------------------------------
	// GET /api/projects/ — without pagination → getProjectsData
	// -------------------------------------------------------------------------

	describe('GET /api/projects/ — list projects', () => {
		it('calls getProjectsData() when no pagination params are provided', async () => {
			const data: ProjectsData = {
				timestamp: '2026-01-01T00:00:00Z',
				summary: { total: 1, active: 1, archived: 0 },
				projects: [makeProject() as any],
			};
			vi.mocked(mockService.getProjectsData).mockResolvedValue(data);

			const handler = handlers.get('GET /api/projects/')!;
			const result = await handler({ query: {} });

			expect(mockService.getProjectsData).toHaveBeenCalledTimes(1);
			expect(mockService.getProjectsList).not.toHaveBeenCalled();
			expect(result).toEqual(data);
		});

		it('calls getProjectsList() when pagination params are present', async () => {
			const listResponse: ProjectsListResponse = {
				items: [makeProject() as any],
				pagination: { total: 1, page: 1, pageSize: 10, totalPages: 1 },
			};
			vi.mocked(mockService.getProjectsList).mockResolvedValue(listResponse);

			const handler = handlers.get('GET /api/projects/')!;
			const result = await handler({ query: { page: 1, pageSize: 10 } });

			expect(mockService.getProjectsList).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
			expect(mockService.getProjectsData).not.toHaveBeenCalled();
			expect(result).toEqual(listResponse);
		});

		it('calls getProjectsList() when sortBy param is present', async () => {
			const listResponse: ProjectsListResponse = { items: [], pagination: undefined };
			vi.mocked(mockService.getProjectsList).mockResolvedValue(listResponse);

			const handler = handlers.get('GET /api/projects/')!;
			await handler({ query: { sortBy: 'name' } });

			expect(mockService.getProjectsList).toHaveBeenCalledWith({ sortBy: 'name' });
		});
	});

	// -------------------------------------------------------------------------
	// POST /api/projects/ — create
	// -------------------------------------------------------------------------

	describe('POST /api/projects/ — create project', () => {
		it('delegates body to service.create and returns the new project', async () => {
			const createData: CreateProject = { name: 'New Project', archived: false };
			const created = makeProject({ name: 'New Project' });
			vi.mocked(mockService.create).mockResolvedValue(created);

			const handler = handlers.get('POST /api/projects/')!;
			const result = await handler({ body: createData });

			expect(mockService.create).toHaveBeenCalledWith(createData);
			expect(result).toEqual(created);
		});
	});

	// -------------------------------------------------------------------------
	// DELETE /api/projects/ — bulk delete
	// -------------------------------------------------------------------------

	describe('DELETE /api/projects/ — bulk delete', () => {
		it('passes ids array to service.bulkDelete', async () => {
			const bulkDeleteResponse = {
				success: true,
				totalRequested: 2,
				totalDeleted: 2,
				totalFailed: 0,
				deleted: ['proj-1', 'proj-2'],
				failed: [],
			};
			vi.mocked(mockService.bulkDelete).mockResolvedValue(bulkDeleteResponse);

			const handler = handlers.get('DELETE /api/projects/')!;
			const result = await handler({ body: { ids: ['proj-1', 'proj-2'] } });

			expect(mockService.bulkDelete).toHaveBeenCalledWith(['proj-1', 'proj-2']);
			expect(result).toEqual(bulkDeleteResponse);
		});
	});

	// -------------------------------------------------------------------------
	// GET /api/projects/:id — get one
	// -------------------------------------------------------------------------

	describe('GET /api/projects/:id — get project by ID', () => {
		it('returns the project when found', async () => {
			const project = makeProject();
			vi.mocked(mockService.getById).mockResolvedValue(project);

			const handler = handlers.get('GET /api/projects/:id')!;
			const result = await handler({ params: { id: 'proj-1' } });

			expect(mockService.getById).toHaveBeenCalledWith('proj-1');
			expect(result).toEqual(project);
		});

		it('propagates NotFoundException from service when project not found', async () => {
			vi.mocked(mockService.getById).mockRejectedValue(new Error('Project with id missing not found'));

			const handler = handlers.get('GET /api/projects/:id')!;

			await expect(handler({ params: { id: 'missing' } })).rejects.toThrow('Project with id missing not found');
		});
	});

	// -------------------------------------------------------------------------
	// PATCH /api/projects/:id — update
	// -------------------------------------------------------------------------

	describe('PATCH /api/projects/:id — update project', () => {
		it('passes id and body to service.update and returns updated project', async () => {
			const updateData: UpdateProject = { name: 'Updated', version: 1 };
			const updated = makeProject({ name: 'Updated', version: 2 });
			vi.mocked(mockService.update).mockResolvedValue(updated);

			const handler = handlers.get('PATCH /api/projects/:id')!;
			const result = await handler({ params: { id: 'proj-1' }, body: updateData });

			expect(mockService.update).toHaveBeenCalledWith('proj-1', updateData);
			expect(result).toEqual(updated);
		});
	});

	// -------------------------------------------------------------------------
	// DELETE /api/projects/:id — single delete
	// -------------------------------------------------------------------------

	describe('DELETE /api/projects/:id — delete project', () => {
		it('calls service.delete and returns { success: true }', async () => {
			vi.mocked(mockService.delete).mockResolvedValue(undefined);

			const handler = handlers.get('DELETE /api/projects/:id')!;
			const result = await handler({ params: { id: 'proj-1' } });

			expect(mockService.delete).toHaveBeenCalledWith('proj-1');
			expect(result).toEqual({ success: true });
		});
	});

	// -------------------------------------------------------------------------
	// POST /api/projects/:id/workspaces
	// -------------------------------------------------------------------------

	describe('POST /api/projects/:id/workspaces — add workspaces', () => {
		it('delegates to service.addWorkspaces and returns updated project', async () => {
			const body = { workspaceIds: ['ws-1', 'ws-2'] };
			const updated = makeProject({ workspaceIds: ['ws-1', 'ws-2'] });
			vi.mocked(mockService.addWorkspaces).mockResolvedValue(updated);

			const handler = handlers.get('POST /api/projects/:id/workspaces')!;
			const result = await handler({ params: { id: 'proj-1' }, body });

			expect(mockService.addWorkspaces).toHaveBeenCalledWith('proj-1', body);
			expect(result).toEqual(updated);
		});
	});

	// -------------------------------------------------------------------------
	// GET /api/projects/:id/board
	// -------------------------------------------------------------------------

	describe('GET /api/projects/:id/board — project board', () => {
		it('returns board data from service.getProjectBoard', async () => {
			const boardData: ProjectBoardData = {
				projectId: 'proj-1',
				projectName: 'Test Project',
				tasksByStatus: { todo: [], in_progress: [] },
				timestamp: '2026-01-01T00:00:00Z',
			};
			vi.mocked(mockService.getProjectBoard).mockResolvedValue(boardData);

			const handler = handlers.get('GET /api/projects/:id/board')!;
			const result = await handler({ params: { id: 'proj-1' } });

			expect(mockService.getProjectBoard).toHaveBeenCalledWith('proj-1');
			expect(result).toEqual(boardData);
		});
	});

	// -------------------------------------------------------------------------
	// GET /api/projects/:projectId/status-config
	// -------------------------------------------------------------------------

	describe('GET /api/projects/:projectId/status-config — get status config', () => {
		it('returns DEFAULT_STATUS_CONFIG when no config has been set', async () => {
			vi.mocked(mockService.getStatusConfig).mockResolvedValue(DEFAULT_STATUS_CONFIG);

			const handler = handlers.get('GET /api/projects/:projectId/status-config')!;
			const result = await handler({ params: { projectId: 'proj-1' } });

			expect(mockService.getStatusConfig).toHaveBeenCalledWith('proj-1');
			expect(result).toEqual(DEFAULT_STATUS_CONFIG);
		});

		it('returns the saved config when one exists', async () => {
			const customConfig = makeStatusConfig();
			vi.mocked(mockService.getStatusConfig).mockResolvedValue(customConfig);

			const handler = handlers.get('GET /api/projects/:projectId/status-config')!;
			const result = await handler({ params: { projectId: 'proj-1' } });

			expect(result).toEqual(customConfig);
		});
	});

	// -------------------------------------------------------------------------
	// PUT /api/projects/:projectId/status-config
	// -------------------------------------------------------------------------

	describe('PUT /api/projects/:projectId/status-config — save status config', () => {
		it('saves config and returns it', async () => {
			const config = makeStatusConfig();
			vi.mocked(mockService.saveStatusConfig).mockResolvedValue(config);

			const handler = handlers.get('PUT /api/projects/:projectId/status-config')!;
			const result = await handler({ params: { projectId: 'proj-1' }, body: config });

			expect(mockService.saveStatusConfig).toHaveBeenCalledWith('proj-1', config);
			expect(result).toEqual(config);
		});

		it('can round-trip: PUT then GET returns the saved config', async () => {
			const config = makeStatusConfig();
			vi.mocked(mockService.saveStatusConfig).mockResolvedValue(config);
			vi.mocked(mockService.getStatusConfig).mockResolvedValue(config);

			const putHandler = handlers.get('PUT /api/projects/:projectId/status-config')!;
			await putHandler({ params: { projectId: 'proj-1' }, body: config });

			const getHandler = handlers.get('GET /api/projects/:projectId/status-config')!;
			const result = await getHandler({ params: { projectId: 'proj-1' } });

			expect(result).toEqual(config);
		});

		it('propagates validation error when transition references unknown status id', async () => {
			const invalidConfig: ProjectStatusConfig = {
				statuses: [{ id: 'todo', label: 'To Do', terminal: false }],
				// "done" is not in statuses[]
				transitions: [{ from: 'todo', to: 'done' }],
			};
			vi.mocked(mockService.saveStatusConfig).mockRejectedValue(
				new Error('Invalid transition: "to" value "done" does not reference a known status id')
			);

			const handler = handlers.get('PUT /api/projects/:projectId/status-config')!;

			await expect(handler({ params: { projectId: 'proj-1' }, body: invalidConfig })).rejects.toThrow(
				/does not reference a known status id/
			);
		});
	});

	// -------------------------------------------------------------------------
	// Static routes property
	// -------------------------------------------------------------------------

	describe('static routes property', () => {
		it('exposes the PROJECTS_API_ROUTES definition', () => {
			expect(ProjectsController.routes).toBeDefined();
			expect(ProjectsController.routes['/api/projects/']).toBeDefined();
			expect(ProjectsController.routes['/api/projects/:id']).toBeDefined();
			expect(ProjectsController.routes['/api/projects/:projectId/status-config']).toBeDefined();
		});
	});
});
