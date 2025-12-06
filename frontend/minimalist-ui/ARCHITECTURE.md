# Architecture Overview

## Design Philosophy

This frontend follows **strict architectural principles** designed for React applications that emphasize:

1. **Separation of Concerns** - Clear boundaries between UI, business logic, and data access
2. **Component Hierarchy** - Generic → Feature → Page progression
3. **Testability** - Pure functions and isolated components
4. **Maintainability** - Consistent patterns and clear dependencies
5. **Scalability** - Easy to extend without touching existing code

## Component Architecture

### 1. Generic UI Components (`src/components/ui/`)

**Purpose**: Pure presentation components with zero business logic

**Characteristics**:
- Based on Radix UI primitives (when applicable)
- Only accept props for data and callbacks
- No API calls or business logic
- Fully reusable across features
- Have their own SCSS modules

**Examples**:
```typescript
// Button - Pure UI component
<Button variant="primary" size="lg" onClick={handleClick}>
  Click Me
</Button>

// Badge - Pure UI component
<Badge variant="success" dot>Active</Badge>

// Card - Pure UI component
<Card elevated interactive onClick={handleClick}>
  {children}
</Card>
```

### 2. Feature Components (`src/components/features/`)

**Purpose**: Compose generic components with domain logic

**Characteristics**:
- Combine multiple UI components
- Accept domain models as props
- Receive utility functions via props (not imported directly)
- Contain feature-specific presentation logic
- Have their own SCSS modules

**Examples**:
```typescript
// WorkerList - Feature component
<WorkerList
  workers={workers}
  loading={loading}
  error={error}
  getWorkerTypeLabel={getWorkerTypeLabel}
  getWorkerTypeColor={getWorkerTypeColor}
  getWorkerStatusLabel={getWorkerStatusLabel}
/>

// TaskList - Feature component
<TaskList
  tasks={tasks}
  onTaskClick={handleTaskClick}
  getTaskStatusLabel={getTaskStatusLabel}
  getTaskStatusColor={getTaskStatusColor}
/>
```

### 3. Page Components (`src/pages/`)

**Purpose**: Purely compositional - bring components together

**Characteristics**:
- Consume custom hooks for data
- Pass data and callbacks to feature components
- Minimal styling (close to 0 lines of CSS)
- Handle page-level state coordination
- Orchestrate multiple features

**Example**:
```typescript
// DashboardPage - Page component
export function DashboardPage() {
  const { tasks, createTask, getTaskStatusLabel } = useTasks();
  const { workers, getWorkerTypeLabel } = useWorkers();

  return (
    <div className={styles.dashboard}>
      <WorkerList workers={workers} getWorkerTypeLabel={getWorkerTypeLabel} />
      <TaskList tasks={tasks} getTaskStatusLabel={getTaskStatusLabel} />
      <NewTaskDialog onSubmit={createTask} />
    </div>
  );
}
```

### 4. Layout Components (`src/components/layout/`)

**Purpose**: Handle structural positioning and responsive design

**Characteristics**:
- Define page structure (header, main, footer)
- Handle responsive breakpoints
- Provide consistent spacing and alignment
- Minimal business logic

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Components                            │
│                  (Pure Presentation)                         │
└─────────────────────────┬───────────────────────────────────┘
                          │ Props
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                     Custom Hooks                             │
│              (useXxx - Expose functionality)                 │
└─────────────────────────┬───────────────────────────────────┘
                          │ Service Methods
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                      Services                                │
│           (Business logic & transformation)                  │
└─────────────────────────┬───────────────────────────────────┘
                          │ Repository Methods
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                    Repositories                              │
│            (Feature-specific data access)                    │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTP Methods
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                     ApiClient                                │
│              (Generic HTTP client)                           │
└─────────────────────────────────────────────────────────────┘
```

### Layer Responsibilities

#### 1. ApiClient (Generic)
```typescript
// src/lib/api/apiClient.ts
// Generic HTTP operations - reusable across all features
class ApiClient {
  async get<T>(path: string): Promise<T>
  async post<T>(path: string, data: unknown): Promise<T>
  async patch<T>(path: string, data: unknown): Promise<T>
  async delete<T>(path: string): Promise<T>
}
```

#### 2. Repositories (Feature-Specific)
```typescript
// src/lib/api/repositories/TaskRepository.ts
// Task-specific data access - abstracts API endpoints
class TaskRepository {
  async getAllTasks(): Promise<Task[]>
  async createTask(data: CreateTaskDTO): Promise<Task>
  async updateTaskStatus(id: string, status: TaskStatus): Promise<Task>
}
```

#### 3. Services (Business Logic)
```typescript
// src/lib/api/services/TaskService.ts
// Business logic and data transformation
class TaskService {
  constructor(private repository: TaskRepository)

