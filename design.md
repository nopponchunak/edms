# ITMS UI format (design.md)

The standard look of the pages. Follow it for every new page or change so that the pages look alike.
The reference page is **Tickets** (`frontend/src/app/pages/tickets/ticket-list`); **Users** is the reference for a full-width list.
For the overall visual direction see `PRODUCT.md`. Colours are always the `--mh-*` tokens (they follow the light / dark theme); never hard-code a colour for a surface, text or border.

> **Using this look in another project:** read sections 11 to 14 (tokens, typography, app shell, shared building blocks) and the checklist in section 15. Sections 1 to 10 are the page rules and are written so they apply unchanged.

## 1. Page

- A list page uses the **whole width** of the content area (no `max-width`), like Users. Only forms and single-record pages (a request, a ticket) stay narrow (about 1040px) so they are easy to read.
- Order from the top: title and sub-title, action buttons, filter row, table, pagination bar.
- Base font 13px (Inter). Page title 24px bold (`.page-title`, `.page-subtitle` 13px muted, `.page-header` is a flex row with the buttons on the right).

## 2. Filter row

- **Search box**: `.search-wrap` is 40px high, `flex: 1`, `min-width: 260px`. Magnifier icon 14px at the left, input padding `0 34px 0 36px`, border `--mh-border-strong`, radius 8px, 13px text. Focus: border `--mh-primary` and a `0 0 0 3px rgba(99,102,241,.15)` ring.
- **Filters** (select, date range) next to it are also 40px high, radius 8px, same border and focus ring.
- A search box must work as the user types (autocomplete where the list is long) and say in its placeholder what it searches, e.g. `Search by Title, Ticket #, Created By…`.
- The search box inside a dialog looks the same.
- A search box must not let the browser fill in a name (`autocomplete="off"`).
- **Autocomplete on server-paged lists**: when the table is paged by the server, autocomplete suggestions **must query the API** (not filter the current page). Use a `Subject<string>` piped through `debounceTime(250)`, `distinctUntilChanged()` and `switchMap` to fetch up to 8 results. Filtering the loaded page misses records on other pages. Clearing the field (× button or empty input) resets to the default list (page 1, no query).
- **Search + autocomplete together**: the search box has both a suggestion dropdown (fires as the user types) and a Search button / Enter key (fires a full search and resets to page 1). Selecting a suggestion runs a full search for that item.

## 3. Table

Use the shared classes of `styles.scss`: `.table-wrap` > `table.data-table` (`.ticket-table` is the same).

| Part | Format |
|---|---|
| Frame (`.table-wrap`) | surface background, 1px `--mh-border`, radius 12px, shadow `0 1px 3px rgba(0,0,0,.06)`, `overflow-x: auto` |
| Header cell | 11px, bold (700), UPPERCASE, letter-spacing .05em, colour `--mh-muted`, background `--mh-bg-soft`, padding `12px 14px` |
| Body cell | 13px, colour `--mh-ink-soft`, padding `12px 14px`, 1px bottom border; no border on the last row |
| Row hover | background `--mh-bg-soft` (clickable rows also `cursor: pointer`) |
| Main value of a row | bold, `--mh-ink` (title) or `--mh-primary` (a link to the record) |
| Numbers | right-aligned, header too |
| Empty list | one row, centred, muted text that says why (`No containers match your search or filters`) |
| Long lists | the header stays visible (`position: sticky`) when the table scrolls |

The global `.table-wrap` / `.data-table` in `styles.scss` is a close but not identical default (radius 16px, header 11.5px / 600 on `--mh-surface-muted`, padding `10px 16px`, row hover tinted `--mh-primary-soft`). A page that must match the Tickets look overrides these in its own SCSS, as `ticket-list` does; see section 16.

**Sorting: every column can be sorted.** Use `th.sortable` with `.th-content` > label + `.sort-icon`: `↕` when idle, `↑` / `↓` when active (icon in `--mh-primary`, bold). The whole header cell is clickable, has `title="Sort by …"` and `aria-sort`. First click: text columns A–Z, number columns largest first; a second click reverses. Rows without a value always go last. Sorting resets to page 1. In code use the shared helpers: `TableSort` (`shared/utils/table-sort.ts`) holds the column and direction (and sorts client-side with `apply(rows)`), and `<th mhSort="key" [sort]="sort" numeric>` (`shared/components/sort-header`) draws the header; add `numeric` for numbers and dates. A table paged by the server cannot sort one page only: send `sortBy` / `sortDir` to the API (whitelist the columns there) and reload from page 1 in the `TableSort` change callback.

