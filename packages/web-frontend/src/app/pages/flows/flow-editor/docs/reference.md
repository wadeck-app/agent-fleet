 Reference

_Moved from README -- see [README](../README.md) for the overview._

 FlowEditorPage.tsx               Pain page
 FlowEditorCanvas.tsx             Canvas Xyflow
 FlowEditorToolbar.tsx            Toolbar
 FlowEditorPropertiesPanel.tsx   Properties panel
 FlowEditorValidationPanel.tsx   Validation panel
 types.ts                         TypeScript types
 nodes/
    ModelStepNode.tsx           Node for model step
    ScriptStepNode.tsx          Node for script step
    SubFlowStepNode.tsx         Node for subflow step
    index.ts                    Export node types
 edges/
    DependencyEdge.tsx          Edge for dependances
    LoopEdge.tsx                Edge for loops
    index.ts                    Export edge types
 hooks/
    useFlowEditor.ts            Main hook
    useFlowValidation.ts        Validation hook
    index.ts
 utils/
    flowToReactFlow.ts          Serialization YAML → Xyflow
    reactFlowToFlow.ts          Serialization Xyflow → YAML
    layoutAlgorithms.ts         Layout algorithms
    cn.ts                       Classnames utility
 README.md                        This documentation
```

  Technologies

- Xyflow v - Interactive graph library
- Dagre - Layout algorithms hierarchique
- Radix UI - Composants UI accessibles
- Tailwind CSS - Styling
- React  - Framework

  Routes

- `/flows/new` - create a nouveau flow
- `/flows/:flowId/edit` - Editer a flow existant

  Composants Visuels

 Nodes

Chaque Type of step a son propre composant visual :

- ModelStepNode : Icone , badge model (sonnet/haiku/opus)
- ScriptStepNode : Icone , badge "script"
- SubFlowStepNode : Icone , badge flowId

All nodes display :

- Step name
- Conditional indicators (when)
- Validation errors (border rouge + compteur)
- Connection handles (haut/bas)

 Edges

- DependencyEdge : Solid line for dependencies (`depends`)
- LoopEdge : Animated dashed line for loops (`onFailure.goto`)

  Validation States

-  Vert : No errors
-  Orange : Warnings
-  Rouge : Critical errors

  Serialization

 FlowDefinition → React Flow

```typescript
const { nodes, edges } = flowDefinitionToReactFlow(flowDefinition);
```

- Converts `steps[]` to Xyflow nodes
- Converts `depends[]` to dependency edges
- Converts `onFailure.goto` to loop edges
- Automatically calculates positions

 React Flow → FlowDefinition

```typescript
const flowDefinition = reactFlowToFlowDefinition(nodes, edges, metadata);
```

- Extrait the steps depuis the nodes
- Reconstruit the `depends[]` depuis the edges
- Reconstruit the `onFailure.goto` depuis the loop edges

  Prochaines Etapes

 Phase  (Ameliorations)

- [ ] Ameliorer the drag & drop (preview pendant the drag)
- [ ] add minimap interactive
- [ ] add undo/redo
- [ ] Exporter en image (PNG/SVG)
- [ ] Mode YAML split view (visual + code)

 Phase  (Features avancees)

- [ ] Execution of flow depuis l'editeur
- [ ] Visualisation of l'execution en temps reel
- [ ] History of the versions
- [ ] Templates of flows
- [ ] Snippets of steps

  References

- [Xyflow Documentation](https://xyflow.com/react)
- [Dagre Documentation](https://github.com/dagrejs/dagre)
- [FlowValidator API](../../../../../flow-engine/src/validation/FlowValidator.ts)
- [Flow Types](../../../../../flow-engine/src/types.ts)

  Problemes Connus

 Imports flow-engine

Imports from `flow-engine` require proper TypeScript configuration. Currently, relative paths are used. For better maintainability, add an alias in `tsconfig.json`:

```json
{
	"compilerOptions": {
		"paths": {
			"flow-engine/": ["../../../flow-engine/src/"]
		}
	}
}
```

 Types Xyflow

Quelques incompatibilites mineures of types with Xyflow necessitent of the `as any` temporaires. Ces types peuvent etre affines with of the generiques more precis.

 ‍ Developpement

 Demarrer the dev server

```bash
npm run dev
```

 Acceder a l'editeur

```
http://localhost:/flows/new
http://localhost:/flows/test-diamond/edit
```

 Tests

```bash
npm run test                  Unit tests
npm run test:watch            Watch mode
npm run test:coverage         Coverage report
```

 Build

```bash
npm run build
```

  Examples d'Usage

```typescript
import { FlowEditorPage } from '@app/pages/flows/flow-editor';

// in App.tsx
<Route path="/flows/:flowId/edit" element={<FlowEditorPage />} />
<Route path="/flows/new" element={<FlowEditorPage />} />
```

The component gere automatiquement :

- Loading of the flow depuis l'URL
- Serialization bidirectionnelle
- Validation en temps reel
- Sauvegarde with dirty tracking

  Credits

Implementation basee on :

- [Xyflow Examples](https://reactflow.dev/examples)
- [BPMN.io](https://bpmn.io/) for l'inspiration UX
- [GitHub Actions Workflow Editor](https://github.com/features/actions) for the patterns d'interaction
