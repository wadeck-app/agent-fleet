## Plans d'amélioration

### Dialog Hierarchy Refactor

**Fichier:** `.claude/plans/dialog-hierarchy-refactor.md`
**Status:** 📋 Planned
**Effort:** 8-11h

Refactoriser la hiérarchie des composants Dialog pour remplacer le confus `CrudDialog` par des composants spécifiques :

- `BaseDialog` - Wrapper générique
- `FormDialog` - Formulaires Create/Edit
- `TwoColumnDialog` - Sélection/Association 2 colonnes
- `InfoDialog` - Affichage info read-only

**Bénéfices:**

- Clarté des intentions (nom = fonction)
- Type-safety améliorée
- Code plus maintenable (-30% lignes pour dialogs 2 colonnes)
- Meilleure DX