## 4. Pagination bar

`.pagination-bar` under the table (margin-top 16px):

- Left: `Showing **1–10** of **50** <things>` (`.pag-info`) and `Rows per page:` with `.select-page-size` (10 / 25 / 50 / 100; 32px high, radius 6px).
- Right (only when there is more than one page): `«` `‹` up to five page numbers `›` `»` as `.pag-btn` (32px, radius 6px). The current page is filled with `--mh-primary`; disabled buttons are 35% opaque.
- Page size and page number are signals (`page`, `pageSize`, `totalPages`). `pageStart` and `pageEnd` are computed to avoid template arithmetic. `pageNumbers()` returns at most 5 page numbers centred on the current page.
- Any search, filter or sort change resets `page` to 1 before reloading.
- The API must accept `page` and `limit` query params and return `meta: { page, limit, total, pages }` in its response.

## 5. Dialog (modal)

- Backdrop `position: fixed; inset: 0; padding: 16px`, content centred. The shared `.modal-backdrop` is black at 50% with a blur and fades in.
- The dialog is `width: 100%` with a `max-width`: **600px** (`modal-md`, simple forms) or **780px** (`modal-lg`, two-column forms and lists of people). Never fixed-width; at most `max-height: 90vh`, body scrolls (`overflow-y: auto`), header and footer stay. (The bare shared `.modal` is 500px wide and slides up; set the width with `modal-md` / `modal-lg`.)
- Header padding `18px 24px` with a small coloured eyebrow label (`.modal-kicker`), a 20px bold title (`.modal-title`) and a one-line description, and a ✕ button (`.btn-close`). Body padding 24px. Footer (`.modal-footer`): Cancel on the left of the primary action, both right-aligned.
- Two-column forms collapse to one column under 600px.
- A list of choices inside a dialog (employees…) is as tall as the screen allows: `min-height: 240px; max-height: clamp(240px, 45vh, 440px)`.
- A create / edit dialog **never closes on a click outside**. It closes only with ✕, Cancel or a successful save, and asks first when there are unsaved changes (`UnsavedChangesTracker`, `shared/utils/unsaved-changes.ts`).
- A group of related fields inside a dialog is drawn as a framed `fieldset.frame`: 1px `--mh-border-strong`, radius 10px, padding `14px 16px 16px`, a 13px bold title (`.frame-title`). A note under a table inside a frame (`.frame-note`, 12.5px muted) is one blank line below the table (`margin-top: 1lh`).

## 6. Forms and buttons

- Buttons: `.btn-primary` (main action, one per view), `.btn-secondary`, `.btn-danger`, `.btn-ghost`; 40px high, radius 12px, 14px semibold. A delete button is a trash icon.
- Inputs: 40px high (36px for compact), radius 8–12px, border `--mh-border`, focus ring in the primary colour. Required fields are marked with a red `*` (`.req`). A field is `.field` = label (13px semibold `--mh-ink-soft`) above the control, gap 6px; help text is `.hint` (12px muted).
- A button that cannot work yet stays **disabled** (e.g. Submit before the conditions are accepted) and a hint says why.
- Errors appear next to the field in red text, never by colour alone. A message for the whole form is `.alert-error` (or `.modal-error` inside a dialog).
- A drop-down with many choices is `app-search-select` (type to narrow, sorted A–Z); a person is picked with `app-user-picker`.

## 7. Status badges

Rounded pill (`.badge`, 12px semibold), tinted background with the same-hue text: green = done / healthy, blue = in progress / info, amber = waiting / warning, red = rejected / unhealthy / critical, grey = neutral. The text always says the state.

Variants in `styles.scss`: `.badge-primary`, `.badge-success`, `.badge-warning`, `.badge-danger`, `.badge-neutral`. Tinted fill is the colour at 12% opacity, text is the lighter shade of the same hue.

## 8. Accessibility

- Visible keyboard focus on every control; tabs use `role="tablist"` / `role="tab"` / `aria-selected`; tables have `aria-sort`; icon-only buttons have `aria-label`.
- Respect reduced motion (already handled globally: animations and transitions drop to 0.01ms).
- A state is never shown by colour alone: the badge or message says it in words.

