# extension-points

Typed interface contracts for the flow-cli plugin system. Defines the provider interfaces that plugins must implement.

Exports `WorkspaceProvider`, `WorkspaceRequest`, `WorkspaceHandle` (workspace/v1) and `ApprovalProvider`, `InputRequest`, `ChoiceRequest`, `ApprovalRequest` (approval/v1).

Used by: flow-engine, flow-cli, plugin-sdk, and all plugin packages.
