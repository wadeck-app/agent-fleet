/**
 * Complete working example of a parent whose sub-steps run in waves.
 * Shared by the generated flow documentation (`flow docs`) and by tests; no I/O.
 */
export const WAVES_EXAMPLE_FLOW_YAML = `version: '1.0.0'
id: implement-with-waves
name: Implement, then check in waves
description: A model implements; cheap script checks run first, then model reviewers (each with a validator), then e2e
workspace:
  mode: isolated
  gitStrategy: main-only
  reusePolicy: never
inputs: {}
steps:
  - id: implement
    name: Implement
    type: model
    model: sonnet
    prompt: Implement the change described in the task.
    subStepStrategy: waves
    maxSubStepIterations: 3
  - id: lint
    name: Lint
    type: script
    shell: bash
    parent: implement
    wave: 1
    script: npm run lint
  - id: unit
    name: Unit tests
    type: script
    shell: bash
    parent: implement
    wave: 1
    script: npm test
  - id: review_security
    name: Security review
    type: model
    model: haiku
    parent: implement
    wave: 2
    prompt: Review the change for security problems and write the report.
  - id: validate_security_report
    name: Validate the security report
    type: script
    shell: bash
    parent: review_security
    script: node scripts/validate-report.js security
  - id: review_design
    name: Design review
    type: model
    model: haiku
    parent: implement
    wave: 2
    prompt: Review the change for design problems and write the report.
  - id: validate_design_report
    name: Validate the design report
    type: script
    shell: bash
    parent: review_design
    script: node scripts/validate-report.js design
  - id: e2e
    name: End-to-end tests
    type: script
    shell: bash
    parent: implement
    wave: 3
    script: npm run e2e
`;

/** The "Sub-step waves" section of the generated flow documentation (`flow docs`). */
export class SubStepWavesDocumentation {
	generate(): string {
		return `### Sub-step waves

\`subStepStrategy: waves\` runs the \`parent:\` sub-steps of a step in ordered waves. Each direct sub-step declares \`wave\` (non-negative integer, ordering only: gaps like 10, 20, 30 are fine, so a wave can be inserted later).

- Sub-steps with the same \`wave\` run in parallel and are all awaited; their failures are reported together to the parent in one message (\`[step-id]\\n<stderr>\` each).
- Wave n+1 starts only when every sub-step of wave n passed. A failed wave restarts from wave 1: the parent re-runs with that wave's failures, then every wave runs again (an earlier green wave is re-verified, the parent may have changed the code). Waves after the failed one are shown as not run, with the wave in the reason.
- A nested sub-step (a sub-step of a sub-step) runs in the wave of its closest ancestor, delays the next wave, and must not declare \`wave\`.
- A wave failure consumes one of the parent's \`maxSubStepIterations\` (default 3); when exhausted the parent fails and names the wave.
- \`retry\` and \`onFailure.goto\` of a sub-step apply before it counts as failed. An engine failure of any sub-step fails the parent at once, without starting a later wave.
- \`depends\` inside one wave keeps its normal meaning (a failed dependency leaves the dependent not run). \`depends\` on an earlier wave is redundant (warning); on a later wave it can never be satisfied (error).
- Sub-steps injected at run time (provideSteps) under a waves parent must declare \`wave\`; a wave that is already over is rejected.
- \`flow validate\` errors on: a direct sub-step without \`wave\`, \`wave\` outside a waves parent or on a nested sub-step, a \`wave\` that is not a non-negative integer, and an unknown \`subStepStrategy\` (valid: \`restart-on-first-failure\`, \`wait-all\`, \`waves\`). It warns on a waves parent with fewer than 2 distinct waves.

Example: wave 1 script checks, wave 2 model reviewers each with a nested validator, wave 3 e2e.

\`\`\`yaml
${WAVES_EXAMPLE_FLOW_YAML.trim()}
\`\`\``;
	}
}