## 9. Page-level tabs

A segmented tab bar under the page header: a rounded track (`--mh-surface-muted`, 1px border, radius 12px, padding 4px) holding buttons (8px 20px, 600 weight, radius 9px, muted text). The active tab is shown by a **sliding colour block**: one blue-violet gradient block (radius 9px, soft shadow) behind the buttons that glides to the active tab in about 0.3s (`transform` + `width`; no animation on the first paint); the active label turns white. A small count pill may follow the label (`Docker 50`; it turns translucent white on the active tab).

Implementation: put the `appSlidingTabs` directive (`pages/assets/grafana-monitoring-lab/shared/sliding-tabs.directive.ts`) on the tab bar. It keeps `--ind-x` / `--ind-w` equal to the active tab's offset and width; the bar is `position: relative` and draws the block with `::after` (see `.page-tabs` in the Grafana page). Buttons use `role="tab"`, `aria-selected` and `.active`.

The content of each tab is its own section; the state of a list (search, sort, filters) is kept when the user opens a record and comes back.

## 10. Keep in step

When you change a shared look here, change this file in the same commit, and keep `docs/user-guide` screenshots in step (see `CLAUDE.md`).

---

# Design system reference (for reuse)

Sections 11 to 16 describe the parts the pages are built from. Everything is read from the code, so when a value here and the code disagree, the code in the file named beside it wins; fix this file in the same commit.

| Layer | What it is | Where it lives |
|---|---|---|
| Tokens | colours, shadows, radii, motion | `frontend/src/styles/variables.scss` (CSS variables), `frontend/tailwind.config.js` (the same names for Tailwind) |
| Base | reset, font, scrollbar, reduced motion | `frontend/src/styles.scss` |
| Shared classes | buttons, inputs, cards, badges, table, pagination, modal, field, alert | `@layer components` in `frontend/src/styles.scss` |
| Shell | top bar, sidebar, content area | `frontend/src/app/layout/*` |
| Shared components | sort header, search select, user picker, PDF preview | `frontend/src/app/shared/*` |
| Rules | how a page is put together | sections 1 to 9 of this file, and `PRODUCT.md` for the direction |

## 11. Tokens

The look is **dark first** (the default); `[data-theme="light"]` on `<html>` switches to light. The top bar toggles it (it sets or removes the attribute). Components use only the variables, so both themes work with no extra code.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--mh-bg` | `#0a1628` | `#f0f2f5` | page background |
| `--mh-bg-soft` | `#0f1d32` | `#e8eaed` | table header, row hover |
| `--mh-surface` | `#111d2e` | `#ffffff` | cards, dialogs, sidebar, top bar |
| `--mh-surface-muted` | `#162236` | `#f9fafb` | inputs, track of tabs, quiet blocks |
| `--mh-surface-raised` | `#1a2740` | `#ffffff` | raised panels |
| `--mh-border` | `#1e3048` | `#e5e7eb` | hairlines |
| `--mh-border-strong` | `#264060` | `#d1d5db` | search box, frames |
| `--mh-ink` | `#e8ecf2` | `#111827` | main text |
| `--mh-ink-soft` | `#c4ccda` | `#374151` | body text in tables, labels |
| `--mh-muted` | `#7a8ba0` | `#6b7280` | secondary text, table headers |
| `--mh-muted-2` | `#506278` | `#9ca3af` | placeholders, section labels |
| `--mh-primary` | `#6366f1` | same | links, active state, focus |
| `--mh-primary-dark` | `#4f46e5` | same | primary button fill |
| `--mh-primary-soft` | 12% primary | 10% primary | selected row, active nav item, hover |
| `--mh-red` / `--mh-success` / `--mh-warning` / `--mh-purple` / `--mh-cyan` | `#ef4444` `#10b981` `#f59e0b` `#8b5cf6` `#06b6d4` | same | states and category accents |
| `--glow-indigo` `-rose` `-emerald` `-amber` | 3px ring at 20–25% | 15% | focus rings |

Other shared values (`tailwind.config.js`):

