# Component Inventory - Terminal UI v2

Complete list of all components after shadcn/ui + Framer Motion migration.

## UI Components (Generic/Reusable)

Located in `src/components/ui/`

### Button
- **Path**: `src/components/ui/Button/Button.tsx`
- **Type**: shadcn/ui + Framer Motion
- **Features**:
  - Variants: primary, secondary, ghost, danger
  - Sizes: sm, md, lg
  - Spring animations on hover/tap
  - Full width option
- **Props**: `ButtonProps` (variant, size, fullWidth, asChild, ...HTMLMotionProps)
- **Animations**: Scale spring (hover: 1.02, tap: 0.98)

### Dialog
- **Path**: `src/components/ui/Dialog/Dialog.tsx`
- **Type**: shadcn/ui + Framer Motion
- **Features**:
  - Overlay with backdrop blur
  - Sizes: sm, md, lg, xl
  - Modal entrance/exit animations
  - Auto-close on overlay click
- **Exports**: Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription
- **Animations**: Fade + scale + slide

### Modal
- **Path**: `src/components/ui/Modal/Modal.tsx`
- **Type**: Wrapper (re-exports Dialog)
- **Features**: Backward-compatible API
- **Props**: `ModalProps` (isOpen, onClose, title, children, footer, size)

### Input
- **Path**: `src/components/ui/Input/Input.tsx`
- **Type**: shadcn/ui
- **Features**:
  - Label support
  - Error state and message
  - Full width option
  - Monospace font
- **Props**: `InputProps` (label, error, fullWidth, ...HTMLInputAttributes)

### Select
- **Path**: `src/components/ui/Select/Select.tsx`
- **Type**: shadcn/ui (Radix wrapper)
- **Features**:
  - Dropdown with keyboard navigation
  - Scroll indicators
  - Portal rendering
  - Item indicator (checkmark)
- **Exports**: Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel, SelectSeparator

### Checkbox
- **Path**: `src/components/ui/Checkbox/Checkbox.tsx`
- **Type**: shadcn/ui (Radix wrapper)
- **Features**:
  - Check indicator animation
  - Focus ring
  - Disabled state
- **Props**: CheckboxProps (extends Radix CheckboxPrimitive.Root)

### Label
- **Path**: `src/components/ui/Label/Label.tsx`
- **Type**: shadcn/ui (Radix wrapper)
- **Features**:
  - Monospace font
  - Peer state awareness
  - Accessible for attribute binding
- **Props**: LabelProps (extends Radix LabelPrimitive.Root)

### Panel
- **Path**: `src/components/ui/Panel/Panel.tsx`
- **Type**: Generic container (retained from original)
- **Features**: Layout wrapper for sections
- **Status**: Not migrated (SCSS-based)

## Feature Components

Located in `src/components/features/`

### Terminal
- **Path**: `src/components/features/Terminal/Terminal.tsx`
- **Type**: Feature component + Framer Motion
- **Features**:
  - Log line display with levels (info, warn, error, debug, success)
  - Search/filter functionality
  - Auto-scroll option
  - Timestamp formatting
  - Level symbols
  - Search highlighting
- **Props**: `TerminalProps` (lines, autoScroll, searchTerm, formatTimestamp, getLevelSymbol, highlightSearchTerm)
- **Animations**:
  - Staggered line appearance (0.02s delay per line)
  - Timestamp fade-in
  - Level badge scale spring
  - Message fade-in
  - Cursor blink for empty states
  - Typing effect for "Waiting for logs..."
- **Styles**: `Terminal.module.scss`

### WorkerList
- **Path**: `src/components/features/WorkerList/WorkerList.tsx`
- **Type**: Feature component + Framer Motion
- **Features**:
  - Worker cards with status
  - Worker selection
  - Stats display (tasks completed, in progress)
  - Uptime display
  - Current task display
