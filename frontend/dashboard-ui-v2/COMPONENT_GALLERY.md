# Component Gallery - Dashboard UI v2

Visual reference guide for all components with their variants and states.

## UI Components

### Button

#### Variants
```
┌─────────────────┐
│   Primary       │ → Default blue/accent color
└─────────────────┘

┌─────────────────┐
│   Secondary     │ → Gray/neutral color
└─────────────────┘

┌─────────────────┐
│   Ghost         │ → Transparent, hover shows bg
└─────────────────┘

┌─────────────────┐
│   Danger        │ → Red for destructive actions
└─────────────────┘
```

#### Sizes
```
┌────────┐
│   SM   │ → Small (2rem height)
└────────┘

┌─────────────┐
│     MD      │ → Medium (2.5rem height) - Default
└─────────────┘

┌──────────────────┐
│       LG         │ → Large (3rem height)
└──────────────────┘
```

#### States
```
Normal:    ┌─────────────┐
           │   Button    │
           └─────────────┘

Hover:     ┌─────────────┐  ↗ Scales to 102%
           │   Button    │  ↗ Lifts slightly
           └─────────────┘

Active:    ┌─────────────┐  ↘ Scales to 98%
           │   Button    │  ↘ Pressed feel
           └─────────────┘

Disabled:  ┌─────────────┐  ⊗ 50% opacity
           │   Button    │  ⊗ No hover effect
           └─────────────┘
```

#### With Icons
```
┌──────────────────┐
│  ➕  Add Task    │
└──────────────────┘

┌──────────────────┐
│  ⚙️  Settings    │
└──────────────────┘

┌──────────────────┐
│  🗑️  Delete      │
└──────────────────┘
```

#### Animation Timeline
```
Hover:
0ms     ───────────────────> 200ms
Normal  [Springs to scale]   Hover

Tap:
0ms     ───────> 100ms
Hover   [Scales]  Tap
```

---

### Card

#### Basic States
```
┌────────────────────────────┐
│                            │
│  Basic Card                │
│  • No elevation            │
│  • Simple border           │
│                            │
└────────────────────────────┘

┌────────────────────────────┐ ↑ Shadow
│                            │ ↑
│  Elevated Card             │ ↑
│  • Box shadow              │ ↑
│  • Raised appearance       │ ↑
│                            │ ↑
└────────────────────────────┘ ↑
```

#### Interactive Card
```
Rest State:
┌────────────────────────────┐
│                            │
│  Interactive Card          │
│  • Clickable               │
│  • Hover effects           │
│                            │
└────────────────────────────┘

Hover State:
┌────────────────────────────┐ ↑ Lifts up 4px
│                            │ ↗ Scales to 102%
│  Interactive Card          │ ✨ Shadow grows
│  • Clickable               │
│  • Hover effects           │
│                            │
└────────────────────────────┘
```

#### Entrance Animation
```
Initial (invisible):
opacity: 0
y: +20px
          ↓
          ↓ 300ms
          ↓
Final (visible):
opacity: 1
y: 0px
```

---

### Badge

#### Variants (Colors)
```
 default   → Gray, neutral
 success   → Green, positive
 warning   → Yellow/Orange, caution
 error     → Red, negative
 info      → Blue, informational
```

#### Visual Examples
```
┌──────────┐
│ Default  │ → Background: gray-100, Text: gray-600
└──────────┘

┌──────────┐
│ Success  │ → Background: green-100, Text: green-600
└──────────┘

┌──────────┐
│ Warning  │ → Background: yellow-100, Text: yellow-600
└──────────┘

┌──────────┐
│  Error   │ → Background: red-100, Text: red-600
└──────────┘

┌──────────┐
│   Info   │ → Background: blue-100, Text: blue-600
└──────────┘
```

#### With Dot Indicator
```
┌────────────┐
│ ● Active   │ → Dot matches text color
└────────────┘

┌────────────┐
│ ● Online   │
└────────────┘
```

---

### Input

#### Basic States
```
┌─────────────────────────────────┐
│ Username                        │
│ ┌─────────────────────────────┐ │
│ │ Enter username...           │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘

With Value:
┌─────────────────────────────────┐
│ Username                        │
│ ┌─────────────────────────────┐ │
│ │ john_doe                    │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘

With Error:
┌─────────────────────────────────┐
│ Email                           │
│ ┌─────────────────────────────┐ │
│ │ invalid-email               │ │ ← Red border
│ └─────────────────────────────┘ │
│ ⚠ Invalid email address         │ ← Error message
└─────────────────────────────────┘
```

