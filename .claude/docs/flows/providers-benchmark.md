# Provider & Model Benchmark

Measured on 2026-09-12, Windows 11, AWS Bedrock (us-east-1).  
Methodology: 15 model steps running in parallel, 5 runs, prompt = "Say OK" (5 words max).  
Cold-start outliers (>30s) excluded. Source flow: `_test-tasks/parallel-providers-speed-test.flow.yml`.

## Latency (ms) — p50 / avg / max

| Rank | Terminal | Model | p50 | avg | max |
|---|---|---|---|---|---|
| 🥇 | codex | gpt-5.6-luna | 3612 | 3808 | 4216 |
| 🥈 | codex | gpt-5.6-sol | 3673 | 3876 | 4248 |
| 🥉 | codex | gpt-5.6-terra | 3863 | 3889 | 4243 |
| 4 | opencode | gpt-5.6-luna | 5399 | 5488 | 6316 |
| 5 | opencode | claude sonnet-4-6 | 5565 | 5754 | 6624 |
| 6 | opencode | gpt-5.6-sol | 5518 | 5756 | 6920 |
| 7 | opencode | gpt-5.6-terra | 5834 | 5966 | 6854 |
| 8 | opencode | claude opus-4-8 | 5901 | 5984 | 6359 |
| 9 | opencode | claude opus-5 | 6012 | 6202 | 7052 |
| 10 | opencode | claude sonnet-5 | 6207 | 6747 | 7812 |
| 11 | claude CLI | sonnet-4-6 (default) | 8086 | 8138 | 8764 |
| 12 | claude CLI | sonnet-4-6 (explicit) | 8146 | 8308 | 8917 |
| 13 | claude CLI | opus-5 | 8422 | 8761 | 9773 |
| 14 | claude CLI | haiku | 8554 | 8826 | 9533 |
| 15 | claude CLI | sonnet-5 | 8888 | 9143 | 10026 |

## Key numbers

- **Codex native overhead vs OpenCode**: +1.8s (3.9s → 5.6s for same codex models)
- **Claude CLI overhead vs codex native**: +4.5s (8.5s vs ~3.9s)
- **Haiku via Claude CLI is not faster than opus** — Claude CLI startup cost (~8s) dominates; model latency differences are below that floor

## Unavailable models

| Terminal | Model | Error |
|---|---|---|
| opencode | anthropic.claude-haiku-4-5 | Bedrock model not enabled for this AWS profile |
| opencode | anthropic.claude-sonnet-4-5 | Bedrock model not enabled |
| opencode | anthropic.claude-fable-5-1 | IAM Marketplace subscription required |
| codex | openai.gpt-6-astra | 404 — not yet available in Bedrock |

## Reasoning effort (codex native, 3 runs each)

No measurable impact on short prompts. Variance (~±300ms) is larger than the difference between levels.

| Model | low | medium | high |
|---|---|---|---|
| gpt-5.6-luna | 3543 | 3260 | 3332 |
| gpt-5.6-sol | 3395 | 3414 | 3442 |
| gpt-5.6-terra | 3622 | 3365 | 3451 |

Use `model_reasoning_effort` to control this: `-c model_reasoning_effort=high` in flow step env, or set globally in `~/.codex/config.toml`. Quality impact on real tasks not yet measured — see TODO below.

## Multi-config OpenCode

OpenCode supports per-step config files via the `env.OPENCODE_CONFIG` field on model steps:

```yaml
- id: my-step
  type: model
  provider: opencode
  model: amazon-bedrock/anthropic.claude-sonnet-5
  env:
    OPENCODE_CONFIG: "C:/Users/Wadeck/.config/opencode/config_claude.json"
```

Two profiles in use:
- `config_claude.json` — AWS profile for Anthropic models (Bedrock)
- `config_codex.json` — AWS profile for OpenAI models (Bedrock)

## TODO

- Quality comparison across models/terminals (same real coding task, judge output)
- Effort level impact on quality (low vs medium vs high on a non-trivial task)
- Latency at higher concurrency (>15 parallel steps)
