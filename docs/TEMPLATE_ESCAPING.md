# Template Variable Escaping

## Question

Comment gérer les caractères littéraux `$`, `{`, `}` dans les scripts ? Faut-il les échapper ?

## Réponse Courte

**Non, pas besoin d'échappement dans la plupart des cas !**

Notre syntaxe `${{ }}` coexiste naturellement avec:

- Variables shell (`$HOME`, `$PATH`, `${VAR}`)
- JSON (`{ "key": "value" }`)
- Autres syntaxes (`{{ mustache }}`, `{ bash }`)

## Comportement Actuel

### ✅ Cas qui fonctionnent sans échappement

#### 1. Variables Shell (single `$`)

```yaml
# Variables shell préservées telles quelles
script: echo $HOME # ✓ OK
script: export PATH=$PATH:/new # ✓ OK
script: echo ${HOME}/documents # ✓ OK
```

#### 2. Accolades simples `{}`

```yaml
# JSON et autres syntaxes préservés
script: echo '{ "key": "value" }'     # ✓ OK
script: awk '{ print $1 }'            # ✓ OK
```

#### 3. Doubles accolades sans `$`

```yaml
# Syntaxes comme Mustache préservées
script: echo "{{ variable }}" # ✓ OK (pas de $)
```

#### 4. Mélange de flow et shell variables

```yaml
# Le meilleur des deux mondes !
script: echo "${{ inputs.name }}" lives in $HOME # ✓ OK
script: cp ${{ inputs.file }} ${HOME}/backup/ # ✓ OK
script: USER=${{ inputs.name }} HOME=$HOME ./script.sh # ✓ OK
```

### ⚠️ Seul pattern interpolé: `${{ expression }}`

Le pattern exact qui déclenche l'interpolation:

```
${{ expression }}
```

Avec:

- `$` - dollar
- `{{` - deux accolades ouvrantes
- espace optionnel
- expression valide
- espace optionnel
- `}}` - deux accolades fermantes

## Exemples Concrets

### Bash Script Complet

```yaml
script: |
    #!/bin/bash
    # Flow variable
    USER=${{ inputs.username }}

    # Shell variables
    HOME_DIR=$HOME
    CONFIG=${HOME}/.config

    # Mélange
    echo "User $USER at $HOME_DIR"
    mkdir -p ${CONFIG}/${{ inputs.appName }}
```

**Résultat après interpolation:**

```bash
#!/bin/bash
# Flow variable
USER=alice

# Shell variables
HOME_DIR=$HOME
CONFIG=${HOME}/.config

# Mélange
echo "User alice at $HOME_DIR"
mkdir -p ${CONFIG}/myapp
```

### JSON avec Flow Variables

```yaml
script: |
    cat > config.json << EOF
    {
      "user": "${{ inputs.name }}",
      "count": ${{ inputs.value }},
      "home": "$HOME"
    }
    EOF
```

**Résultat:**

```json
{
	"user": "alice",
	"count": 42,
	"home": "$HOME"
}
```

### AWK Script

```yaml
script: |
    awk '{
      if ($1 == "${{ inputs.field }}") {
        print $2
      }
    }' ${{ inputs.inputFile }}
```

## Comment Afficher `${{` Littéralement ?

Si vous voulez vraiment afficher `${{` dans la sortie (rare), cassez le pattern:

### Option 1: Ajouter un espace

```yaml
script: echo "Usage: $ {{ inputs.var }}"
# Output: "Usage: $ {{ inputs.var }}"
```

### Option 2: Variables shell

```yaml
script: |
    DOLLAR='$'
    echo "${DOLLAR}{{ inputs.var }}"

# Output: "${{ inputs.var }}"
```

### Option 3: Échappement dans le string

```yaml
script: echo 'Literal: ${{ not.interpolated }}'
# Les quotes simples dans echo empêchent l'interpolation shell
# Mais notre renderer va quand même interpoler !
```

⚠️ **Note**: Actuellement, on ne supporte pas l'échappement avec `\` (contrairement à GHA).

## Comparaison avec GitHub Actions

### GitHub Actions

GHA offre plusieurs méthodes d'échappement:

```yaml
# Méthode 1: Expression vide
run: echo "${{ '{' }}"

# Méthode 2: fromJSON
run: echo "${{ fromJSON('{"literal":"${{}}"}') }}"

# Méthode 3: Casser le pattern
run: echo "$ {{ variable }}"
```

### Notre Implémentation

Actuellement plus simple:

```yaml
# Méthode 1: Casser le pattern avec espace
script: echo "$ {{ variable }}"

# Méthode 2: Utiliser variables shell
script: echo "${DOLLAR}{{ variable }}"

# Les patterns incomplets sont préservés
script: echo "${{ incomplete" # Préservé tel quel
script: echo "{{ no dollar }}" # Préservé tel quel
```

## Tests de Validation

Tous ces cas sont testés dans `template-renderer.escape.test.ts`:

```typescript
✓ Shell variables like $HOME preserved
✓ Shell variable expansion ${VAR} preserved
✓ Mix flow and shell variables
✓ Single curly braces { } preserved
✓ Double {{ }} without $ preserved
✓ Incomplete ${{ patterns preserved
✓ Bash scripts with mixed syntax
✓ JSON with flow variables
✓ AWK scripts with $ references
```

## Cas Limite: Backslash `\`

⚠️ Actuellement, `\` n'échappe PAS les variables:

```yaml
script: echo "\${{ inputs.name }}"
# Output: "\alice" (backslash préservé, variable interpolée)
```

Si besoin d'échappement avec `\`, ce serait une future amélioration.

## Règle Simple

**Si ça n'a pas exactement la forme `${{ expression }}`, ça ne sera pas interpolé.**

Exemples:

- `$HOME` → ✓ préservé (manque `{{`)
- `${VAR}` → ✓ préservé (manque deuxième `{`)
- `{{ x }}` → ✓ préservé (manque `$`)
- `$ {{ x }}` → ✓ préservé (espace casse le pattern)
- `${{ x }}` → ✗ interpolé !

## Recommandations

### ✅ Bonnes Pratiques

```yaml
# Clair: mélanger flow et shell
script: |
    echo "Flow: ${{ inputs.name }}"
    echo "Shell: $HOME"

# Clair: JSON avec interpolation
script: |
    cat > config.json << 'EOF'
    {
      "user": "${{ inputs.name }}",
      "path": "$HOME"
    }
    EOF
```

### ❌ À Éviter

```yaml
# Confusant: trop de $ et {}
script: echo "${${{ inputs.var }}}"

# Peu clair: échappement complexe
script: echo "\\${{ inputs.var }}"
```

## Résumé

| Pattern        | Comportement | Exemple                     |
| -------------- | ------------ | --------------------------- |
| `${{` ... `}}` | ✗ Interpolé  | `${{ inputs.x }}` → `value` |
| `$VAR`         | ✓ Préservé   | `$HOME` → `$HOME`           |
| `${VAR}`       | ✓ Préservé   | `${HOME}` → `${HOME}`       |
| `{ }`          | ✓ Préservé   | `{ "a": 1 }` → `{ "a": 1 }` |
| `{{ }}`        | ✓ Préservé   | `{{ x }}` → `{{ x }}`       |
| `$ {{ }}`      | ✓ Préservé   | `$ {{ x }}` → `$ {{ x }}`   |

**Conclusion**: La syntaxe `${{ }}` est suffisamment distinctive pour coexister naturellement avec les syntaxes shell, JSON, et autres. Pas besoin d'échappement dans 99% des cas !
