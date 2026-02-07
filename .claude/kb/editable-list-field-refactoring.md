# EditableListField Refactoring - Lessons Learned

This document captures key lessons learned from the comprehensive refactoring of EditableListField and related components (completed February 2026).

## Architecture - Contracts & Hooks

### FeatureContract vs FeatureFormContract

Understanding when to use each contract is critical for proper architecture:

**FeatureContract** (alias FeatureDataContract): For data-fetching hooks

- Includes `fillQuery` method for backend query generation
- Used by hooks that interact with the backend
- Examples: `usePagination2`, `useSorting2`, `useCacheControl2`
- Pattern: State management + query construction

```typescript
export interface FeatureContract<TState> {
	fstate: TState;
	actions: Record<string, (...args: any[]) => void>;
	fillQuery: (query: Record<string, any>) => void; // ← Backend integration
}
```

**FeatureFormContract**: For form hooks (local state only)

- NO `fillQuery` - purely local state management
- Used by hooks that manage client-side form state
- Examples: `useListItems`, `useSyncedListItems`
- Pattern: State management only

```typescript
export interface FeatureFormContract<TState> {
	fstate: TState;
	actions: Record<string, (...args: any[]) => void>;
	// No fillQuery!
}
```

**Key Rule**: If your hook needs to contribute to backend queries, use FeatureContract. If it's client-side only (forms, UI state), use FeatureFormContract.

### hooks2/ Organization

The `framework/hooks2/` directory MUST be organized into subfolders:

**Required Structure**:

```
hooks2/
├── form/           # Form-specific hooks (FeatureFormContract)
│   ├── useListItems.ts
│   ├── useListItems.test.ts
│   ├── useSyncedListItems.ts
│   ├── useSyncedListItems.test.ts
│   └── useDragAndDrop.ts
├── data/           # Data-fetching hooks (FeatureContract)
│   ├── usePagination2.ts
│   ├── useSorting2.ts
│   ├── useCacheControl2.ts
│   ├── useCategoryFilter2.ts
│   ├── useSimpleSearch.ts
│   ├── useQueryComposition.ts
│   ├── useDataFetch.ts
│   ├── useDataAccumulator.ts
│   ├── useInfinitePagination.ts
│   └── useMutation.ts
└── utility/        # Utility hooks (neither contract)
    ├── useDebounce.ts
    ├── usePropsInjection.ts
    └── useMultiSelect2.ts
```

**Rules**:

- Tests colocated: `useFeature.test.ts` next to `useFeature.ts`
- No barrel files: Direct imports only
- Use git mv for moves to preserve history

**Import Examples**:

```typescript
// ❌ Old (flat structure)
import { useListItems } from '@framework/hooks2/useListItems';

// ✅ New (organized)
import { useListItems } from '@framework/hooks2/form/useListItems';
import { usePagination2 } from '@framework/hooks2/data/usePagination2';
import { useDebounce } from '@framework/hooks2/utility/useDebounce';
```

## TypeScript - useEffect Rules

### State Updates MUST Be Inside useEffect

**Critical Error Pattern**:

```typescript
// ❌ WRONG - State update outside useEffect = infinite loop risk
function MyComponent({ externalValue }) {
	const [state, setState] = useState(defaultValue);

	if (externalValue !== state) {
		setState(externalValue); // ← CRITICAL BUG: Triggers re-render during render
	}

	return <div>{state}</div>;
}
```

**Correct Pattern**:

```typescript
// ✅ CORRECT - State updates inside useEffect
function MyComponent({ externalValue }) {
	const [state, setState] = useState(defaultValue);

	useEffect(() => {
		if (externalValue !== state) {
			setState(externalValue); // ← Safe: Runs after render
		}
	}, [externalValue, state]);

	return <div>{state}</div>;
}
```

**Why This Matters**:

- React's rendering model forbids state updates during render phase
- State updates trigger re-renders, creating infinite loops
- useEffect runs AFTER rendering completes, making it safe

**Real Example from Refactoring**:

```typescript
// In useSyncedListItems.ts
useEffect(() => {
	if (JSON.stringify(externalItems) !== JSON.stringify(fstate.items)) {
		actions.set(externalItems); // Must be inside useEffect
	}
}, [externalItems, fstate.items, actions]);
```

## Code Style

### Multi-line if/return Always Required

**Rule**: All `if`/`return` statements must use multi-line format with braces, even for single statements.

```typescript
// ❌ WRONG - Single-line format
if (condition) return value;

// ✅ CORRECT - Multi-line format
if (condition) {
	return value;
}

// ✅ CORRECT - Guard clauses
if (!isValid) {
	return;
}

if (count === 0) {
	return [];
}

// Process items
return items.map(...);
```