- **Props**: `WorkerListProps` (workers, selectedWorkerId, onSelectWorker, getStatusIcon, getWorkerTypeLabel, formatUptime)
- **Animations**:
  - List item entrance (stagger 0.05s)
  - Status pulse (idle/active)
  - Hover scale (1.02)
  - Tap scale (0.98)
  - Current task expand/collapse
  - Stats hover pulse
- **Styles**: `WorkerList.module.scss`

### ConfigModal
- **Path**: `src/components/features/ConfigModal/ConfigModal.tsx`
- **Type**: Feature component using UI components
- **Features**:
  - Orchestrator URL configuration
  - Log level selection
  - Max log entries setting
  - Auto-reconnect toggle
  - Theme selection
- **Props**: `ConfigModalProps` (isOpen, onClose, config, onSave)
- **UI Components Used**: Modal, Button, Input, Select, Checkbox, Label
- **Styles**: `ConfigModal.module.scss`

### TaskModal
- **Path**: `src/components/features/TaskModal/TaskModal.tsx`
- **Type**: Feature component + Framer Motion
- **Features**:
  - Task creation form
  - Task type selection (Flow/Command)
  - YAML/command editor
  - Template switching
  - Help text
- **Props**: `TaskModalProps` (isOpen, onClose, onSubmit)
- **Animations**:
  - Content fade-in
  - Sequential field appearance (0.1s delay between fields)
  - Button hover/tap feedback
  - Editor fade-in
  - Help text fade-in
- **UI Components Used**: Modal, Button, Input, Label
- **Styles**: `TaskModal.module.scss`

### CommandPalette
- **Path**: `src/components/features/CommandPalette/CommandPalette.tsx`
- **Type**: Feature component + Framer Motion
- **Features**:
  - Command search
  - Keyboard navigation (arrows, enter, escape)
  - Category grouping
  - Command icons and shortcuts
  - Mouse hover support
- **Props**: `CommandPaletteProps` (isOpen, onClose, commands)
- **Exports**: CommandPalette, Command (interface)
- **Animations**:
  - Overlay fade (0.2s)
  - Modal spring (scale + slide)
  - Input wrapper fade
  - Icon scale spring
  - Staggered category appearance
  - Staggered command items
  - Hover slide (4px right)
  - Empty state fade
- **Styles**: `CommandPalette.module.scss`

### StatsBar
- **Path**: `src/components/features/StatsBar/StatsBar.tsx`
- **Type**: Feature component + Framer Motion
- **Features**:
  - Worker count by status (active/idle/error/total)
  - Task count (active/completed)
  - Visual separator
- **Props**: `StatsBarProps` (activeCount, idleCount, errorCount, totalWorkers, activeTasks, completedTasks)
- **Animations**:
  - Bar fade-in (0.5s)
  - Staggered stat groups (0.1s delay)
  - Value scale spring on change
  - Separator scale spring
  - Hover pulse (scale 1.1)
- **Styles**: `StatsBar.module.scss`

## Index Files

### UI Components Index
- **Path**: `src/components/ui/index.ts`
- **Exports**: Button, buttonVariants, Modal, Dialog components, Input, Select components, Checkbox, Label, Panel

### Features Index
- **Path**: `src/components/features/index.ts`
- **Exports**: All feature components

## Styling Files

### Global Styles
- **Path**: `src/styles/globals.scss`
- **Contents**:
  - Tailwind directives (@tailwind base/components/utilities)
  - shadcn/ui CSS variables (dark/light themes)
  - Global resets
  - Scrollbar styling
  - Typography
  - Utilities

### Theme Variables
- **Path**: `src/styles/theme.scss`
- **Contents**:
  - CSS custom properties
  - Color palette (terminal theme)
  - Typography scale
  - Spacing scale
  - Border radius values
  - Transitions

## Utilities

### Class Name Merger
- **Path**: `src/lib/utils.ts`
- **Function**: `cn(...inputs: ClassValue[]) => string`
- **Purpose**: Merge Tailwind classes with clsx and tailwind-merge
- **Usage**: Prevents class conflicts, enables conditional classes