  async getAllTasks(): Promise<Task[]>
  async getActiveTasks(): Promise<Task[]>
  getTaskStatusColor(status: TaskStatus): string
  getTaskStatusLabel(status: TaskStatus): string
  private sortTasksByPriority(tasks: Task[]): Task[]
}
```

#### 4. Custom Hooks (React Integration)
```typescript
// src/lib/hooks/useTasks.ts
// Expose service functionality to React components
export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    const data = await taskService.getAllTasks();
    setTasks(data);
  }, []);

  return {
    tasks,
    loading,
    createTask,
    getTaskStatusLabel,
    getTaskStatusColor,
  };
}
```

#### 5. Components (Presentation)
```typescript
// Components receive data and utilities via props
export function TaskList({
  tasks,
  loading,
  getTaskStatusLabel,
  getTaskStatusColor,
}: TaskListProps) {
  // Pure presentation logic only
}
```

## State Management Strategy

### Principle: Communication Through Props Only

**Rule**: Components NEVER communicate directly with each other. All communication happens through the parent component via props.

### State Location

1. **Component-local state**: Use `useState` for UI-only state
   ```typescript
   const [isOpen, setIsOpen] = useState(false);
   ```

2. **Feature state**: Lives in page component, passed to children
   ```typescript
   function DashboardPage() {
     const { tasks, createTask } = useTasks();
     return <TaskList tasks={tasks} onCreateTask={createTask} />;
   }
   ```

3. **Context**: Only when >4-5 components share state
   ```typescript
   // Create context only when necessary
   const ThemeContext = createContext<ThemeContextValue>();
   ```

### When to Create Context

- When passing props through 3+ component levels
- When 5+ components need the same state
- For truly global concerns (theme, auth, i18n)

**Example of when NOT to use context**:
```typescript
// BAD - Don't create context for 2-3 components
<TasksContext.Provider>
  <TaskList />
  <TaskForm />
</TasksContext.Provider>

// GOOD - Pass props directly
<DashboardPage>
  <TaskList tasks={tasks} />
  <TaskForm onSubmit={createTask} />
</DashboardPage>
```

## Styling Strategy

### SCSS Architecture

1. **Component-scoped styles**: Each component has `.module.scss`
   ```scss
   // Button.module.scss
   .button {
     padding: var(--space-2) var(--space-4);
     background: var(--color-accent);
   }
   ```

2. **Theme variables**: All colors reference CSS custom properties
   ```scss
   // Use theme variables, not hardcoded colors
   color: var(--color-text-primary);  // ✓ Good
   color: #000000;                    // ✗ Bad
   ```

3. **Minimal page styling**: Pages orchestrate, not style
   ```scss
   // DashboardPage.module.scss - only layout, no decoration
   .dashboard {
     display: flex;
     flex-direction: column;
     gap: var(--space-8);
   }
   ```

### Theme System

**Supports dark and light themes via CSS custom properties**:

```scss
// Light theme (default)
:root {
  --color-bg-primary: #ffffff;
  --color-text-primary: #0f172a;
}

// Dark theme
[data-theme='dark'] {
  --color-bg-primary: #0f172a;
  --color-text-primary: #f1f5f9;
}
```

## Testing Strategy (Not Implemented Yet)

### Recommended Testing Pyramid

1. **70% Unit Tests**
   - Test hooks in isolation
   - Test services and repositories
   - Test utility functions

2. **25% Integration Tests**
   - Test component + hook interactions
   - Test data flow through layers
   - Test form submissions and API calls

3. **5% E2E Tests**
   - Critical user journeys
   - End-to-end workflows

## File Naming Conventions

- **Components**: PascalCase matching export (`Button.tsx`, `TaskList.tsx`)
- **Hooks**: camelCase with `use` prefix (`useTasks.ts`, `useWorkers.ts`)
- **Services**: PascalCase with `Service` suffix (`TaskService.ts`)
- **Repositories**: PascalCase with `Repository` suffix (`TaskRepository.ts`)
- **Styles**: Component name + `.module.scss` (`Button.module.scss`)
- **Types**: PascalCase interfaces/types (`Task`, `WorkerInfo`)

## Dependency Rules

### Import Direction (Top to Bottom)

```
Components
    ↓ Can import
