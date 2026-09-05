# Flow Visual Editor

Visual flow editor for agent-fleet using Xyflow v12.

##  Fonctionnalites

 **Edition visuelle complete**

- Ajout/Deletion of steps by drag & drop
- Connexions visuelles entre steps (dependances, loops)
- Repositionnement libre of the nodes

 **Types of steps supportes**

-  Model Steps (sonnet, haiku, opus)
-  Script Steps (shell scripts)
-  SubFlow Steps (composition of flows)

 **Validation en temps reel**

- Integration with FlowValidator
- Affichage of the erreurs on the nodes
- Panel of validation detaille

 **Properties panel**

- Edition of all the champs step by step
- Formulaires adaptes au Type of step
- Options avancees (when, retry, onFailure)

 **Auto-layout**

- Algorithme hierarchique with dagre
- Layout automatique optimise

 **Actions**

- Save (sauvegarde of the flow)
- Validate (validation manuelle)
- Auto Layout (reorganisation)

##  Structure

```
flow-editor/

---

_Reference content moved to [docs/reference.md](docs/reference.md)._
