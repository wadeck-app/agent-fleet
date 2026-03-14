# UX / Bug backlog — 2026-03-14

Source: user testing session post Phase 6.

## BLOQUANT (à faire maintenant)

### #9 — Validation: template expression avec tiret dans nom de step

**Erreur**: `Template expression contains arithmetic which is not supported: ${{ steps.analyze-storage.outputs.result }}`
**Cause probable**: FlowValidator traite le `-` dans le nom de step comme un opérateur arithmétique
**Fichier**: `packages/flow-engine/src/validator/FlowValidator.ts` (à vérifier)
**Fix**: exclure les expressions de la forme `steps.X.outputs.Y` / `inputs.X` du check arithmétique

### #10 — Validation: output pattern sans capture group

**Erreur**: `Output pattern for 'X' in step 'Y' has no capture group`
**Cause**: Claude génère des `outputPattern` regex sans groupe capturant `(...)`
**Deux options**:

- Fix prompt FlowDesignerAgent pour contraindre Claude à toujours mettre des groupes capturants
- Fix validator pour être moins strict (ou auto-wrapper le pattern)
  **Fichiers**: `packages/web-backend/src/agents/FlowDesignerAgent.ts` + validator

### #11 — État "aucune proposal" après une requête échouée

**Problème**: après une erreur de validation, l'UI revient en état "No flow design requested" au lieu de montrer l'erreur
**Fix**: conserver et afficher l'erreur dans `FlowProposalSection` après un échec de `requestFlowDesign`

---

## NON-BLOQUANT (à faire après)

### #1 — Spinner cache la flèche du select de status

**Vue**: tickets list + toutes les vues
**Fix UX**: spinner hors du `<SelectTrigger>`, à droite du select, select `disabled` pendant loading

### #2 — Icone "magie" dans modal création ticket

**Problème**: icone sparkles/magic qui tourne = pas standard
**Fix**: remplacer par `<Loader2 className="animate-spin" />` à droite du bouton "Create"

### #3 — Compteur "Comments" pas mis à jour en temps réel (WS events)

**Vue G**: après post d'un commentaire par worker-ai, le badge reste à 0 sans refresh manuel
**Fix**: s'abonner aux WS events `comment.created` dans le composant qui gère les counts, ou écouter les events pour refresh les counts

### #4 — Onglets Comments/Triggered ont un count, Audit/Activity n'en ont pas

**Vue G**: Audit et Activity n'affichent pas de compteur
**Fix**: ajouter les counts pour Audit et Activity (ou décider de ne pas en mettre = intentionnel)

### #5 — Status select vide (sans texte) après création ticket

**Bug logic**: le status est vide dans toutes les vues
**Cause probable**: le ticket est créé avec un statut valide mais `useProjectStatusConfig` n'a pas encore chargé, donc le select affiche rien au lieu du label
**Fix**: s'assurer que `SelectValue` affiche le `label` de la config, avec fallback sur la valeur brute si config pas encore chargée

### #6 — Label "Add a comment" non lié au textarea

**Bug UX**: clic sur le label ne met pas le focus sur le textarea
**Fix**: ajouter `htmlFor` sur le `<Label>` correspondant à l'`id` du textarea

### #7 — Select vide sans min-width

**Bug UI**: quand le status est vide, le select est très étroit
**Fix**: ajouter `min-w-[120px]` ou similaire sur le `<SelectTrigger>`

### #8 — Onglet "Feedback" masqué quand inactif

**Bug UX**: l'onglet Feedback disparaît si pas de `currentFlowProposalId`
**Fix**: toujours afficher l'onglet, mais le rendre `disabled` avec un tooltip explicatif
**Lesson learned**: ne jamais cacher une feature, toujours la montrer disabled avec explication
