# Plan: Unity Shader Graph-Style Data Flow Visualization

**Created**: 2025-12-29_22-39
**Task**: Add variable/input/output visualization to FlowEditor with data ports, constant nodes, and edge toggles

## Executive Summary

Implement Unity Shader Graph-style data port visualization for the FlowEditor:

- **Data ports** on nodes (input/output variables parsed from YAML)
- **Constant value nodes** (UI-only, mini-nodes for hardcoded values)
- **Data flow edges** (visual only, not persisted to backend)
- **Two toggle buttons** for showing/hiding dependency edges and data flow edges separately
- **Type validation** when connecting data ports

**Key Constraint**: Backend data model unchanged. All data flow visualization is frontend-only.

## Architecture Decisions

### 1. Type System

- **Decision**: Sync frontend types with backend by importing from `flow-engine` package
- **Rationale**: Ensure type safety and avoid drift between frontend/backend

### 2. Variable Detection

- **Outputs**: Parse `step.output` field from YAML (already in backend model)
- **Inputs**: Parse template variables in prompts/scripts using regex: `/\$\{\{\s*([^}]+)\s*\}\}/g`
- **Example**: `${{ steps.step1.outputs.response }}` → input port "steps.step1.outputs.response"

### 3. Constant Nodes

- **Storage**: ReactFlow state only (NOT in FlowDefinition)
- **Purpose**: Visual helper for hardcoded values
- **Type**: New node type `'constant'` with `ConstantNodeData { value, type, label }`

### 4. Data Flow Edges

- **Storage**: localStorage keyed by flow ID (NOT in backend)
- **Type**: New edge type `'dataflow'`
- **Styling**: Fine dotted lines, type-based colors, lower z-index than dependency edges

### 5. Toggle System

- **State**: Two independent boolean states in `useFlowEditor`
- **Persistence**: localStorage with keys `flowEditor.showDependencyEdges` and `flowEditor.showDataFlowEdges`
- **Filtering**: Filter edges based on `edgeType` before rendering

## Implementation Phases

### Phase 1: Type System Sync (Foundation)

**Goal**: Update frontend types to match backend

**Files**:

- `packages/web-frontend/src/app/pages/flows/flow-editor/types/flow-engine.types.ts`

**Changes**:

```typescript
// Import from backend
export type { VariableType, StepOutput, OutputVariableConfig, TransformFunction } from 'flow-engine/src/types';

// Update FlowDefinition.inputs
inputs: Record<string, VariableType>; // Changed from Record<string, string>

// Update BaseFlowStep
interface BaseFlowStep {
	// ... existing fields
	output?: StepOutput; // ADD THIS
}
```

### Phase 2: Variable Extraction Utilities

**Goal**: Parse inputs/outputs from steps to generate port definitions

**New File**: `packages/web-frontend/src/app/pages/flows/flow-editor/utils/VariableExtractor.ts`

**Key Functions**:

- `extractOutputPorts(step)`: Parse `step.output` → `VariablePort[]`
- `extractInputPorts(step, flow)`: Parse prompts/scripts for `${{ ... }}` → `VariablePort[]`
- `extractAllPorts(flow)`: Generate ports for all steps → `Map<stepId, NodeWithPorts>`

**Interface**:

```typescript
interface VariablePort {
	id: string; // e.g., "output-response"
	name: string; // e.g., "response"
	type: VariableType; // 'string' | 'number' | 'boolean' | 'object'
	direction: 'input' | 'output';
	required?: boolean;
}
```

### Phase 3: Enhanced Node Components

**Goal**: Add dynamic data port handles to existing node components

**Files to Modify**:

- `packages/web-frontend/src/app/pages/flows/flow-editor/types.ts` (add ports to `StepNodeData`)
- `packages/web-frontend/src/app/pages/flows/flow-editor/nodes/ModelStepNode.tsx`
- `packages/web-frontend/src/app/pages/flows/flow-editor/nodes/ScriptStepNode.tsx`
- `packages/web-frontend/src/app/pages/flows/flow-editor/nodes/SubFlowStepNode.tsx`

**Changes**:

1. Update `StepNodeData` interface:

    ```typescript
    interface StepNodeData {
    	step: FlowStep;
    	validationIssues: ValidationIssue[];
    	inputPorts?: VariablePort[]; // ADD
    	outputPorts?: VariablePort[]; // ADD
    }
    ```

