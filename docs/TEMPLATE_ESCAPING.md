# Template Variable Escaping

## Question

How to use literal `$`, `{`, `}` characters in scripts? Do they need escaping?

## Short Answer

**No, escaping is not needed in most cases.**

The `${{ }}` syntax coexists naturally with:

- Shell variables (`$HOME`, `$PATH`, `${VAR}`)
- JSON (`{ "key": "value" }`)
- Other syntaxes (`{{ mustache }}`, `{ bash }`)

## Current Behavior

### Cases that work without escaping

#### 1. Shell Variables (single `$`)

```yaml
# Shell variables preserved as-is
script: echo $HOME # OK
script: export PATH=$PATH:/new # OK
script: echo ${HOME}/documents # OK
```

#### 2. Single curly braces `{}`

```yaml
# JSON and other syntaxes preserved
script: echo '{ "key": "value" }' # OK
script: awk '{ print $1 }' # OK
```

#### 3. Double braces without `$`

```yaml
# Mustache-style syntaxes preserved
script: echo "{{ variable }}" # OK (no $)
```

#### 4. Mixed flow and shell variables

```yaml
# Best of both worlds
script: echo "${{ inputs.name }}" lives in $HOME # OK
script: cp ${{ inputs.file }} ${HOME}/backup/ # OK
script: USER=${{ inputs.name }} HOME=$HOME ./script.sh # OK
```

### Only interpolated pattern: `${{ expression }}`

The exact pattern that triggers interpolation:

```
${{ expression }}
```

With:

- `$` - dollar sign
- `{{` - two opening braces
- optional space
- valid expression
- optional space
- `}}` - two closing braces

## Concrete Examples

### Full Bash Script

```yaml
script: |
    #!/bin/bash
    # Flow variable
    USER=${{ inputs.username }}

    # Shell variables
    HOME_DIR=$HOME
    CONFIG=${HOME}/.config

    # Mixed
    echo "User $USER at $HOME_DIR"
    mkdir -p ${CONFIG}/${{ inputs.appName }}
```

**After interpolation:**

```bash
#!/bin/bash
# Flow variable
USER=alice

# Shell variables
HOME_DIR=$HOME
CONFIG=${HOME}/.config

# Mixed
echo "User alice at $HOME_DIR"
mkdir -p ${CONFIG}/myapp
```

### JSON with Flow Variables

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

**Result:**

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

## How to Display `${{` Literally?

If you need `${{` in output (rare), break the pattern:

### Option 1: Add a space

```yaml
script: echo "Usage: $ {{ inputs.var }}"
# Output: "Usage: $ {{ inputs.var }}"
```

### Option 2: Shell variable

```yaml
script: |
    DOLLAR='$'
    echo "${DOLLAR}{{ inputs.var }}"
# Output: "${{ inputs.var }}"
```

### Option 3: Single quotes in echo

```yaml
script: echo 'Literal: ${{ not.interpolated }}'
# Single quotes prevent shell interpolation
# But our renderer will still interpolate!
```

**Note**: Backslash escaping (`\`) is not currently supported (unlike GHA).

## Comparison with GitHub Actions

### GitHub Actions

GHA offers several escaping methods:

```yaml
# Method 1: Empty expression
run: echo "${{ '{' }}"

# Method 2: fromJSON
run: echo "${{ fromJSON('{"literal":"${{}}"}') }}"

# Method 3: Break the pattern
run: echo "$ {{ variable }}"
```

### Our Implementation

Currently simpler:

```yaml
# Method 1: Break pattern with space
script: echo "$ {{ variable }}"

# Method 2: Shell variable
script: echo "${DOLLAR}{{ variable }}"

# Incomplete patterns are preserved
script: echo "${{ incomplete" # preserved as-is
script: echo "{{ no dollar }}" # preserved as-is
```

## Validation Tests

All cases tested in `template-renderer.escape.test.ts`:

```typescript
// Shell variables like $HOME preserved
// Shell variable expansion ${VAR} preserved
// Mix flow and shell variables
// Single curly braces { } preserved
// Double {{ }} without $ preserved
// Incomplete ${{ patterns preserved
// Bash scripts with mixed syntax
// JSON with flow variables
// AWK scripts with $ references
```

## Edge Case: Backslash `\`

Currently, `\` does NOT escape variables:

```yaml
script: echo "\${{ inputs.name }}"
# Output: "\alice" (backslash preserved, variable interpolated)
```

Backslash escaping support could be added as a future enhancement.

## Simple Rule

**If it does not have exactly the form `${{ expression }}`, it will not be interpolated.**

Examples:

- `$HOME` - preserved (missing `{{`)
- `${VAR}` - preserved (missing second `{`)
- `{{ x }}` - preserved (missing `$`)
- `$ {{ x }}` - preserved (space breaks the pattern)
- `${{ x }}` - interpolated!

## Recommendations

### Good Practices

```yaml
# Clear: mix flow and shell
script: |
    echo "Flow: ${{ inputs.name }}"
    echo "Shell: $HOME"

# Clear: JSON with interpolation
script: |
    cat > config.json << 'EOF'
    {
      "user": "${{ inputs.name }}",
      "path": "$HOME"
    }
    EOF
```

### Avoid

```yaml
# Confusing: too many $ and {}
script: echo "${${{ inputs.var }}}"

# Unclear: complex escaping
script: echo "\\${{ inputs.var }}"
```

## Summary

| Pattern        | Behavior     | Example                     |
| -------------- | ------------ | --------------------------- |
| `${{` ... `}}` | Interpolated | `${{ inputs.x }}` -> `value` |
| `$VAR`         | Preserved    | `$HOME` -> `$HOME`           |
| `${VAR}`       | Preserved    | `${HOME}` -> `${HOME}`       |
| `{ }`          | Preserved    | `{ "a": 1 }` -> `{ "a": 1 }` |
| `{{ }}`        | Preserved    | `{{ x }}` -> `{{ x }}`       |
| `$ {{ }}`      | Preserved    | `$ {{ x }}` -> `$ {{ x }}`   |

**Conclusion**: The `${{ }}` syntax is distinctive enough to coexist naturally with shell, JSON, and other syntaxes. No escaping needed in 99% of cases.
