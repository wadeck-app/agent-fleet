# Template Variable Escaping

## Question

Comment gerer les caracteres litteraux `$`, `{`, `}` dans les scripts ? Faut-il les echapper ?

## Reponse Courte

**Non, pas besoin d'echappement dans la plupart des cas !**

Notre syntaxe `${{ }}` coexiste naturellement avec:

- Variables shell (`$HOME`, `$PATH`, `${VAR}`)
- JSON (`{ "key": "value" }`)
- Autres syntaxes (`{{ mustache }}`, `{ bash }`)

## Comportement Actuel

###  Cas qui fonctionnent sans echappement

#### 1. Variables Shell (single `$`)

```yaml
# Variables shell preservees telles quelles
script: echo $HOME #  OK
script: export PATH=$PATH:/new #  OK
script: echo ${HOME}/documents #  OK
```

#### 2. Accolades simples `{}`

```yaml
# JSON et autres syntaxes preserves
script: echo '{ "key": "value" }'     #  OK
script: awk '{ print $1 }'            #  OK
```

#### 3. Doubles accolades sans `$`

```yaml
# Syntaxes comme Mustache preservees
script: echo "{{ variable }}" #  OK (pas de $)
```

#### 4. Melange de flow et shell variables

```yaml
# Le meilleur des deux mondes !
script: echo "${{ inputs.name }}" lives in $HOME #  OK
script: cp ${{ inputs.file }} ${HOME}/backup/ #  OK
script: USER=${{ inputs.name }} HOME=$HOME ./script.sh #  OK
```

###  Seul pattern interpole: `${{ expression }}`

Le pattern exact qui declenche l'interpolation:

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

    # Melange
    echo "User $USER at $HOME_DIR"
    mkdir -p ${CONFIG}/${{ inputs.appName }}
```

**Resultat apres interpolation:**

```bash
#!/bin/bash
# Flow variable
USER=alice

# Shell variables
HOME_DIR=$HOME
CONFIG=${HOME}/.config

# Melange
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

**Resultat:**

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

## Comment Afficher `${{` Litteralement ?

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

### Option 3: Echappement dans le string

```yaml
script: echo 'Literal: ${{ not.interpolated }}'
# Les quotes simples dans echo empechent l'interpolation shell
# Mais notre renderer va quand meme interpoler !
```

 **Note**: Actuellement, on ne supporte pas l'echappement avec `\` (contrairement a GHA).

## Comparaison avec GitHub Actions

### GitHub Actions

GHA offre plusieurs methodes d'echappement:

```yaml
# Methode 1: Expression vide
run: echo "${{ '{' }}"

# Methode 2: fromJSON
run: echo "${{ fromJSON('{"literal":"${{}}"}') }}"

# Methode 3: Casser le pattern
run: echo "$ {{ variable }}"
```

### Notre Implementation

Actuellement plus simple:

```yaml
# Methode 1: Casser le pattern avec espace
script: echo "$ {{ variable }}"

# Methode 2: Utiliser variables shell
script: echo "${DOLLAR}{{ variable }}"

# Les patterns incomplets sont preserves
script: echo "${{ incomplete" # Preserve tel quel
script: echo "{{ no dollar }}" # Preserve tel quel
```

## Tests de Validation

Tous ces cas sont testes dans `template-renderer.escape.test.ts`:

```typescript
 Shell variables like $HOME preserved
 Shell variable expansion ${VAR} preserved
 Mix flow and shell variables
 Single curly braces { } preserved
 Double {{ }} without $ preserved
 Incomplete ${{ patterns preserved
 Bash scripts with mixed syntax
 JSON with flow variables
 AWK scripts with $ references
```

## Cas Limite: Backslash `\`

 Actuellement, `\` n'echappe PAS les variables:

```yaml
script: echo "\${{ inputs.name }}"
# Output: "\alice" (backslash preserve, variable interpolee)
```

Si besoin d'echappement avec `\`, ce serait une future amelioration.

## Regle Simple

**Si ca n'a pas exactement la forme `${{ expression }}`, ca ne sera pas interpole.**

Exemples:

- `$HOME` →  preserve (manque `{{`)
- `${VAR}` →  preserve (manque deuxieme `{`)
- `{{ x }}` →  preserve (manque `$`)
- `$ {{ x }}` →  preserve (espace casse le pattern)
- `${{ x }}` →  interpole !

## Recommandations

###  Bonnes Pratiques

```yaml
# Clair: melanger flow et shell
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

###  A Eviter

```yaml
# Confusant: trop de $ et {}
script: echo "${${{ inputs.var }}}"

# Peu clair: echappement complexe
script: echo "\\${{ inputs.var }}"
```

## Resume

| Pattern        | Comportement | Exemple                     |
| -------------- | ------------ | --------------------------- |
| `${{` ... `}}` |  Interpole  | `${{ inputs.x }}` → `value` |
| `$VAR`         |  Preserve   | `$HOME` → `$HOME`           |
| `${VAR}`       |  Preserve   | `${HOME}` → `${HOME}`       |
| `{ }`          |  Preserve   | `{ "a": 1 }` → `{ "a": 1 }` |
| `{{ }}`        |  Preserve   | `{{ x }}` → `{{ x }}`       |
| `$ {{ }}`      |  Preserve   | `$ {{ x }}` → `$ {{ x }}`   |

**Conclusion**: La syntaxe `${{ }}` est suffisamment distinctive pour coexister naturellement avec les syntaxes shell, JSON, et autres. Pas besoin d'echappement dans 99% des cas !
