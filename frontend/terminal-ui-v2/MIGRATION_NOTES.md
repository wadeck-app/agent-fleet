# Terminal UI - Migration to shadcn/ui + Framer Motion

## Summary

This version of terminal-ui has been migrated from pure Radix UI to shadcn/ui with Framer Motion animations while maintaining all existing functionality and the terminal/CLI aesthetic.

## Changes Made

### 1. Dependencies Added

- **Tailwind CSS**: Core styling framework (`tailwindcss`, `autoprefixer`, `postcss`)
- **shadcn/ui dependencies**: `class-variance-authority`, `tailwind-merge`, `lucide-react`
- **Radix UI additions**: `@radix-ui/react-label`, `@radix-ui/react-slot`
- **Tailwind plugins**: `tailwindcss-animate`

Note: Framer Motion was already installed.

### 2. Configuration Files

- `tailwind.config.js` - Tailwind configuration with terminal-specific animations
- `postcss.config.js` - PostCSS configuration
- `components.json` - shadcn/ui configuration
- `src/lib/utils.ts` - Utility function (`cn`) for class merging

### 3. Global Styles

Updated `src/styles/globals.scss`:
- Added Tailwind directives (`@tailwind base/components/utilities`)
- Added shadcn/ui CSS variables for dark/light themes
- Maintained existing theme variables for backward compatibility

### 4. UI Components Migrated (Generic Reusable Layer)

All components in `src/components/ui/`:

- **Button** (`Button.tsx`)
  - Now uses shadcn/ui variants via `class-variance-authority`
  - Integrated Framer Motion for hover/tap animations
  - Maintained API compatibility (variant, size, fullWidth props)

- **Dialog/Modal** (`Dialog/Dialog.tsx`, `Modal/Modal.tsx`)
  - Created new Dialog component using shadcn/ui patterns
  - Modal exports from Dialog for backward compatibility
  - Added Framer Motion animations (fade, scale, slide)

- **Input** (`Input.tsx`)
  - Migrated to Tailwind classes
  - Maintained label and error handling
  - Full API compatibility

- **Select** (`Select/Select.tsx`)
  - New component using Radix Select with shadcn/ui styling
  - Replaces direct Radix usage in feature components

- **Checkbox** (`Checkbox/Checkbox.tsx`)
  - New component wrapping Radix Checkbox
  - shadcn/ui styling with terminal aesthetic

- **Label** (`Label/Label.tsx`)
  - New component for form labels
  - Consistent typography with monospace font

### 5. Feature Components Updated

All components in `src/components/features/`:

- **Terminal** (`Terminal.tsx`)
  - Added Framer Motion animations:
    - Staggered line appearance
    - Fade-in transitions for timestamps/levels/messages
    - Blinking cursor for empty states
    - Typing effect for "Waiting for logs..."
  - Layout animations for smooth transitions

- **WorkerList** (`WorkerList.tsx`)
  - List item animations (fade, slide, scale)
  - Status pulse animations (idle/active states)
  - Hover/tap feedback
  - Smooth expand/collapse for current tasks
  - AnimatePresence for list updates

- **ConfigModal** (`ConfigModal.tsx`)
  - Updated to use new shadcn/ui Select and Checkbox
  - Uses new Input component
  - Maintains all configuration options

- **TaskModal** (`TaskModal.tsx`)
  - Added sequential animations for form fields
  - Button hover/tap animations
  - Smooth transitions when switching task types

- **CommandPalette** (`CommandPalette.tsx`)
  - Overlay fade-in/out
  - Modal slide and scale animations
  - Staggered command list appearance
  - Smooth keyboard navigation visual feedback
  - Icon pop animations

- **StatsBar** (`StatsBar.tsx`)
  - Animated counter updates (scale spring)
  - Staggered appearance of stat groups
  - Hover pulse effects

### 6. Styling Approach

- **Hybrid approach**: Tailwind for new components, SCSS modules for feature-specific styles
- **Theme system**: Uses shadcn/ui CSS variables alongside existing theme variables
- **Monospace font**: Enforced via Tailwind (`font-mono` class) for terminal aesthetic
- **Dark theme**: Primary theme with proper contrast
- **No border radius**: Set to `0rem` for sharp, terminal-like appearance

## Animation Highlights

### Terminal Aesthetics
- **Typing effects**: Cursor blink, character-by-character reveals
- **Line animations**: Logs appear with slide-from-left, maintaining terminal flow
- **Status indicators**: Pulse animations for active/idle worker states

### User Feedback
- **Buttons**: Subtle scale on hover/tap (spring physics)
- **Lists**: Stagger animations for visual hierarchy
- **Modals**: Smooth scale + slide entrance/exit
- **Counters**: Spring animations when values change

### Performance
- **Layout animations**: Used sparingly with Framer Motion's `layout` prop
- **AnimatePresence**: Proper exit animations for removed elements
- **GPU acceleration**: Transform-based animations (scale, translate)

## API Compatibility

All components maintain backward-compatible APIs:
- Props interfaces unchanged
- Component exports unchanged
- Feature components can be used as drop-in replacements

## Build & Development

```bash
# Install dependencies
npm install

# Development
npm run dev

# Build
npm run build

# Preview
npm run preview
```

## File Structure

```
src/
├── components/
│   ├── ui/                    # Generic reusable components
│   │   ├── Button/
│   │   ├── Dialog/
│   │   ├── Input/
│   │   ├── Select/
│   │   ├── Checkbox/
│   │   ├── Label/
│   │   └── Modal/             # Re-exports Dialog
│   └── features/              # Feature-specific components
│       ├── Terminal/
│       ├── WorkerList/
│       ├── ConfigModal/
│       ├── TaskModal/
│       ├── CommandPalette/
│       └── StatsBar/
├── lib/
│   └── utils.ts              # Utility functions (cn)
└── styles/
    ├── globals.scss          # Global styles + Tailwind
    └── theme.scss            # Theme variables
```

## Notes

- SCSS modules are retained for feature components to maintain existing styles
- Tailwind is used primarily for UI components and utility classes
- All animations can be disabled via `prefers-reduced-motion` media query
- Light theme is defined but not fully implemented (noted in ConfigModal)

## Future Improvements

- Complete light theme implementation
- Add Storybook stories for all components
- Add unit tests for new components
- Consider migrating more SCSS to Tailwind utility classes
- Add more terminal-themed animations (scan lines, glitch effects)