- **Shadows**: `shadow-card` (`0 1px 3px`), `shadow-card-md`, `shadow-card-lg`, `shadow-modal` (`0 24px 60px`), `shadow-primary` (primary button glow). Keep them small; no decorative shadows.
- **Radius**: 6px pagination controls, 8px search box and filters, 10px frames and nav items, 12px buttons and table frame, 16px `.card` and dialogs.
- **Motion**: `fade-in` 180ms, `slide-up` 200ms (dialogs), `slide-down` 200ms; hover transitions 120–180ms; sidebar width 200–250ms.
- **Z-index**: sidebar 90, shared `.modal-backdrop` 50, a top bar drop-down panel 200. Check the stacking when a dialog opens from inside the shell.

Rules for colour: never a literal hex for a surface, text or border (state tints such as `rgba(16,185,129,.12)` are the one exception and are written the same way everywhere). Category colours go on icons, badges and selected states, not on large surfaces.

## 12. Typography

- Font: **Inter** (weights 300 to 800, loaded from Google Fonts in `styles.scss`), then `Segoe UI`, `Arial`, `sans-serif`. No display fonts. Numbers and codes (ticket numbers, asset tags) use `font-family: monospace` / `font-mono`.
- Base size **13px**, line-height 1.5, antialiased. Thai text uses the same font stack; keep line-height at 1.45 or more so Thai marks are not clipped.

| Role | Size / weight |
|---|---|
| Page title | 24px, 700, tracking tight |
| Section title | 16px, 700 |
| Dialog title | 20px, 700 |
| Card title, frame title | 13–14px, 700 |
| Body, table cell | 13px, 400–500 |
| Field label | 13px, 600, `--mh-ink-soft` |
| Hint, note | 12–12.5px, `--mh-muted` |
| Table header | 11px, 700, UPPERCASE, +0.05em |
| Badge | 11.5–12px, 600 |
| Sidebar section label | 10px, 700, UPPERCASE, +0.1em, `--mh-muted-2` |

Letter-spacing is 0 for normal text; only short uppercase labels are spaced.

## 13. App shell

- **Top bar**: fixed, 56px high, `--mh-surface` with a bottom border. Left: sidebar toggle (36px), logo (25px high), a divider, company name (13px bold) and a small uppercase sub-title. Centre: global search (`app-global-search`, 36px high, max 440px; hidden under 860px). Right: theme toggle, notification bell (`app-notification-bell`), Help & Information (opens the user guide), Applications, profile (`app-profile-modal`). Icon buttons 36px, radius 8px, border `--mh-border`, hover `--mh-surface-muted`.
- **Sidebar**: fixed under the top bar, 260px wide, collapses to 64px (icon only, a tooltip carries the label) and becomes a drawer under 768px. Items 40px high, radius 10px, 13px; muted text, hover `--mh-surface-muted`, **active** = `--mh-primary-soft` fill, `--mh-primary` text and icon, weight 600. A count pill sits at the right. Items are grouped under small uppercase section labels; a group with children can open and close.
- **Menu definition**: one list, `frontend/src/app/core/navigation/nav-items.ts` (label, path, icon, section, `permission`, `roles`). The sidebar and the global search both read it, and the user guide test checks every label is described. Icons are 18px inline SVG (24px grid, stroke 2, round caps) drawn from a path name; `lucide-angular` is installed but not used.
- **Content area**: `margin-top: 56px; margin-left: 260px` (64px collapsed, 0 on mobile), padding `20px 32px 24px` (`16px 20px` under 1024px, `12px` under 768px), background `--mh-bg`.
- **Responsive**: 1024px reduces padding, 768px turns the sidebar into a drawer. Filters wrap; two-column forms collapse under 600px.

## 14. Shared building blocks

