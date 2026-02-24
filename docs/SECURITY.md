# Security Baseline

## MVP Position
- Trust-based local environment for demo data only.
- Sandbox execution path is available via `ExecutorManager` with fail-closed allow/deny policy decisions and explicit force-host fail-closed mode (`GRAVITY_SANDBOX_FORCE_HOST`).
- Security boundaries documented before enforcement.

## Lethal Trifecta Questions
1. What private data can an agent access?
2. What actions can an agent execute?
3. What external channels can an agent send to?

## Planned Security Sequence
1. Tool allow/deny policy in agent config.
2. Tool dispatch sandbox boundary (host vs sandbox via `ExecutorManager`) with stable-ID decision logging.
3. Per-agent security profiles, outbound controls, and richer sandbox approval-state workflow.
4. Inbound access controls and approval gates.