#### Focus States
```
Normal:
┌─────────────────────────────┐
│ Text input...               │ → Border: gray
└─────────────────────────────┘

Hover:
┌─────────────────────────────┐
│ Text input...               │ → Border: darker gray
└─────────────────────────────┘

Focus:
┌═════════════════════════════┐
│ Text input...               │ → Border: blue/accent
└═════════════════════════════┘ → Focus ring: 3px light blue
```

---

## Feature Components

### WorkerCard

```
┌──────────────────────────────────────────────┐
│ ● worker-001          TypeScript Worker    ✓ │
│   └─ Status           └─ Type          └─Badge│
│                                              │
│ ┌──────────────────────────────────────────┐ │
│ │ Current Task: Process configuration files│ │
│ │ ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░  45%              │ │ ← Animated progress
│ └──────────────────────────────────────────┘ │
│                                              │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐│
│ │Tasks   │ │Success │ │Avg Dur │ │CPU Use ││ ← Staggered fade-in
│ │  24    │ │  98.5% │ │ 2m 15s │ │  45.2% ││
│ └────────┘ └────────┘ └────────┘ └────────┘│
│                                              │
│ Connected: 10:23:45 | Last HB: 10:45:23    │
└──────────────────────────────────────────────┘
```

#### Animation Sequence
```
1. Card appears (fade + slide)      0ms
2. Header content                   +50ms
3. Current task expands (if any)    +100ms
4. Progress bar fills               +150ms
5. Metrics fade in (staggered):
   - Tasks Completed               +200ms
   - Success Rate                  +300ms
   - Avg Duration                  +400ms
   - CPU Usage                     +500ms
6. Footer content                   +600ms

Total: ~1.1 seconds for full appearance
```

---

### TaskQueue

```
┌──────────────────────────────────────────────┐
│ Task Queue                    [12 tasks]     │
├──────────────────────────────────────────────┤
│ ⚡ Execute workflow "data-pipeline"          │
│    Status: In Progress  Priority: High       │
│    Progress: ▓▓▓▓▓▓░░░░  60%                │
├──────────────────────────────────────────────┤
│ 📋 Generate report                           │
│    Status: Queued       Priority: Medium     │
├──────────────────────────────────────────────┤
│ ✅ Deploy to production                      │
│    Status: Completed    Priority: High       │
│    Duration: 3m 24s                          │
└──────────────────────────────────────────────┘
```

---

### SystemHealth

```
┌──────────────────────────────────────────────┐
│ System Health                            ✓   │
├──────────────────────────────────────────────┤
│ CPU Usage                                    │
│ ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░  45.2%                │
│                                              │
│ Memory Usage                                 │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░  68.4% (5.2 GB / 8 GB)│
│                                              │
│ Active Workers: 4  |  Queued Tasks: 12      │
│ Uptime: 2d 14h 32m  |  Last Update: 2s ago  │
└──────────────────────────────────────────────┘
```

---

### ActivityLog

```
┌──────────────────────────────────────────────┐
│ Activity Log                     [Clear All] │
├──────────────────────────────────────────────┤
│ ✓ 10:45:23  Task completed successfully      │
│   └ worker-001                               │
├──────────────────────────────────────────────┤
│ ⚠ 10:44:15  High memory usage detected       │
│   └ system                                   │
├──────────────────────────────────────────────┤
│ ℹ 10:42:30  New task queued                  │
│   └ task-queue                               │
├──────────────────────────────────────────────┤
│ ✗ 10:40:12  Worker disconnected              │
│   └ worker-003                               │
└──────────────────────────────────────────────┘
```

---

## Page Layouts

### DashboardPage

```
┌─────────────────────────────────────────────────────────────┐
│ ⚡ Agent Fleet Dashboard        [➕ Add Task] [⚙️ Settings] │
│ ● Connected                                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ [System Health Widget] ←────────────────── Animates first  │
│                                                             │
│ Workers ←──────────────────────────────── Animates second  │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                   │
│ │ Worker 1 │ │ Worker 2 │ │ Worker 3 │ ← Staggered       │
│ └──────────┘ └──────────┘ └──────────┘                   │
│                                                             │
│ ┌─────────────────────┐ ┌─────────────────────┐          │
│ │   Task Queue       │ │   Activity Log     │          │
│ │                    │ │                    │          │
│ │                    │ │                    │          │
│ └─────────────────────┘ └─────────────────────┘          │
│ └────────────────── Animates third                        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Agent Fleet v2.0 • 4 workers • 12 active tasks             │
└─────────────────────────────────────────────────────────────┘
```

