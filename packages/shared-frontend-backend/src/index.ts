// Common - Base entity schemas and types
export { EntityMetadataSchema, BaseEntitySchema, IdParamSchema, PaginationSchema } from './common/base-entity';
export type { EntityMetadata, BaseEntity, IdParam, Pagination } from './common/base-entity';

// Common - API helpers
export {
	BaseListQuerySchema,
	DeleteResponseSchema,
	createListResponseSchema,
	createQuerySchema,
} from './common/api-helpers';
export type { DeleteResponse, BaseListQuery, BaseListQueryMutable } from './common/api-helpers';

// Validation - Input sanitization
export {
	sanitizedString,
	sanitizedText,
	optionalSanitizedString,
	isbnSchema,
	positiveNumber,
	optionalPositiveNumber,
	emailSchema,
	urlSchema,
	yearSchema,
} from './validation/sanitization';
export type { SanitizedString, SanitizedText } from './validation/sanitization';

// Exceptions
export {
	HttpException,
	BadRequestException,
	UnauthorizedException,
	ForbiddenException,
	NotFoundException,
	ConflictException,
	UnprocessableEntityException,
	InternalServerErrorException,
	ERROR_CODES,
} from './exceptions/http-exceptions';
export type { ErrorResponse, ErrorCode } from './exceptions/http-exceptions';

// Route builder
export { defineRoutes } from './route-builder';
export type { HttpMethod, RouteContract, PathRoutes, ApiUrl, ApiRoutes } from './route-builder';

// API Contracts - Ingredients
export {
	IngredientSchema,
	CreateIngredientSchema,
	UpdateIngredientSchema,
	PatchIngredientSchema,
	INGREDIENTS_API_ROUTES,
} from './api/ingredients.contract';
export type {
	Ingredient,
	CreateIngredient,
	UpdateIngredient,
	PatchIngredient,
	IngredientListResponse,
	IngredientsListQuery,
} from './api/ingredients.contract';

// API Contracts - Books
export {
	BookSchema,
	CreateBookSchema,
	UpdateBookSchema,
	PatchBookSchema,
	BOOKS_API_ROUTES,
} from './api/books.contract';
export type {
	Book,
	CreateBook,
	UpdateBook,
	PatchBook,
	BookListResponse,
	BooksListQuery,
	IsbnParam,
	IsbnQuery,
	BulkDeleteRequest,
	BulkDeleteResponse,
	FailedDeletion,
} from './api/books.contract';

// API Contracts - Auth
export {
	LoginRequestSchema,
	LoginResponseSchema,
	RefreshTokenResponseSchema,
	LogoutResponseSchema,
	SessionResponseSchema,
	AUTH_API_ROUTES,
} from './api/auth.contract';
export type {
	LoginRequest,
	LoginResponse,
	RefreshTokenResponse,
	LogoutResponse,
	SessionResponse,
	AuthApiRoutes,
} from './api/auth.contract';

// API Contracts - Monitoring
export {
	HealthResponseSchema,
	TransportStatsResponseSchema,
	SessionInfoSchema,
	SessionsResponseSchema,
	SubscriptionBreakdownSchema,
	MONITORING_API_ROUTES,
} from './api/monitoring.contract';
export type {
	HealthResponse,
	TransportStatsResponse,
	SessionInfo,
	SessionsResponse,
	SubscriptionBreakdown,
	MonitoringApiRoutes,
} from './api/monitoring.contract';

// API Contracts - Dashboard
export {
	DashboardDataSchema,
	OrchestratorStatusSchema,
	ActivityTypeSchema,
	ActivityEntrySchema,
	DASHBOARD_API_ROUTES,
} from './api/dashboard.contract';
export type {
	DashboardData,
	OrchestratorStatus,
	ActivityType,
	ActivityEntry,
	DashboardApiRoutes,
} from './api/dashboard.contract';

// API Contracts - Workers
export {
	WorkerSchema,
	WorkersDataSchema,
	WorkerConnectionStatusSchema,
	WorkerStateSchema,
	WORKERS_API_ROUTES,
} from './api/workers.contract';
export type {
	Worker,
	WorkersData,
	WorkerConnectionStatus,
	WorkerState,
	WorkersApiRoutes,
} from './api/workers.contract';

// API Contracts - Tasks
export {
	TaskSchema,
	TasksDataSchema,
	TaskStatusSchema,
	TaskPrioritySchema,
	TasksQuerySchema,
	TASKS_API_ROUTES,
} from './api/tasks.contract';
export type { Task, TasksData, TaskStatus, TaskPriority, TasksQuery, TasksApiRoutes } from './api/tasks.contract';

// API Contracts - Workspaces
export {
	WorkspaceSchema,
	WorkspacesDataSchema,
	WorkspaceModeSchema,
	WorkspaceStatusSchema,
	GitStatusSchema,
	WORKSPACES_API_ROUTES,
} from './api/workspaces.contract';
export type {
	Workspace,
	WorkspacesData,
	WorkspaceMode,
	WorkspaceStatus,
	GitStatus,
	WorkspacesApiRoutes,
} from './api/workspaces.contract';

// Types - Combined routes and type helpers
export { ALL_API_ROUTES, ROUTES_BY_BASE_URL } from './types';
export type { PathsForMethod, RouteParams, RouteQuery, RouteBody, RouteResponse, ApiPath } from './types';

// Utils - Route validation
export { validateRoutes, assertValidRoutes, warnInvalidRoutes } from './utils/validate-routes';
export type { ValidationError, ValidationResult } from './utils/validate-routes';

// Transport - Transport layer types (Phase 1)
export type {
	TransportRequest,
	TransportResponse,
	TransportEvent,
	SubscriptionMessage,
	TransportError,
	CrudEventType,
	ResourceEvent,
	BusinessEvents,
	EventTypes,
	EventType,
	EventData,
	EventFilter,
	ResourceName,
	EventsForResource,
	ITransport,
	TransportConfig,
	RequestOptions,
	ResponseType,
	UnsubscribeFunction,
	ConnectionState,
	ConnectionStateHandler,
	EventHandler,
	TransportType,
} from './transport';
export {
	isValidPath,
	getAvailableMethods,
	B2F_TASK_CREATED,
	B2F_TASK_UPDATED,
	B2F_TASK_DELETED,
	B2F_TASK_STATUS_CHANGED,
	B2F_TASK_ASSIGNED,
	B2F_TASK_PRIORITY_CHANGED,
	B2F_WORKER_CREATED,
	B2F_WORKER_UPDATED,
	B2F_WORKER_DELETED,
	B2F_WORKER_STATUS_CHANGED,
	B2F_WORKER_HEARTBEAT,
	B2F_WORKER_CAPACITY_CHANGED,
	B2F_WORKER_CONNECTED,
	B2F_WORKER_DISCONNECTED,
	B2F_WORKER_STATUS,
	B2F_WORKSPACE_CREATED,
	B2F_WORKSPACE_UPDATED,
	B2F_WORKSPACE_DELETED,
	B2F_WORKSPACE_STATUS_CHANGED,
	B2F_WORKSPACE_QUOTA_EXCEEDED,
	B2F_WORKSPACE_ARCHIVED,
} from './transport';
