# Quick Start Guide

Get the Agent Fleet Terminal UI running in under 2 minutes.

## Installation & Run

```bash
# Navigate to the project
cd frontend/terminal-ui

# Install dependencies
npm install

# Start development server
npm run dev
```

Open your browser to **http://localhost:3000**

## What You'll See

- **Left Panel**: 4 mock workers with live status indicators
- **Right Panel**: Streaming logs from selected worker
- **Top Bar**: Connection status and stats
- **Bottom Bar**: Keyboard shortcuts reference

## Try These Features

### 1. View Worker Logs
Click any worker in the left panel to see its logs in real-time.

### 2. Search Logs
Type in the search box in the top-right to filter log entries.

### 3. Command Palette
Press `Cmd+K` (Mac) or `Ctrl+K` (Windows/Linux) to open the command palette.
Try typing "new" or "settings".

### 4. Create a Task
Press `Cmd+N` or select "Create New Task" from command palette:
- Enter a name like "Build Project"
- Choose Flow or Command type
- Edit the YAML/command
- Click "Create Task"

### 5. Configure Settings
Press `Cmd+,` or select "Open Settings" from command palette:
- Change orchestrator URL
- Adjust log level
- Enable/disable auto-reconnect

## Keyboard Shortcuts

| Action | Mac | Windows/Linux |
|--------|-----|---------------|
| Command Palette | `⌘K` | `Ctrl+K` |
| New Task | `⌘N` | `Ctrl+N` |
| Settings | `⌘,` | `Ctrl+,` |
| Close Modal | `Esc` | `Esc` |

## Mock Data

The app runs with simulated data by default:
- Logs appear every 2-5 seconds
- Worker statuses update periodically
- All features work without a real backend

## Next Steps

- Read [README.md](./README.md) for full documentation
- Check [DEVELOPMENT.md](./DEVELOPMENT.md) for development guide
- Customize mock data in `src/mock/MockDataService.ts`
- Connect to real orchestrator (replace MockDataService)

## Troubleshooting

**Port 3000 already in use?**
```bash
# Edit vite.config.ts and change the port
server: {
  port: 3001,
}
```

**Dependencies not installing?**
```bash
# Try clearing npm cache
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

**Build failing?**
```bash
# Check Node version (need 18+)
node --version

# Update npm
npm install -g npm@latest
```

## Screenshots

### Main Dashboard
Split panel view with worker list and streaming logs.

### Command Palette (⌘K)
Quick access to all actions with keyboard navigation.

### Task Creation (⌘N)
Create flows with YAML editor or run direct commands.

### Settings (⌘,)
Configure connection, logging, and UI preferences.

---

**Enjoy using Agent Fleet Terminal UI!** 🚀
