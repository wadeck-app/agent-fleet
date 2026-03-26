# UX/Feedback fixes — 2026-03-14

Source: user feedback session post Phase 6 UI review.

## Status legend

- [ ] TODO
- [~] IN PROGRESS
- [x] DONE
- [!] BLOCKED / DEFER

---

## GROUPE 1 — Visual consistency (spinner, loading, alignment)

### a) Spinner pas collé au select dans vues E et F

- [ ] `SelectWithSpinner`: le spinner est à droite mais pas adjacent (espace trop grand dans layouts E/F)
- Fix: vérifier le layout flex et que `gap` est serré (`gap-1` ou `gap-2` max)
- Inspecter toutes les vues (A-G) avec agent-browser

### b) Loader dans le bouton — TODO (reporter)

- [!] `ButtonWithIcon` n'existe pas encore dans le codebase
- `Button` n'a pas de prop `loading` natif
- Convention actuelle : `{saving && <Loader2 className="mr-2 size-4 animate-spin" />}` avant le texte
- À faire plus tard : créer `ButtonWithIcon` ou ajouter `loading` sur `Button` + choisir position (gauche/droite)
- **Ne pas traiter dans cette session**

### c) Vue G — status et custom fields pas alignés horizontalement

- [ ] Voir http://localhost:5320/tickets/3arwig1mt
- Fix: aligner Status + labels/custom fields sur la même grille horizontale

### d) Vue G — espacement incohérent dans les onglets loading (Triggered vs Flow Design)

- [ ] Triggered: loading message sans espace
- [ ] Flow Design: loading plus aéré → préféré
- Fix: uniformiser tous les onglets sur le style "Flow Design" (centré, espacé, icône + texte)

### e) Vue G — Comments/Audit/Activity/Feedback loading states incohérents

- [ ] Comments: spinner centré sans message
- [ ] Audit, Activity, Feedback: à vérifier
- Fix: tous les onglets doivent avoir le même loading state que Flow Design

---

## GROUPE 2 — Tab counters (vue G)

### f) Ajouter compteurs sur tous les onglets vue G

- [ ] Comments ✓ (déjà fait via WS)
- [ ] Triggered ✓ (déjà fait via WS)
- [ ] Audit: ajouter count + WS event
- [ ] Activity: ajouter count + WS event
- [ ] Feedback: badge si feedback soumis (0/1)
- [ ] Flow Design: badge si proposal existe (0/1 ou status label?)
- Tous doivent utiliser les events WS correspondants

---

## GROUPE 3 — Flow Design UX

### g) Request flow design — formulaire en blur + overlay loading

- [ ] Actuellement: tout disparaît au profit d'un loading message
- Fix: garder le formulaire visible mais en mode `opacity-50 pointer-events-none`
- Afficher le loading status EN PLUS du formulaire (pattern blur comme autres forms)
- Tester avec dev-hold skill

### h) UPPERCASE labels — "PROPOSED FLOW" etc.

- [x] Jamais de labels en UPPERCASE dans l'UI (lisibilité et cohérence)
- Fix: `PROPOSED FLOW` → `Proposed flow` ou `Proposed Flow` (Title Case selon contexte)
- Ajouter au lessons-learned ✓

### i) Confidence score — tooltip explicatif

- [ ] Actuellement: juste un nombre %
- Fix: tooltip au hover expliquant ce que signifie le score, et pourquoi il n'est pas à 100%
- Contenu tooltip: "Confidence reflects how well the agent understood the ticket. A lower score may indicate missing details, ambiguous requirements, or open questions."
- Bonus: lister les "questions ouvertes" que le flow designer a identifiées

### j) Reasoning — wall of text → bullet points

- [ ] Le champ `reasoning` est un bloc de texte brut
- Fix: parser et afficher en bullet points si le texte contient des phrases séparées par `. ` ou `\n`
- Ou demander au FlowDesignerAgent de renvoyer des bullets dans sa réponse

### k) YAML flow — lien vers Flow Editor

- [ ] Ajouter un bouton/lien "Open in Flow Editor" à côté du YAML
- Nécessite de savoir quelle route mène au flow editor et comment passer le flow id/content

### s) "ADAPTATIONS" en uppercase dans la réponse LLM

- [ ] Même règle que (h): jamais de uppercase dans l'UI
- Fix: formatter la section en title case côté UI, ou en amont dans le prompt

