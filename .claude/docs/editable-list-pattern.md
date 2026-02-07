# EditableListField Pattern - Developer Guide

## Quick Start

The EditableListField pattern provides a composable, generic way to create editable lists in React. It's inspired by the DataView/Table/Grid pattern and follows the same headless composable architecture.

## Basic Usage

### 1. Import the components

```typescript
import { EditableListField } from '@framework/components2/list/EditableListField';
import { useListItems } from '@framework/hooks2/useListItems';
```

### 2. Define your item type

```typescript
interface MyItem {
  id: string;
  name: string;
  value: number;
}
```

### 3. Create a custom item renderer

```typescript
function MyItemRenderer({ item, actions }: {
  item: MyItem;
  actions: ItemActions<MyItem>
}) {
  return (
    <div className="flex gap-2 rounded border p-2">
      <Input
        value={item.name}
        onChange={e => actions.update({ name: e.target.value })}
      />
      <Input
        type="number"
        value={item.value}
        onChange={e => actions.update({ value: Number(e.target.value) })}
      />
      <Button onClick={actions.remove}>Remove</Button>
    </div>
  );
}
```

### 4. Use the hook and component

```typescript
function MyComponent() {
  const items = useListItems<MyItem>({
    initialItems: [{ id: '1', name: 'Item 1', value: 10 }],
    minItems: 0,
    maxItems: 10,
  });

  return (
    <EditableListField
      label="My Items"
      description="Add or remove items"
      items={items}
      renderItem={(item, index, actions) => (
        <MyItemRenderer item={item} actions={actions} />
      )}
      createDefault={() => ({ id: crypto.randomUUID(), name: '', value: 0 })}
      addButtonLabel="Add Item"
      enableReordering={true}
      getItemId={(item) => item.id}
    />
  );
}
```

## Pre-built Renderers

The framework includes three pre-built renderers:

### KeyValueItemRenderer
For environment variables or any key-value pairs.

```typescript
import { KeyValueItemRenderer, type KeyValueItem } from '@framework/components2/list/renderers/KeyValueItemRenderer';

const items = useListItems<KeyValueItem>({
  initialItems: [{ key: 'API_KEY', value: 'secret' }],
});

<EditableListField
  items={items}
  renderItem={(item, _, actions) => <KeyValueItemRenderer item={item} actions={actions} />}
  createDefault={() => ({ key: '', value: '' })}
  getItemId={(item, index) => item.key || `env-${index}`}
/>
```

### OutputItemRenderer
For output configuration with name, type, and optional pattern.

```typescript
import { OutputItemRenderer, type OutputItem } from '@framework/components2/list/renderers/OutputItemRenderer';

const items = useListItems<OutputItem>({
  initialItems: [{ name: 'result', type: 'string', pattern: 'Result: (.*)' }],
});

<EditableListField
  items={items}
  renderItem={(item, _, actions) => <OutputItemRenderer item={item} actions={actions} />}
  createDefault={() => ({ name: '', type: 'string' })}
  getItemId={(item, index) => item.name || `output-${index}`}
/>
```

### InputDefinitionRenderer
For flow input definitions with name and type.

```typescript
import { InputDefinitionRenderer, type InputDefinitionItem } from '@framework/components2/list/renderers/InputDefinitionRenderer';

const items = useListItems<InputDefinitionItem>({
  initialItems: [{ name: 'userId', type: 'string' }],
});

<EditableListField
  items={items}
  renderItem={(item, _, actions) => <InputDefinitionRenderer item={item} actions={actions} />}
  createDefault={() => ({ name: '', type: 'string' })}
  getItemId={(item, index) => item.name || `input-${index}`}
/>
```

## API Reference

### useListItems Hook

```typescript
interface UseListItemsOptions<T> {
  initialItems?: T[];
  minItems?: number;
  maxItems?: number;
  createDefault?: () => T;
}

function useListItems<T>(options?: UseListItemsOptions<T>): ListItemsContract<T>
```

**Returns:**
```typescript
interface ListItemsContract<T> {
  fstate: {
    items: T[];
    count: number;
    isEmpty: boolean;
    canAdd: boolean;
    canRemove: boolean;
  };
  actions: {
    add: (item: T) => void;
    remove: (index: number) => void;
    update: (index: number, partial: Partial<T>) => void;
    set: (items: T[]) => void;
    clear: () => void;
    reorder: (fromIndex: number, toIndex: number) => void;
  };
  fillQuery: (query: Record<string, unknown>) => void;
}
```

### EditableListField Component