2. Add handles in nodes:

    ```typescript
    {/* Data input ports (left, above main handle) */}
    {inputPorts.map((port, index) => (
      <Handle
        key={port.id}
        type="target"
        position={Position.Left}
        id={port.id}
        className="!bg-blue-500 !w-3 !h-3"
        style={{ top: `${20 + index * 24}px` }}
        title={`${port.name} (${port.type})`}
      />
    ))}

    {/* Main dependency handle stays at center */}

    {/* Data output ports (right, above main handle) */}
    {outputPorts.map((port, index) => (
      <Handle
        key={port.id}
        type="source"
        position={Position.Right}
        id={port.id}
        className="!bg-green-500 !w-3 !h-3"
        style={{ top: `${20 + index * 24}px` }}
        title={`${port.name} (${port.type})`}
      />
    ))}
    ```

**Handle Colors**:

- Blue: Input data ports
- Green: Output data ports
- Primary: Main dependency handles
- Red: Loop handles

### Phase 4: Constant Value Nodes

**Goal**: Create mini-nodes for hardcoded values

**New Files**:

- `packages/web-frontend/src/app/pages/flows/flow-editor/nodes/ConstantNode.tsx`

**Component**:

```typescript
interface ConstantNodeData {
	value: any;
	type: VariableType;
	label?: string;
}

export const ConstantNode = memo(({ data, selected }) => {
	// Small node (80-120px) with single output handle
	// Display type icon + formatted value
});
```

**Integration**:

- Register in `nodes/index.ts`: `constant: ConstantNode`
- Add "Constant" button to `FlowEditorToolbar.tsx`
- Handle in `useFlowEditor.ts`: Create ReactFlow node, NOT a FlowStep
- **Critical**: Exclude constant nodes in `reactFlowToFlowDefinition()`

### Phase 5: Data Flow Edges

**Goal**: Create visual edges for data connections

**New Files**:

- `packages/web-frontend/src/app/pages/flows/flow-editor/edges/DataFlowEdge.tsx`

**Component**:

```typescript
interface DataFlowEdgeData {
	edgeType: 'dataflow';
	sourceVarName?: string;
	targetVarName?: string;
	varType?: VariableType;
}

export const DataFlowEdge = memo(props => {
	// Bezier path, dotted line (strokeDasharray: '2,2')
	// Color by type: string=blue, number=green, boolean=amber, object=purple
	// Opacity: 0.7, strokeWidth: 1-2px
});
```

**Integration**:

- Register in `edges/index.ts`: `dataflow: DataFlowEdge`
- Update `EdgeData` type to include `'dataflow'`

### Phase 6: Edge Visibility Toggles

**Goal**: Add two independent toggle buttons to show/hide edge types

**Files to Modify**:

- `packages/web-frontend/src/app/pages/flows/flow-editor/hooks/useFlowEditor.ts`
- `packages/web-frontend/src/app/pages/flows/flow-editor/FlowEditorToolbar.tsx`
- `packages/web-frontend/src/app/pages/flows/flow-editor/FlowEditorPage.tsx`

**Changes in useFlowEditor.ts**:

```typescript
// State with localStorage persistence
const [showDependencyEdges, setShowDependencyEdges] = useState(() => {
  return localStorage.getItem('flowEditor.showDependencyEdges') !== 'false';
});

const [showDataFlowEdges, setShowDataFlowEdges] = useState(() => {
  return localStorage.getItem('flowEditor.showDataFlowEdges') !== 'false';
});

// Persist on change
useEffect(() => {
  localStorage.setItem('flowEditor.showDependencyEdges', String(showDependencyEdges));
}, [showDependencyEdges]);

useEffect(() => {
  localStorage.setItem('flowEditor.showDataFlowEdges', String(showDataFlowEdges));
}, [showDataFlowEdges]);

// Filter edges
const filteredEdges = useMemo(() => {
  return edges.filter(edge => {
    const type = edge.data?.edgeType;
    if (type === 'dependency' || type === 'conditional' || type === 'loop') {
      return showDependencyEdges;
    }
    if (type === 'dataflow') {
      return showDataFlowEdges;
    }
    return true;
  });
}, [edges, showDependencyEdges, showDataFlowEdges]);

// Return filteredEdges instead of edges
return {
  // ...
  edges: filteredEdges,
  toggleDependencyEdges: () => setShowDependencyEdges(p => !p),
  toggleDataFlowEdges: () => setShowDataFlowEdges(p => !p),
};
```

**Changes in FlowEditorToolbar.tsx**:

