# Radix UI Best Practices

Last updated: 2025-12-14

**Purpose:** Essential guide for Radix UI composition, styling with Tailwind, and building accessible components.

**Load this when:** Working with Radix UI components in `packages/frontend/src/components/`.

## Core Principles

| Principle                      | Description                                 |
| ------------------------------ | ------------------------------------------- |
| Unstyled primitives            | Radix provides behavior, you provide styles |
| Accessibility built-in         | WAI-ARIA compliant by default               |
| Composition over configuration | Assemble parts to build components          |
| `asChild` pattern              | Control rendered elements                   |
| Controlled & uncontrolled      | Support both patterns                       |

## Project Architecture

### Component Organization

```
packages/frontend/src/components/
├── ui/               # Wrapped Radix components (project style)
│   ├── Button.tsx
│   ├── Dialog.tsx
│   ├── Select.tsx
│   └── ...
```

### Wrapper Pattern

| Rule          | Description                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------- |
| **DO**        | Create wrappers in `components/ui/`, apply project styling, set default props, export clean API |
| **DON'T**     | Use Radix primitives directly in features (no consistency, repeated code, hard to update)       |
| **Reference** | `.claude/docs/examples/radix/wrapper-pattern.tsx`                                               |

## Radix Component Structure

### Anatomy Pattern

Most Radix components have multiple parts. Example (Dialog):

| Part               | Purpose                           |
| ------------------ | --------------------------------- |
| Dialog.Root        | State container                   |
| Dialog.Trigger     | Opens dialog                      |
| Dialog.Portal      | Renders in portal                 |
| Dialog.Overlay     | Background overlay                |
| Dialog.Content     | Main content                      |
| Dialog.Title       | Accessible title (required)       |
| Dialog.Description | Accessible description (required) |
| Dialog.Close       | Close button                      |

**Composition:** Assemble parts to create complete component.
**Reference:** `.claude/docs/examples/radix/composition.tsx`

## Styling with Tailwind

### Strategy

| Step              | Method                                          |
| ----------------- | ----------------------------------------------- |
| 1. Apply classes  | Use `className` prop with Tailwind utilities    |
| 2. Responsive     | Use Tailwind responsive prefixes (`md:`, `lg:`) |
| 3. State variants | Use `data-*` attributes                         |
| 4. Animation      | Combine Tailwind animations with Radix state    |

### Radix Data Attributes

| Attribute                   | Usage             | Example                          |
| --------------------------- | ----------------- | -------------------------------- |
| `data-state="open\|closed"` | Open/closed state | `data-[state=open]:rotate-180`   |
| `data-disabled`             | Disabled state    | `data-[disabled]:opacity-50`     |
| `data-highlighted`          | Hover/focus state | `data-[highlighted]:bg-gray-100` |
| `data-selected`             | Selected state    | `data-[selected]:bg-blue-500`    |

**Reference:** `.claude/docs/examples/radix/styling.tsx`

## `asChild` Pattern - IMPORTANT

| Aspect        | Details                                                                          |
| ------------- | -------------------------------------------------------------------------------- |
| **Problem**   | Radix renders default element (usually `<button>`)                               |
| **Solution**  | `asChild` merges props into child element                                        |
| **Use when**  | Custom element type, merge with custom component, avoid wrapper divs             |
| **Pattern**   | `<Dialog.Trigger asChild><button className="...">Open</button></Dialog.Trigger>` |
| **Reference** | `.claude/docs/examples/radix/as-child.tsx`                                       |

## Accessibility

### Built-in (Radix Handles)

ARIA attributes, focus management, keyboard navigation, screen reader support.

### Your Responsibilities

| Must Provide   | Description                            |
| -------------- | -------------------------------------- |
| Labels         | Use `Dialog.Title`, `Label` components |
| Semantic HTML  | Use correct elements                   |
| Visible focus  | Style focus states                     |
| Error messages | Associate with form controls           |
| Loading states | Indicate async operations              |

**Reference:** `.claude/docs/examples/radix/accessibility.tsx`

## Common Radix Components

