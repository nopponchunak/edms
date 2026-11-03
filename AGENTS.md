# Instructions for AI coding assistants

Read `docs/HANDOFF.md` first (current state, decisions, how to run, open items), then `PRODUCT.md`.

Short version of the rules:
- `PRODUCT.md` is the reference for architecture, UI and CSS. `system_old` is read-only and only for business flow and
  fields, never for code or style.
- Apps: `apps/frontend` (Angular 20, dev port 4201) and `apps/backend` (NestJS 11, port 3001). The API runs from `dist/`:
  rebuild with `npx nest build` after backend changes.
- New forms reuse the shared access model and the newest form modules as templates (see `docs/HANDOFF.md` section 4).
- People are deactivated, never deleted; finished documents must keep opening exactly as completed (form versions and
  signer snapshots, section 5).
- Never print or commit secrets (`.env`, API keys). Do not commit or push unless the owner asks.
