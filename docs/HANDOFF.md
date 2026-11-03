# Handoff notes for the next developer / AI assistant

Read this first, then `PRODUCT.md` (architecture, UI and CSS rules). It records what exists, the rules the product owner
has decided, how to run things, and what is still open. Written 2026-11-03. Secrets are not in this file: they live in
the git-ignored `.env`, and mock test credentials are only in `apps/backend/src/scripts/seed-mock-users.ts`.

## 1. What this is

Meinhardt (Thailand) Ltd. EDMS: a rebuild of the legacy EDMS (`system_old`, read-only reference) as an Angular 20 web app
(`apps/frontend`) and a NestJS 11 / TypeORM / PostgreSQL API (`apps/backend`). The product owner writes in Thai.

**Standing rules from the owner**
- `PRODUCT.md` is the only reference for architecture, UI patterns, CSS (`--mh-*` variables) and API design.
  `system_old` is for **business flow, fields and rules only**, never code or style.
- Before a new form, the owner supplies its flow. Build to that flow, then adjust when asked.
- Every form follows the shared access model (section 4). Every list table: all columns sortable server-side.
- People are **deactivated, never deleted**. Finished documents must open **exactly as they were when completed**
  (section 5).
- Ask before doing anything outward-facing (push, calls to external systems). Do not commit unless asked.

## 2. Run it

| | |
|---|---|
| Database | `docker compose up -d postgres` (dev DB on port 5436, see `.env`) |
| Install | `npm install` at the repo root (npm workspaces) |
| API | `cd apps/backend && npx nest build && node dist/main` (port 3001, prefix `/api`). The API runs from `dist/`, so **rebuild after every backend change and restart** |
| Web | `cd apps/frontend && npx ng serve --port 4201` |
| Migrations | `cd apps/backend && npm run migration:run` (never `synchronize`) |
| Type-check the web app | `cd apps/frontend && npx ng build --configuration development` |
| Mock users | `cd apps/backend && npm run mock:users` (local only, refuses production) |

Login: LDAP needs the company network/VPN (10.98.201.61). Without it use the **local account** button: the env super
admin (`LOCAL_ADMIN_*`) or active DB users with `auth_provider = 'local'`. Mock users `acsc, acsl, ca, di, md` exist for
approval tests (role `employee`, committees ACSC / ACSL / CA / DI-MD).

PowerShell 5.1 has no `&&`; use `;`.

## 3. Forms built (all in `apps/backend/src/<module>` and `apps/frontend/src/app/pages/<module>`)

| Form | Module | Notes |
|---|---|---|
| Expenses Claim (General 105), Allowance After 10 PM (General 302) | `expenses-claim`, `allowance-after-10pm` | Original two forms; Prepared by, Verified by, Approved by |
| Charitable Contribution 1-ACCC-01 | `charitable-contribution` | Steps Verify(ACSC) → Ack1(ACSL) → Approve(DI/MD) → Approve 2 → Ack2(CA); THB rule: <= 20,000 one DI/MD, above needs an MD or two DIs; a DI cannot approve own request, an MD may |
| Gift/Hospitality Receiving 4-ACGH-01 | `gift-hospitality-receiving` | Min 3,000 THB; Verify ACSC, Ack ACSL, Approve TL/DI/MD, Ack2 CA; nobody approves own |
| Gift/Hospitality Offering 4-ACGH-02 | `gift-hospitality-offering` | Tiers above 5k / 10k / 30k; MD + DI above 30k; Ack2 CA |
| Purchase Requisition MTPC-02 | `purchase-requisition` | IS (title "IT Manager") → Verify (level MD/DI/AD/TL) → Approve (committee DI/MD) → Approve 2 if grand total > 50,000 → CA (committee) → Action (title contains "Purchase"). Two layouts (Standard / Envelope). PDF follows the Word original and appends attachments |
| Concept Design Review MTDD-01 | `design-review` | Shared "design review engine" (config in `design-review.config.ts`); 5-question checklist; sign-offs Review → Respond → TL → TL2 → DI; any active user selectable for now |

Other pieces: committees (Master Data), **Projects** (Master Data, with PMTS sync), user & access management, approvals
("Waiting for me": `GET /api/approvals/pending`), revision/comment history, attachments, reassign-approver (admin).

## 4. Shared access model and conventions (reuse for every form)

- `<prefix>.view` gates menu, route and GET endpoints; `<prefix>.create` gates create/edit/delete. `<prefix>.view-all`
  (super_admin, administrator, accounting_admins) lifts "only forms you take part in". Add permissions in a migration.
- Owner (creator or "Prepared by") or administrator edits/deletes Drafts; a **rejected** form can be edited and resubmitted.
- A step is acted on by the **named person on their turn** (no `.approve` permission). Reject needs a comment; a resubmit
  after reject is a new **Revision** (DB column `version`; the UI always says "Revision"). Events table stores each
  submit/decision with a form snapshot.
