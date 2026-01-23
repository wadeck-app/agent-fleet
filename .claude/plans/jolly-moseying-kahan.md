# Plan: Hybrid Implicit/Explicit Flow Input System

## Objective

Implement a flexible flow input system supporting three declaration modes:

1. **Auto-discovery**: `${{ inputs.something }}` without declaration → automatically string, optional
2. **One-liner**: `task: string` → shorthand for simple inputs
3. **Extended format**: Full metadata with type, required, default, description

## Key Requirements

- Maintain backward compatibility with 29 existing flows
- Support default values and descriptions (for UI tooltips)
- Distinguish required vs optional inputs
- Validate inputs at task creation time (backend)
- Auto-discover undeclared inputs during flow validation

## Architecture Overview

### Type System

New types in `packages/flow-engine/src/types.ts`:

```typescript
// Extended input definition with metadata
interface InputDefinition {
	type: VariableType;
	required?: boolean; // default: false
	default?: any;
	description?: string; // for UI tooltips
}

// Union type: shorthand OR extended
type InputSpec = VariableType | InputDefinition;

// Normalized form (internal representation)
interface NormalizedInputDefinition {
	type: VariableType;
	required: boolean;
	default?: any;
	description?: string;
	source: 'explicit' | 'auto-discovered';
}

// Updated FlowDefinition
interface FlowDefinition {
	// ... existing fields ...
	inputs: Record<string, InputSpec>; // CHANGED from Record<string, VariableType>
	_autoDiscoveredInputs?: Record<string, NormalizedInputDefinition>; // NEW
}
```

### Implementation Phases

## Phase 1: Backend - Type System & Parser

**Files:**

- `packages/flow-engine/src/types.ts` (lines 428-439)
- `packages/flow-engine/src/registry/FlowRegistry.ts` (lines 175-302)

**Tasks:**

1. **Define new types** in `types.ts`:
    - Add `InputDefinition` interface
    - Add `InputSpec` type (union)
    - Add `NormalizedInputDefinition` interface
    - Update `FlowDefinition.inputs` type
    - Add `_autoDiscoveredInputs` field to FlowDefinition
    - Update `FlowMetadata.inputs` type

2. **Enhance YAML parser** in `FlowRegistry.ts`:
    - Add `normalizeInputs(rawInputs)` method:
        - Handle shorthand: `"string"` → `{ type: 'string', required: false, source: 'explicit' }`
        - Handle extended: `{ type, required, default, description }` → normalized form
        - Throw error on invalid formats
    - Update `parseFlowDefinition()` to use `normalizeInputs()`
    - Test with existing flows.yml (backward compatibility)

**Verification:**

```bash
npm run build
# All 29 existing flows should parse without errors
```

## Phase 2: Backend - Auto-Discovery

**Files:**

- `packages/flow-engine/src/validation/TemplateValidator.ts` (lines 50-212)
- `packages/flow-engine/src/validation/ValidationTypes.ts` (line 27)

**Tasks:**

1. **Add SubFlowStep scanning** in `TemplateValidator.ts`:
    - Update `extractVariableReferences()` (lines 50-87):
        - Add `else if (step.type === 'subflow')` branch
        - Scan `step.inputs` values for `${{ ... }}` expressions
    - Critical fix: SubFlowStep inputs currently NOT scanned

2. **Implement auto-discovery**:
    - Add `autoDiscoveredInputs: Map<string, NormalizedInputDefinition>` field
    - Add `getAutoDiscoveredInputs()` method
    - Update `validateReference()` (lines 122-212):
        - When UNDEFINED_INPUT detected, check if auto-discovery enabled
        - If enabled: add to `autoDiscoveredInputs` Map, log INFO (not ERROR)
        - If disabled: keep current ERROR behavior

3. **Add validation code**:
    - Add `AUTO_DISCOVERED_INPUT` to `ValidationCode` enum

**Verification:**

```bash
npm run test:flow-engine
# Template validator tests should pass
```

## Phase 3: Backend - Validation Integration

**Files:**

- `packages/flow-engine/src/validation/SchemaValidator.ts` (lines 271-301)
- `packages/flow-engine/src/validation/FlowValidator.ts` (lines 96-98)

