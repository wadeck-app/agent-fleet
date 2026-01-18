# Plan: Manage Pinned Projects Dialog with Drag & Drop

## Context

The user wants to replace the current hover-based "unpin" icon with a dedicated settings button that opens a dialog for managing pinned projects. The dialog should have a two-column layout:

- **Left column**: Pinned projects (with drag & drop for reordering)
- **Right column**: Available projects (non-pinned)
- **Actions**: Arrow buttons (→ to unpin, ← to pin) instead of × and ○
- **Auto-save**: Changes persist immediately to the server

## Current State

- Projects have `pinned` (boolean) and `order` (number) fields in the backend
- ProjectsV2Page currently shows pinned projects as tabs with Settings button in edit mode
- Edit mode shows Pin icons for unpinning
- The codebase uses:
    - `@dnd-kit` for drag & drop (already installed)
    - Radix UI for dialogs
    - `CrudDialog` wrapper for consistent dialog styling
    - Pattern: `SortableColumnItem` for drag & drop with visual feedback

## Implementation Plan

### 1. Create ManagePinnedProjectsDialog Component

**File**: `packages/web-frontend/src/app/pages/projects2/ManagePinnedProjectsDialog.tsx`

**Structure**:

```tsx
interface ManagePinnedProjectsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projects: Project[];
	pinnedProjects: Project[];
	onPin: (projectId: string) => Promise<void>;
	onUnpin: (projectId: string) => Promise<void>;
	onReorder: (projectId: string, newOrder: number) => Promise<void>;
}
```

**Features**:

- Two-column layout using CSS Grid or Flexbox
- Left: Pinned projects with drag & drop
- Right: Available (non-pinned) projects with search
- Arrow buttons (ArrowRight/ArrowLeft from lucide-react) for pin/unpin actions
- Auto-save: changes immediately call API
- Loading state during API calls
- Toast notifications for errors only

**Dialog Structure**:

- Use `CrudDialog` with `maxWidth="2xl"`
- Title: "Customize Project Tabs"
- No footer buttons (auto-save, just "Done" to close)
- `showCloseButton={true}`

**Layout**:

```tsx
<CrudDialog maxWidth="2xl" title="Customize Project Tabs" ...>
  <div className="grid grid-cols-2 gap-6 p-6">
    {/* Left Column: Pinned Projects */}
    <div>
      <h3>Pinned Projects</h3>
      <DndContext onDragEnd={handleDragEnd}>
        <SortableContext items={pinnedProjects} strategy={verticalListSortingStrategy}>
          {pinnedProjects.map(project => (
            <SortablePinnedProjectItem
              project={project}
              onUnpin={handleUnpin}
            />
          ))}
        </SortableContext>
      </DndContext>
      <p className="text-sm text-muted-foreground">Drag to reorder, click → to unpin</p>
    </div>

    {/* Right Column: Available Projects */}
    <div>
      <h3>Available Projects</h3>
      <SearchInput value={search} onChange={setSearch} />
      <div className="space-y-1">
        {filteredAvailableProjects.map(project => (
          <AvailableProjectItem
            project={project}
            onPin={handlePin}
          />
        ))}
      </div>
      <p className="text-sm text-muted-foreground">Click ← to pin</p>
    </div>
  </div>
</CrudDialog>
```

### 2. Create SortablePinnedProjectItem Component

**File**: `packages/web-frontend/src/app/pages/projects2/SortablePinnedProjectItem.tsx`

**Inspired by**: `SortableColumnItem` component pattern

**Features**:

- Uses `useSortable` from `@dnd-kit/sortable`
- Drag handle with `GripVertical` icon (≡)
- Project icon and name
- Arrow right button (→) for unpinning
- Visual feedback during drag (opacity, transform)

**Structure**:

```tsx
interface SortablePinnedProjectItemProps {
	project: Project;
	onUnpin: (projectId: string) => void;
	isLoading?: boolean;
}

// Uses:
// - useSortable({ id: project.id })
// - CSS.Transform.toString(transform)
// - Drag handle with GripVertical icon
// - Button with ArrowRight icon for unpinning
```

### 3. Create AvailableProjectItem Component

**File**: `packages/web-frontend/src/app/pages/projects2/AvailableProjectItem.tsx`

**Features**:

- Static item (no drag & drop)
- Project icon and name
- Arrow left button (←) for pinning
- Hover effect

**Structure**:

```tsx
interface AvailableProjectItemProps {
	project: Project;
	onPin: (projectId: string) => void;
	isLoading?: boolean;
}

// Simple div with:
// - Project icon (DynamicLucideIcon)
// - Project name
// - Button with ArrowLeft icon
```

### 4. Update ProjectsV2Page

**File**: `packages/web-frontend/src/app/pages/projects2/ProjectsV2Page.tsx`