- Approver dropdowns come from **committee membership** (`/api/committees/dropdown/<name>`, label "initial, Name") or, where
  the owner said so, from Title/Level (`/api/committees/role-dropdown/...`). Re-check at submit; each named person must hold
  the form's `.view`.
- Voucher number: format is the owner's choice per form, assigned on first submit (`PREFIX-YYYYMMDD-XXXX`).
- To copy a form: `purchase-requisition` (newest, most complete) and `design-review` (config-driven) are the best templates.
  Backend files: entity, dto, rules, service, controller, module; wire in `app.module.ts`, `approvals.service.ts`
  (+ module), `lifecycle/signer-snapshot.subscriber.ts`. Frontend: service, steps, list, form, view, PDF, then
  `app.routes.ts`, `layout/app-shell.component.{ts,html}` menu, `shared/approvals/approvals.service.ts`.
- `DataSource.query` returns `[rows, count]` for `UPDATE/DELETE ... RETURNING`; use `projects/query-rows.ts` `rowsOf`.
- Heredocs with quotes broke in the Bash tool several times; write files with the editor tools instead.

## 5. Lifecycle policy (decided 2026-11-02)

1. Deactivate people, never delete them.
2. Old documents keep the form version they were filed under; new formats apply to new documents only.

Built: every form table has `form_version` (default 1) and `signers` (name + employee code frozen when each person
signs, filled by `SignerSnapshotSubscriber`). Views choose the PDF builder with `PDF_BUILDERS[r.formVersion]`. The
final PDF is **not** stored; it is rebuilt from stored data + version + signer snapshot, so **keep old PDF builders and
rules when you introduce version 2**. Admin "Reassign approver" exists on Charitable, both Gift forms, Purchase
Requisition and Design Review (not Expenses / Allowance).

## 6. Projects and PMTS

`projects` table (Master Data > Projects). `Sync from PMTS` runs in the background on the server
(`projects-sync.service.ts`, `pmts.client.ts`); guide: `PMTS_INTEGRATION_API_USAGE_GUIDE_TH.md`. Host
`https://pmts.meinhardt.net/api/integration/v1`; the key comes from `PMTS_API_KEY` or the client named `EDMS` in
`PMTS_PROJECT_API_CLIENTS` in `.env` (never log it or send it to the browser). About 7,800 projects; PMTS answers slowly,
so the first full copy may take minutes. Decisions: closed PMTS projects **stay selectable** here (their PMTS status is
shown for information only); PMTS projects cannot be renamed here; projects missing from PMTS are marked, not removed;
hand-typed projects with the same number are linked. **The sync has never been run against the real PMTS** (only against a
stub). Automatic scheduling is not set up.

## 7. Open items

- **Never clicked through in a real browser:** the newest UI (Purchase Requisition, Design Review, Projects page, general
  form re-layout, collapsible history). API flows were tested with scripts and mock users.
- MTDD-01: no PDF yet (no Word template in `Forms/`), no discussion threads (the legacy has a shared topic/reply system for
  all review forms, statuses Open / Pending / Resolved), the legacy "return to responder when actions not satisfactorily
  taken" rule is not built, sign-off people are not yet limited by committee or role.
- Remaining legacy MTDD group (add as configs of the design review engine): MTDD-02 Schematic (9-question checklist),
  MTDD-03 Submission (7 questions), Tender CSA/MEP review + verification, Construction Validation; Engineering Audit,
  Value Engineering and LEED are bigger and unread. Overview page and Legacy Design Review Records: postponed.
- Vladimir Script is the signature font the owner chose. It is a Microsoft font, so `apps/frontend/public/fonts/VladimirScript.ttf`
  is **git-ignored** (licence). Copy `C:\Windows\Fonts\VLADIMIR.TTF` to that path on each machine that builds PDFs; without it the
  PDF code falls back to the bundled Allura. Check the licence before distributing the font.
- Charitable: the rule "requester must be EE or above when > 20,000 THB" is parked. Voucher prefixes GHR / GHO were my
  assumption. Committee group `TL/DI/MD` (Gift Receiving) must exist in Master Data > Committee.
- README still says ports 4200 / 3000; the real ones used here are 4201 / 3001.

## 8. Gotchas

- Backend changes need `npx nest build` and a restart; the web dev server rebuilds by itself.
- Test data: mock users sit in the real committee groups; remove the `MOCK-*` employees when testing is over. Test scripts
  that grant permissions to the `employee` role must revert them.
- Commits and pushes happen only when the owner asks. Pushing to GitHub was blocked for the AI by its sandbox once; the
  owner ran it manually.
