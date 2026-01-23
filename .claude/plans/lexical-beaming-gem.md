# Plan: Retrait des fonctionnalités automatiques des workspace scripts

## Objectif

Retirer TOUTES les fonctionnalités automatiques du système de workspace scripts pour garantir un contrôle 100% manuel depuis l'UI.

**Principe**: L'utilisateur doit start/stop/restart les scripts manuellement via les boutons de l'UI. Aucun script ne doit démarrer ou redémarrer automatiquement.

## Analyse du code actuel

### Fonctionnalités automatiques identifiées

#### 1. Champ `autoStart` - CODE MORT ❌

- **Fichiers**: `workspaceScripts.contract.ts`, `WorkspaceScriptsService.ts`, `WorkspaceScriptsRepository.ts`
- **Statut**: Défini mais JAMAIS utilisé
- Les méthodes `getAutoStartScripts()` et `findAutoStartByWorkspace()` ne sont jamais appelées
- Aucune logique de startup ne boucle sur ces scripts
- Valeur toujours hardcodée à `false` dans l'UI

**Action**: Suppression complète (nettoyage de code mort)

#### 2. Champ `restartOnFailure` + Logique d'auto-restart - ACTIF ⚠️

- **Fichiers**: `workspaceScripts.contract.ts`, `ScriptProcessService.ts`, `WorkspaceScriptsService.ts`
- **Statut**: **UTILISÉ pour l'auto-restart**
- Logique active dans `ScriptProcessService.handleProcessExit()` (lignes 309-317)
- Quand un processus crash (exitCode !== 0), il redémarre automatiquement si `restartOnFailure = true`
- Valeur toujours hardcodée à `false` dans l'UI (donc désactivé en pratique)

**Action**: Suppression complète de la logique d'auto-restart

#### 3. Vérification des processus orphelins au startup - OK ✅

- **Fichier**: `server.ts`, `ScriptProcessService.checkOrphanedProcesses()`
- **Statut**: Cleanup seulement - pas d'auto-start
- Au démarrage du backend, vérifie les processus marqués "running" qui n'existent plus
- Les marque comme "crashed" mais NE LES REDÉMARRE PAS

**Action**: GARDER - c'est du nettoyage, pas de l'automatisation

## Modifications à effectuer

### Phase 1: Backend - Retrait de la logique d'auto-restart

**Fichier**: `packages/web-backend/src/services/ScriptProcessService.ts`

**Ligne 309-317**: Supprimer complètement le bloc d'auto-restart dans `handleProcessExit()`

```typescript
// AVANT (lignes 309-317):
if (script.restartOnFailure) {
	log.info(`Auto-restarting script ${script.id} after crash`);
	try {
		await this.restartProcess(script.workspaceId, script.id);
	} catch (error) {
		log.error(`Failed to auto-restart script ${script.id}:`, error);
	}
}

// APRÈS:
// [Block supprimé - pas d'auto-restart]
```

**Résultat**: Quand un processus crash, il reste en status "crashed" et l'utilisateur doit cliquer sur "Restart" manuellement.

### Phase 2: Backend - Nettoyage du champ `autoStart`

**Fichier 1**: `packages/shared-frontend-backend/src/api/workspaceScripts.contract.ts`

Supprimer les lignes suivantes:

- **Ligne 22**: `autoStart: z.boolean(), // Auto-start on workspace open`
- **Ligne 90**: `autoStart: z.boolean().default(false),`
- **Ligne 104**: `autoStart: z.boolean().optional(),`

**Fichier 2**: `packages/web-backend/src/services/WorkspaceScriptsService.ts`

Supprimer les éléments suivants:

- **Ligne 149**: Assignation `autoStart: data.autoStart ?? false,`
- **Ligne 208**: Mise à jour `if (data.autoStart !== undefined) updateData.autoStart = data.autoStart;`
- **Lignes 319-326**: Méthode complète `getAutoStartScripts()` (jamais appelée)

**Fichier 3**: `packages/web-backend/src/repositories/WorkspaceScriptsRepository.ts`

Supprimer:

- **Lignes 51-59**: Méthode complète `findAutoStartByWorkspace()` (jamais appelée)

### Phase 3: Backend - Nettoyage du champ `restartOnFailure`

**Fichier 1**: `packages/shared-frontend-backend/src/api/workspaceScripts.contract.ts`

Supprimer les lignes suivantes:

- **Ligne 23**: `restartOnFailure: z.boolean(), // Auto-restart crashed scripts`
- **Ligne 91**: `restartOnFailure: z.boolean().default(false),`
- **Ligne 105**: `restartOnFailure: z.boolean().optional(),`

**Fichier 2**: `packages/web-backend/src/services/WorkspaceScriptsService.ts`

Supprimer:

- **Ligne 150**: Assignation `restartOnFailure: data.restartOnFailure ?? false,`
- **Ligne 209**: Mise à jour `if (data.restartOnFailure !== undefined) updateData.restartOnFailure = data.restartOnFailure;`

**Note**: Le champ peut rester dans le modèle de données (WorkspaceScript) et dans ScriptProcess, mais ne sera plus utilisé.

### Phase 4: Frontend - Aucune modification nécessaire

Le frontend n'utilise jamais ces champs dans l'UI:

- `ConfigureScriptsDialog.tsx` les hardcode toujours à `false`
- Aucun toggle ou checkbox pour les activer

**Action**: Rien à faire côté frontend

### Phase 5: Tests et validation

**Objectifs**:

1. Vérifier que le système compile sans erreurs TypeScript
2. Vérifier que les scripts peuvent être start/stop/restart manuellement via l'UI
3. Vérifier qu'un script crashé reste en status "crashed" (pas de redémarrage auto)
4. Vérifier que `checkOrphanedProcesses()` fonctionne toujours au startup

