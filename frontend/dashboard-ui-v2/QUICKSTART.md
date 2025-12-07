# Quick Start Guide

Get the Agent Fleet Dashboard running in 3 minutes.

## Prerequisites

- Node.js 18+ installed
- npm or yarn package manager

## Installation & Setup

```bash
# Navigate to the dashboard directory
cd frontend/dashboard-ui

# Install dependencies (takes ~30 seconds)
npm install

# Start development server
npm run dev
```

The dashboard will automatically open at `http://localhost:3000`

## What You'll See

The dashboard loads with realistic mock data:

- **6 Workers** - Mix of active, idle, and error states
- **12 Tasks** - Various statuses and priorities
- **Live Metrics** - CPU, memory, network stats
- **Activity Log** - Recent system events

## Quick Tour

### 1. Monitor Workers
Worker cards show real-time status with:
- Status indicator (active/idle/error)
- Current task with progress
- Performance metrics
- Click any card for more details

### 2. Manage Tasks
Task Queue features:
- Search bar for filtering
- Status and priority filters
- Click tasks to see details
- Real-time progress updates

### 3. Add Tasks
Click the "Add Task" button:
- Fill in task description
- Select priority level
- Choose workflow (optional)
- Or use Quick Actions for common tasks

### 4. System Health
Top section shows:
- CPU and memory usage
- Network activity
- Active connections
- Overall system status

### 5. Activity Log
Right sidebar displays:
- Timeline of all events
- Filter by type/severity
- Expandable details
- Auto-scrolling updates

### 6. Settings
Click the Settings button:
- Toggle dark/light theme
- Configure connection URL
- Enable notifications
- View system info

## Theme Switching

Toggle between light and dark themes:
1. Click "Settings" button in header
2. Select Light or Dark theme
3. Theme applies immediately

## Mock Data Updates

The dashboard simulates real-time updates:
- Worker metrics update every 5 seconds
- System metrics fluctuate naturally
- Heartbeats stay current

## Building for Production

```bash
# Create optimized build
npm run build

# Preview production build
npm run preview
```

Build output goes to `dist/` directory.

## Next Steps

1. **Customize Mock Data**: Edit `src/data/mockData.ts`
2. **Add More Workers**: Expand the `mockWorkers` array
3. **Create Custom Workflows**: Add to `mockWorkflows`
4. **Integrate Backend**: See README.md for WebSocket integration

## Common Issues

**Port 3000 already in use?**
```bash
# Vite will automatically try port 3001, 3002, etc.
# Or specify a different port:
npm run dev -- --port 3030
```

**Types not working?**
```bash
# Restart TypeScript server in your editor
# Or reinstall dependencies:
rm -rf node_modules package-lock.json
npm install
```

**Styles not loading?**
```bash
# Clear browser cache
# Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
```

## Development Tips

- **Hot Reload**: Changes reflect instantly in browser
- **Console Logs**: Click events log to browser console
- **Responsive**: Resize browser to test mobile layouts
- **Notifications**: Grant permission for desktop alerts

## File Structure

```
src/
├── components/     # UI components
├── data/          # Mock data
├── styles/        # Global styles
├── types/         # TypeScript types
├── App.tsx        # Main app
└── main.tsx       # Entry point
```

## Resources

- Full documentation: See `README.md`
- Component details: Check individual component files
- Type definitions: See `src/types/index.ts`

Enjoy building with Agent Fleet Dashboard!