| Component         | Parts                                                              | Use For                               | Reference       |
| ----------------- | ------------------------------------------------------------------ | ------------------------------------- | --------------- |
| Dialog / Modal    | Root, Trigger, Portal, Overlay, Content, Title, Description, Close | Modals, alerts, confirmations         | `dialog.tsx`    |
| Select / Dropdown | Root, Trigger, Portal, Content, Viewport, Item, ItemText           | Dropdowns, select inputs              | `select.tsx`    |
| Popover           | Root, Trigger, Anchor, Portal, Content, Close                      | Popovers, tooltips (with positioning) | `popover.tsx`   |
| Accordion         | Root, Item, Header, Trigger, Content                               | Collapsible content sections          | `accordion.tsx` |
| Checkbox / Radio  | Root, Indicator                                                    | Form controls                         | `checkbox.tsx`  |
| Tabs              | Root, List, Trigger, Content                                       | Tab navigation                        | `tabs.tsx`      |

All examples in `.claude/docs/examples/radix/`

## Controlled vs Uncontrolled

| Mode                   | State Management         | When to Use                                                  | Reference        |
| ---------------------- | ------------------------ | ------------------------------------------------------------ | ---------------- |
| Uncontrolled (default) | Radix manages internally | Most cases, simpler                                          | `controlled.tsx` |
| Controlled             | You manage with useState | Programmatic control, sync with other state, prevent default | `controlled.tsx` |

**Pattern (controlled):** Pass `open={state}` and `onOpenChange={setState}` props to Root component.

## Portal Usage

| Aspect        | Details                                                                                 |
| ------------- | --------------------------------------------------------------------------------------- |
| **What**      | Render component outside DOM hierarchy (in `<body>`)                                    |
| **Why**       | Avoid z-index issues, avoid overflow clipping, better accessibility                     |
| **Pattern**   | `<Dialog.Portal><Dialog.Overlay /><Dialog.Content>...</Dialog.Content></Dialog.Portal>` |
| **Rule**      | Most Radix overlay components should use Portal                                         |
| **Reference** | `.claude/docs/examples/radix/portal.tsx`                                                |

## Animation & Theming

### Animation

Use Radix data attributes + Tailwind animations: `className="data-[state=open]:animate-fadeIn data-[state=closed]:animate-fadeOut"`

Define custom animations in `tailwind.config.js` under `theme.extend.keyframes` and `theme.extend.animation`.

**Reference:** `.claude/docs/examples/radix/animation.tsx`

### Theming

1. Define theme variables in CSS/Tailwind config
2. Reference variables in components
3. Switch themes by changing variable values

**Tailwind pattern:** Define colors like `'dialog-overlay': 'rgba(0, 0, 0, 0.5)'` in config.

**Reference:** `.claude/docs/examples/radix/theming.tsx`

## Form Integration

| Radix Form Controls                           | Integration Steps                                                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Checkbox, Radio Group, Select, Switch, Slider | 1. Wrap in standard HTML `<form>`, 2. Use `Label` for associations, 3. Standard form handling, 4. Client + server validation |

**Reference:** `.claude/docs/examples/radix/forms.tsx`

## Anti-Patterns

| Anti-Pattern                          | Problem                       | Solution                                   |
| ------------------------------------- | ----------------------------- | ------------------------------------------ |
| Using primitives directly in features | No consistency, repeated code | Create wrapper in `components/ui/`         |
| Missing accessibility                 | Unusable for screen readers   | Always include Title/Description in Dialog |
| Ignoring Portal                       | Z-index issues                | Use Portal for overlays                    |
| Overriding Radix behavior             | Breaks accessibility          | Work with Radix patterns                   |
| Inline styling                        | Repetition, no consistency    | Create styled wrapper component            |

**Reference:** `.claude/docs/examples/radix/antipatterns.tsx`

## TypeScript Patterns

**Extend Radix props:** `type MyDialogProps = { title: string; children: ReactNode } & Dialog.DialogProps`

Then spread in component: `<Dialog.Root {...props}>`

**Reference:** `.claude/docs/examples/radix/typescript.tsx`

## Quick Checklist

When working with Radix UI, verify:

- [ ] Wrapper created in `components/ui/` (not using primitives directly)
- [ ] Project styling applied consistently
- [ ] Title and Description included in Dialog/Modal
- [ ] Portal used for overlays
- [ ] Data attributes used for state-based styling
- [ ] TypeScript props extended correctly
- [ ] Focus states styled
- [ ] Keyboard navigation tested

## Related Documentation

- `.claude/docs/frontend.md` - Frontend architecture patterns
- `.claude/docs/react.md` - React-specific best practices
- `.claude/kb/ui-animation.md` - Animation lessons (Framer Motion + Radix)
- `.claude/docs/examples/radix/` - All code examples
