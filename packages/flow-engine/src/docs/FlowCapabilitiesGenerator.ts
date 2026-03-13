/**
 * Flow Capabilities Generator
 *
 * Generates a structured Markdown document describing all flow engine capabilities.
 * Used as context injected into an AI agent prompt (FlowDesignerAgent) so it
 * understands what the flow engine supports.
 *
 * No runtime reflection — structure is hardcoded mirroring types.ts.
 */
export class FlowCapabilitiesGenerator {
	/**
	 * Generate a structured Markdown document describing all flow engine capabilities.
	 *
	 * @returns Markdown string ready for injection into an AI prompt
	 */
	generate(): string {
		return [
			this.generateHeader(),
			this.generateStepTypes(),
			this.generateVariableTypes(),
			this.generateTemplateSyntax(),
			this.generateWorkspaceModes(),
			this.generateStatusTransitions(),
			this.generateInterventionTypes(),
			this.generateFeedbackAndRetrospectiveAPIs(),
		].join('\n\n');
	}

	private generateHeader(): string {
		return `# Flow Engine Capabilities

This document describes all capabilities supported by the flow engine.
Use it to design valid flows when responding to user requests.`;
	}

	private generateStepTypes(): string {
		// @formatter:off
		const TMPL = '${{';
		return `## Section 1: Step Types

Each step has a \`type\` discriminator and inherits base fields from \`BaseFlowStep\`:
- \`id\` (string, required) — unique identifier within the flow
- \`name\` (string, required) — human-readable label
- \`context\` — optional: \`files\` (glob patterns), \`previousOutputs\` (step IDs), \`taskMetadata\` (keys)
- \`output\` — map of variable names to extraction configs (pattern, from, transform, default)
- \`depends\` — list of step IDs that must complete before this step runs
- \`when\` — conditional expression (evaluated to boolean); step is skipped if false
- \`skipOnLoop\` — skip this step when a feedback loop is triggered (useful for one-time setup)
- \`retry\` — \`{ maxAttempts, backoff: 'linear' | 'exponential' }\`
- \`onFailure\` — feedback loop config: \`{ goto, maxIterations, resetOnSuccess, addComment }\`
- \`contract\` — \`{ preProcess: { validateInputs, required }, postProcess: { validateOutputs, required } }\`

### model

Executes an AI model with a prompt. Supports template variable interpolation in the prompt.

\`\`\`yaml
type: model
model: sonnet | haiku | opus
prompt: |
  Analyze the following: ${TMPL} inputs.description }}
  Previous result: ${TMPL} steps.previous.outputs.result }}
\`\`\`

Key fields:
- \`model\` (ModelType, required) — which AI model to use: \`sonnet\`, \`haiku\`, or \`opus\`
- \`prompt\` (string, required) — prompt template with \`${TMPL} }}\` variable interpolation

### script

Executes a shell command or script in the workspace.

\`\`\`yaml
type: script
script: |
  npm test
  echo "Tests done"
workingDir: ./packages/my-package
env:
  NODE_ENV: test
captureOutput: true
\`\`\`

Key fields:
- \`script\` (string, required) — shell command(s) to execute
- \`workingDir\` (string, optional) — working directory for execution
- \`env\` (Record<string, string>, optional) — environment variables
- \`captureOutput\` (boolean, optional) — whether to capture stdout/stderr

### subflow

References and executes another flow (composition). Enables reuse and modularity.

\`\`\`yaml
type: subflow
flowId: my-other-flow
inputs:
  description: ${TMPL} inputs.description }}
  context: ${TMPL} steps.gather.outputs.context }}
workspaceStrategy: inherit | separate
allowRecursion: false
\`\`\`

Key fields:
- \`flowId\` (string, required) — ID of the flow to execute
- \`inputs\` (Record<string, string>, required) — template inputs passed to the subflow
- \`workspaceStrategy\` (\`'inherit' | 'separate'\`, optional, default: \`inherit\`) — whether to share workspace
- \`output\` — map of variable names to template strings extracting from subflow outputs
- \`allowRecursion\` (boolean, optional) — must be explicitly \`true\` to allow a flow calling itself

### user_intervention

Pauses flow execution and waits for user interaction. Can be non-blocking with a timeout.

\`\`\`yaml
type: user_intervention
interventionType: approval | question | choice
blocking: true
timeout:
  minutes: 60
  onTimeout: fail | continue | default
  defaultValue: ~
\`\`\`

Key fields:
- \`interventionType\` (required) — \`approval\`, \`question\`, or \`choice\`
- \`blocking\` (boolean, default: \`true\`) — whether to pause flow until user responds
- \`timeout\` — optional: \`{ minutes, onTimeout: 'fail' | 'continue' | 'default', defaultValue }\`
- \`approval\` — config for approval type: \`{ title, description, allowReject }\`
- \`question\` — config for question type: \`{ question, responseType: 'text' | 'number' | 'boolean', validation }\`
- \`choice\` — config for choice type: \`{ question, options: [{ id, label, description }], allowMultiple }\``;
		// @formatter:on
	}

