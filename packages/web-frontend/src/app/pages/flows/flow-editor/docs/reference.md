 Reference

_Moved from README -- see [README](../README.md) for the overview._

 FlowEditorPage.tsx               Page principale
 FlowEditorCanvas.tsx             Canvas Xyflow
 FlowEditorToolbar.tsx            Barre d'outils
 FlowEditorPropertiesPanel.tsx   Panneau de proprietes
 FlowEditorValidationPanel.tsx   Panneau de validation
 types.ts                         Types TypeScript
 nodes/
    ModelStepNode.tsx           Node pour model step
    ScriptStepNode.tsx          Node pour script step
    SubFlowStepNode.tsx         Node pour subflow step
    index.ts                    Export des node types
 edges/
    DependencyEdge.tsx          Edge pour dependances
    LoopEdge.tsx                Edge pour loops
    index.ts                    Export des edge types
 hooks/
    useFlowEditor.ts            Hook principal
    useFlowValidation.ts        Hook de validation
    index.ts
 utils/
    flowToReactFlow.ts          Serialisation YAML → Xyflow
    reactFlowToFlow.ts          Serialisation Xyflow → YAML
    layoutAlgorithms.ts         Algorithmes de layout
    cn.ts                       Utilitaire classnames
 README.md                        Cette documentation
```

  Technologies

- Xyflow v - Bibliotheque de graphs interactifs
- Dagre - Algorithme de layout hierarchique
- Radix UI - Composants UI accessibles
- Tailwind CSS - Styling
- React  - Framework

  Routes

- `/flows/new` - Creer un nouveau flow
- `/flows/:flowId/edit` - Editer un flow existant

  Composants Visuels

 Nodes

Chaque type de step a son propre composant visual :

- ModelStepNode : Icone , badge model (sonnet/haiku/opus)
- ScriptStepNode : Icone , badge "script"
- SubFlowStepNode : Icone , badge flowId

Tous les nodes affichent :

- Nom du step
- Indicateurs conditionnels (when)
- Erreurs de validation (border rouge + compteur)
- Handles de connexion (haut/bas)

 Edges

- DependencyEdge : Ligne pleine pour dependances (`depends`)
- LoopEdge : Ligne pointillee animee pour loops (`onFailure.goto`)

  Etats de Validation

-  Vert : Pas d'erreur
-  Orange : Warnings
-  Rouge : Erreurs critiques

  Serialisation

 FlowDefinition → React Flow

```typescript
const { nodes, edges } = flowDefinitionToReactFlow(flowDefinition);
```

- Convertit les `steps[]` en nodes Xyflow
- Convertit les `depends[]` en edges de dependance
- Convertit les `onFailure.goto` en edges de loop
- Calcule les positions automatiquement

 React Flow → FlowDefinition

```typescript
const flowDefinition = reactFlowToFlowDefinition(nodes, edges, metadata);
```

- Extrait les steps depuis les nodes
- Reconstruit les `depends[]` depuis les edges
- Reconstruit les `onFailure.goto` depuis les loop edges

  Prochaines Etapes

 Phase  (Ameliorations)

- [ ] Ameliorer le drag & drop (preview pendant le drag)
- [ ] Ajouter minimap interactive
- [ ] Ajouter undo/redo
- [ ] Exporter en image (PNG/SVG)
- [ ] Mode YAML split view (visual + code)

 Phase  (Features avancees)

- [ ] Execution de flow depuis l'editeur
- [ ] Visualisation de l'execution en temps reel
- [ ] Historique des versions
- [ ] Templates de flows
- [ ] Snippets de steps

  References

- [Xyflow Documentation](https://xyflow.com/react)
- [Dagre Documentation](https://github.com/dagrejs/dagre)
- [FlowValidator API](../../../../../flow-engine/src/validation/FlowValidator.ts)
- [Flow Types](../../../../../flow-engine/src/types.ts)

  Problemes Connus

 Imports flow-engine

Les imports depuis `flow-engine` necessitent une configuration TypeScript appropriee. Actuellement, des chemins relatifs sont utilises. Pour une meilleure maintenabilite, ajouter un alias dans `tsconfig.json` :

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

Quelques incompatibilites mineures de types avec Xyflow necessitent des `as any` temporaires. Ces types peuvent etre affines avec des generiques plus precis.

 ‍ Developpement

 Demarrer le dev server

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

  Exemple d'Utilisation

```typescript
import { FlowEditorPage } from '@app/pages/flows/flow-editor';

// Dans App.tsx
<Route path="/flows/:flowId/edit" element={<FlowEditorPage />} />
<Route path="/flows/new" element={<FlowEditorPage />} />
```

Le composant gere automatiquement :

- Chargement du flow depuis l'URL
- Serialisation bidirectionnelle
- Validation en temps reel
- Sauvegarde avec dirty tracking

  Credits

Implementation basee sur :

- [Xyflow Examples](https://reactflow.dev/examples)
- [BPMN.io](https://bpmn.io/) pour l'inspiration UX
- [GitHub Actions Workflow Editor](https://github.com/features/actions) pour les patterns d'interaction