```typescript
// Add toggle buttons in toolbar
<Button
  variant={showDependencyEdges ? 'default' : 'outline'}
  size="sm"
  onClick={onToggleDependencyEdges}
>
  <GitBranch className="mr-2 size-4" />
  Dependencies
</Button>

<Button
  variant={showDataFlowEdges ? 'default' : 'outline'}
  size="sm"
  onClick={onToggleDataFlowEdges}
>
  <Workflow className="mr-2 size-4" />
  Data Flow
</Button>
```

### Phase 7: Data Flow Edge Persistence

**Goal**: Save/load data flow edges from localStorage

**Files to Modify**:

- `packages/web-frontend/src/app/pages/flows/flow-editor/hooks/useFlowEditor.ts`

**Storage Key**: `flowEditor.dataFlowEdges.${flowId}`

**Load Logic** (in flow load effect):

```typescript
useEffect(() => {
	if (!flowDefinition) return;

	const { nodes: newNodes, edges: backendEdges } = flowDefinitionToReactFlow(flowDefinition);

	// Inject variable ports
	const portsMap = extractAllPorts(flowDefinition);
	const nodesWithPorts = newNodes.map(node => ({
		...node,
		data: {
			...node.data,
			inputPorts: portsMap.get(node.id)?.inputPorts || [],
			outputPorts: portsMap.get(node.id)?.outputPorts || [],
		},
	}));

	// Load data flow edges from localStorage
	const key = `flowEditor.dataFlowEdges.${flowDefinition.id}`;
	const stored = localStorage.getItem(key);
	const dataFlowEdges = stored ? JSON.parse(stored) : [];

	setNodes(nodesWithPorts);
	setEdges([...backendEdges, ...dataFlowEdges]);
}, [flowDefinition, setNodes, setEdges]);
```

**Save Logic** (auto-save on edge changes):

```typescript
useEffect(() => {
	if (!flowDefinition) return;

	// Extract only data flow edges
	const dataFlowEdges = edges.filter(e => e.data?.edgeType === 'dataflow');

	// Save to localStorage
	const key = `flowEditor.dataFlowEdges.${flowDefinition.id}`;
	localStorage.setItem(key, JSON.stringify(dataFlowEdges));
}, [edges, flowDefinition]);
```

**Critical**: Update `reactFlowToFlowDefinition` to filter out data flow edges:

```typescript
export function reactFlowToFlowDefinition(baseFlow, nodes, edges) {
	// EXCLUDE data flow edges and constant nodes
	const backendEdges = edges.filter(e => e.data?.edgeType !== 'dataflow');
	const backendNodes = nodes.filter(n => n.type !== 'constant');

	// ... rest of conversion
}
```

### Phase 8: Type Validation

**Goal**: Validate type compatibility when connecting data ports

**New File**: `packages/web-frontend/src/app/pages/flows/flow-editor/utils/TypeValidator.ts`

**Functions**:

```typescript
// Type compatibility rules
export function areTypesCompatible(sourceType: VariableType, targetType: VariableType): boolean {
	if (sourceType === targetType) return true;
	if (targetType === 'string' || targetType === 'object') return true; // Universal receivers
	if (sourceType === 'string' && (targetType === 'number' || targetType === 'boolean')) return true;
	if (sourceType === 'number' && targetType === 'boolean') return true;
	return false;
}

// Get type from handle ID
export function getHandleType(handleId: string, node: FlowNode): VariableType | null {
	if (node.type === 'constant') return node.data.type;

	const port =
		node.data.inputPorts?.find(p => p.id === handleId) || node.data.outputPorts?.find(p => p.id === handleId);

	return port?.type || null;
}
```

**Integration in useFlowEditor.ts**:

```typescript
const onConnect: OnConnect = useCallback(
	params => {
		// Check if data flow connection (not main handles)
		const isDataFlow =
			params.sourceHandle?.startsWith('input-') ||
			params.sourceHandle?.startsWith('output-') ||
			params.targetHandle?.startsWith('input-');

		if (!isDataFlow) {
			// Normal dependency edge
			setEdges(eds =>
				addEdge(
					{
						...params,
						type: 'dependency',
						data: { edgeType: 'dependency' },
					},
					eds
				)
			);
			setIsDirty(true);
			return;
		}

		// Validate types
		const sourceNode = nodes.find(n => n.id === params.source);
		const targetNode = nodes.find(n => n.id === params.target);
		const sourceType = getHandleType(params.sourceHandle!, sourceNode!);
		const targetType = getHandleType(params.targetHandle!, targetNode!);

		if (!areTypesCompatible(sourceType!, targetType!)) {
			console.error(`Type mismatch: Cannot connect ${sourceType} to ${targetType}`);
			// TODO: Show toast notification
			return;
		}

		// Create data flow edge
		setEdges(eds =>
			addEdge(
				{
					...params,
					type: 'dataflow',
					data: { edgeType: 'dataflow', varType: sourceType },
				},
				eds
			)
		);
		setIsDirty(true);
	},
	[setEdges, nodes]
);
```