**Tasks:**

1. **Update SchemaValidator** to normalize inputs:
    - Update `validateInputs()` to return `Record<string, NormalizedInputDefinition>`
    - Validate default value types match declared types (warn on mismatch)
    - Support both shorthand and extended formats

2. **Update FlowValidator** orchestration:
    - Pass normalized inputs from SchemaValidator to TemplateValidator
    - After Phase 4 template validation, merge explicit + auto-discovered inputs
    - Store merged result in `flow._autoDiscoveredInputs`

**Verification:**

```bash
npm run test:agent
# All validation tests pass
```

## Phase 4: Backend - API Contract

**Files:**

- `packages/shared-frontend-backend/src/api/flows.contract.ts`

**Tasks:**

1. **Update Zod schemas**:
    - Add `InputDefinitionSchema`:
        ```typescript
        z.object({
        	type: z.enum(['string', 'number', 'boolean', 'object']),
        	required: z.boolean(),
        	default: z.any().optional(),
        	description: z.string().optional(),
        	source: z.enum(['explicit', 'auto-discovered']),
        });
        ```
    - Update `FlowMetadataSchema.inputs` to use `InputDefinitionSchema`

2. **Update FlowRegistry metadata generation**:
    - Use `flow._autoDiscoveredInputs` (merged inputs) in metadata
    - Ensure backward compatibility (old clients ignore new fields)

**Verification:**

```bash
npm run build
# Check API contracts compile without errors
```

## Phase 5: Backend - Task Creation Validation

**Files:**

- `packages/web-backend/src/services/TasksService.ts` (lines 350-405)

**Tasks:**

1. **Add input validation** in `createTask()`:
    - After existing validation, add flow input validation
    - Get flow metadata from FlowRegistry
    - Call new `validateFlowInputs()` method

2. **Implement `validateFlowInputs()` method**:
    - Check required inputs are provided
    - Validate input types match declarations
    - Return array of error messages

**Verification:**

```bash
npm run test:web-backend
# Task creation tests with flow inputs should pass
```

## Phase 6: Frontend - Field Components

**Files:**

- `packages/web-frontend/src/framework/features/forms/fieldUtils.ts`
- `packages/web-frontend/src/framework/features/forms/fields/TextField.tsx`

**Tasks:**

1. **Extend BaseFieldProps**:
    - Add `description?: string` (for tooltips/help text)

2. **Update TextField component**:
    - Add `description` prop
    - Render description as help text below input
    - Style with `text-sm text-muted-foreground`

**Verification:**

```bash
npm run build:frontend
# Frontend compiles without errors
```

## Phase 7: Frontend - Task Creation Form

**Files:**

- `packages/web-frontend/src/app/pages/tasks/CreateTaskDialog.tsx` (lines 78-417)

**Tasks:**

1. **Update validation logic** (lines 78-87):
    - Read `inputDef.required` from flow metadata
    - Only validate required inputs (remove hardcoded "all required")

2. **Update form rendering** (lines 354-417):
    - Read `InputDefinition` from `selectedFlow.inputs[inputName]`
    - Pass `required={inputDef.required}` to TextField
    - Pass `description={inputDef.description}` to TextField
    - Show default value in placeholder if present
    - Add badge for auto-discovered inputs

**Verification:**

```bash
npm run dev
# Manually test task creation form with different flow types
```

## Phase 8: Testing

**Unit Tests:**

1. **FlowRegistry.test.ts** - Add tests:
    - Parse shorthand: `task: string`
    - Parse extended: `{ type: 'string', required: true, default: 'foo', description: 'bar' }`
    - Parse mixed formats in same flow
    - Error on invalid type

2. **TemplateValidator.test.ts** - Add tests:
    - Auto-discover from SubFlowStep inputs
    - Generate INFO issue for auto-discovered inputs
    - Don't duplicate explicitly defined inputs

3. **TasksService.test.ts** - Add tests:
    - Validate required inputs at task creation
    - Allow optional inputs to be omitted
    - Validate input types

**Integration Tests:**

1. **End-to-end flow**:
    - Create flow with auto-discovered inputs
    - Create task for that flow
    - Verify default values applied
    - Execute flow successfully

