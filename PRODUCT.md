# Product

## Anti-references

- Avoid marketing-page composition, decorative dashboards, oversized hero layouts, playful controls, and color-heavy surfaces that distract from review and administration tasks.
- Avoid dark dashboards, glassmorphism, large gradients, over-rounded cards, and decorative shadows.
- Avoid single-page card menus that feel detached from the full portal shell. The application home should feel like a command center with navigation, search, status, and quick access.

## Design Principles

- Prioritize scanability for dense user, HRIS, module, and application records.
- Make account source, permission scope, module category, and risk states explicit before actions are taken.
- Use familiar admin patterns for side navigation, top search, filters, cards, tables, status badges, and forms.
- Keep destructive or permission-changing actions deliberate and easy to verify.
- Preserve the existing Meinhardt portal visual language unless usability requires a local refinement.
- Use restrained color on large surfaces, then reserve stronger category colors for icons, badges, selected states, and state indicators.

## Accessibility & Inclusion

Target clear keyboard focus, readable contrast, semantic forms, and reduced-motion-safe transitions. Admin actions should not rely on color alone; labels and text states must carry the same information.

## Frontend Visual Style Reference

Use the attached Meinhardt application portal reference as the target direction for the Angular frontend. The design is a light enterprise portal with a fixed top bar, left navigation, command search, quick metrics, module cards, and compact category navigation.

### Overall Layout

- App shell:
  - Sticky top bar height: `64px`.
  - Left sidebar width: `260px` desktop, collapsible to icon-only or drawer on tablet and mobile.
  - Main content max width: about `1240px` to `1320px`, aligned with generous page gutters.
  - Desktop content padding: `32px 40px 48px`.
  - Tablet content padding: `24px`.
  - Mobile content padding: `16px`.
- Page rhythm:
  - Greeting line above title.
  - Page title, short helper sentence, then filter row.
  - Quick Access metrics row.
  - All Modules card grid.
  - Popular Categories strip near the bottom.
- Avoid a marketing hero. The first viewport must be the working application home.

### Color System

Use a cool near-white base with Meinhardt navy as the primary identity color and category colors as controlled accents.

```scss
:root {
  --mh-bg: #f7f9fc;
  --mh-bg-soft: #f1f5fb;
  --mh-surface: #ffffff;
  --mh-surface-muted: #f8fbff;
  --mh-border: #d9e3ef;
  --mh-border-strong: #c5d3e4;

  --mh-ink: #08244a;
  --mh-ink-soft: #263d5f;
  --mh-muted: #61718a;
  --mh-muted-2: #8290a6;

  --mh-primary: #1f6feb;
  --mh-primary-dark: #0b3b75;
  --mh-primary-soft: #e8f1ff;
  --mh-red: #e63535;

  --mh-success: #35b86b;
  --mh-warning: #f59e22;
  --mh-purple: #9b51d0;
  --mh-cyan: #27a9c7;
}
```

Category accent mapping:

- Administration: blue, `#2f78e8`.
- Construction: sky, `#45b6d8`.
- Safety: red, `#e95055`.
- Compliance: green, `#35b86b`.
- HR & People: violet, `#9b63d9`.
- Finance: purple, `#8f5bd7`.
- Planning: coral, `#f06a3b`.
- Tools: amber, `#f4a62a`.
- Quality or PMCM: muted slate-blue badges, `#dbe5f1` background with `#274363` text.

### Typography

- Font family: `Inter`, `"Segoe UI"`, `Arial`, `sans-serif`.
- Do not use display fonts. This is a work portal.
- Page title: `28px`, `700`, line-height `1.2`, color `--mh-ink`.
- Section title: `16px`, `700`, line-height `1.35`.
- Card title: `14px`, `700`.
- Body and descriptions: `13px`, line-height `1.45`.
- Labels, badges, nav counters: `11px` to `12px`, `600` to `700`.
- Letter spacing: `0` for normal text. Use slight uppercase spacing only for short badges, around `0.04em` to `0.08em`.

### Top Bar