	private generateVariableTypes(): string {
		return `## Section 2: Variable Types

All 20 supported \`VariableType\` values:

### Base types (legacy, always supported)
| Type | Description |
|------|-------------|
| \`string\` | Single-line text value |
| \`number\` | Floating-point number |
| \`boolean\` | True/false value |
| \`object\` | Arbitrary JSON object |

### Text types
| Type | Description |
|------|-------------|
| \`text\` | Multi-line text (textarea) |
| \`url\` | URL with protocol validation |
| \`markdown\` | Markdown-formatted text, rendered in UI |

### Number types
| Type | Description |
|------|-------------|
| \`integer\` | Whole number only |
| \`percentage\` | Number between 0 and 100 |
| \`duration\` | Time duration with unit (seconds/minutes/hours/days) |

### Selection types
| Type | Description |
|------|-------------|
| \`enum\` | Single selection from a predefined list |
| \`multi-enum\` | Multiple selections from a predefined list |

### File types
| Type | Description |
|------|-------------|
| \`file\` | File path, optionally filtered by extension |
| \`folder\` | Directory path |

### Date types
| Type | Description |
|------|-------------|
| \`date\` | Date value (YYYY-MM-DD) |
| \`datetime\` | Date and time value (ISO 8601) |

### Code types
| Type | Description |
|------|-------------|
| \`regex\` | Regular expression pattern |

### Structure types
| Type | Description |
|------|-------------|
| \`array\` | Ordered list of values (configurable item type) |
| \`keyvalue\` | Key-value pairs (map/dictionary) |

### Security types
| Type | Description |
|------|-------------|
| \`password\` | Sensitive value, masked in UI |

### Business types
| Type | Description |
|------|-------------|
| \`priority\` | Priority level: \`low\`, \`medium\`, \`high\`, or \`critical\` |`;
	}

	private generateTemplateSyntax(): string {
		// @formatter:off
		const TMPL = '${{';
		return `## Section 3: Template Syntax

Templates use GitHub Actions-style syntax: \`${TMPL} expression }}\`.

### Accessing step outputs
\`\`\`
${TMPL} steps.<stepId>.outputs.<variableName> }}
\`\`\`
Example: \`${TMPL} steps.analyze.outputs.recommendation }}\`

### Accessing flow inputs
\`\`\`
${TMPL} inputs.<variableName> }}
\`\`\`
Example: \`${TMPL} inputs.description }}\`

### Accessing task metadata
\`\`\`
${TMPL} task.<property> }}
${TMPL} task.metadata.<key> }}
\`\`\`
Examples:
- \`${TMPL} task.priority }}\`
- \`${TMPL} task.metadata.ticketId }}\`

### Built-in transform functions (for output extraction)
Applied via the \`transform\` field in \`OutputVariableConfig\`:
- \`parseJSON\` — parse JSON string to object
- \`parseYAML\` — parse YAML string to object
- \`parseInt\` — parse integer
- \`parseFloat\` — parse float
- \`parseBoolean\` — parse boolean
- \`trim\` — strip whitespace
- \`toLowerCase\` / \`toUpperCase\` — case conversion
- \`split\` — split string to array

### Output extraction from user intervention responses
Use the \`from\` field to reference intervention response fields:
- \`from: intervention.approved\` — whether the user approved
- \`from: intervention.comment\` — optional comment from user
- \`from: intervention.answeredBy\` — user who responded
- \`from: intervention.value\` — the answer value (for question/choice types)`;
		// @formatter:on
	}

