# Agent Fleet Dashboard - Project Structure

Complete overview of all files and their purposes.

## Directory Tree

```
frontend/dashboard-ui/
├── public/                          # Static assets (handled by Vite)
├── src/
│   ├── components/                  # React Components
│   │   ├── WorkerCard/
│   │   │   ├── WorkerCard.tsx       # Worker status card component
│   │   │   └── WorkerCard.css       # Worker card styles
│   │   ├── TaskQueue/
│   │   │   ├── TaskQueue.tsx        # Task list with filtering
│   │   │   └── TaskQueue.css        # Task queue styles
│   │   ├── TaskForm/
│   │   │   ├── TaskForm.tsx         # New task creation form
│   │   │   └── TaskForm.css         # Task form styles
│   │   ├── SystemHealth/
│   │   │   ├── SystemHealth.tsx     # System metrics display
│   │   │   └── SystemHealth.css     # System health styles
│   │   ├── ActivityLog/
│   │   │   ├── ActivityLog.tsx      # Event timeline component
│   │   │   └── ActivityLog.css      # Activity log styles
│   │   ├── Settings/
│   │   │   ├── Settings.tsx         # Configuration panel
│   │   │   └── Settings.css         # Settings styles
│   │   └── index.ts                 # Component exports
│   ├── data/
│   │   └── mockData.ts              # Mock data (workers, tasks, metrics)
│   ├── styles/
│   │   ├── theme.css                # Theme variables (light/dark)
│   │   └── global.css               # Global styles and utilities
│   ├── types/
│   │   └── index.ts                 # TypeScript type definitions
│   ├── App.tsx                      # Main application component
│   ├── App.css                      # Application-level styles
│   └── main.tsx                     # Application entry point
├── index.html                       # HTML template
├── package.json                     # Dependencies and scripts
├── tsconfig.json                    # TypeScript configuration
├── tsconfig.node.json               # TypeScript config for Vite
├── vite.config.ts                   # Vite build configuration
├── .gitignore                       # Git ignore rules
├── README.md                        # Full documentation
├── QUICKSTART.md                    # Quick start guide
└── PROJECT_STRUCTURE.md             # This file
```

## File Descriptions

### Configuration Files

#### `package.json`
- Project metadata and dependencies
- npm scripts for dev, build, preview
- React 18, TypeScript, Vite dependencies

#### `tsconfig.json`
- TypeScript compiler options
- Strict mode enabled
- ES2020 target with DOM libraries

#### `vite.config.ts`
- Vite build tool configuration
- React plugin setup
- Dev server on port 3000

#### `.gitignore`
- Ignores node_modules, dist, logs
- Editor-specific files excluded

### Source Files

#### `src/main.tsx` - Entry Point
- Renders React app to DOM
- Imports global styles
- React StrictMode wrapper

#### `src/App.tsx` - Main Application
- Dashboard layout and state management
- Integrates all components
- Handles theme and config
- Real-time update simulation
- Props: None (root component)

#### `src/App.css` - App Styles
- Header, main, footer layouts
- Grid system for dashboard
- Responsive breakpoints
- Animation definitions

### Components

#### `WorkerCard` Component
**Purpose**: Display individual worker status and metrics

**Files**:
- `WorkerCard.tsx` - Component logic
- `WorkerCard.css` - Card styling

**Props**:
- `worker: Worker` - Worker data
- `onClick?: (worker) => void` - Click handler

**Features**:
- Status indicator with pulse animation
- Current task display with progress
- Metrics grid (tasks, success rate, duration, CPU)
- Heartbeat timestamps
- Error message display

#### `TaskQueue` Component
**Purpose**: List and filter all tasks

**Files**:
- `TaskQueue.tsx` - Component logic
- `TaskQueue.css` - List styling

**Props**:
- `tasks: Task[]` - Array of tasks
- `onTaskClick?: (task) => void` - Click handler

**Features**:
- Search functionality
- Status and priority filters
- Priority color indicators
- Progress bars
- Time ago formatting

#### `TaskForm` Component
**Purpose**: Create new tasks

**Files**:
- `TaskForm.tsx` - Form logic
- `TaskForm.css` - Form styling

**Props**:
- `onSubmit: (taskData) => void` - Submit handler
- `onCancel?: () => void` - Cancel handler

**Features**:
- Description textarea
- Priority selector
- Workflow dropdown
- Quick action buttons
- Form validation

#### `SystemHealth` Component
**Purpose**: Display system metrics

**Files**:
- `SystemHealth.tsx` - Metrics logic
- `SystemHealth.css` - Metrics styling

**Props**:
- `metrics: SystemMetrics` - System metrics data

**Features**:
- CPU usage with bar chart
- Memory usage with bar chart
- Network activity (in/out)
- Active connections count
- Status indicator

#### `ActivityLog` Component
**Purpose**: Timeline of system events