- White surface, `1px` bottom border, subtle shadow.
- Left side: Meinhardt logo plus product context, for example `MEINHARDT THAILAND` and `PMP`.
- Center: global search input, width about `420px` to `520px`, height `36px`.
- Right side: icon buttons for notifications, help, app launcher, avatar, account dropdown.
- Icon buttons:
  - Size `36px`.
  - Transparent default.
  - Hover background `--mh-primary-soft`.
  - Focus ring `0 0 0 3px rgba(31, 111, 235, 0.18)`.
- Notification badge: small red dot/counter placed at the top-right of the bell icon.

### Sidebar

- Background: white or very light blue-tinted surface.
- Width: `260px`.
- Border-right: `1px solid --mh-border`.
- Active item:
  - Background `--mh-primary-soft`.
  - Text `--mh-primary-dark`.
  - Icon tile blue with soft fill.
  - Counter pill aligned right.
- Navigation item height: `36px` to `44px`.
- Sidebar sections:
  - Home shortcut.
  - Categories with counters.
  - Favorites with a `Manage` link.
  - Help/request access panel.
  - Collapse button at bottom.
- Icons should use one consistent icon set, preferably `lucide-angular` if added to the Angular app.

### Controls

- Inputs and selects:
  - Height `40px`.
  - Border `1px solid --mh-border-strong`.
  - Radius `6px`.
  - Background white.
  - Placeholder color must remain readable, around `#5f708a`.
- Filter row:
  - Search input flexes to fill available width.
  - Category, status, and sort controls stay compact.
  - View toggle buttons sit on the right.
- Buttons:
  - Primary: blue fill, white text.
  - Secondary: white fill, blue/navy text, border.
  - Icon buttons use symbols, not text-only pills, when the action is familiar.

### Cards

- Card radius: `8px`.
- Border: `1px solid --mh-border`.
- Shadow: subtle only, around `0 8px 20px rgba(8, 36, 74, 0.08)`.
- Do not pair heavy shadows with strong borders.
- Quick Access cards:
  - Four-column desktop grid.
  - Icon tile on the left, metric and helper copy on the right.
  - Height about `76px` to `88px`.
  - Use colored icon tiles, not colored full cards.
- Module cards:
  - Five-column desktop grid where space allows.
  - Minimum card width around `180px` to `210px`.
  - Height around `140px` to `156px`.
  - Icon tile top-left, favorite star top-right where relevant.
  - Module title, category badge, one-line description, then footer usage status and chevron.
  - Keep module cards visually calm; accent color lives in the icon tile and badge only.
- Popular category cards:
  - Horizontal strip or responsive row.
  - Compact cards with icon, category name, and module count.

### Responsive Behavior

- Desktop:
  - Sidebar visible.
  - Module grid uses 4 to 5 columns.
  - Quick stats use 4 columns.
- Tablet:
  - Sidebar collapses or becomes overlay.
  - Module grid uses 2 to 3 columns.
  - Quick stats use 2 columns.
- Mobile:
  - Top search becomes full-width below the top bar or opens as search mode.
  - Sidebar becomes drawer.
  - Filters stack vertically.
  - Module cards use 1 column.
  - Popular categories become horizontal scroll cards or a 1-column list.

### Interaction & Motion

- Hover transitions: `150ms` to `180ms`.
- Use small translate on card hover only if it does not cause layout shift: `translateY(-2px)`.
- Use focus-visible rings on all controls.
- Respect reduced motion:

### Framework
- Frontend : Angular
- Backend : NestJS
- DB : postgresSQL

### Implementation Notes For Current Angular Frontend

- The existing `portal/src/app/pages/menu` screen should evolve from a simple app-card menu into the referenced application home.
- Replace the current top-border card accent style with icon-tile accents and neutral card borders.
- Add left sidebar categories and favorites instead of relying only on a category select.
- Keep the current Meinhardt logo and authenticated profile pattern, but refine spacing and topbar actions to match the reference.
- Add quick access metrics before the module grid. Initial metrics can be derived from catalog count, recently used placeholder state, favorites placeholder state, and pending approvals placeholder state until real APIs exist.
- Keep all text compact and operational. Avoid promotional copy.
