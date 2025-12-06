# Project Structure

Complete file structure of the Agent Fleet Terminal UI.

```
frontend/terminal-ui/
├── public/
│   └── vite.svg                    # Vite logo
├── src/
│   ├── components/
│   │   ├── Button/
│   │   │   ├── Button.tsx          # Reusable button component
│   │   │   └── Button.css          # Button styles
│   │   ├── CommandPalette/
│   │   │   ├── CommandPalette.tsx  # Cmd+K command palette
│   │   │   └── CommandPalette.css  # Command palette styles
│   │   ├── ConfigModal/
│   │   │   ├── ConfigModal.tsx     # Workspace configuration modal
│   │   │   └── ConfigModal.css     # Config modal styles
│   │   ├── Dashboard/
│   │   │   ├── Dashboard.tsx       # Main dashboard container
│   │   │   └── Dashboard.css       # Dashboard layout styles
│   │   ├── Modal/
│   │   │   ├── Modal.tsx           # Generic modal component
│   │   │   └── Modal.css           # Modal styles
│   │   ├── Panel/
│   │   │   ├── Panel.tsx           # Reusable panel container
│   │   │   └── Panel.css           # Panel styles
│   │   ├── StatsBar/
│   │   │   ├── StatsBar.tsx        # Statistics bar component
│   │   │   └── StatsBar.css        # Stats bar styles
│   │   ├── TaskModal/
│   │   │   ├── TaskModal.tsx       # Task creation modal with YAML editor
│   │   │   └── TaskModal.css       # Task modal styles
│   │   ├── Terminal/
│   │   │   ├── Terminal.tsx        # Terminal-style log viewer
│   │   │   └── Terminal.css        # Terminal styles
│   │   └── WorkerList/
│   │       ├── WorkerList.tsx      # Worker sidebar list
│   │       └── WorkerList.css      # Worker list styles
│   ├── mock/
│   │   ├── types.ts                # TypeScript type definitions
│   │   └── MockDataService.ts      # Simulated backend service
│   ├── App.tsx                     # Main application component
│   ├── App.css                     # App-level styles
│   ├── main.tsx                    # Application entry point
│   └── index.css                   # Global styles and theme
├── .eslintrc.cjs                   # ESLint configuration
├── .gitignore                      # Git ignore patterns
├── index.html                      # HTML entry point
├── package.json                    # Dependencies and scripts
├── tsconfig.json                   # TypeScript configuration
├── tsconfig.node.json              # TypeScript config for Node
├── vite.config.ts                  # Vite build configuration
├── README.md                       # Main documentation
├── QUICKSTART.md                   # Quick start guide
├── DEVELOPMENT.md                  # Development guide
└── PROJECT_STRUCTURE.md            # This file
```

## File Purposes

### Configuration Files

- **package.json**: Project dependencies, scripts, and metadata
- **tsconfig.json**: TypeScript compiler options for source code
- **tsconfig.node.json**: TypeScript options for build tools
- **vite.config.ts**: Vite dev server and build configuration
- **.eslintrc.cjs**: Linting rules and configuration
- **.gitignore**: Files to exclude from version control

### Entry Points

- **index.html**: HTML entry point that loads the React app
- **src/main.tsx**: JavaScript entry point that renders App
- **src/App.tsx**: Root React component with global state

### Component Categories

#### UI Components (Reusable)
- **Button**: Styled button with variants (primary, secondary, ghost, danger)
- **Panel**: Container with title, actions, and optional footer
- **Modal**: Overlay modal dialog with customizable content
- **Terminal**: Log viewer with ANSI colors and search

#### Feature Components
- **Dashboard**: Main layout with split panels
- **WorkerList**: Sidebar showing all workers with status
- **StatsBar**: Top bar showing worker and task statistics
- **TaskModal**: Form for creating new tasks with YAML editor
- **ConfigModal**: Settings form for workspace configuration
- **CommandPalette**: Keyboard-driven command interface

### Data Layer

- **mock/types.ts**: TypeScript interfaces for Worker, LogEntry, Task, etc.
- **mock/MockDataService.ts**: Simulated backend with pub/sub pattern

### Styles

- **index.css**: Global styles, CSS custom properties, theme colors
- **App.css**: App-level layout and header/footer styles
- **Component CSS files**: Scoped styles for each component

## Key Features by File

### Real-time Log Streaming
```
MockDataService.ts → Dashboard.tsx → Terminal.tsx
```

### Worker Management
```
MockDataService.ts → Dashboard.tsx → WorkerList.tsx
```

### Command Palette
```
App.tsx (keyboard shortcut) → CommandPalette.tsx
```

### Task Creation
```
App.tsx (Cmd+N) → TaskModal.tsx → MockDataService.ts
```

### Configuration
```
App.tsx (Cmd+,) → ConfigModal.tsx → App state
```

## Component Dependencies

```
App
├── Dashboard
│   ├── StatsBar
│   ├── Panel
│   │   └── WorkerList
│   └── Panel
│       └── Terminal
├── CommandPalette
├── TaskModal
│   ├── Modal
│   └── Button
└── ConfigModal
    ├── Modal
    └── Button
```

## Data Flow

```
MockDataService (singleton)
    │
    ├─→ subscribeToWorkers() ─→ Dashboard ─→ WorkerList
    │                              ↓
    │                          StatsBar
    │
    └─→ subscribeToLogs() ─────→ Dashboard ─→ Terminal
```

## Styling Architecture

```
index.css (CSS custom properties)
    ↓
App.css (app-level layout)
    ↓
Component CSS files (component-specific styles)
```

All colors reference CSS custom properties from `index.css`:
- `--color-bg-primary`, `--color-bg-secondary`, etc.
- `--ansi-red`, `--ansi-green`, etc.
- `--font-mono`, `--font-size-base`, etc.

## Adding New Files

### New Component
1. Create `src/components/ComponentName/`
2. Add `ComponentName.tsx` and `ComponentName.css`
3. Import and use in parent component

### New Feature
1. Add types to `src/mock/types.ts`
2. Extend `MockDataService` if needed
3. Create component(s) in `src/components/`
4. Wire up in `App.tsx` or `Dashboard.tsx`

### New Global Style
Add to `src/index.css` in the appropriate section:
- `:root` for CSS custom properties
- Top-level selectors for global styles
- Utility classes at the bottom
