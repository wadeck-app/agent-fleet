# Flow Visual Editor

Editeur visuel de flows pour agent-fleet utilisant Xyflow v12.

##  Fonctionnalites

 **Edition visuelle complete**

- Ajout/suppression de steps par drag & drop
- Connexions visuelles entre steps (dependances, loops)
- Repositionnement libre des nodes

 **Types de steps supportes**

-  Model Steps (sonnet, haiku, opus)
-  Script Steps (shell scripts)
-  SubFlow Steps (composition de flows)

 **Validation en temps reel**

- Integration avec FlowValidator
- Affichage des erreurs sur les nodes
- Panel de validation detaille

 **Panneau de proprietes**

- Edition de tous les champs step par step
- Formulaires adaptes au type de step
- Options avancees (when, retry, onFailure)

 **Auto-layout**

- Algorithme hierarchique avec dagre
- Layout automatique optimise

 **Actions**

- Save (sauvegarde du flow)
- Validate (validation manuelle)
- Auto Layout (reorganisation)

##  Structure

```
flow-editor/

---

_Reference content moved to [docs/reference.md](docs/reference.md)._