## Critical Files Summary

### Files to Modify:

1. **`types/flow-engine.types.ts`** - Sync types with backend (add `VariableType`, `StepOutput`, etc.)
2. **`hooks/useFlowEditor.ts`** - Core state: toggles, port injection, filtering, localStorage
3. **`nodes/ModelStepNode.tsx`** - Add dynamic data port handles
4. **`nodes/ScriptStepNode.tsx`** - Add dynamic data port handles
5. **`nodes/SubFlowStepNode.tsx`** - Add dynamic data port handles
6. **`utils/flowToReactFlow.ts`** - Exclude constant nodes & data flow edges from backend conversion
7. **`FlowEditorToolbar.tsx`** - Add toggle buttons and constant button
8. **`FlowEditorPage.tsx`** - Wire toggle props to toolbar
9. **`types.ts`** - Update `StepNodeData` and `EdgeData` interfaces

### New Files to Create:

1. **`utils/VariableExtractor.ts`** - Parse inputs/outputs from steps
2. **`utils/TypeValidator.ts`** - Type compatibility validation
3. **`nodes/ConstantNode.tsx`** - Mini-node for hardcoded values
4. **`edges/DataFlowEdge.tsx`** - Visual edge for data connections
5. **`nodes/index.ts`** - Export and register ConstantNode
6. **`edges/index.ts`** - Export and register DataFlowEdge

## Implementation Order (Recommended)

### Day 1: Foundation

1. Phase 1: Type system sync
2. Phase 2: Variable extraction utilities
3. Write unit tests for VariableExtractor

### Day 2-3: Visual Components

4. Phase 3: Enhanced node components (add handles)
5. Phase 4: Constant nodes
6. Phase 5: Data flow edges

### Day 4: Interaction & State

7. Phase 6: Toggle system
8. Phase 8: Type validation

### Day 5: Persistence & Testing

9. Phase 7: localStorage persistence
10. Integration testing
11. Manual testing checklist

## Testing Strategy

### Unit Tests:

- `VariableExtractor.test.ts`: Template parsing, output extraction
- `TypeValidator.test.ts`: Type compatibility rules
- `ConstantNode.test.tsx`: Rendering and formatting
- `DataFlowEdge.test.tsx`: Edge rendering

### Integration Tests:

- Load flow → verify ports extracted
- Connect data flow edge → verify type validation
- Toggle edges → verify filtering
- Reload page → verify data flow edges persist

### Manual Checklist:

- [ ] Load flow with `${{ ... }}` templates → see input ports
- [ ] Load flow with `output:` configs → see output ports
- [ ] Add constant node → connect to input port
- [ ] Try incompatible type connection → see error
- [ ] Toggle dependencies on/off
- [ ] Toggle data flow on/off
- [ ] Reload page → data flow edges restored
- [ ] Save flow → backend unchanged (no data flow edges)

## Edge Cases

1. **Missing output definitions**: Show warning indicator on port, default to `string` type
2. **Too many ports**: Dynamically adjust node height based on port count
3. **Circular data dependencies**: Optional enhancement - detect and warn
4. **Handle overlap**: Vertical spacing of 24px between ports

## Risk Assessment

### High Risk:

- Type system changes may cause TypeScript errors across many files
- **Mitigation**: Incremental changes, thorough testing

### Medium Risk:

- Handle positioning with many ports may cause crowding
- **Mitigation**: Dynamic node sizing, vertical scrolling

### Low Risk:

- localStorage size limits
- **Mitigation**: Consider IndexedDB if needed

## Success Criteria

✅ Data ports visible on nodes based on YAML config
✅ Constant nodes creatable and connectable
✅ Data flow edges drawn between ports with drag & drop
✅ Type validation prevents incompatible connections
✅ Two independent toggles control edge visibility
✅ Data flow edges persist across page reloads
✅ Backend FlowDefinition unchanged (no data flow edges saved)
✅ No performance degradation with 20+ nodes

## Notes

- All data flow visualization is **frontend-only**
- Backend data model remains **unchanged**
- Data flow edges stored in **localStorage**, not backend
- Constant nodes are **UI helpers**, not FlowSteps
- Port extraction uses **existing template regex** from backend
