# Development Guide

## Architecture Overview

The Terminal UI is built following React best practices with a clear separation of concerns:

### Component Structure

```
components/
├── UI Components (reusable)
│   ├── Button/
│   ├── Panel/
│   ├── Modal/
│   └── Terminal/
├── Feature Components
│   ├── Dashboard/
│   ├── WorkerList/
│   ├── TaskModal/
│   └── ConfigModal/
└── Utility Components
    ├── CommandPalette/
    └── StatsBar/
```

### Data Flow

```
MockDataService (singleton)
    ↓ (subscriptions)
Dashboard (state management)
    ↓ (props)
Child Components (pure presentation)
```

## Key Design Decisions

### 1. Mock Data Layer
- `MockDataService` provides simulated backend
- Pub/sub pattern for real-time updates
- Easy to swap with real WebSocket service
- Simulates network latency and updates

### 2. Component Organization
- Each component in its own directory
- Co-located CSS files (not CSS modules for simplicity)
- TypeScript for type safety
- Props interfaces exported for reusability

### 3. Styling Approach
- CSS custom properties for theming
- Terminal-inspired color palette
- Monospace fonts throughout
- No external CSS frameworks (pure CSS)

### 4. State Management
- React hooks (useState, useEffect)
- Local state in components
- Subscriptions for external data
- No Redux/Zustand (not needed yet)

## Adding New Features

### New Component

1. Create directory: `src/components/MyComponent/`
2. Add files:
   ```
   MyComponent.tsx
   MyComponent.css
   ```
3. Export from component:
   ```typescript
   export function MyComponent({ prop1, prop2 }: MyComponentProps) {
     // implementation
   }
   ```

### New Mock Data

1. Add types to `mock/types.ts`
2. Extend `MockDataService` with new methods
3. Add subscription mechanism if real-time updates needed

### New Keyboard Shortcut

Add to `App.tsx` in the `useEffect` hook:

```typescript
else if ((e.metaKey || e.ctrlKey) && e.key === 'x') {
  e.preventDefault();
  // Your action
}
```

Update footer in `App.tsx` to show the shortcut.

## Code Style

### TypeScript
- Always define prop interfaces
- Use explicit return types for functions
- Avoid `any` type
- Use optional chaining and nullish coalescing

### React
- Functional components only
- Hooks for state and effects
- Destructure props in function signature
- Use meaningful component names

### CSS
- Use CSS custom properties for values that might change
- Follow BEM-like naming (e.g., `component-element-modifier`)
- Keep selectors flat (avoid deep nesting)
- Mobile-first responsive design

## Testing Strategy

Currently no tests, but recommended approach:

### Unit Tests (Vitest)
- Test mock data service
- Test utility functions
- Test component logic

### Integration Tests (React Testing Library)
- Test component interactions
- Test keyboard shortcuts
- Test modal flows

### E2E Tests (Playwright)
- Test critical user paths
- Test with mock data mode

## Performance Considerations

### Log Streaming
- Limit logs in memory (configurable max)
- Virtual scrolling for large log lists (future)
- Debounce search input

### Component Optimization
- React.memo for expensive components
- useCallback for event handlers
- useMemo for derived state

### Bundle Size
- Current approach: minimal dependencies
- Tree-shake unused code
- Code-split routes if added

## Future Improvements

### WebSocket Integration
Replace `MockDataService` with real WebSocket service:

```typescript
class WebSocketService {
  private ws: WebSocket;

  connect(url: string) {
    this.ws = new WebSocket(url);
    this.ws.onmessage = this.handleMessage;
  }

  // Same interface as MockDataService
  subscribeToLogs(callback: (log: LogEntry) => void) {
    // Implementation
  }
}
```

### Virtual Terminal
Replace Terminal component with xterm.js:
- Full terminal emulation
- Better ANSI support
- Copy/paste functionality
- Terminal search

### State Persistence
Add localStorage for:
- Selected worker
- UI preferences
- Recent tasks
- Log filters

### Advanced Features
- Task templates
- Worker groups
- Log filters and tags
- Performance metrics dashboard
- Export/import configurations

## Debugging

### React DevTools
Install React DevTools browser extension for component inspection.

### Vite DevTools
Built-in HMR status in browser console.

### Mock Data
Adjust simulation intervals in `MockDataService.ts`:
```typescript
// Faster updates for debugging
this.logInterval = setInterval(() => {
  // ...
}, 500); // 500ms instead of 2000ms
```

## Building for Production

```bash
npm run build
```

Output in `dist/` directory. Serve with any static file server:

```bash
npm run preview
# or
npx serve dist
```

## Environment Variables

Create `.env` for configuration:

```env
VITE_ORCHESTRATOR_URL=ws://localhost:8080
VITE_LOG_LEVEL=info
```

Access in code:
```typescript
const url = import.meta.env.VITE_ORCHESTRATOR_URL;
```

## Troubleshooting

### Port already in use
Change port in `vite.config.ts`:
```typescript
server: {
  port: 3001,
}
```

### Hot reload not working
- Clear Vite cache: `rm -rf node_modules/.vite`
- Restart dev server

### TypeScript errors
- Ensure `node_modules` is installed
- Check `tsconfig.json` settings
- Restart TypeScript server in IDE
