/**
 * Complete working example of a flow that uses a secret input.
 * Shared by the generated flow documentation (`flow docs`) and by tests; no I/O.
 */
export const SECRET_EXAMPLE_FLOW_YAML = `version: '1.0.0'
id: call-protected-api
name: Call a protected API
description: Calls an HTTP API with a bearer token that is never written in the flow
workspace:
  mode: isolated
  gitStrategy: main-only
  reusePolicy: never
inputs:
  API_TOKEN:
    type: password
    description: Bearer token of the API (pass it as env://VAR or file://./path)
    required: true
steps:
  - id: call-api
    name: Call the API
    type: script
    shell: bash
    secrets: [API_TOKEN]
    script: |
      curl -s -H "Authorization: Bearer $API_TOKEN" https://example.invalid/api/status
`;
