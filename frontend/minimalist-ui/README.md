# Agent Fleet - Minimalist UI

A clean, modern React frontend for the Agent Fleet orchestrator. Built with a focus on essential information and primary actions, following Linear/Arc browser aesthetics.

## Design Philosophy

- **Minimalist & Modern**: Clean, spacious design with purposeful elements
- **Progressive Disclosure**: Show more information on demand, hide idle details
- **Contextual Actions**: Actions appear when needed (hover, selection)
- **Single Page App**: Smooth transitions without page reloads

## Tech Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Fast build tool and dev server
- **SCSS Modules** - Scoped styling
- **Radix UI** - Accessible component primitives
- **Framer Motion** - Smooth animations

## Architecture

This project follows strict architectural principles:

### Component Hierarchy

1. **Generic UI Components** (`src/components/ui/`)
   - Pure presentation components
   - Zero business logic
   - Based on Radix UI primitives
   - Examples: Button, Badge, Card, Input

2. **Feature Components** (`src/components/features/`)
   - Compose generic components with domain logic
   - Examples: WorkerList, TaskList, NewTaskDialog

3. **Page Components** (`src/pages/`)
   - Purely compositional
   - Bring components together
   - Minimal styling (close to 0 lines of CSS)

4. **Layout Components** (`src/components/layout/`)
   - Handle structural positioning
   - Used within pages

### Data Flow

```
apiClient (generic HTTP)
    ↓
xxxRepository (feature-specific data access)
    ↓
xxxService (business logic & transformation)
    ↓
useXxx hooks (expose service to components)
    ↓
Components (pure presentation)
```

### State Management

- Component-to-component communication through props only
- Shared state lives in parent page components
- Custom hooks encapsulate data fetching and business logic

## Setup

### Prerequisites

- Node.js 18+ and npm
- Agent Fleet orchestrator running on `http://localhost:3737`

### Installation

```bash
# Navigate to the project directory
cd frontend/minimalist-ui

# Install dependencies
npm install
```

## Development

### Start Dev Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`. The dev server includes:
- Hot module replacement (HMR)
- API proxy to orchestrator at `/api` → `http://localhost:3737`

### Build for Production

```bash
npm run build
```

Build output will be in the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

### Type Checking

```bash
npm run type-check
```

### Linting

```bash
npm run lint
```

## Project Structure

```
src/
├── components/
│   ├── ui/              # Generic reusable components
│   │   ├── Button/
│   │   ├── Badge/
│   │   ├── Card/
│   │   ├── Input/
│   │   └── Spinner/
│   ├── features/        # Feature-specific components
│   │   ├── WorkerList/
│   │   ├── TaskList/
│   │   └── NewTaskDialog/
│   └── layout/          # Layout components
│       └── AppLayout/
├── pages/               # Page components
│   └── DashboardPage/
├── lib/
│   ├── api/
│   │   ├── apiClient.ts           # Generic HTTP client
│   │   ├── repositories/          # Data access layer
│   │   │   ├── TaskRepository.ts
│   │   │   ├── WorkerRepository.ts
│   │   │   └── FlowRepository.ts
│   │   └── services/              # Business logic
│   │       ├── TaskService.ts
│   │       └── WorkerService.ts
│   ├── hooks/                     # Custom React hooks
│   │   ├── useTasks.ts
│   │   ├── useWorkers.ts
│   │   └── useFlows.ts
│   └── mock/                      # Mock data for development
│       └── mockData.ts
├── types/
│   └── domain.ts                  # Domain type definitions
├── styles/
│   ├── theme.scss                 # Design tokens & CSS variables
│   └── globals.scss               # Global styles & resets
├── App.tsx                        # Root component
└── main.tsx                       # Entry point
```

## Features

### Monitor Workers

- Clean list view with essential status indicators
- Visual status with subtle animations
- Expandable cards showing worker details
- Real-time updates (polling every 3 seconds)
- Focus on current activity

### Add Tasks

- Prominent "New Task" button
- Streamlined creation dialog
- Flow selection for automated workflows
- Priority assignment
- Smart defaults to minimize input

### View Tasks

- Organized by status (Active vs Pending)
- Priority and status badges
- Task assignment information
- Relative timestamps
- Flow execution indicators

## Theming

The UI supports both light and dark themes via CSS custom properties:

- Light theme is the default
- Dark theme can be activated by adding `data-theme="dark"` to the root element
- All colors reference theme variables (e.g., `var(--color-bg-primary)`)
- Smooth transitions between theme changes

## API Integration

The frontend communicates with the orchestrator REST API:

- `GET /stats` - Orchestrator statistics
- `GET /workers` - List all connected workers
- `GET /tasks` - List all tasks
- `POST /tasks` - Create new task
- `PATCH /tasks/:id/status` - Update task status
- `GET /flows` - List available flows

API calls are proxied through Vite dev server to avoid CORS issues.

## Mock Data

For development without the backend running, mock data is available in `src/lib/mock/mockData.ts`:

```typescript
import { mockWorkers, mockTasks, mockFlows } from '@/lib/mock/mockData';
```

## Best Practices

### Component Development

1. **Keep components pure** - UI components should only handle presentation
2. **Use TypeScript strictly** - No `any` types, proper interfaces
3. **SCSS Modules** - Each component has its own scoped stylesheet
4. **Accessibility** - Use Radix UI for accessible primitives
5. **Mobile-first** - Design for mobile, enhance for desktop

### Styling

1. **Use design tokens** - Reference CSS variables, not hardcoded values
2. **Consistent spacing** - Use spacing scale (`var(--space-*)`)
3. **Theme-aware** - All colors must support dark/light themes
4. **Minimal page styling** - Pages should have close to 0 CSS

### State Management

1. **Props for communication** - Components communicate via props only
2. **Lift state appropriately** - State lives at the right level
3. **Hooks for data** - Use custom hooks for API calls and logic
4. **No prop drilling** - Use context only when >4-5 components share state

## Contributing

When adding new features:

1. Create generic UI components in `components/ui/`
2. Compose feature components in `components/features/`
3. Add data access in `lib/api/repositories/`
4. Add business logic in `lib/api/services/`
5. Create custom hooks in `lib/hooks/`
6. Compose everything in page components

## License

Part of the Agent Fleet project.
