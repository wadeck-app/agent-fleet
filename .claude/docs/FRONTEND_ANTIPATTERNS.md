# Frontend Anti-Patterns

**Reference document** - Loaded when debugging issues or reviewing code.

## 1. Business Logic in Generic Components

### Problem
Generic components become feature-specific and not reusable.

### Bad Example
```tsx
// ❌ Generic Button with business logic
export function Button({ userId, onClick }: { userId: string; onClick: () => void }) {
  const handleClick = async () => {
    // BAD: Business logic in generic component
    const user = await fetchUser(userId);
    if (user.canPerformAction) {
      onClick();
    }
  };

  return <button onClick={handleClick}>Click me</button>;
}
```

### Good Example
```tsx
// ✅ Generic Button - pure presentation
export function Button({ onClick, disabled, children }: ButtonProps) {
  return (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

// ✅ Feature component with business logic
export function UserActionButton({ userId }: { userId: string }) {
  const { canPerformAction, performAction } = useUserActions(userId);

  return (
    <Button disabled={!canPerformAction} onClick={performAction}>
      Perform Action
    </Button>
  );
}
```

**Reference:** `docs/examples/frontend/components/generic-component.tsx`

---

## 2. Direct Component-to-Component Communication

### Problem
Creates tight coupling, hard to test, unpredictable data flow.

### Bad Example
```tsx
// ❌ Direct communication via refs or events
export function ParentComponent() {
  const childRef = useRef<ChildHandle>(null);

  const handleAction = () => {
    childRef.current?.doSomething(); // BAD: Direct manipulation
  };

  return (
    <>
      <button onClick={handleAction}>Trigger</button>
      <ChildComponent ref={childRef} />
    </>
  );
}
```

### Good Example
```tsx
// ✅ Communication via props and state lifting
export function ParentComponent() {
  const [data, setData] = useState<Data | null>(null);

  const handleAction = () => {
    setData({ /* new data */ });
  };

  return (
    <>
      <button onClick={handleAction}>Trigger</button>
      <ChildComponent data={data} onDataChange={setData} />
    </>
  );
}
```

**Reference:** `docs/examples/frontend/state/props-communication.tsx`

---

## 3. API Calls Directly in Components

### Problem
Hard to test, violates separation of concerns, no data transformation layer.

### Bad Example
```tsx
// ❌ API calls in component
export function TaskList() {
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    // BAD: Direct API call
    fetch('/api/tasks')
      .then(res => res.json())
      .then(data => setTasks(data));
  }, []);

  return <div>{/* render tasks */}</div>;
}
```

### Good Example
```tsx
// ✅ Use data flow architecture
// Hook
export function useTasks() {
  const [tasks, setTasks] = useState<TaskViewModel[]>([]);

  useEffect(() => {
    taskService.getTasks().then(setTasks);
  }, []);

  return { tasks };
}

// Component
export function TaskList() {
  const { tasks } = useTasks();
  return <div>{/* render tasks */}</div>;
}
```

**Reference:** `docs/examples/frontend/data-flow/`

---

## 4. Using Context for <4 Components

### Problem
Unnecessary complexity, harder to understand data flow.

### Bad Example
```tsx
// ❌ Context for 2 components
const FormContext = createContext<FormValue | null>(null);

export function FormPage() {
  const [value, setValue] = useState('');

  return (
    <FormContext.Provider value={{ value, setValue }}>
      <FormInput />
      <FormSubmit />
    </FormContext.Provider>
  );
}
```

### Good Example
```tsx
// ✅ Props for <4 components
export function FormPage() {
  const [value, setValue] = useState('');

  return (
    <>
      <FormInput value={value} onChange={setValue} />
      <FormSubmit value={value} />
    </>
  );
}
```

**Reference:** `docs/examples/frontend/state/context-usage.tsx`

---

## 5. Styling in Page Components

### Problem
Pages become coupled to layouts, hard to reuse components.

### Bad Example
```tsx
// ❌ Styling in page
export function TasksPage() {
  return (
    <div style={{ display: 'flex', padding: '20px', gap: '10px' }}>
      <div className="w-64 bg-gray-100 p-4">
        <TaskSidebar />
      </div>
      <div className="flex-1">
        <TaskList />
      </div>
    </div>
  );
}
```

