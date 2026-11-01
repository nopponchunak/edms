# Legacy migration map

The legacy application contains roughly 75 controllers, 82 models, 219 migrations and 190 Angular
components. Migration is split into bounded domains so that each vertical slice can be tested against
the current production behaviour.

## Phase 0 — platform foundation (current)

- Angular application shell, dashboard, module catalog and design tokens.
- NestJS health, dashboard and module catalog endpoints.
- PostgreSQL development service and environment contract.
- Server-side validation, CORS allowlist and `/api` prefix.

## Phase 1 — identity and administration

- Employee LDAP login and local emergency-admin login.
- Users, employees, roles, permissions, menu permissions and audit logs.
- Replace legacy MD5 passwords with Argon2 and hard-coded JWT signing with environment-backed secrets.
- Import users only after role and permission mappings are approved.

## Phase 2 — compliance requests

> Form migration authorization gate: do not begin cloning any form until its name, scope and expected
> parity checks have been presented to and explicitly selected by the project owner. Migrate one
> owner-selected form at a time.

- Charitable Contribution.
- Gift/Hospitality Receiving.
- Gift/Hospitality Offering.
- Shared approval timeline, attachments, comments and status history.

## Phase 3 — procurement and claims

- Purchase Requisition and Purchase Order.
- Expenses Claim and Allowance After 10 PM.
- Supplier and Sub-consultant assessments/evaluations.
- Number generation, combined PDF and print rendering.

## Phase 4 — proposals and quality

- Proposal & Contract Review and Project Quality Assurance Plan.
- Fee sheets and revisions.
- Design review, construction validation, engineering audit, LEED, schematic, submission and tender
  review families.
- Legacy Design Review integration and migration tools.

## Compatibility checklist per module

1. Record fields and PostgreSQL types.
2. State machine and transition permissions.
3. Number-generation rules and uniqueness.
4. Approval routing and delegation.
5. Attachment ownership, retention and antivirus boundary.
6. Notifications and audit events.
7. List filters, sorting, pagination and exports.
8. Print/PDF output.
9. Legacy data migration and reconciliation totals.
10. Production parity sign-off before switching traffic.
