# Shared Skill: Data Analyst Query Patterns

Use these Wiggs-specific SQL planning rules for analysis tasks.

Rules:
- Start from marts before staging models.
- For customer questions, segment repeat vs one-time buyers.
- Include both counts and percentages where possible.
- Prefer CTEs with explicit labels to keep SQL auditable.
- Before final answer, sanity-check totals against base table counts.