Hooks
    ↓ Can import
Services
    ↓ Can import
Repositories
    ↓ Can import
ApiClient
```

### What Each Layer Can Import

- **Components**: Hooks, other components, types
- **Hooks**: Services, types
- **Services**: Repositories, types
- **Repositories**: ApiClient, types
- **ApiClient**: Only standard libraries

### What Each Layer CANNOT Import

- **Repositories**: Cannot import services or hooks
- **Services**: Cannot import hooks or components
- **Hooks**: Cannot import components
- **ApiClient**: Cannot import anything from the app

## Adding New Features

### Checklist for New Features

1. **Define types** in `src/types/domain.ts`
2. **Create repository** in `src/lib/api/repositories/`
3. **Create service** in `src/lib/api/services/`
4. **Create hook** in `src/lib/hooks/`
5. **Create generic UI components** in `src/components/ui/` (if needed)
6. **Create feature components** in `src/components/features/`
7. **Compose in page** in `src/pages/`

### Example: Adding a "Workspace" Feature

```typescript
// 1. Define types
export interface Workspace {
  id: string;
  path: string;
  mode: 'isolated' | 'shared';
}

// 2. Create repository
export class WorkspaceRepository {
  async getAllWorkspaces(): Promise<Workspace[]>
}

// 3. Create service
export class WorkspaceService {
  constructor(private repository: WorkspaceRepository)
  async getAllWorkspaces(): Promise<Workspace[]>
  getWorkspaceModeLabel(mode: string): string
}

// 4. Create hook
export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  // ... implementation
  return { workspaces, loading, error };
}

// 5. Create feature component
export function WorkspaceList({ workspaces, loading, error }: WorkspaceListProps)

// 6. Use in page
export function DashboardPage() {
  const { workspaces, loading, error } = useWorkspaces();
  return <WorkspaceList workspaces={workspaces} loading={loading} error={error} />;
}
```

## Key Design Patterns

### 1. Repository Pattern
Abstracts data access from business logic.

### 2. Service Pattern
Encapsulates business logic and data transformation.

### 3. Custom Hooks Pattern
Exposes React-friendly API for components.

### 4. Composition Pattern
Build complex UIs from simple components.

### 5. Render Props Pattern
Pass rendering logic via props when needed.

## Common Pitfalls to Avoid

1. **Don't import services directly in components**
   ```typescript
   // BAD
   import { taskService } from '@/lib/api/services/TaskService';

   // GOOD
   const { tasks } = useTasks();
   ```

2. **Don't add business logic to UI components**
   ```typescript
   // BAD - business logic in component
   function TaskList({ tasks }) {
     const sortedTasks = tasks.sort((a, b) => ...);
   }

   // GOOD - business logic in service
   function TaskService {
     sortTasksByPriority(tasks: Task[]): Task[]
   }
   ```

3. **Don't hardcode colors or spacing**
   ```scss
   // BAD
   color: #000000;
   padding: 16px;

   // GOOD
   color: var(--color-text-primary);
   padding: var(--space-4);
   ```

4. **Don't create context prematurely**
   - Start with prop passing
   - Only create context when prop drilling becomes painful

## Benefits of This Architecture

1. **Testability**: Each layer can be tested in isolation
2. **Maintainability**: Clear responsibilities and boundaries
3. **Scalability**: Easy to add features without touching existing code
4. **Reusability**: Generic components work across features
5. **Type Safety**: TypeScript enforces contracts between layers
6. **Developer Experience**: Clear patterns make onboarding easier

## References

- [Clean Architecture by Robert C. Martin](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Presentation Domain Data Layering](https://martinfowler.com/bliki/PresentationDomainDataLayering.html)
- [Component Hierarchy Best Practices](https://react.dev/learn/thinking-in-react)
