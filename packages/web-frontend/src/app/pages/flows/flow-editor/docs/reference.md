# Reference

_Moved from README -- see [README](../README.md) for the overview._

├── FlowEditorPage.tsx              # Page principale
├── FlowEditorCanvas.tsx            # Canvas Xyflow
├── FlowEditorToolbar.tsx           # Barre d'outils
├── FlowEditorPropertiesPanel.tsx  # Panneau de propriétés
├── FlowEditorValidationPanel.tsx  # Panneau de validation
├── types.ts                        # Types TypeScript
├── nodes/
│   ├── ModelStepNode.tsx          # Node pour model step
│   ├── ScriptStepNode.tsx         # Node pour script step
│   ├── SubFlowStepNode.tsx        # Node pour subflow step
│   └── index.ts                   # Export des node types
├── edges/
│   ├── DependencyEdge.tsx         # Edge pour dépendances
│   ├── LoopEdge.tsx               # Edge pour loops
│   └── index.ts                   # Export des edge types
├── hooks/
│   ├── useFlowEditor.ts           # Hook principal
│   ├── useFlowValidation.ts       # Hook de validation
│   └── index.ts
├── utils/
│   ├── flowToReactFlow.ts         # Sérialisation YAML → Xyflow
│   ├── reactFlowToFlow.ts         # Sérialisation Xyflow → YAML
│   ├── layoutAlgorithms.ts        # Algorithmes de layout
│   └── cn.ts                      # Utilitaire classnames
└── README.md                       # Cette documentation
```

## 🔧 Technologies

- **Xyflow v12** - Bibliothèque de graphs interactifs
- **Dagre** - Algorithme de layout hierarchique
- **Radix UI** - Composants UI accessibles
- **Tailwind CSS** - Styling
- **React 19** - Framework

## 📝 Routes

- `/flows/new` - Créer un nouveau flow
- `/flows/:flowId/edit` - Éditer un flow existant

## 🎨 Composants Visuels

### Nodes

Chaque type de step a son propre composant visual :

- **ModelStepNode** : Icône 🧠, badge model (sonnet/haiku/opus)
- **ScriptStepNode** : Icône ⌨️, badge "script"
- **SubFlowStepNode** : Icône 🔄, badge flowId

Tous les nodes affichent :

- Nom du step
- Indicateurs conditionnels (when)
- Erreurs de validation (border rouge + compteur)
- Handles de connexion (haut/bas)

### Edges

- **DependencyEdge** : Ligne pleine pour dépendances (`depends`)
- **LoopEdge** : Ligne pointillée animée pour loops (`onFailure.goto`)

## 🚦 États de Validation

- ✅ **Vert** : Pas d'erreur
- ⚠️ **Orange** : Warnings
- ❌ **Rouge** : Erreurs critiques

## 💾 Sérialisation

### FlowDefinition → React Flow

```typescript
const { nodes, edges } = flowDefinitionToReactFlow(flowDefinition);
```

- Convertit les `steps[]` en nodes Xyflow
- Convertit les `depends[]` en edges de dépendance
- Convertit les `onFailure.goto` en edges de loop
- Calcule les positions automatiquement

### React Flow → FlowDefinition

```typescript
const flowDefinition = reactFlowToFlowDefinition(nodes, edges, metadata);
```

- Extrait les steps depuis les nodes
- Reconstruit les `depends[]` depuis les edges
- Reconstruit les `onFailure.goto` depuis les loop edges

## 🎯 Prochaines Étapes

### Phase 2 (Améliorations)

- [ ] Améliorer le drag & drop (preview pendant le drag)
- [ ] Ajouter minimap interactive
- [ ] Ajouter undo/redo
- [ ] Exporter en image (PNG/SVG)
- [ ] Mode YAML split view (visual + code)

### Phase 3 (Features avancées)

- [ ] Exécution de flow depuis l'éditeur
- [ ] Visualisation de l'exécution en temps réel
- [ ] Historique des versions
- [ ] Templates de flows
- [ ] Snippets de steps

## 📚 Références

- [Xyflow Documentation](https://xyflow.com/react)
- [Dagre Documentation](https://github.com/dagrejs/dagre)
- [FlowValidator API](../../../../../flow-engine/src/validation/FlowValidator.ts)
- [Flow Types](../../../../../flow-engine/src/types.ts)

## 🐛 Problèmes Connus

### Imports flow-engine

Les imports depuis `flow-engine` nécessitent une configuration TypeScript appropriée. Actuellement, des chemins relatifs sont utilisés. Pour une meilleure maintenabilité, ajouter un alias dans `tsconfig.json` :

```json
{
	"compilerOptions": {
		"paths": {
			"flow-engine/*": ["../../../flow-engine/src/*"]
		}
	}
}
```

### Types Xyflow

Quelques incompatibilités mineures de types avec Xyflow nécessitent des `as any` temporaires. Ces types peuvent être affinés avec des génériques plus précis.

## 👨‍💻 Développement

### Démarrer le dev server

```bash
npm run dev
```

### Accéder à l'éditeur

```
http://localhost:5173/flows/new
http://localhost:5173/flows/test-diamond/edit
```

### Tests

```bash
npm run test                 # Unit tests
npm run test:watch           # Watch mode
npm run test:coverage        # Coverage report
```

### Build

```bash
npm run build
```

## ✨ Exemple d'Utilisation

```typescript
import { FlowEditorPage } from '@app/pages/flows/flow-editor';

// Dans App.tsx
<Route path="/flows/:flowId/edit" element={<FlowEditorPage />} />
<Route path="/flows/new" element={<FlowEditorPage />} />
```

Le composant gère automatiquement :

- Chargement du flow depuis l'URL
- Sérialisation bidirectionnelle
- Validation en temps réel
- Sauvegarde avec dirty tracking

## 🙏 Crédits

Implémentation basée sur :

- [Xyflow Examples](https://reactflow.dev/examples)
- [BPMN.io](https://bpmn.io/) pour l'inspiration UX
- [GitHub Actions Workflow Editor](https://github.com/features/actions) pour les patterns d'interaction