---

## Color Palette

### UI Colors
```
Primary (Accent):    #3B82F6 (blue-500)
Primary Hover:       #2563EB (blue-600)

Success:            #10B981 (green-500)
Success Light:      #D1FAE5 (green-100)

Warning:            #F59E0B (amber-500)
Warning Light:      #FEF3C7 (amber-100)

Error:              #EF4444 (red-500)
Error Light:        #FEE2E2 (red-100)

Info:               #3B82F6 (blue-500)
Info Light:         #DBEAFE (blue-100)
```

### Neutral Colors
```
Text Primary:       var(--color-text-primary)
Text Secondary:     var(--color-text-secondary)
Text Tertiary:      var(--color-text-tertiary)

Background:         var(--color-bg-primary)
Background Elevated: var(--color-bg-elevated)
Background Tertiary: var(--color-bg-tertiary)

Border:             var(--color-border-primary)
Border Secondary:   var(--color-border-secondary)
```

---

## Typography Scale

```
Display:   3rem    (48px)
H1:        2rem    (32px)
H2:        1.5rem  (24px)
H3:        1.25rem (20px)
Base:      1rem    (16px)
Small:     0.875rem (14px)
XSmall:    0.75rem (12px)
```

---

## Spacing Scale

```
space-1:   0.25rem  (4px)
space-2:   0.5rem   (8px)
space-3:   0.75rem  (12px)
space-4:   1rem     (16px)
space-6:   1.5rem   (24px)
space-8:   2rem     (32px)
space-12:  3rem     (48px)
```

---

## Border Radius

```
radius-sm:   0.25rem  (4px)   → Badges
radius-md:   0.5rem   (8px)   → Inputs, Buttons
radius-lg:   0.75rem  (12px)  → Cards
radius-full: 9999px           → Dots, Pills
```

---

## Shadows

```
shadow-sm:   0 1px 2px rgba(0,0,0,0.05)
shadow-md:   0 4px 6px rgba(0,0,0,0.07)
shadow-lg:   0 10px 15px rgba(0,0,0,0.1)
shadow-xl:   0 20px 25px rgba(0,0,0,0.1)
```

---

## Animation Durations

```
Fast:        150ms  → Micro-interactions
Normal:      300ms  → Most transitions
Slow:        400ms  → Entrances
Very Slow:   500ms  → Progress bars

Stagger:     100ms  → Delay between items
```

---

## Z-Index Layers

```
Base:        0      → Normal content
Elevated:    10     → Cards with elevation
Dropdown:    100    → Dropdowns, popovers
Modal:       1000   → Modals, dialogs
Tooltip:     1100   → Tooltips
Notification: 1200  → Toast notifications
```

---

## Responsive Breakpoints

```
Mobile:      < 768px
Tablet:      768px - 1024px
Desktop:     > 1024px
Wide:        > 1440px
```

---

## Accessibility

### Focus States
```
All interactive elements have visible focus:
- 2px outline in accent color
- 2px offset from element
- Visible in all themes
```

### Keyboard Navigation
```
Tab:         Move to next element
Shift+Tab:   Move to previous element
Enter:       Activate button/link
Space:       Activate button
Escape:      Close modal/panel
```

### Screen Reader Support
```
- All inputs have labels (visible or sr-only)
- Errors announced with role="alert"
- Status changes announced
- Dynamic content updates announced
```

---

## Theme Support

### Light Theme (Default)
- High contrast text on light backgrounds
- Soft shadows for depth
- Cool color palette

### Dark Theme (Future)
- Light text on dark backgrounds
- Brighter accent colors
- Adjusted shadow opacity

---

## Component Composition Examples

### Form with Multiple Components
```
┌─────────────────────────────────────────────┐
│ User Profile                        [Edit]  │ ← Badge
├─────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────┐ │
│ │ Full Name                               │ │ ← Input
│ │ ┌─────────────────────────────────────┐ │ │
│ │ │ John Doe                            │ │ │
│ │ └─────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ Email                                   │ │
│ │ ┌─────────────────────────────────────┐ │ │
│ │ │ john@example.com                    │ │ │
│ │ └─────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ [Save Changes]  [Cancel] ←────────── Buttons│
└─────────────────────────────────────────────┘
```

---

**Visual Design Version**: 2.0
**Last Updated**: 2025-12-06
**Component Count**: 4 UI + 5 Feature = 9 Total
