# Agent Fleet Dashboard

A professional, dashboard-focused React frontend for the Agent Fleet orchestrator system.

## Overview

The Agent Fleet Dashboard provides real-time monitoring and control of the multi-agent orchestration system. Built with React 18 and Vite, it offers a polished command center aesthetic inspired by professional monitoring tools like Grafana and Datadog.

## Features

### 1. Worker Monitoring
- **Grid-based worker cards** displaying real-time status (active/idle/error/disconnected)
- **Performance metrics**: tasks completed, success rate, average duration, CPU usage
- **Current task visualization** with progress bars
- **Status indicators** with color coding and heartbeat animation
- **Click-to-expand** for detailed worker information

### 2. Task Management
- **Task queue visualization** with filtering by status and priority
- **Search functionality** for quick task lookup
- **Task creation form** with workflow selection
- **Quick action buttons** for common tasks (Run Tests, Deploy, Code Review, Hotfix)
- **Priority color coding** (urgent/high/medium/low)
- **Real-time progress tracking**

### 3. System Health Monitoring
- **CPU usage** with visual bar chart and threshold indicators
- **Memory usage** with used/total statistics
- **Network activity** tracking (bytes in/out)
- **Active connections** count
- **System status summary** with traffic light indicators

### 4. Activity Log
- **Timeline view** of all system events
- **Filtering by type** (task/worker/system/error) and severity
- **Expandable details** for each log entry
- **Real-time updates** with timestamp information
- **Color-coded severity** levels (info/success/warning/error)

### 5. Configuration
- **Connection settings** for orchestrator URL and heartbeat interval
- **Auto-reconnect** toggle
- **Theme switching** (light/dark mode)
- **Desktop notifications** enable/disable
- **System information** display

## Tech Stack

- **React 18.2** - Modern UI library with hooks
- **TypeScript** - Type-safe development
- **Vite 5.0** - Fast build tool and dev server
- **CSS Modules** - Scoped styling with CSS custom properties
- **Mock Data** - Realistic test data for development

## Project Structure

```
frontend/dashboard-ui/
├── src/
│   ├── components/           # React components
│   │   ├── WorkerCard/       # Worker status cards
│   │   ├── TaskQueue/        # Task list with filtering
│   │   ├── TaskForm/         # New task creation form
│   │   ├── SystemHealth/     # System metrics display
│   │   ├── ActivityLog/      # Event timeline
│   │   └── Settings/         # Configuration panel
│   ├── data/
│   │   └── mockData.ts       # Mock data for development
│   ├── styles/
│   │   ├── theme.css         # Theme variables (light/dark)
│   │   └── global.css        # Global styles
│   ├── types/
│   │   └── index.ts          # TypeScript type definitions
│   ├── App.tsx               # Main application component
│   ├── App.css               # Application-level styles
│   └── main.tsx              # Entry point
├── index.html                # HTML template
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
├── vite.config.ts            # Vite configuration
└── README.md                 # This file
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Modern web browser with ES2020 support

### Installation

```bash
cd frontend/dashboard-ui
npm install
```

### Development Server

Start the development server with hot reload:

```bash
npm run dev
```

The dashboard will be available at `http://localhost:3000`

### Build for Production

Create an optimized production build:

```bash
npm run build
```

The built files will be in the `dist/` directory.

### Preview Production Build

Preview the production build locally:

```bash
npm run preview
```

## Mock Data

The dashboard uses comprehensive mock data for development and testing:

- **6 Workers** with various states (active, idle, error, disconnected)
- **12 Tasks** across different statuses and priorities
- **System metrics** (CPU, memory, network)
- **10 Activity log entries** covering different event types
- **5 Available workflows** for task creation

All mock data is defined in `src/data/mockData.ts` and can be easily customized.

## Theme System

The dashboard supports both light and dark themes using CSS custom properties:

- **Automatic theme switching** via settings panel
- **Theme persistence** across sessions
- **Smooth transitions** between themes
- **Consistent color palette** with semantic naming

Theme variables are defined in `src/styles/theme.css`.