```typescript
interface EditableListFieldProps<T> {
  // Core
  items: ListItemsContract<T>;
  renderItem: (item: T, index: number, actions: ItemActions<T>) => ReactNode;
  createDefault: () => T;

  // Optional
  label?: string;
  description?: string;
  error?: string;
  renderEmpty?: () => ReactNode;
  addButtonLabel?: string;
  emptyMessage?: string;
  enableReordering?: boolean;
  getItemId?: (item: T, index: number) => string | number;
  className?: string;
}
```

**getItemId prop:**
- Function to extract unique ID from item for React keys
- Falls back to array index if not provided (not recommended for dynamic lists)
- Essential when using `enableReordering={true}`
- Improves performance by allowing React to track items correctly

### ItemActions

```typescript
interface ItemActions<T> {
  update: (partial: Partial<T>) => void;
  remove: () => void;
}
```

## Advanced Patterns

### Using Stable Keys with getItemId

By default, EditableListField uses array indices as React keys. For dynamic lists where items can be reordered or removed, this can cause rendering issues. Use the `getItemId` prop to provide stable keys:

```typescript
<EditableListField
  items={items}
  renderItem={renderItem}
  createDefault={() => ({ key: '', value: '' })}
  getItemId={(item) => item.key || `temp-${Math.random()}`}
/>
```

**Why this matters:**
- Prevents React from re-rendering wrong components during reordering
- Improves performance by allowing React to track items correctly
- Essential when using drag-and-drop reordering

**Best practices:**
```typescript
// ✅ Good: Use stable ID from item
getItemId={(item) => item.id}

// ✅ Good: Use name as fallback with index
getItemId={(item, index) => item.name || `item-${index}`}

// ❌ Bad: Don't use random values
getItemId={() => Math.random()} // Creates new key every render!

// ❌ Bad: Don't omit when using reordering
enableReordering={true} // Without getItemId, items may swap incorrectly
```

### Syncing with External State (Manual Approach)

When you need to sync list items with external state (like a form or API):

```typescript
const items = useListItems<MyItem>({ initialItems: externalData });

useEffect(() => {
  // Convert items back to external format
  const syncedData = items.fstate.items.map(item => ({
    // Transform as needed
  }));

  // Only update if different to avoid infinite loops
  if (JSON.stringify(syncedData) !== JSON.stringify(externalData)) {
    onExternalUpdate(syncedData);
  }
}, [items.fstate.items]);
```

### Syncing with External State (useSyncedListItems)

For cleaner code, use the `useSyncedListItems` helper hook:

```typescript
import { useSyncedListItems } from '@framework/hooks2/useSyncedListItems';

// Transform array of objects to object with keys
const envItems = useSyncedListItems<KeyValueItem, Record<string, string>>({
  initialItems: Object.entries(env).map(([key, value]) => ({ key, value })),
  transform: (items) => Object.fromEntries(
    items.filter(item => item.key.trim()).map(item => [item.key, item.value])
  ),
  onSync: (envObj) => onUpdateNode(id, { env: envObj }),
  minItems: 0,
});

<EditableListField
  items={envItems}
  renderItem={(item, _, actions) => <KeyValueItemRenderer item={item} actions={actions} />}
  createDefault={() => ({ key: '', value: '' })}
  getItemId={(item) => item.key || `env-${Math.random()}`}
/>
```

**Benefits of useSyncedListItems:**
- Automatic syncing on every change
- Built-in filtering support
- Reduces boilerplate code
- Type-safe transformations

**API:**
```typescript
interface UseSyncedListItemsOptions<T, R = T[]> {
  initialItems?: T[];
  transform: (items: T[]) => R;
  onSync: (transformed: R) => void;
  filter?: (item: T) => boolean;
  minItems?: number;
  maxItems?: number;
  createDefault?: () => T;
}
```

### Conditional Rendering in Item Renderer

Show/hide fields based on item state:

```typescript
function ConditionalItemRenderer({ item, actions }: ItemRendererProps) {
  return (
    <div>
      <Select
        value={item.type}
        onChange={v => actions.update({ type: v })}
      >
        <option value="simple">Simple</option>
        <option value="advanced">Advanced</option>
      </Select>

      {item.type === 'advanced' && (
        <Input
          value={item.advancedOption}
          onChange={e => actions.update({ advancedOption: e.target.value })}
        />
      )}
    </div>
  );
}
```

### Drag & Drop

Enable drag & drop reordering:

```typescript
<EditableListField
  items={items}
  renderItem={renderItem}
  createDefault={createDefault}
  enableReordering={true} // Enable drag & drop
/>
```

