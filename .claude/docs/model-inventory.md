# Model inventory — what actually answers

Measured on 2026-09-13 by calling every candidate with a three-word prompt:
`node .claude/scripts/model-inventory.mjs [opencode|claude|codex]`. Re-run it after an account or
CLI change; it takes a few minutes and costs a handful of tokens per model.

Nothing here is inferred from a catalogue or a whitelist — those are what misled us. Bedrock ids
are not consistent: some carry a date, some do not, one carries a bare `-v1`.

## Anthropic models — profile `cloudbees-bedrock-claude-infra-bedrock-claude-user`

| Family     | Id to use                                      | opencode   | claude    |
| ---------- | ---------------------------------------------- | ---------- | --------- |
| haiku-4-5  | `us.anthropic.claude-haiku-4-5-20251001-v1:0`  | works      | works     |
| sonnet-4-5 | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` | works      | works     |
| sonnet-4-6 | `us.anthropic.claude-sonnet-4-6`               | works      | works     |
| sonnet-5   | `us.anthropic.claude-sonnet-5`                 | works      | works     |
| opus-4-6   | `us.anthropic.claude-opus-4-6-v1`              | works      | works     |
| opus-4-7   | `us.anthropic.claude-opus-4-7`                 | works      | works     |
| opus-4-8   | `us.anthropic.claude-opus-4-8`                 | works      | works     |
| opus-5     | `us.anthropic.claude-opus-5`                   | works      | works     |
| fable-5    | `us.anthropic.claude-fable-5`                  | **denied** | **fails** |
| fable-5-1  | `us.anthropic.claude-fable-5-1`                | **denied** | **fails** |

The fable models exist in the account and are refused by IAM, not by the CLIs:

```
Model access is denied due to IAM user or service role is not authorized to perform the request
```

That is a permission to request, not a configuration to fix. Nothing in flow should alias to
them until it is granted.

`claude` also accepts the family names `haiku`, `sonnet`, `opus` directly, and honours
`ANTHROPIC_DEFAULT_*_MODEL` — so flow leaves claude model names untouched rather than overriding
a choice made in the environment.

## OpenAI models — profile `cloudbees-bedrock-openai-codex-codex-user` (codex)

| Id                                              | codex |
| ----------------------------------------------- | ----- |
| `openai.gpt-5.6-terra` (the configured default) | works |
| `openai.gpt-5.5`                                | works |
| `openai.gpt-5.6`                                | works |

This is a different bedrock account: anthropic models are not reachable from it, and family names
like "sonnet" mean nothing there.

## What does not work, and why

| What                                                        | Result                                     | Cause                                                                                        |
| ----------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `anthropic.claude-haiku-4-5`                                | `The provided model identifier is invalid` | a catalogue alias, not a bedrock id                                                          |
| Any id without the `us.` prefix, undeclared                 | `ProviderModelNotFoundError` from opencode | opencode's catalogue for bedrock has no such model                                           |
| `us.*` ids declared in `models` but absent from `whitelist` | missing from `opencode models`             | opencode needs both halves                                                                   |
| `OPENCODE_CONFIG=C:/path/to.json`                           | config silently ignored                    | the value is split on `:`, so a drive letter becomes two bogus paths — use `/c/path/to.json` |

## Making opencode see a model it does not know

`whitelist` only intersects opencode's own catalogue: `config_claude.json` whitelists ten ids and
opencode lists seven, dropping haiku-4-5, sonnet-4-5 and opus-4-6 without a word. To add one, it
must be **declared and whitelisted**:

```json
{
	"provider": {
		"amazon-bedrock": {
			"options": { "region": "us-east-1", "profile": "cloudbees-bedrock-claude-infra-bedrock-claude-user" },
			"models": {
				"us.anthropic.claude-haiku-4-5-20251001-v1:0": { "name": "Claude Haiku 4.5" },
				"us.anthropic.claude-sonnet-4-5-20250929-v1:0": { "name": "Claude Sonnet 4.5" },
				"us.anthropic.claude-opus-4-6-v1": { "name": "Claude Opus 4.6" }
			},
			"whitelist": [
				"us.anthropic.claude-haiku-4-5-20251001-v1:0",
				"us.anthropic.claude-sonnet-4-5-20250929-v1:0",
				"us.anthropic.claude-sonnet-4-6",
				"us.anthropic.claude-sonnet-5",
				"us.anthropic.claude-opus-4-6-v1",
				"us.anthropic.claude-opus-4-7",
				"us.anthropic.claude-opus-4-8",
				"us.anthropic.claude-opus-5"
			]
		}
	}
}
```

## How flow uses this

`packages/flow-engine/src/processing/ModelAliases.ts` maps the family names for **opencode only**:

| A step writing  | gets                                          |
| --------------- | --------------------------------------------- |
| `model: haiku`  | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |
| `model: sonnet` | `us.anthropic.claude-sonnet-5`                |
| `model: opus`   | `us.anthropic.claude-opus-5`                  |

Anything else passes through unchanged, so an explicit id still works and an older version can be
pinned deliberately (`model: us.anthropic.claude-sonnet-4-6`). `claude` and `codex` are left
alone. The execution trace records the **resolved** id, so a run always says which sonnet it was.

A test asserts the table only ever points at ids proven above, and never at the IAM-denied fable
models — so a typo cannot reach a flow as a dispatch-time failure.
