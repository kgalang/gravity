# Slack App Setup (Gravity)

This doc is the source of truth for configuring the Gravity Slack app.

## Goal

Enable all current Gravity trigger and delivery paths:

- Slash commands: `/wiggs`, `/compliance`, `/pearlboy`
- Non-slash message triggers: `app_mention`, thread replies, DM messages
- Proactive delivery targets: channel thread and DM user

## 1. Create Tokens

1. Open <https://api.slack.com/apps> and create/select the Gravity app.
2. Under `Basic Information`, create an **App-Level Token** with scope:
   - `connections:write`
3. Under `OAuth & Permissions`, install/reinstall app and copy **Bot User OAuth Token**.

Expected token types:

- `SLACK_APP_TOKEN`: `xapp-...`
- `SLACK_BOT_TOKEN`: `xoxb-...`

## 2. Bot Token Scopes

Under `OAuth & Permissions -> Bot Token Scopes`, configure:

Required:

- `app_mentions:read`: inbound `app_mention`
- `chat:write`: post channel/thread replies
- `commands`: slash command handling
- `channels:history`: channel `message` events (public channels)
- `groups:history`: channel `message` events (private channels)
- `im:history`: DM `message` events
- `im:write`: open DM conversations (`conversations.open`) for proactive DM delivery

Optional (only if needed):

- `chat:write.public`: post to public channels without explicitly inviting the bot
- `mpim:history`: group DM message events
- `mpim:write`: group DM creation/posting flows

After scope changes, always click `Reinstall to Workspace`.

## 3. Enable Socket Mode

Under `Settings -> Socket Mode`:

1. Turn `Enable Socket Mode` on.
2. Ensure the app-level token (`xapp-...`) is present in `.env` as `SLACK_APP_TOKEN`.

## 4. Enable App Home DM Input

Under `Features -> App Home`:

1. Enable `Messages Tab`.
2. Enable `Allow users to send Slash commands and messages from the messages tab`.

If this is off, users will see: `Sending messages to this app has been turned off.`

## 5. Configure Event Subscriptions

Under `Features -> Event Subscriptions`:

1. Turn `Enable Events` on.
2. Add bot events:
   - `app_mention`
   - `message.channels`
   - `message.groups`
   - `message.im`
3. Save changes and reinstall if prompted.

## 6. Configure Slash Commands

Under `Features -> Slash Commands`, add:

- `/wiggs`
- `/compliance`
- `/pearlboy`

Slack requires a Request URL value in the form even when Socket Mode is enabled.
Use a valid HTTPS placeholder (for example `https://example.com/slack/commands`) if you do not use HTTP ingress.

## 7. Install and Invite

1. Install app to workspace.
2. Invite app to target channels (for example `#gravity-data-analyst`, `#gravity-compliance`).
3. Confirm `seed.sql` channel IDs match the workspace channel IDs before `npm run db:apply`.

## 8. Runtime Environment

Set environment variables:

```bash
SLACK_APP_TOKEN=xapp-...
SLACK_BOT_TOKEN=xoxb-...
```

Then run:

```bash
npm run dev
```

Expected log when connected:

```text
[gravity] slack transport connected (botUserId=...)
```

## 9. Verification Checklist

1. Slash command: `/wiggs top customers`
2. Slash command: `/compliance <draft copy>` (Pearlboy compliance review)
3. Slash command: `/pearlboy <draft copy>` (Pearlboy alias)
4. App mention: `@Gravity test`
5. Thread reply under bot thread
6. DM message to app
7. (Optional) proactive trigger delivery to channel thread and DM

Expected `/compliance` review contract:

- `Verdict: pass | needs_revision | block | needs_human_review`
- `Flags` section with matched phrase + rule id
- `Required Disclosures` section when applicable
- `Suggested Revision` section
- `Escalation` section for human-review routing

## 10. Troubleshooting

- Symptom: `Sending messages to this app has been turned off.`
  - Fix: Enable App Home `Messages Tab` and allow sending messages.
- Symptom: no inbound events
  - Fix: verify Socket Mode is enabled, required bot events are subscribed, app reinstalled.
- Symptom: slash command not routed
  - Fix: confirm `/wiggs`, `/compliance`, and `/pearlboy` exist in Slack and match router mapping.
- Symptom: proactive DM delivery fails
  - Fix: add `im:write`, reinstall app, verify `SLACK_BOT_TOKEN` is current.
