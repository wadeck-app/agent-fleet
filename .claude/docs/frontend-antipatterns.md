# Frontend Anti-Patterns

Last updated: 2025-12-14

**Reference document** - Load when debugging issues or reviewing code.

---

## 1. Business Logic in Generic Components

| Issue            | Description                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| **Problem**      | Generic components become feature-specific, not reusable                                           |
| **Symptom**      | Button/Input components fetching data, making decisions                                            |
| **Bad Pattern**  | `Button` component calls `fetchUser()`, checks permissions                                         |
| **Good Pattern** | Generic `Button` accepts `disabled` prop; feature component `UserActionButton` uses hook for logic |
| **Reference**    | `.claude/docs/examples/packages/frontend/components/generic-component.tsx`                         |

---

## 2. Direct Component-to-Component Communication

| Issue            | Description                                                             |
| ---------------- | ----------------------------------------------------------------------- |
| **Problem**      | Tight coupling, hard to test, unpredictable data flow                   |
| **Symptom**      | Using refs to call methods on child components directly                 |
| **Bad Pattern**  | `childRef.current?.doSomething()`                                       |
| **Good Pattern** | Props and state lifting: `<Child data={data} onDataChange={setData} />` |
| **Reference**    | `.claude/docs/examples/packages/frontend/state/props-communication.tsx` |

---

## 3. API Calls Directly in Components

| Issue            | Description                                                            |
| ---------------- | ---------------------------------------------------------------------- |
| **Problem**      | Hard to test, violates separation of concerns, no transformation layer |
| **Symptom**      | `fetch()` or axios directly in component useEffect                     |
| **Bad Pattern**  | Component calls `fetch('/api/tasks')` in useEffect                     |
| **Good Pattern** | `apiClient → Repository → Service → Hook → Component`                  |
| **Reference**    | `.claude/docs/examples/packages/frontend/data-flow/`                   |

---

## 4. Using Context for <4 Components

| Issue            | Description                                                       |
| ---------------- | ----------------------------------------------------------------- |
| **Problem**      | Unnecessary complexity, harder to understand data flow            |
| **Symptom**      | Context wrapping 2-3 components only                              |
| **Bad Pattern**  | Context for form with 2 child components                          |
| **Good Pattern** | Props for <4 components, Context for >4-5 components              |
| **Reference**    | `.claude/docs/examples/packages/frontend/state/context-usage.tsx` |

---

## 5. Styling in Page Components

| Issue            | Description                                                                         |
| ---------------- | ----------------------------------------------------------------------------------- |
| **Problem**      | Pages coupled to layouts, hard to reuse components                                  |
| **Symptom**      | Page component has flex/grid layout, padding, gap classes                           |
| **Bad Pattern**  | `<div className="flex padding-20 gap-10"><TaskSidebar /><TaskList /></div>`         |
| **Good Pattern** | `<MainLayout sidebar={<TaskSidebar />}><TaskList /></MainLayout>`                   |
| **Reference**    | `.claude/docs/examples/packages/frontend/styling/page-minimal-styling-tailwind.tsx` |

**Styling Distribution Rule:**

Styling should follow a clear hierarchy (see `.claude/docs/frontend.md`):

- **Base components** (primitives, forms): Maximum styling (89+ classes via CVA)
- **Intermediate components** (layouts, domain): Minimal styling (structural only)
- **Page components**: Quasi none (0-5 classes max, structural only)

**Acceptable in pages:** Container width, responsive breakpoints (`w-full sm:w-64`), icon sizing (`size-4`)

**Not acceptable in pages:** Layout (flex/grid), colors, spacing (padding/margin/gap), borders, shadows

---

## 6. Hardcoded Colors

| Issue            | Description                                                                 |
| ---------------- | --------------------------------------------------------------------------- |
| **Problem**      | Themes don't work, inconsistent design, hard to maintain                    |
| **Symptom**      | Using `#3b82f6`, `#ffffff`, `rgb()` values directly                         |
| **Bad Pattern**  | `className="bg-[#3b82f6] text-[#ffffff]"`                                   |
| **Good Pattern** | `className="bg-primary text-primary-foreground"` (theme colors)             |
| **Reference**    | `.claude/docs/examples/packages/frontend/styling/theme-system-tailwind.css` |

---

## 7. Inline Styles Instead of Tailwind

| Issue            | Description                                                              |
| ---------------- | ------------------------------------------------------------------------ |
| **Problem**      | Breaks consistency, harder to maintain, no responsive/theme support      |
| **Symptom**      | `style={{ padding: '16px', backgroundColor: '#fff' }}`                   |
| **Bad Pattern**  | Inline styles for layout/colors                                          |
| **Good Pattern** | Tailwind utilities: `className="flex bg-background p-4"`                 |
| **Reference**    | `.claude/docs/examples/packages/frontend/styling/tailwind-component.tsx` |

---

## 8. Not Using cn() for Conditional Classes

