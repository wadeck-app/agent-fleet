# Agent Fleet - Claude Instructions

## Flow Development Guidelines

### ALWAYS Validate Flows Before Committing

When creating or modifying flows in `.agent-fleet/flows.yaml`:

1. **After any flow modification**, immediately test validation by checking the server logs
2. Look for validation errors or warnings in the console
3. Fix any issues before proceeding
4. The FlowValidator will catch:
   - Undefined step references in `depends`
   - Circular dependencies
   - Invalid template variable references
   - Missing required fields
   - Type mismatches

### Template Variable Syntax

- ✅ Use: `${{ inputs.variableName }}`
- ✅ Use: `${{ steps.stepId.outputs.field }}`
- ✅ Use: `${{ task.priority }}`
- ❌ **Do NOT use**: `${{ inputs.var || 'default' }}` (not supported by validator)
- ❌ **Do NOT use**: Complex JavaScript expressions in templates

For optional inputs, declare them in the flow definition and handle missing values at runtime.

### Flow Testing Checklist

Before marking a flow as complete:

- [ ] Flow validates without errors
- [ ] All `depends` references point to existing steps
- [ ] All template variables reference declared inputs or previous step outputs
- [ ] Test with actual task creation (not just validation)
- [ ] Verify DAG execution order is correct
- [ ] Check logs for warnings

### Example Validation Check

After modifying a flow, the server logs should show:
```
✓ Loaded flow: your-flow-name
```

If you see errors:
```
Validation failed for flow 'your-flow':
  [ERROR] ...
```

**STOP** and fix the errors immediately before continuing.