### t) FlowDesignerAgent — préserver l'existant, ne modifier que ce qui est demandé

- [ ] Le LLM fait de l'auto-correction sur des parties non demandées
- Fix: ajouter dans le prompt "Preserve all existing flow steps and configuration. Only modify what the user explicitly requested in their feedback."

---

## GROUPE 4 — Review threads (Flow Design)

### l) Inline comment system — à refaire complètement

- [!] DEFER — nécessite une session d'interview pour comprendre le besoin
- Plan séparé à créer après les autres fixes
- Modèle cible: GitHub/GitLab PR inline comments (sélection de texte/lignes → commentaire)
- Feature réutilisable dans toute l'application

### m) Review thread — lignes de code non affichées

- [!] DEFER — dépend de (l)

### n) Line number validation bug (1,1 invalide alors que valide)

- [!] DEFER — dépend de (l)

### o) Review thread add — reload complet de l'onglet

- [ ] Ajouter un thread ne devrait pas recharger l'onglet entier
- Fix: update local state après submission, pas de reload

### p) Reject UX — info cachée avant clic

- [ ] Cliquer "Reject" ouvre un textarea sans info préalable sur ce qu'on va voir
- Fix: afficher le libellé + description du champ AVANT que l'user clique, ou utiliser un design type "expandable" avec preview

### q) Bouton "Confirm reject" hors de la zone visible

- [ ] Après expansion du textarea, le bouton est en dessous du fold
- Fix: soit scroll automatique vers le bouton, soit sticky footer avec le bouton

### r) Reject confirm — loading trop long, pattern incohérent

- [ ] Le bouton reste en loading pendant la réponse LLM (lent)
- Fix: envoyer la requête → feedback immédiat "Rejection submitted, processing..." → afficher le résultat quand disponible (polling ou WS)

---

## GROUPE 5 — Feedback form UX

### u) Feedback form — labels en UPPERCASE

- [ ] Tous les labels du formulaire Feedback sont en uppercase (incohérent)
- Fix: retirer les classes `uppercase tracking-wide text-muted-foreground` ou les harmoniser avec le reste de l'app

### v) Supprimer les champs redondants du formulaire Feedback

- [ ] Author, Flow ID, Task ID sont redondants (dispo via contexte ticket)
- Fix: les retirer du formulaire, les injecter automatiquement depuis le contexte

### w) "optional" incohérent sur Suggestions uniquement

- [ ] What went well et What went wrong sont aussi non-requis mais pas marqués optional
- Fix: soit marquer tous comme optional, soit aucun

### x) Pas de blur/loading à la soumission du feedback

- [ ] Pattern attendu: form en blur + message de statut pendant la soumission
- Fix: appliquer le même pattern que les autres formulaires de l'app

### y) Impossible de soumettre un 2e feedback

- [ ] Une fois soumis, le formulaire disparaît et on ne peut pas en ajouter un nouveau
- Clarifier: est-ce intentionnel (1 feedback par ticket) ou bug ?

### z) Impossible de relire le feedback soumis

- [ ] Après soumission, le feedback n'est plus visible
- Fix: afficher le feedback soumis en mode lecture, avec option edit/delete si pertinent

---

## GROUPE 6 — Backend/Events

### aa) Feedback → ticket events

- [ ] La soumission d'un feedback doit émettre un `ticket.event` (ex: `feedback.submitted`)
- Fix: ajouter l'émission d'event dans `FlowFeedbackService.submitFeedback()`

### ab) Feedback → audit + activity logs

- [ ] La soumission de feedback doit apparaître dans les onglets Audit et Activity
- Fix: appeler `AuditService.log()` et `ActivityService.log()` dans `FlowFeedbackService`

---

## Ordre d'exécution suggéré

1. **h, s, u** — Supprimer UPPERCASE (quick wins, lessons-learned)
2. **a, b, c, d, e** — Cohérence visuelle (spinner, loading, alignement)
3. **f** — Compteurs WS sur tous les onglets
4. **v, w, x, y, z** — Feedback form cleanup
5. **g** — Form blur pendant loading (plus complexe)
6. **i, j** — Confidence tooltip + reasoning formatting
7. **o, p, q, r** — Review thread fixes
8. **t** — FlowDesignerAgent prompt
9. **aa, ab** — Backend events
10. **k** — Flow editor link
11. **l, m, n** — DEFER inline comments (session interview)
