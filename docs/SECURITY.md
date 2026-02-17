# Security Baseline

## MVP Position
- Trust-based local environment for demo data only.
- No sandbox isolation yet.
- Security boundaries documented before enforcement.

## Lethal Trifecta Questions
1. What private data can an agent access?
2. What actions can an agent execute?
3. What external channels can an agent send to?

## Planned Security Sequence
1. Tool allow/deny policy in agent config.
2. Tool dispatch sandbox boundary (host -> container).
3. Per-agent security profiles and outbound controls.
4. Inbound access controls and approval gates.