**Rationale**:

- Consistency across codebase
- Easier to add logging/debugging
- Reduces git diff noise when modifying
- Aligns with project CLAUDE.md standards

## Reusability - Component/Hook Extraction

### When to Extract Components

Extract reusable components when:

1. Code duplicated 3+ times across files
2. Visual pattern repeated (buttons, icons, layouts)
3. CSS classes repeated identically
4. Component serves single clear purpose

**Example from Refactoring**:

Before (duplicated 3 times):

```typescript
// In KeyValueItemRenderer.tsx
<Button type="button" variant="ghost" size="icon-sm" onClick={actions.remove} title="Remove">
	<Trash2 className="size-4 text-destructive" />
</Button>

// In OutputItemRenderer.tsx
<Button type="button" variant="ghost" size="icon-sm" onClick={actions.remove} title="Remove">
	<Trash2 className="size-4 text-destructive" />
</Button>

// In InputDefinitionRenderer.tsx
<Button type="button" variant="ghost" size="icon-sm" onClick={actions.remove} title="Remove">
	<Trash2 className="size-4 text-destructive" />
</Button>
```

After (extracted):

```typescript
// RemoveItemButton.tsx
export function RemoveItemButton({ onRemove, disabled, title = 'Remove item' }) {
	return (
		<Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} disabled={disabled} title={title}>
			<Trash2 className="size-4 text-destructive" />
		</Button>
	);
}

// Usage
<RemoveItemButton onRemove={actions.remove} title="Remove variable" />
```

**Benefits**:

- Single source of truth for styling
- Consistent behavior across all uses
- Easier to test in isolation
- Change once, update everywhere

### When to Extract Hooks

Extract reusable hooks when:

1. Logic >10 lines in component
2. Testing complexity increases
3. Reusability potential identified
4. Clear single responsibility

**Example from Refactoring**:

Before (60 lines inline in EditableListField):

```typescript
// Setup dnd-kit sensors
const sensors = useSensors(
	useSensor(PointerSensor, {
		activationConstraint: { distance: 8 },
	}),
	useSensor(KeyboardSensor, {
		coordinateGetter: sortableKeyboardCoordinates,
	})
);

const handleDragEnd = (event: DragEndEvent) => {
	const { active, over } = event;
	if (over && active.id !== over.id) {
		const fromIndex = fstate.items.findIndex((item, i) => resolveItemId(item, i) === active.id);
		const toIndex = fstate.items.findIndex((item, i) => resolveItemId(item, i) === over.id);
		actions.reorder(fromIndex, toIndex);
	}
};

const sortableIds = fstate.items.map((item, i) => resolveItemId(item, i));
```

After (extracted to useDragAndDrop):

```typescript
// In component
const dnd = useDragAndDrop({
	items: fstate.items,
	getItemId: resolveItemId,
	onReorder: actions.reorder,
	disabled: !enableReordering,
});

// Use
<DndContext sensors={dnd.sensors} onDragEnd={dnd.handleDragEnd}>
	<SortableContext items={dnd.sortableIds}>...</SortableContext>
</DndContext>;
```

**Benefits**:

- Component reduced from 220 lines → 190 lines (14% smaller)
- Drag-and-drop logic testable in isolation
- Reusable across other sortable components
- Clear separation of concerns

## UX Patterns

### Technical Fields Need Examples

For regex/pattern fields or other technical inputs, provide minimum 3 concrete examples in the description/help text.

**Before** (no examples):

```typescript
<Textarea
	label="Extraction Pattern"
	description="Regex pattern for extracting the value from output"
	placeholder="Result: (.*)"
/>
```

**After** (with examples):

```typescript
<Textarea
	label="Extraction Pattern (optional)"
	description="Regex pattern for extracting the value from output"
	placeholder="Result: (.*)"
/>
<p className="text-xs text-muted-foreground">
	Examples: <code>Result: (.*)</code> - Extract after "Result: " | <code>(\d+) items</code> - Extract number |{' '}
	<code>Status: (\w+)</code> - Extract word
</p>
```

**Why This Matters**:

- Reduces user confusion
- Provides immediate learning/reference
- Shows real-world patterns
- Lowers support burden

**Rule of Thumb**: If a field requires technical knowledge (regex, JSONPath, SQL), provide 3+ examples covering common use cases.

## Anti-Patterns

### ❌ Barrel Files (index.ts)