**Changes**:

1. **Remove edit mode state** (`isEditMode`) - no longer needed
2. **Remove inline Pin buttons** from project tabs
3. **Replace Settings button behavior**:

    ```tsx
    const [isManageDialogOpen, setIsManageDialogOpen] = useState(false);

    // Settings button opens dialog instead of toggling edit mode
    <Button onClick={() => setIsManageDialogOpen(true)}>
    	<Settings className="h-4 w-4" />
    </Button>;
    ```

4. **Add dialog component**:

    ```tsx
    <ManagePinnedProjectsDialog
    	open={isManageDialogOpen}
    	onOpenChange={setIsManageDialogOpen}
    	projects={projects}
    	pinnedProjects={pinnedProjects}
    	onPin={handlePin}
    	onUnpin={handleUnpin}
    	onReorder={handleReorder}
    />
    ```

5. **Update handlers**:
    - `handlePin`: Pin a project (set pinned=true, order=max+1)
    - `handleUnpin`: Unpin a project (set pinned=false)
    - `handleReorder`: Reorder pinned projects (update order for affected projects)

### 5. Reordering Logic

When a pinned project is dragged and dropped:

```tsx
const handleReorder = async (activeId: string, overId: string) => {
	const oldIndex = pinnedProjects.findIndex(p => p.id === activeId);
	const newIndex = pinnedProjects.findIndex(p => p.id === overId);

	// Reorder locally for optimistic UI
	const reordered = arrayMove(pinnedProjects, oldIndex, newIndex);

	// Update order field for all affected projects
	const updates = reordered.map((project, index) => ({
		id: project.id,
		order: index,
		version: project.version,
	}));

	// Send updates to server
	await Promise.all(
		updates.map(update => projectsApi.updateProject(update.id, { order: update.order, version: update.version }))
	);
};
```

**Note**: Since all projects are already sorted by order in `loadProjects`, the real-time refresh will automatically reflect the new order.

### 6. Search Functionality

In the right column (Available Projects):

```tsx
const [searchQuery, setSearchQuery] = useState('');

const filteredAvailableProjects = availableProjects.filter(
	project =>
		project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
		project.description?.toLowerCase().includes(searchQuery.toLowerCase())
);
```

Use existing `TextField` or create a simple search input with clear button.

### 7. Styling Considerations

**Visual Design**:

- Two columns with subtle border between them
- Each column has a header (h3) and helper text at bottom
- Items have hover effect (bg-accent)
- Drag handle visible on hover (opacity transition)
- Arrow buttons always visible (not hover-only) for clarity
- Loading state: disable buttons + show spinner
- Empty states for each column

**Colors**:

- Background highlight during drag: `bg-accent/5`
- Border: `border-border`
- Helper text: `text-muted-foreground text-sm`

### 8. Error Handling

- Toast notification on API failure
- Revert optimistic UI update if API call fails
- Keep dialog open on error (don't auto-close)
- Show error inline if needed

## Critical Files

1. **New Files**:
    - `packages/web-frontend/src/app/pages/projects2/ManagePinnedProjectsDialog.tsx`
    - `packages/web-frontend/src/app/pages/projects2/SortablePinnedProjectItem.tsx`
    - `packages/web-frontend/src/app/pages/projects2/AvailableProjectItem.tsx`

2. **Modified Files**:
    - `packages/web-frontend/src/app/pages/projects2/ProjectsV2Page.tsx`

## Verification

1. **Manual Testing**:
    - Open Projects v2 page
    - Click Settings button → dialog opens
    - Pin a project from right column → appears in left column
    - Unpin a project from left column → appears in right column
    - Drag & drop projects in left column → order persists after page reload
    - Search in right column → filters projects
    - Close and reopen app → pinned projects and order are preserved

2. **Edge Cases**:
    - Pin all projects → right column shows empty state
    - Unpin all projects → left column shows empty state
    - Drag project to same position → no API calls
    - Concurrent updates → optimistic locking with version field

3. **TypeScript**:
    - Run `npm run check` to verify no TypeScript errors

## Dependencies

All required dependencies are already installed:

- `@dnd-kit/core`: ^6.3.1
- `@dnd-kit/sortable`: ^10.0.0
- `@dnd-kit/utilities`: ^3.2.2
- `@radix-ui/react-dialog`: ^1.1.15
- `lucide-react`: (for icons)

## Implementation Notes

- Use existing `projectsApi.updateProject()` for all updates
- Follow existing patterns from `SortableColumnItem` for drag & drop
- Use `CrudDialog` for consistent styling
- Auto-save pattern: no Cancel/Save buttons, changes apply immediately
- Loading states: disable buttons during API calls, show spinner if needed
- Real-time updates: existing `useRealtimeRefresh` will sync changes across tabs
