# CP3 Plan (Slack Connection + Routing)

Status: active
Owner: kevin + codex
Last Updated: 2026-02-17

## Goal
Connect the runtime to Slack Socket Mode and route inbound channel messages to the correct agent using `gravity.agents.channel_id`.

## Scope Decision
CP3 will not depend on `@mariozechner/pi-mom` directly. We will copy/adapt implementation patterns from local `pi-mom` source into Gravity-native runtime modules and use compatible `pi-*` package dependencies (version-pinned).

## CP3 In/Out
- In scope: Slack Socket Mode connection, `app_mention` ingestion, channel-to-agent routing, run lifecycle + run log writes, basic echo response.
- Out of scope: full Claude tool loop, compaction/session manager internals, events scheduler, sandbox enforcement.

## Work Items
- [x] Add minimal runtime unit tests to establish CP3 safety rails.
- [x] Add a run lifecycle logging wrapper with stable IDs (`runId`, `agentId`, `sessionKey`).
- [x] Replace placeholder Slack channel IDs in `seed.sql` with real workspace channel IDs.
- [ ] Add runtime dependencies aligned with the `pi-mom` implementation (`pi-*`, Slack SDKs, supporting libs) to `package.json` with pinned versions.
- [ ] Copy/adapt minimal Slack loop pieces from `pi-mom` into `src/` (transport + queueing only).
- [ ] Wire Slack Socket Mode connection and event ingestion.
- [ ] Implement `channel_id -> agentId` lookup from Postgres (`gravity.agents`).
- [ ] Add run lifecycle-backed inserts/updates for `gravity.runs`.
- [ ] Reply with a basic echo response to validate end-to-end routing.
- [x] Update checkpoint status and architecture docs if boundaries change.

## Risks
- Slack app credentials and Socket Mode setup may be incomplete.
- Channel ID mismatches can silently break routing.
- `pi-*` package version drift from `pi-mom` can break adapted code paths.
- Imported runtime pieces from `pi-mom` may require adaptation for current Gravity boundaries and env config.

## Exit Criteria
- Slack bot is online and receives messages.
- A test message in a mapped channel is routed to the expected agent and receives a response.
- `gravity.runs` records start/completion (or failure) with stable IDs for the routed test message.
- `npm run check` passes.
- Docs and checkpoint state are updated in the same change.