### Good Example
```tsx
// ✅ Delegate to layout
export function TasksPage() {
  return (
    <MainLayout sidebar={<TaskSidebar />}>
      <TaskList />
    </MainLayout>
  );
}
```

**Reference:** `docs/examples/frontend/styling/page-minimal-styling-tailwind.tsx`

---

## 6. Hardcoded Colors

### Problem
Themes don't work, inconsistent design, hard to maintain.

### Bad Example
```tsx
// ❌ Hardcoded colors
<div className="bg-[#3b82f6] text-[#ffffff]">
  <h1 style={{ color: '#000000' }}>Title</h1>
</div>
```

### Good Example
```tsx
// ✅ Theme colors
<div className="bg-primary text-primary-foreground">
  <h1 className="text-foreground">Title</h1>
</div>
```

**Reference:** `docs/examples/frontend/styling/theme-system-tailwind.css`

---

## 7. Inline Styles Instead of Tailwind

### Problem
Breaks consistency, harder to maintain, no responsive/theme support.

### Bad Example
```tsx
// ❌ Inline styles
<div style={{ padding: '16px', backgroundColor: '#fff', display: 'flex' }}>
  <button style={{ color: 'blue', fontSize: '14px' }}>Click</button>
</div>
```

### Good Example
```tsx
// ✅ Tailwind utilities
<div className="flex bg-background p-4">
  <button className="text-sm text-primary">Click</button>
</div>
```

**Reference:** `docs/examples/frontend/styling/tailwind-component.tsx`

---

## 8. Not Using cn() for Conditional Classes

### Problem
Complex className strings, hard to read conditional styling.

### Bad Example
```tsx
// ❌ String concatenation
<button
  className={`btn ${isActive ? 'bg-blue-500' : 'bg-gray-500'} ${isLarge ? 'text-lg' : 'text-sm'}`}
>
  Click
</button>
```

### Good Example
```tsx
// ✅ Using cn()
<button
  className={cn(
    'btn',
    isActive ? 'bg-primary' : 'bg-secondary',
    isLarge && 'text-lg'
  )}
>
  Click
</button>
```

**Reference:** `docs/examples/frontend/styling/tailwind-component.tsx`

---

## 9. Testing Implementation Details

### Problem
Tests break when refactoring, brittle test suite.

### Bad Example
```tsx
// ❌ Testing implementation
test('useTasks hook', () => {
  const { result } = renderHook(() => useTasks());

  // BAD: Testing internal state variable names
  expect(result.current.internalLoadingState).toBe(false);
  expect(result.current._cachedData).toBeNull();
});
```

### Good Example
```tsx
// ✅ Testing behavior
test('useTasks hook', () => {
  const { result } = renderHook(() => useTasks());

  // GOOD: Testing public API and behavior
  expect(result.current.isLoading).toBe(true);

  await waitFor(() => {
    expect(result.current.tasks).toHaveLength(3);
  });
});
```

**Reference:** `docs/examples/frontend/testing/integration-test-component.test.tsx`

---

## 10. Missing Storybook Stories

### Problem
No visual documentation, no isolated component development.

### Bad Example
```tsx
// ❌ Component without stories
export function Button({ variant, children }: ButtonProps) {
  return <button className={cn(/* ... */)}>{children}</button>;
}
// No corresponding Button.stories.tsx file
```

### Good Example
```tsx
// ✅ Component with stories
export function Button({ variant, children }: ButtonProps) {
  return <button className={cn(/* ... */)}>{children}</button>;
}

// Button.stories.tsx
export default {
  title: 'Components/Button',
  component: Button,
} satisfies Meta<typeof Button>;

export const Primary: Story = {
  args: { variant: 'primary', children: 'Click me' },
};

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Click me' },
};
```

**Reference:** `docs/examples/frontend/testing/storybook-stories.stories.tsx`

---

## 11. Services with UI Concerns

### Problem
Services become coupled to UI, hard to reuse/test.

