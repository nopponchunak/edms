# Legacy role mapping

The legacy EDMS stores roles in the `permissions` table and menu actions in
`menu_permissions`. This mapping was read from the legacy API on 2026-10-31.

## Rules

- `view`, `view_own`, or `view_all` maps to `<module>.view`.
- `create` or `save` maps to `<module>.create`.
- Legacy edit/delete flags do not map to approval authority.
- `<module>.approve` remains unassigned until that form workflow is cloned and verified.
- `SYSTEM ADMIN` maps to the existing `super_admin` role.
- `EMPLOYEE` maps to the existing `employee` role.
- The duplicate `Purchasing` records (legacy IDs 18 and 11) are merged by permission union.
- `PENDING` is excluded. It is an account state, and its legacy permission matrix is unexpectedly broad.
- No users are assigned or reassigned by the migration.

## Normalized names

| Legacy name | New role code | New display name |
| --- | --- | --- |
| Excutive | `executive` | Executive |
| Secreary Admins | `secretary_admins` | Secretary Admins |
| Enigneers | `engineers` | Engineers |
| Satff | `staff` | Staff |
| Purchasing (IDs 18 and 11) | `purchasing` | Purchasing |
| SYSTEM ADMIN | `super_admin` | Super Administrator |
| EMPLOYEE | `employee` | Employee |
| PENDING | Excluded | Account status only |

All other legacy display names are retained with normalized lowercase role codes.