| Issue            | Description                                                                             |
| ---------------- | --------------------------------------------------------------------------------------- |
| **Problem**      | Complex className strings, hard to read conditional styling                             |
| **Symptom**      | String concatenation with ternary operators                                             |
| **Bad Pattern**  | ``className={`btn ${isActive ? 'bg-blue' : 'bg-gray'} ${isLarge && 'text-lg'}`}``       |
| **Good Pattern** | `className={cn('btn', isActive ? 'bg-primary' : 'bg-secondary', isLarge && 'text-lg')}` |
| **Reference**    | `.claude/docs/examples/packages/frontend/styling/tailwind-component.tsx`                |

---

## 9. Testing Implementation Details

| Issue            | Description                                                                           |
| ---------------- | ------------------------------------------------------------------------------------- |
| **Problem**      | Tests break when refactoring, brittle test suite                                      |
| **Symptom**      | Testing internal state variable names, private methods                                |
| **Bad Pattern**  | `expect(result.current._cachedData).toBeNull()`                                       |
| **Good Pattern** | Test public API: `expect(result.current.isLoading).toBe(true)`                        |
| **Reference**    | `.claude/docs/examples/packages/frontend/testing/integration-test-component.test.tsx` |

---

## 10. Missing Storybook Stories

| Issue            | Description                                                                     |
| ---------------- | ------------------------------------------------------------------------------- |
| **Problem**      | No visual documentation, no isolated component development                      |
| **Symptom**      | Component without `.stories.tsx` file                                           |
| **Bad Pattern**  | Button component, no stories                                                    |
| **Good Pattern** | Every component has `.stories.tsx` with Primary, Secondary, Disabled variants   |
| **Reference**    | `.claude/docs/examples/packages/frontend/testing/storybook-stories.stories.tsx` |

---

## 11. Services with UI Concerns

| Issue            | Description                                                                        |
| ---------------- | ---------------------------------------------------------------------------------- |
| **Problem**      | Services coupled to UI, hard to reuse/test                                         |
| **Symptom**      | Service formats dates, colors, UI strings                                          |
| **Bad Pattern**  | Service returns `{ formattedDate: '12/14/2025', statusColor: 'green' }`            |
| **Good Pattern** | Service returns `{ dueDate: Date, status: 'done' }`; component formats for display |
| **Reference**    | `.claude/docs/examples/packages/frontend/data-flow/service.ts`                     |

---

## 12. Global State for Local Features

| Issue            | Description                                                               |
| ---------------- | ------------------------------------------------------------------------- |
| **Problem**      | Unnecessary complexity, state pollution, hard to debug                    |
| **Symptom**      | Modal state in global store when used in one page                         |
| **Bad Pattern**  | Zustand/Redux for modal open/close in single page                         |
| **Good Pattern** | `const [isModalOpen, setIsModalOpen] = useState(false)` in page component |

---

## 13. Not Using Shadcn/ui Components

| Issue            | Description                                                                |
| ---------------- | -------------------------------------------------------------------------- |
| **Problem**      | Reinventing wheel, inconsistent patterns, missing accessibility            |
| **Symptom**      | Building Dialog/Select/Popover from scratch with divs                      |
| **Bad Pattern**  | Custom modal without focus trap, keyboard nav, ARIA                        |
| **Good Pattern** | `import { Dialog, DialogContent } from '@/components/ui/dialog'`           |
| **Reference**    | `.claude/docs/examples/packages/frontend/components/generic-component.tsx` |

---

## 14. Responsive Design Mistakes

| Issue            | Description                                                               |
| ---------------- | ------------------------------------------------------------------------- |
| **Problem**      | Fixed widths, desktop-first approach, broken mobile layouts               |
| **Symptom**      | `w-[1200px]` with breakpoint modifiers going smaller                      |
| **Bad Pattern**  | `className="w-[1200px] lg:w-[800px] md:w-[600px]"` (desktop-first)        |
| **Good Pattern** | `className="w-full max-w-screen-xl mx-auto px-4"` (mobile-first)          |
| **Reference**    | `.claude/docs/examples/packages/frontend/styling/responsive-tailwind.tsx` |

---

## Summary Checklist

Before submitting code, verify:

**Component Architecture:**

- [ ] No business logic in generic components
- [ ] No direct component-to-component communication
- [ ] No API calls in components (use hooks/services)
- [ ] Context only for >4-5 components
- [ ] Pages have minimal/zero styling (delegate to layouts)

**Styling:**

- [ ] Using theme colors (no hardcoded hex values)
- [ ] Using Tailwind utilities (no inline styles)
- [ ] Using `cn()` for conditional classes
- [ ] Mobile-first responsive design

**Testing:**

- [ ] Tests check behavior, not implementation
- [ ] All components have Storybook stories

**Architecture:**

- [ ] Services return data, not UI formatting
- [ ] State scoped appropriately (local vs global)
- [ ] Using Shadcn/ui components as base primitives

---

## Related Documentation

- `.claude/docs/frontend.md` - Frontend architecture and patterns
- `.claude/docs/react.md` - React-specific best practices
- `.claude/docs/radix.md` - Radix UI component patterns
- `.claude/docs/examples/packages/frontend/` - Code examples for all patterns