**Files**:
- `ActivityLog.tsx` - Timeline logic
- `ActivityLog.css` - Timeline styling

**Props**:
- `entries: ActivityLogEntry[]` - Log entries
- `maxHeight?: string` - Max height for scrolling

**Features**:
- Timeline visualization
- Type and severity filters
- Expandable details
- Time formatting
- Color-coded severity

#### `Settings` Component
**Purpose**: Configuration panel

**Files**:
- `Settings.tsx` - Settings logic
- `Settings.css` - Panel styling

**Props**:
- `config: WorkspaceConfig` - Current config
- `onSave: (config) => void` - Save handler
- `onClose?: () => void` - Close handler

**Features**:
- Connection settings
- Theme switcher
- Notification toggle
- System information
- Unsaved changes indicator

### Data & Types

#### `src/data/mockData.ts`
**Purpose**: Realistic mock data for development

**Exports**:
- `mockWorkers: Worker[]` - 6 workers with various states
- `mockTasks: Task[]` - 12 tasks across statuses
- `mockSystemMetrics: SystemMetrics` - System metrics
- `mockActivityLog: ActivityLogEntry[]` - 10 log entries
- `mockWorkflows` - 5 available workflows

#### `src/types/index.ts`
**Purpose**: TypeScript type definitions

**Key Types**:
- `Worker` - Worker information and metrics
- `Task` - Task details and status
- `SystemMetrics` - CPU, memory, network metrics
- `ActivityLogEntry` - Log entry structure
- `WorkspaceConfig` - Dashboard configuration
- Enums: `TaskStatus`, `WorkerType`, `WorkerStatus`, `Priority`

### Styles

#### `src/styles/theme.css`
**Purpose**: CSS custom properties for theming

**Variables**:
- Colors (primary, secondary, backgrounds, borders)
- Status colors (success, warning, error, info)
- Worker status colors
- Priority colors
- Shadows, spacing, border radius
- Typography scales

**Themes**:
- Light theme (default)
- Dark theme (via `[data-theme="dark"]`)

#### `src/styles/global.css`
**Purpose**: Global styles and utilities

**Includes**:
- CSS reset
- Typography defaults
- Scrollbar styling
- Utility classes (text sizes, colors, weights)
- Animation keyframes (fadeIn, pulse, spin)

## Component Dependencies

```
App
├── WorkerCard (x6)
├── TaskQueue
│   └── Uses: Task data, filtering logic
├── TaskForm
│   └── Uses: mockWorkflows
├── SystemHealth
│   └── Uses: SystemMetrics
├── ActivityLog
│   └── Uses: ActivityLogEntry[]
└── Settings
    └── Uses: WorkspaceConfig
```

## Data Flow

```
mockData.ts → App.tsx → Components
     ↓
Components emit events → App.tsx handles → Updates state
     ↓
State updates → Components re-render
```

## Styling Architecture

```
theme.css (variables)
    ↓
global.css (base styles)
    ↓
Component.css (scoped styles)
    ↓
Uses CSS custom properties from theme
```

## Build Output

```
dist/
├── index.html          # Bundled HTML
├── assets/
│   ├── index-[hash].js     # Bundled JavaScript
│   └── index-[hash].css    # Bundled CSS
└── vite.svg            # Favicon
```

## Key Patterns

### Component Structure
```typescript
// 1. Imports
import React from 'react';
import { Type } from '../../types';
import './Component.css';

// 2. Props interface
interface ComponentProps {
  data: Type;
  onAction?: () => void;
}

// 3. Component definition
export const Component: React.FC<ComponentProps> = ({ data, onAction }) => {
  // Hooks
  // Helper functions
  // Render
  return <div>...</div>;
};
```

### Styling Pattern
```css
/* Component wrapper */
.component-name { }

/* Header/section */
.component-name-header { }

/* Elements */
.element-name { }

/* States */
.component-name.active { }

/* Responsive */
@media (max-width: 768px) { }
```

### Type Pattern
```typescript
// Enum for constants
export enum Status {
  ACTIVE = 'active',
  IDLE = 'idle'
}

// Interface for objects
export interface Item {
  id: string;
  status: Status;
  metadata?: Record<string, any>;
}
```

## Responsive Breakpoints

- **Desktop**: Default (up to 1920px)
- **Large Tablet**: 1200px
- **Tablet**: 768px
- **Mobile**: 480px

## Performance Optimizations

- Memoized filtered results in TaskQueue
- CSS hardware-accelerated animations
- Efficient re-render with React hooks
- Debounced search inputs
- Virtual scrolling ready (for large lists)

## Testing Strategy

Current: Visual testing with mock data
Future: Unit tests with Vitest, E2E with Playwright

## Browser Compatibility

- Modern browsers with ES2020 support
- CSS Grid and Flexbox
- CSS Custom Properties
- WebSocket API (for real integration)
