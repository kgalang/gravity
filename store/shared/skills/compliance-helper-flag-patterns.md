# Shared Skill: Compliance Helper Flag Patterns

Use these patterns to identify compliance red flags in fintech marketing copy. Severity and response should be calibrated to the risk tier (channel, audience size, permanence) -- a homepage claim gets full scrutiny; an internal Slack message gets a lighter touch.

## Hard Blocks (stop-ship at any risk tier)

These patterns have caused real enforcement actions and should never ship without remediation:

- **Representing Mercury as a bank.** "Mercury Bank", "our bank", "we are a bank", "open a bank account at Mercury." Chime received cease-and-desist orders from CA and IL for this. There is no safe version of calling a fintech a bank if it does not hold a charter.
- **FDIC claims without naming the partner bank.** Under the 2024 FDIC final rule (12 CFR Part 328), failing to identify the specific insured depository institution is a per-se material omission. Always name Choice Financial Group, Column N.A., or the relevant partner, and always include "Member FDIC."
- **Implying FDIC insurance protects against Mercury's failure.** FDIC insurance covers bank failure, not fintech failure. The Synapse/Evolve collapse proved this distinction matters -- $160M+ in customer funds were trapped when the fintech middleware layer failed, and FDIC insurance was irrelevant. Copy must never create the impression that "FDIC-insured" means "your money is safe no matter what happens to Mercury."
- **Banking terminology without the not-a-bank disclosure.** Any use of "banking", "bank account", "deposit", "checking account", "savings account" requires the canonical disclosure ("Mercury is a fintech company, not a bank. Banking services provided by [Partner Banks], Members FDIC.") in the same copy block, in bold or increased font per CA DFPI settlement precedent.
- **Unqualified "free" or "no fees" claims.** LendingClub paid $18M for "No Hidden Fees" while charging origination fees. Dave faced FTC action for "no mandatory fees" with hidden Express Fees. If any fee exists under any condition for the described service, "free" must be qualified or removed. A fine-print asterisk does not cure a bold "FREE" headline under the CFPB's net impression standard.

## Warnings (flag, calibrate to risk tier)

These require attention but the appropriate response depends on channel and context:

- **Absolute certainty language** ("guaranteed", "risk-free", "always", "never fails", "100% safe"). On a homepage or paid ad, rewrite to evidence-based language ("designed to", "aims to", "historically has"). In a 1:1 sales email, flag but don't block -- a human can exercise judgment about conversational tone vs. regulatory exposure.
- **Comparison claims** ("better than your bank", "fastest in the industry", "higher rates than X"). Require substantiation under FTC Section 5. Must be apples-to-apples, current data, same terms. Outdated or cherry-picked comparisons are deceptive. At medium+ risk tiers, require a substantiation source or soften to non-comparative language.
- **Speed/instant claims** ("instant transfers", "real-time", "same-day"). Dave enforcement: "instant" that requires a fee while the free option takes days is deceptive. Qualify with conditions and fee disclosures in the same visual unit.
- **Testimonials and endorsements without required disclosures.** Customer outcome claims ("I saved $50K") must reflect typical results or disclose atypicality. Material connections (sponsorship, referral bonuses, free products) must be disclosed within the endorsement per 2023 FTC Endorsement Guides. Both Mercury and the endorser are liable.
- **Language implying Mercury transmits money.** "We send your money", "Mercury transfers funds" could trigger money transmitter classification. Mercury's legal position is that it does not transmit money -- movement occurs through partner banks. Use "initiate a transfer" or "transfers processed by our partner banks."

## Escalate to Human Review (never auto-approve)

These topics involve specific regulatory regimes where automated review is insufficient:

- **APY, interest rate, or yield language.** Triggers Reg DD (Truth in Savings) full-disclosure requirements: minimum balance, variable-rate notice, rate duration, tiered rates. Even a social media post mentioning an APY triggers the full suite.
- **Investment, securities, treasury, or sweep language.** May cross into SEC/FINRA territory. Robinhood's 2018 SIPC debacle happened exactly at this boundary. Treasury management and cash sweep products may constitute securities requiring broker-dealer registration.
- **Tax advice, legal advice, or insurance references.** These are licensed professions. Marketing copy should never imply Mercury provides them.
- **APR or loan-related claims.** Triggers TILA (Regulation Z) disclosure requirements.

## The Net Impression Test

Apply this qualitative check to every piece of copy at medium and high risk tiers: **"If a reasonable consumer glanced at this for 3 seconds, what would they believe?"** If that snap judgment is inaccurate, the copy fails -- regardless of what the fine print says. This is the CFPB's primary framework for evaluating deception and it overrides the literal truth of individual statements. A technically true headline with contradictory fine print is still deceptive if the net impression misleads.

## Calibrating Severity to Blast Radius

Not every flag deserves the same urgency. A good compliance officer is a business enabler, not a blocker:

| Risk Tier | Channels | Approach |
|-----------|----------|----------|
| **Low** | Internal comms, 1:1 emails, small social posts | Flag hard blocks only. Warnings are informational. Ship with common sense. |
| **Medium** | Email campaigns, blog posts, webinars, organic social | Full rule evaluation. Warnings should be addressed. Can ship with documented accept-risk from marketing lead. |
| **High** | Homepage, product pages, paid ads, PR quotes, affiliate marketing, app store listings | Full compliance + legal review. All flags must be resolved. No accept-risk bypass without CCO sign-off. |

The goal is to move fast on low-risk channels while protecting the company on high-exposure surfaces. A compliance review that blocks everything equally is just as harmful as one that catches nothing -- it trains the marketing team to ignore compliance entirely.
