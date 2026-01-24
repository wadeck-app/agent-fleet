# Testing Composable Forms Pattern

## Manual Testing Checklist

### 1. CreateTaskDialog - Primary Test Case

**Setup:**

1. Start the dev server: `npm run dev`
2. Navigate to Tasks page
3. Click "Create Task" button

**Test 1: Footer Stays Fixed**

- [ ] Open CreateTaskDialog
- [ ] Verify footer with buttons is visible at bottom
- [ ] Select a worker with many flows
- [ ] Select a flow with many inputs (expand right panel)
- [ ] Scroll content in dialog body
- [ ] **Expected**: Footer stays fixed at bottom, always visible
- [ ] **Expected**: Only the middle content scrolls

**Test 2: Form Submission Works**

- [ ] Fill in required fields:
    - Description: "Test task"
    - Priority: "High"
    - Worker: Select any worker
- [ ] Click "Créer tâche" button
- [ ] **Expected**: Task is created successfully
- [ ] **Expected**: Success toast appears
- [ ] **Expected**: Dialog closes

**Test 3: Create and Open Button**

- [ ] Open CreateTaskDialog again
- [ ] Fill in required fields
- [ ] Click "Create and open" button
- [ ] **Expected**: Task is created
- [ ] **Expected**: Navigates to task detail page

**Test 4: Cancel Button**

- [ ] Open CreateTaskDialog
- [ ] Fill in some fields
- [ ] Click "Annuler" button
- [ ] **Expected**: Dialog closes without saving
- [ ] **Expected**: No API calls made

**Test 5: Validation Errors**

- [ ] Open CreateTaskDialog
- [ ] Click "Créer tâche" without filling fields
- [ ] **Expected**: Validation errors appear
- [ ] **Expected**: Footer still visible
- [ ] **Expected**: Error messages in appropriate fields

**Test 6: Resizable Splitter**

- [ ] Open CreateTaskDialog
- [ ] Drag the vertical splitter between columns
- [ ] **Expected**: Columns resize smoothly
- [ ] **Expected**: Footer remains fixed
- [ ] Refresh page and reopen dialog
- [ ] **Expected**: Splitter position is remembered

**Test 7: Long Form Content**

- [ ] Select a worker
- [ ] Select a flow with 10+ inputs
- [ ] **Expected**: Footer stays at bottom
- [ ] **Expected**: Can scroll to see all inputs
- [ ] **Expected**: Footer buttons always visible

**Test 8: Button States**

- [ ] Open CreateTaskDialog
- [ ] Fill in all required fields
- [ ] Click "Créer tâche"
- [ ] **During submission**:
    - [ ] Button text changes to "Saving..."
    - [ ] All buttons disabled
    - [ ] Footer remains visible
- [ ] **After success**:
    - [ ] Dialog closes
    - [ ] Success message appears

### 2. Backward Compatibility Tests

**Test Old Dialogs Still Work:**

**CreateProjectDialog:**

- [ ] Navigate to Projects page
- [ ] Click "Create Project"
- [ ] **Expected**: Dialog opens normally
- [ ] Fill in project details
- [ ] Click "Create Project"
- [ ] **Expected**: Project created successfully

**EditProjectDialog:**

- [ ] Navigate to Projects page
- [ ] Click edit icon on any project
- [ ] **Expected**: Dialog opens with project data
- [ ] Modify fields
- [ ] Click "Save"
- [ ] **Expected**: Project updated successfully

**EditWorkspaceDialog:**

- [ ] Navigate to Workspaces page
- [ ] Click edit icon on any workspace
- [ ] **Expected**: Dialog opens normally
- [ ] Modify fields
- [ ] Click "Save"
- [ ] **Expected**: Workspace updated successfully

### 3. Visual Regression Tests

**Layout Verification:**

- [ ] Header stays at top (never scrolls)
- [ ] Footer stays at bottom (never scrolls)
- [ ] Content area scrolls independently
- [ ] No visual glitches during scroll
- [ ] No layout shifts when opening/closing

**Responsive Design:**

- [ ] Test at 1920x1080 resolution
- [ ] Test at 1366x768 resolution
- [ ] Test at 1024x768 resolution
- [ ] **Expected**: Footer always visible on all sizes