**Problem**: Barrel files (index.ts that re-export everything) hide dependencies and complicate imports.

```typescript
// Usage hides where components actually live
import { AddButton, EditableListField } from '@framework/components2/list';

// ❌ WRONG - Barrel file
// framework/components2/list/index.ts
export * from './EditableListField';
export * from './SortableItem';
export * from './AddButton';
```

**Solution**: Direct imports from source files

```typescript
// ✅ CORRECT - Direct imports
import { AddButton } from '@framework/components2/list/AddButton';
import { EditableListField } from '@framework/components2/list/EditableListField';
```

**Benefits**:

- Clear dependency graph
- IDE navigation works better
- Easier to refactor
- No circular dependency risks

### ❌ Type Assertions (as any, as unknown as)

**Problem**: Type assertions hide design flaws and bypass TypeScript's safety.

```typescript
// ❌ WRONG - Type assertion band-aid
const value = (data as any).someField;
const typed = data as unknown as MyType;
```

**Solution**: Fix types upstream

```typescript
// ✅ CORRECT - Proper interface
interface Data {
	someField: string;
}
const value = data.someField; // Type-safe
```

**Exception**: Only use type assertions when:

- Interfacing with untyped third-party libraries
- Handling legitimate any types (JSON parsing)
- Document WHY with comment

### ❌ Flat Hook Directories

**Problem**: All hooks in single directory becomes unmaintainable at scale.

```
hooks2/
├── useListItems.ts
├── usePagination2.ts
├── useSorting2.ts
├── useDebounce.ts
├── ...30 more files...
```

**Solution**: Categorize with subfolders (form/, data/, utility/)

See "hooks2/ Organization" section above for details.

## Migration Best Practices

### Use git mv to Preserve History

When reorganizing files:

```bash
# ✅ CORRECT - Preserves git history
git mv old/path/file.ts new/path/file.ts

# ❌ WRONG - Loses git history
rm old/path/file.ts
# Create new file at new/path/file.ts
```

### Update Imports with Script

For large-scale import updates (50+ files), write a migration script:

```javascript
// update-imports.js
const fs = require('fs');
const path = require('path');

const REPLACEMENTS = {
	'@framework/hooks2/useListItems': '@framework/hooks2/form/useListItems',
	// ... more mappings
};

function updateFile(filePath) {
	let content = fs.readFileSync(filePath, 'utf8');
	for (const [oldPath, newPath] of Object.entries(REPLACEMENTS)) {
		content = content.replace(new RegExp(`from ['"]${oldPath}['"]`, 'g'), `from '${newPath}'`);
	}
	fs.writeFileSync(filePath, content);
}
```

### Validate After Each Phase

Don't complete entire refactoring, then test. Instead:

1. Complete one phase
2. Run `npm run check` (TypeScript)
3. Run `npm run test` (Unit tests)
4. Fix issues before proceeding
5. Move to next phase

**Why**: Easier to identify what broke the build/tests.

## Testing Standards

### Coverage Requirements

- Minimum 70% for all components/hooks
- Target 90% for business logic
- 100% for critical paths (data mutations, form submissions)

### Colocate Tests

```
useListItems.ts
useListItems.test.ts  ← Same directory
```

### Test Structure

```typescript
describe('ComponentName', () => {
	describe('rendering', () => {
		it('should render button element', () => {});
		it('should render icon', () => {});
	});

	describe('behavior', () => {
		it('should call onClick when clicked', () => {});
	});

	describe('edge cases', () => {
		it('should handle disabled state', () => {});
	});
});
```

## Summary of Changes

This refactoring (February 2026) addressed 15 architectural issues:

1. ✅ Created FeatureFormContract for form hooks
2. ✅ Organized hooks2/ into form/data/utility folders
3. ✅ Extracted DragHandle component (removed duplication)
4. ✅ Extracted RemoveItemButton component (removed duplication)
5. ✅ Extracted AddButton component (removed duplication)
6. ✅ Extracted useDragAndDrop hook (60 lines → 5 line call)
7. ✅ Fixed useListItems test (fillQuery expectation)
8. ✅ Updated all item renderers to use new components
9. ✅ Simplified EditableListField (220 → 190 lines, 14% reduction)
10. ✅ Added regex examples to OutputItemRenderer
11. ✅ Removed barrel files
12. ✅ Eliminated type assertions in flow-editor
13. ✅ Added comprehensive test coverage (>70% all components)
14. ✅ Created migration scripts for safe refactoring
15. ✅ Documented all patterns and anti-patterns

**Final Result**: More maintainable, testable, and reusable architecture that scales better for future features.
