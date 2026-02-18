# CP3 Plan (Slack Connection + Routing)

Status: active
Owner: kevin + codex
Last Updated: 2026-02-18

## Goal
Connect the runtime to Slack Socket Mode and route inbound slash commands to the correct agent on a single router bot.

## Scope Decision
CP3 will not depend on `@mariozechner/pi-mom` directly. We will copy/adapt implementation patterns from local `pi-mom` source into Gravity-native runtime modules and use compatible `pi-*` package dependencies (version-pinned).
MVP routing is slash-command-first (`/wiggs`, `/compliance`) with a static command map. We are intentionally not using channel-based fallback routing.
Trigger policy for MVP: only slash commands should trigger agents. Non-slash triggers (`app_mention`, `message`) stay disabled until CP6 session behavior and CP7 session/memory tests are implemented.

## CP3 In/Out
- In scope: Slack Socket Mode connection, `slash_commands` ingestion, slash-command-to-agent routing, run lifecycle + run log writes, basic echo response.
- Out of scope: full Claude tool loop, compaction/session manager internals, events scheduler, sandbox enforcement.

## Work Items
- [x] Add minimal runtime unit tests to establish CP3 safety rails.
- [x] Add a run lifecycle logging wrapper with stable IDs (`runId`, `agentId`, `sessionKey`).
- [x] Replace placeholder Slack channel IDs in `seed.sql` with real workspace channel IDs.
- [x] Add runtime dependencies aligned with the `pi-mom` implementation (`pi-*`, Slack SDKs, supporting libs) to `package.json` with pinned versions.
- [x] Copy/adapt minimal Slack loop pieces from `pi-mom` into `src/` (transport + queueing only).
- [x] Wire Slack Socket Mode connection and slash-command ingestion (`slash_commands` with channel-scoped queueing).
- [x] Implement static slash command to agent mapping for MVP (`/wiggs`, `/compliance`).
- [x] Keep non-slash trigger paths disabled in runtime (`app_mention`, `message`).
- [ ] Add run lifecycle-backed inserts/updates for `gravity.runs`.
- [ ] Reply with a basic echo response to validate end-to-end routing.
- [x] Update checkpoint status and architecture docs if boundaries change.

## Risks
- Slack app credentials and Socket Mode setup may be incomplete.
- Slash command configuration/scopes may be incomplete.
- `pi-*` package version drift from `pi-mom` can break adapted code paths.
- Imported runtime pieces from `pi-mom` may require adaptation for current Gravity boundaries and env config.

## Exit Criteria
- Slack bot is online and receives slash command payloads.
- A test slash command (for example `/wiggs`) is routed to the expected agent and receives a response.
- `gravity.runs` records start/completion (or failure) with stable IDs for the routed test slash command.
- `npm run check` passes.
- Docs and checkpoint state are updated in the same change.