**Commandes de test**:

```bash
# 1. Build backend
npm run build

# 2. Vérification TypeScript
npm run check

# 3. Tests unitaires (si existants)
npm run test:web-backend

# 4. Démarrer le backend
npm run dev
```

**Tests manuels E2E**:

1. **Test 1: Start/Stop manuel**
    - Naviguer vers ProjectsV2 > Workspace > Scripts
    - Configurer un script (ex: "dev:backend")
    - Cliquer "Start" → vérifier status "running"
    - Cliquer "Stop" → vérifier status "stopped"
    - ✅ Le script ne redémarre PAS automatiquement

2. **Test 2: Crash sans auto-restart**
    - Démarrer un script
    - Killer le processus manuellement (kill PID depuis le terminal)
    - Attendre quelques secondes
    - ✅ Le script passe en status "crashed"
    - ✅ Le script NE redémarre PAS automatiquement
    - Cliquer "Restart" manuellement → vérifier qu'il redémarre

3. **Test 3: Cleanup orphelins au startup**
    - Démarrer un script
    - Killer le backend (Ctrl+C)
    - Laisser le script npm tourner en arrière-plan
    - Redémarrer le backend
    - ✅ Dans les logs: "Checking for orphaned script processes..."
    - ✅ Le script est marqué "crashed"
    - ✅ Le script NE redémarre PAS automatiquement

4. **Test 4: Restart manuel après crash**
    - Script en status "crashed"
    - Cliquer "Restart" dans l'UI
    - ✅ Le script redémarre et passe en "running"

## Fichiers critiques modifiés

**Backend - API Contract:**

- `packages/shared-frontend-backend/src/api/workspaceScripts.contract.ts`

**Backend - Services:**

- `packages/web-backend/src/services/ScriptProcessService.ts` (CRITIQUE - logique auto-restart)
- `packages/web-backend/src/services/WorkspaceScriptsService.ts`

**Backend - Repositories:**

- `packages/web-backend/src/repositories/WorkspaceScriptsRepository.ts`

**Frontend:**

- Aucune modification nécessaire

## Risques et mitigations

### Risque 1: Breaking changes dans l'API

**Impact**: Les clients frontend pourraient envoyer `autoStart` ou `restartOnFailure` dans les requêtes
**Mitigation**: Les champs sont optionnels (`.optional()`) - les ignorer silencieusement ne casse rien

### Risque 2: Données existantes avec `autoStart=true` ou `restartOnFailure=true`

**Impact**: Les enregistrements existants dans la DB contiennent ces champs
**Mitigation**:

- Les champs peuvent rester dans le modèle de données
- Ils ne seront simplement plus utilisés par le code
- Pas besoin de migration SQL

### Risque 3: Tests backend cassés

**Impact**: Si des tests vérifient l'auto-restart
**Mitigation**:

- Mettre à jour les tests pour vérifier qu'il N'Y A PAS d'auto-restart
- Vérifier que le status reste "crashed" après un crash

## Ordre d'exécution recommandé

**Étape 1**: Phase 1 (Retrait auto-restart dans ScriptProcessService)
**Étape 2**: Phase 2 (Nettoyage autoStart)
**Étape 3**: Phase 3 (Nettoyage restartOnFailure)
**Étape 4**: Build + Check TypeScript
**Étape 5**: Tests manuels E2E

**Durée estimée**: 1-2 heures

## Critères de succès

1. ✅ Aucune erreur TypeScript (`npm run check`)
2. ✅ Le build réussit (`npm run build`)
3. ✅ Les scripts peuvent être start/stop/restart MANUELLEMENT via l'UI
4. ✅ Un script crashé reste en status "crashed" (pas d'auto-restart)
5. ✅ Le cleanup des orphelins au startup fonctionne toujours
6. ✅ Tous les tests backend passent (si existants)

## Notes additionnelles

### Comportement après crash

**Avant**:

- Script crash → auto-restart si `restartOnFailure=true`
- L'utilisateur ne voit pas toujours le crash

**Après**:

- Script crash → reste en status "crashed"
- Événement B2F_SCRIPT_PROCESS_ERROR émis → notifie l'UI
- L'utilisateur voit le status "crashed" dans le panel
- L'utilisateur doit cliquer "Restart" pour relancer

### Cleanup des processus orphelins (à garder)

**Fonction**: `ScriptProcessService.checkOrphanedProcesses()`

**Appelée**: Au démarrage du backend (`server.ts` ligne 733)

**Comportement**:

1. Trouve tous les `ScriptProcess` avec status='running'
2. Vérifie si le PID existe encore (cross-platform)
3. Si le processus n'existe plus → marque comme 'crashed'
4. Émet événement B2F_SCRIPT_PROCESS_ERROR

**Pourquoi garder**: C'est du nettoyage de l'état de la DB, pas de l'auto-start. Les scripts restent "crashed" et ne redémarrent pas.

## Documentation à mettre à jour (optionnel)

Si un README ou docs/workspace-scripts.md existe:

- Mettre à jour pour clarifier que les scripts sont 100% manuels
- Documenter le comportement après crash (reste crashed, restart manuel)
- Documenter le cleanup des orphelins au startup

## Conclusion

Ce plan retire toutes les fonctionnalités automatiques du système de workspace scripts:

- ❌ Pas d'auto-start au démarrage du workspace
- ❌ Pas d'auto-restart après un crash
- ✅ Contrôle 100% manuel via les boutons de l'UI
- ✅ Cleanup des processus orphelins au startup (mais pas de redémarrage)

Le système reste robuste, mais l'utilisateur garde le contrôle total.