	private generateWorkspaceModes(): string {
		return `## Section 4: Workspace Modes

Configured via the \`workspace\` field of a \`FlowDefinition\`:

\`\`\`yaml
workspace:
  mode: isolated | shared | manual
  gitStrategy: main-only | feature-branch | any | worktree
  reusePolicy: never | if-available | always
  concurrencyKey: optional-group-key
\`\`\`

### Modes
| Mode | Description |
|------|-------------|
| \`isolated\` | Each execution gets a fresh workspace; changes are isolated per run |
| \`shared\` | All steps and executions share the same workspace |
| \`manual\` | User specifies the workspace path explicitly |

### Git strategies
| Strategy | Description |
|----------|-------------|
| \`main-only\` | Only the main/master branch is used |
| \`feature-branch\` | A feature branch is created for each execution |
| \`any\` | No constraint on branch |
| \`worktree\` | Uses git worktrees for isolation without full clones |

### Reuse policies
| Policy | Description |
|--------|-------------|
| \`never\` | Always provision a fresh workspace |
| \`if-available\` | Reuse an existing compatible workspace if one is free |
| \`always\` | Always reuse; fail if none available |`;
	}

	private generateStatusTransitions(): string {
		return `## Section 5: Status Transitions

Configured via the optional \`statusTransitions\` field of a \`FlowDefinition\`.
Defaults: \`onSuccess → review\`, \`onFailure → changes_requested\`.

\`\`\`yaml
statusTransitions:
  onSuccess:
    task: review           # TaskStatus to apply on success
    ticket: in_progress    # TicketStatus to apply on the linked ticket
  onFailure:
    task: changes_requested
    ticket: todo
\`\`\`

Shorthand (task status only):
\`\`\`yaml
statusTransitions:
  onSuccess: review
  onFailure: changes_requested
\`\`\`

### TaskStatus values
\`backlog\`, \`refining\`, \`refined\`, \`prioritizing\`, \`todo\`, \`in_progress\`,
\`testing\`, \`review\`, \`reviewing\`, \`changes_requested\`, \`approved\`, \`merged\`,
\`blocked\`, \`cancelled\`, \`awaiting_user\`

### TicketStatus
Ticket statuses are project-configurable strings. Built-in defaults:
\`backlog\`, \`todo\`, \`in_progress\`, \`done\`, \`cancelled\`, \`pending_integration\`, \`integrated\``;
	}

	private generateInterventionTypes(): string {
		return `## Section 6: Intervention Types

Used in \`user_intervention\` steps. Three types are supported:

### approval
A yes/no decision from the user.
\`\`\`yaml
type: user_intervention
interventionType: approval
approval:
  title: "Approve the proposed changes?"
  description: "Review the diff above before approving."
  allowReject: true
\`\`\`
Output fields: \`intervention.approved\` (boolean), \`intervention.comment\` (string)

### question
A free-form text answer from the user.
\`\`\`yaml
type: user_intervention
interventionType: question
question:
  question: "What is the target branch for this PR?"
  responseType: text   # text | number | boolean
  validation:
    - type: required
    - type: pattern
      value: "^[a-z0-9/-]+$"
\`\`\`
Output fields: \`intervention.value\`, \`intervention.answeredBy\`

### choice
User picks from a list of predefined options.
\`\`\`yaml
type: user_intervention
interventionType: choice
choice:
  question: "Which deployment environment?"
  options:
    - id: staging
      label: Staging
      description: Deploy to staging environment
    - id: production
      label: Production
      description: Deploy to live environment
  allowMultiple: false
\`\`\`
Output fields: \`intervention.value\` (selected option id or array if \`allowMultiple\`), \`intervention.answeredBy\``;
	}

	private generateFeedbackAndRetrospectiveAPIs(): string {
		return `## Section 7: Flow Feedback & Retrospective APIs

These endpoints are available for capturing structured feedback after flow executions.

### Submit flow feedback
\`\`\`
POST /api/tickets/:ticketId/feedback
\`\`\`
Body:
\`\`\`json
{
  "rating": 4,           // integer 1-5
  "wentWell": ["clear prompt", "fast execution"],
  "wentWrong": ["output format unexpected"],
  "suggestions": ["add retry on parse error"]
}
\`\`\`

### Get all feedback for a flow
\`\`\`
GET /api/flows/:flowId/feedback
\`\`\`
Returns array of feedback entries for the given flow.

### Submit retrospective for a ticket
\`\`\`
POST /api/tickets/:ticketId/retrospective
\`\`\`
Body:
\`\`\`json
{
  "executionSummary": "Flow ran 3 steps, produced a PR",
  "wentWell": ["model step output was accurate"],
  "wentWrong": ["script step failed on first attempt"],
  "suggestions": ["add lint step before commit"]
}
\`\`\`

### Get retrospective for a ticket
\`\`\`
GET /api/tickets/:ticketId/retrospective
\`\`\`
Returns the retrospective for the given ticket execution.`;
	}
}
