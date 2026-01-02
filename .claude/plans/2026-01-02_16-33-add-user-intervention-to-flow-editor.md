# Plan: Add User Intervention Step to Flow Editor

**Created:** 2026-01-02_16-33
**Status:** Ready for Approval

## Context

The Flow Editor currently supports 4 step types (model, script, subflow, constant), but the `user_intervention` step type is missing from the UI despite:

- Already having a `UserInterventionNode.tsx` component
- Being defined in the backend types
- Having full execution support in flow-engine

## Current State

**What Exists:**

- `UserInterventionNode.tsx` at `packages/web-frontend/src/app/pages/flows/flow-editor/nodes/UserInterventionNode.tsx`
- Type definition: `UserInterventionStep` in `packages/web-frontend/src/app/pages/flows/flow-editor/types/flow-engine.types.ts`
- Node registered in `packages/web-frontend/src/app/pages/flows/flow-editor/nodes/index.ts` as `user_intervention: UserInterventionNode`

**What's Missing:**

1. ❌ Toolbar button to add user_intervention steps
2. ❌ `addNode()` handler for creating default user_intervention steps
3. ❌ Properties panel fields to configure user_intervention steps

## Implementation Plan

### Step 1: Add Toolbar Button

**File:** `packages/web-frontend/src/app/pages/flows/flow-editor/FlowEditorToolbar.tsx`

**Changes:**

- Line 4: Add `Bell` icon import from lucide-react
- Line 12: Update `onAddNode` type parameter to include `'user_intervention'`
    ```typescript
    onAddNode: (type: 'model' | 'script' | 'subflow' | 'constant' | 'user_intervention') => void;
    ```
- After line 97 (after Constant button): Add new button:
    ```tsx
    <Button
    	variant="outline"
    	size="sm"
    	draggable
    	onDragStart={e => onDragStart(e, 'user_intervention')}
    	onClick={() => onAddNode('user_intervention')}
    	className="h-8"
    >
    	<Bell className="mr-2 size-4" />
    	User Intervention
    </Button>
    ```

### Step 2: Handle Step Creation

**File:** `packages/web-frontend/src/app/pages/flows/flow-editor/hooks/useFlowEditor.ts`

**Changes:**

- Line 371: Update `addNode` type parameter to include `'user_intervention'`
    ```typescript
    const addNode = useCallback(
      (type: 'model' | 'script' | 'subflow' | 'constant' | 'user_intervention') => {
    ```
- After line 416 (in the else branch for subflow), add elif for user_intervention:
    ```typescript
    } else if (type === 'user_intervention') {
      newStep = {
        type: 'user_intervention',
        id: newId,
        name: 'New User Intervention',
        interventionType: 'approval',
        blocking: true,
        approval: {
          title: '',
          allowReject: true,
        },
      } as UserInterventionStep;
    } else {
    ```

### Step 3: Add Properties Panel Configuration

**File:** `packages/web-frontend/src/app/pages/flows/flow-editor/FlowEditorPropertiesPanel.tsx`

**Changes:**
After line 401 (after subflow section), add new section for user_intervention:

```typescript
{step.type === 'user_intervention' && (
  <>
    <div className="space-y-2">
      <Label htmlFor="interventionType">Intervention Type</Label>
      <select
        id="interventionType"
        value={step.interventionType}
        onChange={e => handleUpdate('interventionType', e.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="approval">Approval</option>
        <option value="question">Question</option>
        <option value="choice">Choice</option>
      </select>
    </div>

    <div className="space-y-2">
      <Label htmlFor="blocking">
        <input
          id="blocking"
          type="checkbox"
          checked={step.blocking ?? true}
          onChange={e => handleUpdate('blocking', e.target.checked)}
          className="mr-2"
        />
        Blocking (wait for user response)
      </Label>
    </div>

    {/* Approval Configuration */}
    {step.interventionType === 'approval' && (
      <>
        <div className="space-y-2">
          <Label htmlFor="approval-title">Approval Title</Label>
          <Input
            id="approval-title"
            value={step.approval?.title || ''}
            onChange={e => onUpdateNode(selectedNode.id, {
              approval: { ...step.approval, title: e.target.value }
            } as Partial<FlowStep>)}
            placeholder="e.g., Approve Deployment to Production"
          />
          <FieldValidationMessage
            issues={selectedNode.data.validationIssues.filter(
              issue => issue.location?.field === 'approval.title'
            )}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="approval-description">Description (optional)</Label>
          <Textarea
            id="approval-description"
            value={step.approval?.description || ''}
            onChange={e => onUpdateNode(selectedNode.id, {
              approval: { ...step.approval, description: e.target.value }
            } as Partial<FlowStep>)}
            rows={3}
            placeholder="Additional context or instructions"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="approval-allowReject">
            <input
              id="approval-allowReject"
              type="checkbox"
              checked={step.approval?.allowReject ?? true}
              onChange={e => onUpdateNode(selectedNode.id, {
                approval: { ...step.approval, allowReject: e.target.checked }
              } as Partial<FlowStep>)}
              className="mr-2"
            />
            Allow Reject
          </Label>
        </div>
      </>
    )}

    {/* Question Configuration */}
    {step.interventionType === 'question' && (
      <>
        <div className="space-y-2">
          <Label htmlFor="question-text">Question</Label>
          <Textarea
            id="question-text"
            value={step.question?.question || ''}
            onChange={e => onUpdateNode(selectedNode.id, {
              question: { ...step.question, question: e.target.value }
            } as Partial<FlowStep>)}
            rows={3}
            placeholder="Enter your question here"
          />
          <FieldValidationMessage
            issues={selectedNode.data.validationIssues.filter(
              issue => issue.location?.field === 'question.question'
            )}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="question-responseType">Response Type</Label>
          <select
            id="question-responseType"
            value={step.question?.responseType || 'text'}
            onChange={e => onUpdateNode(selectedNode.id, {
              question: { ...step.question, responseType: e.target.value as 'text' | 'number' | 'boolean' }
            } as Partial<FlowStep>)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="boolean">Boolean</option>
          </select>
        </div>
      </>
    )}

    {/* Choice Configuration */}
    {step.interventionType === 'choice' && (
      <>
        <div className="space-y-2">
          <Label htmlFor="choice-question">Question</Label>
          <Textarea
            id="choice-question"
            value={step.choice?.question || ''}
            onChange={e => onUpdateNode(selectedNode.id, {
              choice: { ...step.choice, question: e.target.value }
            } as Partial<FlowStep>)}
            rows={3}
            placeholder="What would you like the user to choose?"
          />
          <FieldValidationMessage
            issues={selectedNode.data.validationIssues.filter(
              issue => issue.location?.field === 'choice.question'
            )}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="choice-options">Options (JSON)</Label>
          <Textarea
            id="choice-options"
            value={JSON.stringify(step.choice?.options || [], null, 2)}
            onChange={e => {
              try {
                const parsed = JSON.parse(e.target.value);
                onUpdateNode(selectedNode.id, {
                  choice: { ...step.choice, options: parsed }
                } as Partial<FlowStep>);
              } catch (_err) {
                // Invalid JSON, ignore
              }
            }}
            rows={8}
            className="font-mono text-sm"
            placeholder='[{"id": "option1", "label": "Option 1", "description": "..."}]'
          />
          <p className="text-xs text-muted-foreground">
            Array of options with id, label, and optional description
          </p>
          <FieldValidationMessage
            issues={selectedNode.data.validationIssues.filter(
              issue => issue.location?.field === 'choice.options'
            )}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="choice-allowMultiple">
            <input
              id="choice-allowMultiple"
              type="checkbox"
              checked={step.choice?.allowMultiple ?? false}
              onChange={e => onUpdateNode(selectedNode.id, {
                choice: { ...step.choice, allowMultiple: e.target.checked }
              } as Partial<FlowStep>)}
              className="mr-2"
            />
            Allow Multiple Selection
          </Label>
        </div>
      </>
    )}
  </>
)}
```

## Files to Modify

1. `packages/web-frontend/src/app/pages/flows/flow-editor/FlowEditorToolbar.tsx` (~10 lines)
2. `packages/web-frontend/src/app/pages/flows/flow-editor/hooks/useFlowEditor.ts` (~15 lines)
3. `packages/web-frontend/src/app/pages/flows/flow-editor/FlowEditorPropertiesPanel.tsx` (~150 lines)

## Testing Strategy

After implementation:

1. Verify button appears in toolbar
2. Test drag-and-drop from toolbar
3. Test click to add step
4. Verify default step is created with correct structure
5. Test switching between intervention types (approval/question/choice)
6. Verify validation messages appear for required fields
7. Test template variable support in title/description/question fields
8. Save flow and verify YAML output matches expected structure

## Notes

- The `UserInterventionNode.tsx` component already exists and handles rendering
- Type definitions are already complete in `flow-engine.types.ts`
- Validation logic is already implemented in flow-engine's `SchemaValidator.ts`
- This is purely a UI addition to expose existing functionality