## Animation Summary by Component

### High Animation Intensity
1. **CommandPalette**: Most animated (overlay, modal, items, icons)
2. **Terminal**: Rich animations (lines, cursor, typing effect)
3. **WorkerList**: List animations + status pulses

### Medium Animation Intensity
1. **TaskModal**: Sequential field animations
2. **StatsBar**: Counter animations + hover effects

### Low Animation Intensity
1. **ConfigModal**: Uses Modal animations only
2. **Button**: Simple hover/tap spring
3. **Input**: No animations (static)
4. **Select**: Radix default animations
5. **Checkbox**: Check indicator animation

## SCSS Modules Retained

These components still use SCSS modules (not fully migrated to Tailwind):

- Terminal.module.scss
- WorkerList.module.scss
- ConfigModal.module.scss
- TaskModal.module.scss
- CommandPalette.module.scss
- StatsBar.module.scss
- Button.module.scss (removed - now uses Tailwind)
- Modal.module.scss (removed - now uses Tailwind)
- Input.module.scss (removed - now uses Tailwind)
- Panel.module.scss (retained)

## Removed Files

These files were removed during migration:
- `src/components/ui/Button/Button.module.scss` (replaced by Tailwind)
- `src/components/ui/Modal/Modal.module.scss` (replaced by Tailwind)
- `src/components/ui/Input/Input.module.scss` (replaced by Tailwind)

## Component Dependencies

```
App
├── DashboardPage
│   ├── StatsBar (Framer Motion)
│   ├── WorkerList (Framer Motion)
│   ├── Panel
│   └── Terminal (Framer Motion)
├── CommandPalette (Framer Motion)
├── TaskModal (Framer Motion)
│   ├── Modal (shadcn + Framer)
│   ├── Button (shadcn + Framer)
│   ├── Input (shadcn)
│   └── Label (shadcn)
└── ConfigModal
    ├── Modal (shadcn + Framer)
    ├── Button (shadcn + Framer)
    ├── Input (shadcn)
    ├── Select (shadcn)
    ├── Checkbox (shadcn)
    └── Label (shadcn)
```

## Testing Checklist

To verify all components work correctly:

- [ ] Button: Test all variants (primary, secondary, ghost, danger)
- [ ] Button: Test all sizes (sm, md, lg)
- [ ] Button: Test hover/tap animations
- [ ] Dialog/Modal: Test open/close animations
- [ ] Dialog/Modal: Test all sizes (sm, md, lg, xl)
- [ ] Input: Test with/without label and error
- [ ] Select: Test dropdown open/close and selection
- [ ] Checkbox: Test check/uncheck animations
- [ ] Terminal: Test log lines appearing with animations
- [ ] Terminal: Test cursor blink and typing effect
- [ ] Terminal: Test search filtering
- [ ] WorkerList: Test worker selection and animations
- [ ] WorkerList: Test status pulse animations
- [ ] ConfigModal: Test all form fields
- [ ] ConfigModal: Test save/reset functionality
- [ ] TaskModal: Test flow/command switching
- [ ] TaskModal: Test field animations
- [ ] CommandPalette: Test search and filtering
- [ ] CommandPalette: Test keyboard navigation
- [ ] CommandPalette: Test command execution
- [ ] StatsBar: Test counter updates and animations
- [ ] StatsBar: Test hover effects

---

**Component Count**: 13 UI + 6 Feature = 19 Total Components
**Animation Components**: 9 (Button, Dialog, Terminal, WorkerList, TaskModal, CommandPalette, StatsBar, Checkbox, ConfigModal uses Modal)
**Fully Migrated to Tailwind**: 6 (Button, Dialog, Modal, Input, Select, Checkbox, Label)
**Retained SCSS**: 7 (Terminal, WorkerList, ConfigModal, TaskModal, CommandPalette, StatsBar, Panel)
