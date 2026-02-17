# Agent-Generated Acceptance Bar

A change counts as acceptable agent-generated work only when all conditions hold:

1. It passes all required checks (`npm run check`).
2. It keeps architecture boundaries explicit (`docs/architecture/interfaces.md` updated if needed).
3. It updates impacted documentation in the same change.
4. It includes enough clarity that another engineer can explain what changed and why.
5. It does not increase moving parts without a stated owner and rollback path.

Anything below this bar is draft output, not merge-ready output.