## Component Architecture

### Design Philosophy

Following React best practices with functional components and hooks:

- **Single Responsibility**: Each component has one clear purpose
- **Composition over Inheritance**: Complex UIs built from simple components
- **Props-based Communication**: No prop drilling, clean data flow
- **Type Safety**: Full TypeScript coverage
- **CSS Modules**: Scoped styles prevent conflicts

### Key Components

#### WorkerCard
Displays individual worker status with metrics and current task.

**Props**: `worker: Worker`, `onClick?: (worker: Worker) => void`

#### TaskQueue
Shows filterable list of all tasks with search and status/priority filters.

**Props**: `tasks: Task[]`, `onTaskClick?: (task: Task) => void`

#### TaskForm
Form for creating new tasks with workflow selection and quick actions.

**Props**: `onSubmit: (taskData) => void`, `onCancel?: () => void`

#### SystemHealth
Displays system metrics (CPU, memory, network, connections).

**Props**: `metrics: SystemMetrics`

#### ActivityLog
Timeline view of system events with filtering and expandable details.

**Props**: `entries: ActivityLogEntry[]`, `maxHeight?: string`

#### Settings
Configuration panel for connection, appearance, and notifications.

**Props**: `config: WorkspaceConfig`, `onSave: (config) => void`, `onClose?: () => void`

## Responsive Design

The dashboard is fully responsive with breakpoints at:

- **Desktop**: 1920px max-width (default)
- **Tablet**: 768px and below
- **Mobile**: 480px and below

Mobile-specific optimizations:
- Stacked layouts instead of grids
- Collapsed navigation
- Touch-friendly button sizes
- Simplified footer

## Integration with Backend

To connect the dashboard to the real Agent Fleet orchestrator:

1. Update `orchestratorUrl` in Settings to point to your WebSocket server
2. Replace mock data imports with WebSocket client
3. Implement message handlers for:
   - Worker status updates
   - Task progress notifications
   - System metrics streaming
   - Activity log events

Example WebSocket integration structure:

```typescript
// Create WebSocket connection
const ws = new WebSocket(config.orchestratorUrl);

// Handle incoming messages
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  switch (message.type) {
    case 'worker_status':
      setWorkers(prev => updateWorker(prev, message.data));
      break;
    case 'task_update':
      setTasks(prev => updateTask(prev, message.data));
      break;
    // ... other message types
  }
};

// Send messages
const createTask = (taskData) => {
  ws.send(JSON.stringify({
    type: 'create_task',
    data: taskData
  }));
};
```

## Customization

### Adding New Metrics

1. Update `SystemMetrics` type in `src/types/index.ts`
2. Add metric visualization to `SystemHealth` component
3. Update mock data in `src/data/mockData.ts`

### Custom Workflows

Add new workflows to `mockWorkflows` in `src/data/mockData.ts`:

```typescript
{
  id: 'custom-flow',
  name: 'Custom Workflow',
  description: 'Description of your workflow'
}
```

### Styling Customization

Modify theme variables in `src/styles/theme.css`:

```css
:root {
  --color-primary: #your-color;
  --color-bg-card: #your-background;
  /* ... other variables */
}
```

## Performance Considerations

- **Virtual scrolling**: Consider for large task/log lists (1000+ items)
- **Debounced search**: Already implemented for task filtering
- **Memoization**: Used in TaskQueue for filtered results
- **Lazy loading**: Components load on-demand
- **CSS animations**: Hardware-accelerated transforms

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Opera 76+

## Future Enhancements

Potential improvements for production use:

- [ ] Real WebSocket integration with orchestrator
- [ ] Historical data charts (task completion over time)
- [ ] Worker performance analytics
- [ ] Task dependencies visualization
- [ ] Drag-and-drop task prioritization
- [ ] Multi-user support with authentication
- [ ] Export/import configuration
- [ ] Custom dashboard layouts
- [ ] Advanced filtering and search
- [ ] Keyboard shortcuts

## License

MIT - See root project LICENSE file

## Support

For issues and questions, please refer to the main Agent Fleet repository.