| Block | Use | Where |
|---|---|---|
| `.btn-primary` `.btn-secondary` `.btn-danger` `.btn-ghost` | buttons (section 6) | `styles.scss` |
| `.input` `.input-sm` `.select` `.field` | form controls (global `.input` is 44px high; pages use 40px, see section 16) | `styles.scss` |
| `.card` `.card-md` `.glass-card` | surfaces | `styles.scss` |
| `.badge-*` | status pills (section 7) | `styles.scss` |
| `.page-header` `.page-title` `.page-subtitle` | page top | `styles.scss` |
| `.table-wrap` `.data-table` `th.sortable` `.pagination-bar` `.pag-btn` `.select-page-size` | list pages (sections 3, 4) | `styles.scss` |
| `.modal-backdrop` `.modal` `.modal-header` `.modal-title` `.modal-body` `.modal-footer` `.modal-error` | dialogs (section 5) | `styles.scss` |
| `.alert-error` | form or page error | `styles.scss` |
| `TableSort`, `th[mhSort]` | sorting (section 3) | `shared/utils/table-sort.ts`, `shared/components/sort-header` |
| `UnsavedChangesTracker` | protect create / edit dialogs | `shared/utils/unsaved-changes.ts` |
| `app-search-select` | type-to-narrow drop-down, works with `ngModel` | `shared/components/search-select` |
| `app-user-picker` | autocomplete of people, free text allowed (external e-mail) | `shared/components/user-picker` |
| `PdfPreviewService` + `<app-pdf-preview-host/>` | open a PDF in a preview dialog with Download | `shared/components/pdf-preview` |
| `appSlidingTabs` | the sliding tab bar (section 9) | `pages/assets/grafana-monitoring-lab/shared/` |
| Stat card | a number with an icon tile (48px tile, radius 12px, card radius 14px, 16px gap, hover lifts 2px) in an auto-fit grid (`minmax(220px, 1fr)`, gap 16px) | `pages/admin/roles`, `pages/assets/grafana-monitoring` |
| Framed group | `fieldset.frame` inside a dialog (section 5) | `pages/onboarding/offboarding` |

## 15. Reusing this look in another project

Copy, in this order, and keep the names so this file still applies:

1. `frontend/src/styles/variables.scss` (tokens) and the `theme.extend` part of `frontend/tailwind.config.js` (the colour, shadow, radius and animation names).
2. `frontend/src/styles.scss` (reset, font, scrollbar, reduced motion, `@layer components`). Needs Tailwind with `@tailwind base/components/utilities`.
3. `frontend/src/app/layout/*` (shell, top bar, sidebar) and `core/navigation/nav-items.ts`, then replace the menu entries, logo (`public/meinhardt-logo.png`) and company text.
4. `frontend/src/app/shared/*` (sort header, `TableSort`, search select, user picker, unsaved-changes, PDF preview).
5. This file and `PRODUCT.md` (the direction and the anti-references), so Claude or a new developer builds the next page the same way. Put a line in the new project's `CLAUDE.md`: "UI format: follow `design.md`".

Then, for a new brand, change only `--mh-primary`, `--mh-primary-dark`, `--mh-primary-soft` and the logo; nothing else needs to move. If the new project is not Angular, keep sections 1 to 9 and 11 to 13 (they are plain CSS and rules) and rebuild the components in section 14 in that framework.

## 16. Known differences (fix when you touch the page)

These are places where the code does not yet match the rules above. Do not copy them into new work.

- **Table look**: the global `.table-wrap` / `.data-table` differs from section 3 (see the note there). Only `ticket-list` carries the reference values. The long-term fix is to move the section 3 values into `styles.scss` so every page gets them.
- **Input height**: global `.input` is `h-11` (44px) and `.input-sm` 36px; the rules say 40px.
- **Dialog width**: `modal-md` / `modal-lg` are declared per page (`it-budget.shared.scss`, `rmm-devices`), not in `styles.scss`; the global `.modal` is 500px.
- **Local component families**: Personal Devices uses its own `pd-*` classes (`pd-btn`, `pd-card`, `pd-table`, `pd-alert`, `personal-devices.shared.scss`) and IT Budget its own `bud-*`; they copy the same look but are not shared. Prefer the global classes in new pages.
- **Status badge**: besides the pill `.badge`, three pages define a local `.status-badge` with radius 6px (`asset-history`, `onboarding-create`, `organizations`).
- **Card radius**: stat cards use 14px, `.pd-card` 12px, `.card` 16px.
- **Search box**: `.search-wrap` is repeated in several page SCSS files (`tickets`, `agent`, `organizations`, `knowledge`) instead of being a shared class.
- **`PRODUCT.md` colours**: the palette in `PRODUCT.md` (light, navy `#1f6feb`, 64px top bar, 260px sidebar, max content width 1240px) describes the earlier portal reference. The running app is dark first with indigo `#6366f1`, a 56px top bar and a full-width content area. Where the two differ, this file and `variables.scss` win; the `PRODUCT.md` principles (scanability, restrained colour, explicit states, no marketing look) still apply.
