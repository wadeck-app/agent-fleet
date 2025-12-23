# FlowWorker CWD Configuration Options

## Overview

The FlowWorker now supports specifying a custom project root (working directory) via two methods:

1. **CLI Flag**: `--project-root=<path>`
2. **Environment Variable**: `PROJECT_ROOT`

This allows launching the worker against any project directory without being bound to the current shell's working directory.

---

## Usage Examples

### Option 1: CLI Flag (Highest Priority)

```bash
# Start worker with a custom project root
npm run worker -- --project-root=/path/to/custom/project

# Or with tsx directly
tsx packages/worker/src/flow/FlowWorker.ts --project-root=/home/user/my-project

# With other flags combined
npm run worker -- --project-root=/custom/path --interactive --worker-id=worker-1
```

### Option 2: Environment Variable

```bash
# Set via environment variable
export PROJECT_ROOT=/path/to/custom/project
npm run worker

# Or inline
PROJECT_ROOT=/path/to/custom/project npm run worker
```

### Option 3: Default (Current Working Directory)

```bash
# Uses process.cwd() if no flag or env var specified
cd /my/project
npm run worker
```

---

## Priority Order

The FlowWorker resolves the project root in this order (highest to lowest priority):

1. **CLI Flag**: `--project-root=<path>` (if provided)
2. **Environment Variable**: `PROJECT_ROOT` (if set)
3. **Default**: `process.cwd()` (current working directory)

**Example:**

```bash
# The CLI flag takes precedence over PROJECT_ROOT
PROJECT_ROOT=/path1 npm run worker -- --project-root=/path2
# → Uses /path2 (CLI flag wins)
```

---

## Implementation Details

### FlowWorker Constructor (line 73-80)

```typescript
constructor(
  wsUrl?: string,
  projectRoot: string = process.cwd(),
  interactive: boolean = false,
  preferredWorkerId?: string,
  enableUI: boolean = true
)
```

The `projectRoot` parameter defaults to `process.cwd()`.

### Entry Point Parsing (line 912-914)

```typescript
// Parse project root from CLI args or environment variable
const projectRootArg = process.argv.find(arg => arg.startsWith('--project-root='));
const projectRoot = projectRootArg ? projectRootArg.split('=')[1] : process.env.PROJECT_ROOT || process.cwd();
```

---

## Related Files Modified

- `packages/worker/src/flow/FlowWorker.ts`:
    - Added constructor documentation with PROJECT_ROOT/--project-root details
    - Entry point parsing for CLI flag and env var (lines 912-914)

- `bin/fleet-worker.js`:
    - Updated worker path to correct location: `packages/worker/src/flow/FlowWorker.ts`

---

## How It Works

### When Using CLI Flag

```bash
npm run worker -- --project-root=/my/project
```

1. `bin/fleet-worker.js` spawns tsx with all args
2. FlowWorker entry point receives `--project-root=/my/project`
3. Parser extracts value: `/my/project`
4. Passed to FlowWorker constructor
5. FlowRegistry, WorkspaceManager initialize with `/my/project`

### When Using Environment Variable

```bash
PROJECT_ROOT=/my/project npm run worker
```

1. Environment variable is set before process starts
2. FlowWorker checks `process.env.PROJECT_ROOT`
3. Uses value: `/my/project`
4. Same initialization as CLI flag

---

## Benefits

✅ **Flexibility**: Run worker against any project without cd'ing into it
✅ **CI/CD Friendly**: Easy to pass paths in automation scripts
✅ **Non-Breaking**: Defaults to current behavior (process.cwd()) if not specified
✅ **Consistent**: Same pattern as other CLI flags (--worker-id, --interactive)
✅ **Priority System**: CLI flag can override env var when needed