### Bad Example
```tsx
// ❌ Service formatting for UI
class TaskService {
  async getTasks() {
    const tasks = await taskRepository.fetchTasks();

    // BAD: UI formatting in service
    return tasks.map(task => ({
      ...task,
      formattedDate: new Date(task.dueDate).toLocaleDateString('en-US'),
      statusColor: task.status === 'done' ? 'green' : 'red',
    }));
  }
}
```

### Good Example
```tsx
// ✅ Service returns data, component formats
class TaskService {
  async getTasks(): Promise<TaskViewModel[]> {
    const tasks = await taskRepository.fetchTasks();

    // GOOD: Transform data structure, not UI formatting
    return tasks.map(task => ({
      id: task.id,
      title: task.title,
      status: task.status,
      dueDate: new Date(task.dueDate), // Return Date object
    }));
  }
}

// Component handles UI formatting
function TaskCard({ task }: { task: TaskViewModel }) {
  return (
    <div>
      <span>{task.dueDate.toLocaleDateString()}</span>
      <Badge className={task.status === 'done' ? 'bg-green-500' : 'bg-red-500'}>
        {task.status}
      </Badge>
    </div>
  );
}
```

**Reference:** `docs/examples/frontend/data-flow/service.ts`

---

## 12. Global State for Local Features

### Problem
Unnecessary complexity, state pollution, hard to debug.

### Bad Example
```tsx
// ❌ Global state for local modal
const globalStore = createStore({
  isModalOpen: false,
  modalData: null,
});

export function TasksPage() {
  const { isModalOpen } = useGlobalStore();
  // BAD: Modal state shouldn't be global
  return <>{isModalOpen && <Modal />}</>;
}
```

### Good Example
```tsx
// ✅ Local state for local feature
export function TasksPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsModalOpen(true)}>Open</button>
      {isModalOpen && <Modal onClose={() => setIsModalOpen(false)} />}
    </>
  );
}
```

---

## 13. Not Using Shadcn/ui Components

### Problem
Reinventing the wheel, inconsistent patterns, missing accessibility.

### Bad Example
```tsx
// ❌ Building primitives from scratch
export function Dialog({ open, children }: DialogProps) {
  return (
    <div className={open ? 'block' : 'hidden'}>
      {/* BAD: Missing focus trap, keyboard nav, ARIA, etc. */}
      <div className="fixed inset-0 bg-black/50">
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          {children}
        </div>
      </div>
    </div>
  );
}
```

### Good Example
```tsx
// ✅ Use Shadcn/ui (built on Radix UI)
import { Dialog, DialogContent } from '@/components/ui/dialog';

export function MyDialog({ open, children }: MyDialogProps) {
  return (
    <Dialog open={open}>
      <DialogContent>
        {children}
      </DialogContent>
    </Dialog>
  );
}
```

**Reference:** `docs/examples/frontend/components/generic-component.tsx`

---

## 14. Responsive Design Mistakes

### Problem
Fixed widths, desktop-first approach, broken mobile layouts.

### Bad Example
```tsx
// ❌ Fixed widths, desktop-first
<div className="w-[1200px] lg:w-[800px] md:w-[600px] sm:w-[400px]">
  <div className="grid grid-cols-4 lg:grid-cols-3 md:grid-cols-2 sm:grid-cols-1">
    {items}
  </div>
</div>
```

### Good Example
```tsx
// ✅ Mobile-first, flexible widths
<div className="w-full max-w-screen-xl mx-auto px-4">
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    {items}
  </div>
</div>
```

**Reference:** `docs/examples/frontend/styling/responsive-tailwind.tsx`

---

## Summary Checklist

Before submitting code, check:

- [ ] No business logic in generic components
- [ ] No direct component-to-component communication
- [ ] No API calls in components (use hooks/services)
- [ ] Context only for >4-5 components
- [ ] Pages have minimal/zero styling
- [ ] Using theme colors (no hardcoded hex values)
- [ ] Using Tailwind utilities (no inline styles)
- [ ] Using `cn()` for conditional classes
- [ ] Tests check behavior, not implementation
- [ ] All components have Storybook stories
- [ ] Services return data, not UI formatting
- [ ] State scoped appropriately (local vs global)
- [ ] Using Shadcn/ui components as base
- [ ] Mobile-first responsive design