**Dark Mode:**

- [ ] Switch to dark mode
- [ ] Open CreateTaskDialog
- [ ] **Expected**: Colors correct
- [ ] **Expected**: Footer styling correct

### 4. Browser Compatibility

Test in:

- [ ] Chrome (primary)
- [ ] Firefox
- [ ] Edge
- [ ] Safari (if available)

**For each browser:**

- [ ] Open CreateTaskDialog
- [ ] Verify footer is fixed
- [ ] Submit form
- [ ] **Expected**: All functionality works

## Automated Testing

### Run Unit Tests

```bash
cd packages/web-frontend
npm run test FormActions.test.tsx
```

**Expected Results:**

```
✓ renders all actions
✓ handles button clicks
✓ disables buttons when isSubmitting is true
✓ respects individual action disabled state
✓ applies correct button variants
✓ supports external form submission via formId
✓ defaults to button type when not specified
✓ defaults to default variant when not specified
```

### Run TypeScript Check

```bash
npm run check:ts
```

**Expected**: No TypeScript errors

### Run Build

```bash
npm run build
```

**Expected**: Build succeeds

## Performance Tests

### Dialog Open/Close Speed

- [ ] Open CreateTaskDialog
- [ ] **Expected**: Opens smoothly (<100ms)
- [ ] Close dialog
- [ ] **Expected**: Closes smoothly (<100ms)

### Form Submission Speed

- [ ] Fill in minimal required fields
- [ ] Click submit
- [ ] **Expected**: Submission completes in <1s (depending on API)

### Scroll Performance

- [ ] Open dialog with 20+ form fields
- [ ] Scroll rapidly
- [ ] **Expected**: Smooth 60fps scrolling
- [ ] **Expected**: No jank or layout shifts

## Edge Cases

### Test 1: Multiple Actions

- [ ] Verify all 3 buttons render correctly
- [ ] Verify correct order: Save, Secondary, Cancel
- [ ] Verify correct variants applied

### Test 2: Disabled Actions

- [ ] During submission, all buttons should be disabled
- [ ] Individual actions can have disabled: true

### Test 3: Long Button Labels

- [ ] Actions with long labels should not break layout
- [ ] Footer should wrap buttons on small screens

### Test 4: Form ID Conflicts

- [ ] Open two dialogs with different forms
- [ ] **Expected**: No form ID conflicts
- [ ] **Expected**: Each dialog submits independently

## Regression Tests

### Things That Should NOT Change

**Old Dialogs:**

- [ ] CreateProjectDialog still works
- [ ] EditProjectDialog still works
- [ ] EditWorkspaceDialog still works
- [ ] No visual changes to old dialogs

**Form Fields:**

- [ ] All field types still work
- [ ] Validation still works
- [ ] Error messages still appear correctly

**Other Features:**

- [ ] Toast notifications still work
- [ ] Navigation still works
- [ ] API calls still work

## Success Criteria

**All tests must pass:**

- ✅ Footer is always visible (never scrolls)
- ✅ Form submission works via external form ID
- ✅ All buttons work correctly
- ✅ Validation errors appear correctly
- ✅ Old dialogs still work (backward compatibility)
- ✅ No visual regressions
- ✅ No TypeScript errors
- ✅ No build errors
- ✅ Unit tests pass

## Known Issues

None expected.

## Rollback Plan

If critical issues found:

1. Revert CreateTaskDialog changes:

    ```bash
    git checkout HEAD -- packages/web-frontend/src/app/pages/tasks/CreateTaskDialog.tsx
    ```

2. Revert FormContainer changes:

    ```bash
    git checkout HEAD -- packages/web-frontend/src/framework/features/forms/FormContainer.tsx
    ```

3. Delete new files:
    ```bash
    rm packages/web-frontend/src/framework/features/forms/FormActions.tsx
    rm packages/web-frontend/src/framework/features/forms/FormActions.test.tsx
    ```

## Contact

For issues or questions, check:

- `.claude/docs/composable-forms-pattern.md` - Full documentation
- This file - Testing instructions