Items will show a drag handle (GripVertical icon) when reordering is enabled.

### Custom Empty State

Provide a custom empty state:

```typescript
<EditableListField
  items={items}
  renderItem={renderItem}
  createDefault={createDefault}
  renderEmpty={() => (
    <div className="text-center">
      <Icon className="size-12 text-muted-foreground" />
      <p className="text-sm">No items yet. Click Add to get started!</p>
    </div>
  )}
/>
```

## Best Practices

### 1. Type Safety
Always define strict types for your items:

```typescript
// ✅ Good
interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
}

// ❌ Bad
interface TodoItem {
  [key: string]: any;
}
```

### 2. Unique Keys
When rendering lists, ensure items have unique identifiers:

```typescript
createDefault={() => ({
  id: crypto.randomUUID(), // Unique ID
  name: '',
  value: 0,
})}
```

### 3. Filter Empty Values
When syncing to external state, filter out empty/invalid items:

```typescript
const validItems = items.fstate.items
  .filter(item => item.name.trim()) // Remove empty names
  .filter(item => item.value > 0);  // Remove invalid values
```

### 4. Memoize Item Renderers
For large lists, memoize your item renderer:

```typescript
const MyItemRenderer = React.memo(({ item, actions }: ItemRendererProps) => {
  // ... rendering logic
});
```

### 5. Handle Constraints
Use minItems/maxItems to enforce business rules:

```typescript
const items = useListItems<MyItem>({
  minItems: 1,  // Must have at least 1 item
  maxItems: 10, // Cannot have more than 10 items
});
```

## Testing

### Testing the Hook

```typescript
import { renderHook, act } from '@testing-library/react';
import { useListItems } from '@framework/hooks2/useListItems';

test('should add item', () => {
  const { result } = renderHook(() => useListItems<MyItem>());

  act(() => {
    result.current.actions.add({ id: '1', name: 'Test', value: 10 });
  });

  expect(result.current.fstate.items).toHaveLength(1);
  expect(result.current.fstate.items[0].name).toBe('Test');
});
```

### Testing the Component

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

test('should add item when button clicked', async () => {
  const user = userEvent.setup();
  const items = useListItems<MyItem>();

  render(
    <EditableListField
      items={items}
      renderItem={renderItem}
      createDefault={() => ({ id: '1', name: '', value: 0 })}
    />
  );

  await user.click(screen.getByText('Add Item'));

  expect(screen.getByDisplayValue('')).toBeInTheDocument();
});
```

## Migration Guide

### From JSON Textarea

**Before:**
```typescript
<Textarea
  value={JSON.stringify(data, null, 2)}
  onChange={e => {
    try {
      const parsed = JSON.parse(e.target.value);
      onUpdate(parsed);
    } catch {
      // Invalid JSON
    }
  }}
/>
```

**After:**
```typescript
const items = useListItems<MyItem>({
  initialItems: Object.entries(data).map(([key, value]) => ({ key, value })),
});

<EditableListField
  items={items}
  renderItem={(item, _, actions) => (
    <KeyValueItemRenderer item={item} actions={actions} />
  )}
  createDefault={() => ({ key: '', value: '' })}
/>
```

### From Custom List Implementation

**Before:**
```typescript
const [items, setItems] = useState([]);

const handleAdd = () => {
  setItems([...items, { id: uuid(), name: '' }]);
};

const handleRemove = (index) => {
  setItems(items.filter((_, i) => i !== index));
};

// ... more handlers
```

**After:**
```typescript
const items = useListItems<MyItem>({
  initialItems: [],
});

// Use items.actions.add, items.actions.remove directly
```

## Comparison with Similar Patterns

| Feature | EditableListField | DataView/Table | Form Array |
|---------|-------------------|----------------|------------|
| Composable | ✅ | ✅ | ✅ |
| Generic | ✅ | ✅ | ❌ |
| Drag & Drop | ✅ | ❌ | ❌ |
| Constraints | ✅ | ❌ | ✅ |
| Headless | ✅ | ✅ | ❌ |

## Examples from Codebase

See these files for real-world usage:

1. **Environment Variables**: `FlowEditorPropertiesPanel.tsx` (line ~447)
2. **Output Configuration**: `FlowEditorPropertiesPanel.tsx` (line ~824)
3. **Flow Inputs**: `FlowSettingsDialog.tsx` (line ~228)

## Further Reading

- [Frontend Architecture Guide](./frontend.md)
- [FeatureContract Pattern](../docs/examples/packages/frontend/data-flow/)
- [DataView/Table/Grid Pattern](../components2/data/)