**Migration Tests:**

1. **Backward compatibility**:
    - Load all 29 existing flows
    - Verify all parse and validate successfully
    - Verify metadata format correct

**Verification:**

```bash
npm run test
npm run check
# All tests pass, no type errors
```

## Critical Files Summary

**Backend - Flow Engine:**

- `packages/flow-engine/src/types.ts` - Type definitions
- `packages/flow-engine/src/registry/FlowRegistry.ts` - YAML parsing
- `packages/flow-engine/src/validation/TemplateValidator.ts` - Auto-discovery
- `packages/flow-engine/src/validation/SchemaValidator.ts` - Normalization
- `packages/flow-engine/src/validation/FlowValidator.ts` - Orchestration

**Backend - API:**

- `packages/shared-frontend-backend/src/api/flows.contract.ts` - API schemas
- `packages/web-backend/src/services/TasksService.ts` - Task creation validation

**Frontend:**

- `packages/web-frontend/src/app/pages/tasks/CreateTaskDialog.tsx` - Form generation
- `packages/web-frontend/src/framework/features/forms/fields/TextField.tsx` - Field component
- `packages/web-frontend/src/framework/features/forms/fieldUtils.ts` - Field props

## Example Flow Definition

**Before (current):**

```yaml
simple-implement:
    inputs:
        task: string
    steps:
        - type: model
          prompt: '${{ inputs.task }}'
```

**After - Auto-discovery:**

```yaml
simple-implement:
    # No inputs section needed!
    steps:
        - type: model
          prompt: '${{ inputs.task }}'
```

→ `task` auto-discovered as `string`, optional

**After - One-liner:**

```yaml
simple-implement:
    inputs:
        task: string # shorthand
    steps:
        - type: model
          prompt: '${{ inputs.task }}'
```

→ Same as before (backward compatible)

**After - Extended:**

```yaml
simple-implement:
    inputs:
        task:
            type: string
            required: true
            description: 'Task description for implementation'
    steps:
        - type: model
          prompt: '${{ inputs.task }}'
```

→ Required input with description shown in UI

## Migration Strategy

**Phase 1 (Immediate):** Deploy new system

- All 29 existing flows work without changes
- Shorthand format normalized to `{ type, required: false, source: 'explicit' }`

**Phase 2 (Gradual):** Update flows to extended format

- Add descriptions for better UX
- Mark critical inputs as required
- Add default values where appropriate

**Phase 3 (Future):** Leverage auto-discovery

- Remove boilerplate `inputs` sections for simple flows
- Focus explicit declarations on required/constrained inputs

## Risks & Mitigations

**Risk:** Breaking existing flows

- **Mitigation:** Comprehensive backward compatibility testing with all 29 flows

**Risk:** Type inference complexity for auto-discovered inputs

- **Mitigation:** Default to `string` type (safe, can be overridden explicitly)

**Risk:** SubFlowStep input scanning adds complexity

- **Mitigation:** Reuse existing template regex, minimal code change

**Risk:** Frontend form changes break existing workflows

- **Mitigation:** Progressive enhancement (gracefully handle missing metadata)

## Success Criteria

1. ✅ All 29 existing flows parse and validate without errors
2. ✅ Auto-discovery works for inputs used in prompts, scripts, and subflow inputs
3. ✅ Backend validates required inputs at task creation time
4. ✅ Frontend shows descriptions as tooltips/help text
5. ✅ Frontend respects required vs optional indicators
6. ✅ All tests pass (unit + integration)
7. ✅ No type errors (`npm run check`)

## End-to-End Verification

```bash
# 1. Build all packages
npm run build

# 2. Run type checking
npm run check

# 3. Run all tests
npm run test

# 4. Start dev server
npm run dev

# 5. Manual testing:
#    - Create a new flow with extended input format
#    - Create a task for that flow
#    - Verify form shows description, required indicator
#    - Submit task and verify validation works
#    - Execute flow and verify inputs passed correctly

# 6. Migration verification:
#    - Load all existing flows (check orchestrator logs)
#    - Verify no validation errors
#    - Create tasks for existing flows
#    - Verify existing workflows unchanged
```
