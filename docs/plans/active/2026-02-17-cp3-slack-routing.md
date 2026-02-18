# CP3 Plan (Slack Connection + Routing)

Status: active
Owner: kevin + codex
Last Updated: 2026-02-18

## Goal
Connect the runtime to Slack Socket Mode and route inbound channel messages to the correct agent using `gravity.agents.channel_id`.

## Scope Decision
CP3 will not depend on `@mariozechner/pi-mom` directly. We will copy/adapt implementation patterns from local `pi-mom` source into Gravity-native runtime modules and use compatible `pi-*` package dependencies (version-pinned).

## CP3 In/Out
- In scope: Slack Socket Mode connection, `app_mention` + `message` ingestion (including DMs), channel-to-agent routing, run lifecycle + run log writes, basic echo response.
- Out of scope: full Claude tool loop, compaction/session manager internals, events scheduler, sandbox enforcement.

## Work Items
- [x] Add minimal runtime unit tests to establish CP3 safety rails.
- [x] Add a run lifecycle logging wrapper with stable IDs (`runId`, `agentId`, `sessionKey`).
- [x] Replace placeholder Slack channel IDs in `seed.sql` with real workspace channel IDs.
- [x] Add runtime dependencies aligned with the `pi-mom` implementation (`pi-*`, Slack SDKs, supporting libs) to `package.json` with pinned versions.
- [x] Copy/adapt minimal Slack loop pieces from `pi-mom` into `src/` (transport + queueing only).
- [x] Wire Slack Socket Mode connection and event ingestion (`app_mention` + `message` with channel-scoped queueing).
- [x] Implement `channel_id -> agentId` lookup from Postgres (`gravity.agents`).
- [ ] Add run lifecycle-backed inserts/updates for `gravity.runs`.
- [ ] Reply with a basic echo response to validate end-to-end routing.
- [x] Update checkpoint status and architecture docs if boundaries change.

## Deferred Follow-Up (Post-CP3)
- [ ] Add slash-command entrypoint for Wiggs (`/wiggs`) on the single router bot.
- [ ] Handle Socket Mode `slash_commands` payloads and route `/wiggs <query>` into the same run lifecycle path.
- [ ] Keep mention-based routing as fallback while slash commands roll out.

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
