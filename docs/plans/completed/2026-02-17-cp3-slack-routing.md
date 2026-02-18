# CP3 Plan (Slack Connection + Routing)

Status: complete
Owner: kevin + codex
Last Updated: 2026-02-18

## Goal
Connect the runtime to Slack Socket Mode and route inbound slash commands to the correct agent on a single router bot.

## Scope Decision
CP3 will not depend on `@mariozechner/pi-mom` directly. We will copy/adapt implementation patterns from local `pi-mom` source into Gravity-native runtime modules.
Dependency scope for CP3 is intentionally minimal (`@slack/socket-mode`, `@slack/web-api`, `kysely`, `pg`). `pi-coding-agent` and other `pi-*` packages are deferred to CP4 with the Claude loop work.
MVP routing is slash-command-first (`/wiggs`, `/compliance`) with a static command map. We are intentionally not using channel-based fallback routing.
Trigger policy for MVP: only slash commands should trigger agents. Non-slash triggers (`app_mention`, `message`) stay disabled until CP6 session behavior and CP7 session/memory tests are implemented.

## CP3 In/Out
- In scope: Slack Socket Mode connection, `slash_commands` ingestion, slash-command-to-agent routing, run lifecycle + run log writes, basic echo response with slash `response_type: in_channel` so commands remain visible in-channel.
- Out of scope: full Claude tool loop, compaction/session manager internals, events scheduler, sandbox enforcement.

## Work Items
- [x] Add minimal runtime unit tests to establish CP3 safety rails.
- [x] Add a run lifecycle logging wrapper with stable IDs (`runId`, `agentId`, `sessionKey`).
- [x] Replace placeholder Slack channel IDs in `seed.sql` with real workspace channel IDs.
- [x] Add CP3 runtime dependencies for Slack transport + run persistence (`@slack/socket-mode`, `@slack/web-api`, `kysely`, `pg`) to `package.json`.
- [x] Copy/adapt minimal Slack loop pieces from `pi-mom` into `src/` (transport + queueing only).
- [x] Wire Slack Socket Mode connection and slash-command ingestion (`slash_commands` with channel-scoped queueing).
- [x] Implement static slash command to agent mapping for MVP (`/wiggs`, `/compliance`).
- [x] Keep non-slash trigger paths disabled in runtime (`app_mention`, `message`).
- [x] Add run lifecycle-backed inserts/updates for `gravity.runs`.
- [x] Reply with a basic echo response using slash `response_type: in_channel` to validate end-to-end routing and keep slash command visibility.
- [x] Update checkpoint status and architecture docs if boundaries change.

## Risks
- Slack app credentials and Socket Mode setup may be incomplete.
- Slash command configuration/scopes may be incomplete.
- Deferring `pi-coding-agent`/`pi-*` to CP4 may shift integration risk into that checkpoint.
- Imported runtime pieces from `pi-mom` may require adaptation for current Gravity boundaries and env config.

## Exit Criteria
- Slack bot is online and receives slash command payloads.
- A test slash command (for example `/wiggs`) is routed to the expected agent and receives an `in_channel` response that preserves command visibility.
- `gravity.runs` records start/completion (or failure) with stable IDs for the routed test slash command.
- `npm run check` passes.
- Docs and checkpoint state are updated in the same change.
