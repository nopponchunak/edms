# ui.md — หน้าตาของ ITMS (สรุปให้นำไปทำโปรเจกต์อื่นให้เหมือนกัน)

เอกสารนี้สรุป font, ขนาดตัวอักษร, สี, icon, โหมด Light/Dark และ hamburger menu ตามที่ใช้จริงในโค้ด
(ที่มา: `frontend/src/styles/variables.scss`, `styles.scss`, `tailwind.config.js`, `layout/topbar|sidebar|shell`)
รายละเอียดเรื่องตาราง/ฟอร์ม/dialog ดู `design.md`

Stack: Angular + Tailwind 3 + SCSS · ธีม **dark เป็นค่าเริ่มต้น** · สีทุกตัวอ่านผ่าน CSS variable `--mh-*`

---

## 1. Font

| รายการ | ค่า |
|---|---|
| Font หลัก | **Inter** (Google Fonts, weight 300 400 500 600 700 800) |
| Fallback | `'Segoe UI', Arial, sans-serif` (Tailwind: `Inter, system-ui, -apple-system, sans-serif`) |
| Font mono | ไม่ได้กำหนด (ใช้ของเบราว์เซอร์) |
| ภาษาไทย | ไม่ได้ระบุ font ไทยแยก ใช้ fallback ของระบบ (Segoe UI / Tahoma) |
| การเรนเดอร์ | `-webkit-font-smoothing: antialiased` |

```scss
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

html, body {
  font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
  font-size: 13px;
  line-height: 1.5;
  color: var(--mh-ink);
  background: var(--mh-bg);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

## 2. ขนาดตัวอักษร (ตัวเล็กเป็นหลัก — ฐาน 13px)

| ใช้กับ | ขนาด | น้ำหนัก | อื่นๆ |
|---|---|---|---|
| เนื้อหาทั่วไป | 13px | 400 | line-height 1.5 (19.5px) |
| ปุ่ม `.btn` / input `.input` | **11.4px** (`text-sm` = 0.875rem) | 600 / 400 | ดูหมายเหตุ rem ด้านล่าง |
| ชื่อหน้า `.page-title` | **24px** | 700 | `tracking-tight` |
| คำอธิบายใต้ชื่อหน้า | 13px | 400 | สี `--mh-muted` |
| หัวข้อ dialog | 14.6px (`text-lg` = 1.125rem) | 700 | |
| หัวตาราง `th` | 11–11.5px | 600–700 | ตัวพิมพ์ใหญ่ได้, tracking 0.05em |
| ชื่อกลุ่มเมนู sidebar | 10px | 700 | UPPERCASE, tracking 0.1em, สี `--mh-muted-2` |
| เมนู sidebar | 13px | 500 (active 600) | |
| เมนูย่อย sidebar | 12.5px | 500 (active 600) | |
| ชื่อบริษัทใน topbar | 13px | 700 | บรรทัดล่าง "ITMS" 10.5px / 600 / UPPERCASE |
| ชื่อผู้ใช้ใน topbar | 12.5px | 700 | บรรทัดล่าง 10.5px / 500 |
| ช่องค้นหา topbar | 12.5px | 400 | |
| ป้าย badge | **9.75px** (`text-xs` = 0.75rem) | 600 | pill เต็มมุม สูง 16.25px |

> **หมายเหตุสำคัญเรื่อง rem:** `html` ตั้ง `font-size: 13px` ดังนั้น 1rem = 13px (ไม่ใช่ 16px) ทุก utility ของ Tailwind ที่เป็น rem จึงเล็กลง ×0.8125 (เช่น `h-10` = 32.5px, `text-sm` = 11.4px, `rounded-xl` = 9.75px) ส่วนค่าที่เขียนเป็น px ตรงๆ (24px, 12.5px, 36px ฯลฯ) ไม่ถูกลดขนาด ถ้าโปรเจกต์ใหม่ใช้ root 16px จะได้หน้าตาใหญ่กว่านี้ ต้องตั้ง `html { font-size: 13px }` ให้เหมือนกัน (ค่าในตารางทั้งหมดวัดจากหน้าจริง)
| ตัวอักษรในอวาตาร์ | 12px | 700 | |

## 3. สี (Design tokens)

ประกาศใน `:root` (dark) และ override ใน `[data-theme="light"]`

| Token | Dark (ค่าเริ่มต้น) | Light | ใช้ทำอะไร |
|---|---|---|---|
| `--mh-bg` | `#0a1628` | `#f0f2f5` | พื้นหลังหน้า |
| `--mh-bg-soft` | `#0f1d32` | `#e8eaed` | พื้นหลังอ่อน, หัวตาราง, hover ปุ่ม secondary |
| `--mh-surface` | `#111d2e` | `#ffffff` | การ์ด, topbar, sidebar, ตาราง |
| `--mh-surface-muted` | `#162236` | `#f9fafb` | พื้น input, hover แถว/เมนู |
| `--mh-surface-raised` | `#1a2740` | `#ffffff` | ชั้นที่ลอยขึ้น (popover) |
| `--mh-border` | `#1e3048` | `#e5e7eb` | เส้นขอบทั่วไป |
| `--mh-border-strong` | `#264060` | `#d1d5db` | เส้นขอบเน้น |
| `--mh-ink` | `#e8ecf2` | `#111827` | ข้อความหลัก |
| `--mh-ink-soft` | `#c4ccda` | `#374151` | ข้อความรอง |
| `--mh-muted` | `#7a8ba0` | `#6b7280` | ข้อความจาง, icon ปุ่ม |
| `--mh-muted-2` | `#506278` | `#9ca3af` | placeholder, icon เมนูที่ไม่ active, ชื่อกลุ่ม |
| `--mh-primary` | `#6366f1` | `#6366f1` | สีหลัก (Indigo) |
| `--mh-primary-dark` | `#4f46e5` | `#4f46e5` | พื้นปุ่ม primary |
| `--mh-primary-soft` | `rgba(99,102,241,.12)` | `rgba(99,102,241,.10)` | พื้นเมนู active, badge primary |
| `--mh-red` | `#ef4444` | `#ef4444` | ผิดพลาด / ลบ |
| `--mh-success` | `#10b981` | `#10b981` | สำเร็จ |
| `--mh-warning` | `#f59e0b` | `#f59e0b` | เตือน |
| `--mh-purple` | `#8b5cf6` | `#8b5cf6` | เสริม |
| `--mh-cyan` | `#06b6d4` | `#06b6d4` | เสริม |

สี status/เน้นไม่เปลี่ยนตามโหมด มีแค่พื้นผิว ตัวอักษร เส้นขอบ และความโปร่งของ glow ที่เปลี่ยน

Glow ตอน focus: `--glow-indigo: 0 0 0 3px rgba(99,102,241,.25)` (light = .15), เช่นเดียวกับ rose `239,68,68` / emerald `16,185,129` / amber `245,158,11` (.2 ใน dark, .15 ใน light)

**Badge (สถานะ)** — พื้นโปร่ง 12% + ตัวอักษรสีอ่อน

| ชนิด | พื้น | ตัวอักษร |
|---|---|---|
| primary | `--mh-primary-soft` | `--mh-primary` |
| success | `rgba(16,185,129,.12)` | `#34d399` |
| warning | `rgba(245,158,11,.12)` | `#fbbf24` |
| danger | `rgba(239,68,68,.12)` | `#f87171` |
| neutral | `--mh-surface-muted` + ขอบ `--mh-border` | `--mh-muted` |

**Scrollbar** กว้าง 5px, ราง transparent, แท่ง `rgba(99,102,241,.2)` (hover .4) โค้งเต็ม

**Tailwind** map สีเป็น `mh.*` (เช่น `bg-mh-surface`, `text-mh-muted`, `border-mh-border`) ทุกตัวชี้ไปที่ CSS variable ข้างบน จึงสลับโหมดได้โดยไม่ต้องใช้ `dark:`

```js
// tailwind.config.js (ตัดมา)
theme: { extend: {
  colors: { mh: { bg:'var(--mh-bg)', surface:'var(--mh-surface)', 'surface-muted':'var(--mh-surface-muted)',
                  ink:'var(--mh-ink)', muted:'var(--mh-muted)', primary:'var(--mh-primary)',
                  border:'var(--mh-border)' /* …ครบทุก token */ } },
  fontFamily: { sans: ['Inter','system-ui','-apple-system','sans-serif'] },
  boxShadow: {
    card:   '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',
    'card-md': '0 4px 12px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.08)',
    modal:  '0 24px 60px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.15)',
    primary:'0 4px 14px rgba(79,70,229,0.35)',
  },
}}
```

## 4. รูปทรง ระยะ และ component หลัก

| ชิ้นส่วน | ค่า |
|---|---|
| ปุ่ม `.btn` | สูง **32.5px**, รัศมี 9.75px, padding-x 16.25px, ตัวอักษร 11.4px/600, gap 6.5px, focus ring 2px + offset 2px |
| ปุ่ม primary | (วัดจริง: สูง 32.5px) พื้น `--mh-primary-dark`, ตัวอักษรขาว, เงา `primary`, hover → `--mh-primary` |
| ปุ่ม secondary | พื้น `--mh-surface`, ขอบ `--mh-border`, ตัวอักษร `--mh-ink-soft`, hover พื้น `--mh-bg-soft` |
| ปุ่ม danger | `bg-red-600`, hover `red-700` |
| ปุ่ม ghost | โปร่ง, ตัวอักษร `--mh-muted`, hover พื้น `--mh-surface-muted` |
| Input `.input` | สูง **35.75px**, รัศมี 9.75px, ตัวอักษร 11.4px, พื้น `--mh-surface-muted`, ขอบ `--mh-border`, padding-x 13px; focus ขอบ `--mh-primary` + ring `--mh-primary-soft`; `.input-sm` สูง 29.25px, รัศมี 6.5px, ตัวอักษร 13px |
| การ์ด `.card` | รัศมี **13px**, พื้น `--mh-surface`, ขอบ 1px `--mh-border`, เงา `card` |
| ตาราง `.table-wrap` | รัศมี 13px (ใช้ `.card`), th 11.5px/600 tracking 0.04em พื้น `--mh-surface-muted` padding แนวตั้ง 10px, td 13px padding แนวตั้ง 12px |
| Badge | pill, padding `1.6px 8.1px`, สูง 16.25px |
| Animation | fade-in 180ms, slide-up/down 200ms (8px), transition ปุ่ม/เมนู 150ms |
| ลด motion | `prefers-reduced-motion: reduce` ตัด animation/transition เหลือ 0.01ms |
| เนื้อหาหลัก | padding `20px 32px 24px` (≤1024px: `16px 20px`, ≤768px: `12px`) |

## 5. Layout หลัก (shell)

```
┌──────────────────────────────────────────────────────────────┐
│ Topbar  fixed  สูง 45.5px  z 100  พื้น surface  ขอบล่าง border │
├──────────┬───────────────────────────────────────────────────┤
│ Sidebar  │ Main  margin-top 56px, margin-left 260px           │
│ fixed    │ พื้น --mh-bg                                       │
│ 260px    │                                                   │
│ (พับ 64) │                                                   │
└──────────┴───────────────────────────────────────────────────┘
```

- **Topbar** (ซ้าย → ขวา): ปุ่ม hamburger · โลโก้ (สูง 25px) · เส้นคั่น 1×22px · ชื่อบริษัท + "ITMS" · **ช่องค้นหาตรงกลาง** (สูง 36px, กว้างสูงสุด 440px, รัศมี 9px, ซ่อนเมื่อ <860px) · ปุ่มสลับธีม · กระดิ่ง · ช่วยเหลือ (ⓘ) · ตาราง apps · pill รหัสบริษัท (สูง 32px) · อวาตาร์ผู้ใช้ + ชื่อ/บทบาท (ซ่อนชื่อเมื่อ <640px) + chevron → dropdown กว้าง 230px รัศมี 12px
- **ข้อสังเกตจากการวัดจริง:** topbar ใช้ `h-14` = 3.5rem = **45.5px** (เพราะ root 13px) แต่ sidebar `top` และ main `margin-top` เป็น **56px** ตายตัว จึงมีช่องว่างราว 10.5px ใต้ topbar ถ้าอยากให้ชิดกันในโปรเจกต์ใหม่ ให้ตั้งความสูง topbar เป็น 56px (px) หรือใช้ตัวแปรเดียวกันทั้งสามจุด
- **Sidebar**: top 56px, กว้าง 260px, พื้น `--mh-surface`, ขอบขวา 1px `--mh-border`, z 90; padding `16px 12px`; เลื่อนแนวตั้งได้
- ปุ่ม icon ใน topbar: 36×36px, `border-radius: 8px`, ตัวอักษร/ไอคอน `--mh-muted` → hover พื้น `--mh-surface-muted` + `--mh-ink`

## 6. Icon

- **ไม่ใช้ font icon** — เป็น **inline SVG สไตล์ Feather/Lucide** (24×24 viewBox, `fill="none"`, `stroke="currentColor"`, `stroke-width="2"`, `stroke-linecap="round"`, `stroke-linejoin="round"`)
- ขนาด: topbar และเมนูหลัก **18px**, เมนูย่อย **15px**, chevron **14px**, ไอคอนในช่องค้นหา/pill 14px
- สีตาม `currentColor`: ปกติ `--mh-muted-2` (เมนู) / `--mh-muted` (ปุ่ม topbar), active → `--mh-primary`
- Sidebar เก็บ path ของไอคอนไว้ใน map `iconPath(name)` (`sidebar.component.ts`) แล้วเรนเดอร์ด้วย `<svg><path [attr.d]="iconPath(item.icon)"/></svg>` — ชื่อที่ใช้อยู่: overview, ticket, plus-circle, user-plus, user-x, key, file-text, headphones, building, message-square, book-open, database, graph, layers, tag, office, admin-user, settings, globe, shield, users, monitor, cpu, history, activity, calendar, upload, pencil, wallet, package
- ถ้าจะใช้ในโปรเจกต์ใหม่ ใช้ไลบรารี **Lucide** (`lucide-angular`) หน้าตาจะเหมือนกัน (ในโปรเจกต์นี้ติดตั้งไว้แต่ยังไม่ได้ใช้)

## 7. Light / Dark mode

- **Dark คือค่าเริ่มต้น** (`:root`). โหมดสว่างเปิดด้วยการใส่ `data-theme="light"` ที่ `<html>`
- ปุ่มสลับอยู่ใน topbar: dark → แสดงไอคอน **ดวงอาทิตย์** (กดเพื่อไป light); light → แสดงไอคอน **พระจันทร์** (กดเพื่อไป dark) พร้อม `aria-label`/`title` "Switch to Light/Dark Mode"
- จำค่าใน `localStorage` คีย์ `hd_theme` = `'dark'` | `'light'`; อ่านตอนสร้าง topbar
- ไม่ตามค่า `prefers-color-scheme` ของระบบ (ผู้ใช้เลือกเอง)

```ts
isDark = signal(true);

constructor() {
  if (localStorage.getItem('hd_theme') === 'light') {
    this.isDark.set(false);
    document.documentElement.setAttribute('data-theme', 'light');
  }
}

toggleTheme() {
  const next = !this.isDark();
  this.isDark.set(next);
  if (next) { document.documentElement.removeAttribute('data-theme'); localStorage.setItem('hd_theme', 'dark'); }
  else      { document.documentElement.setAttribute('data-theme', 'light'); localStorage.setItem('hd_theme', 'light'); }
}
```

## 8. Hamburger menu (ปุ่มพับ/ขยาย sidebar)

- ปุ่ม `#btn-toggle-sidebar` มุมซ้ายสุดของ topbar: **36×36px**, ขอบ 1px `--mh-border`, รัศมี 8px, โปร่ง, ไอคอนเส้น 3 เส้น (`y = 6, 12, 18`, `x 3→21`, `stroke-width 2.2`, ขนาด 18px)
- hover: พื้น `--mh-surface-muted`, ไอคอน `--mh-ink`
- กดแล้วสลับ **ขยาย (260px) ↔ พับเป็นแถบไอคอน (64px)** ด้วย `SidebarService.toggle()`; จำค่าใน `localStorage` คีย์ `hd_sidebar_collapsed` (`'true'`/`'false'`)
- ตอนพับ: ซ่อนชื่อกลุ่ม ป้ายเมนู และ badge เหลือไอคอนอย่างเดียว; ปุ่มเมนูเป็นสี่เหลี่ยมโค้ง 40×40px กึ่งกลาง, มี `title` เป็นชื่อเมนูให้ hover ดู; กดกลุ่มที่มีเมนูย่อยตอนพับ = ขยาย sidebar ออกมา
- Animation: sidebar `width 200ms cubic-bezier(.4,0,.2,1)`, main `margin-left 250ms ease`
- เมนู active: พื้น `--mh-primary-soft`, ตัวอักษร+ไอคอน `--mh-primary`, น้ำหนัก 600; hover: พื้น `--mh-surface-muted`, ตัวอักษร `--mh-ink-soft`; รายการสูง 40px (เมนูย่อย 34px) รัศมี 10px (เมนูย่อย 8px)
- กลุ่มที่มีเมนูย่อย: chevron หมุน 180° ตอนเปิด; เมนูย่อยเยื้อง 14px มีเส้นซ้าย 1.5px `--mh-border`

```html
<button id="btn-toggle-sidebar" class="sidebar-toggle-btn" (click)="sidebarSvc.toggle()" aria-label="Toggle sidebar">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
</button>
```

**ข้อจำกัดที่มีอยู่ตอนนี้ (ถ้าทำโปรเจกต์ใหม่ ควรแก้):**
- จอ ≤768px sidebar ถูกซ่อนทั้งหมด (`display: none`) และ main ใช้ `margin-left: 0` แต่ **ยังไม่มี drawer** — ปุ่ม hamburger กดแล้วไม่เห็นเมนูบนมือถือ โปรเจกต์ใหม่ควรทำให้ hamburger เปิด sidebar เป็น overlay บนจอเล็ก
- สี badge success/warning/danger ใช้ตัวอักษรอ่อน (`#34d399` ฯลฯ) ตายตัว อ่านง่ายใน dark แต่คอนทราสต์ต่ำบนพื้นขาวใน light

## 9. Modal / Dialog (วัดจากหน้า "Add User")

| ส่วน | ค่า |
|---|---|
| ฉากหลัง `.modal-backdrop` | `fixed inset-0`, ดำ 50% (`rgba(0,0,0,.5)`), `backdrop-blur-sm` (4px), จัดกลางจอ, padding 16.25px, **z-index 50**, animation fade-in 180ms |
| กล่อง `.modal` | กว้าง **500px** (`max-w-full`), พื้น `--mh-surface`, ขอบ 1px `--mh-border`, รัศมี 13px, เงา `modal` (`0 24px 60px rgba(0,0,0,.3), 0 4px 12px rgba(0,0,0,.15)`), animation slide-up 200ms |
| Header | padding `19.5px 19.5px 13px`, ชื่อซ้าย ปุ่มปิดขวา |
| ชื่อ `.modal-title` | 14.6px / 700 / `--mh-ink` |
| ปุ่มปิด | **26×26px**, รัศมี 6.5px, โปร่ง, ตัวอักษร `✕` สี `--mh-muted` |
| Body `.modal-body` | padding `0 19.5px 13px`, field เรียงแนวตั้ง gap 16px |
| Field | label 13px/600 สี `--mh-ink-soft` (ดอกจันบังคับสีแดง), ห่างจาก input 6.5px (`gap-1.5`) |
| Footer `.modal-footer` | padding `13px 19.5px`, เส้นบน 1px `--mh-border`, ปุ่มชิดขวา gap 13px |
| ปุ่มใน footer | Cancel = ปุ่ม ghost (ตัวอักษร `--mh-muted`), ยืนยัน = primary |
| ข้อความผิดพลาด `.modal-error` / `.alert-error` | พื้น `rgba(239,68,68,.1)`, ขอบ `rgba(239,68,68,.2)`, ตัวอักษร `#f87171`, รัศมี 9.75px |

ขนาดอื่นที่หน้าต่างๆ ใช้ (modal-md / modal-lg) เปลี่ยนเฉพาะความกว้างของ `.modal` ดู `design.md`

## 10. ตารางครบชุด + Pagination

**ตาราง** (`.data-table`, `.ticket-table`, `.sync-table`; ห่อด้วย `.table-wrap` = การ์ด รัศมี 13px)

| ส่วน | ค่า |
|---|---|
| ตัวอักษรตาราง | 13px |
| `th` | 11.5px / 600 / UPPERCASE / tracking 0.04em / สี `--mh-muted` / พื้น `--mh-surface-muted` / padding `10px 16px` / เส้นล่าง 1px `--mh-border` / `white-space: nowrap` |
| `td` | 13px / สี `--mh-ink-soft` / padding `12px 16px` / line-height 1.45 / เส้นล่าง 1px `--mh-border` (แถวสุดท้ายไม่มีเส้น) |
| Hover แถว | พื้น `--mh-primary-soft` (transition 120ms) |
| หัวคอลัมน์เรียงลำดับ `th.sortable` | เมาส์เป็นมือ, hover พื้น `--mh-surface` ตัวอักษร `--mh-ink`; ไอคอนลูกศร 11px ความโปร่ง 40% (คอลัมน์ที่เรียงอยู่ 100% สี `--mh-primary`) |
| คอลัมน์กว้าง/แคบ | บางหน้า override padding เป็น `10px 3.25px 10px 11.4px` (เช่นคอลัมน์ลูกศรขยายแถวของหน้า Users) จึงไม่ต้องตกใจถ้าวัดแล้วไม่เท่า 16px |

**Pagination bar** (`.pagination-bar`: flex, ห่างตารางบน 16px, padding `6px 2px`, gap 12px, ตัดบรรทัดได้)

| ส่วน | ค่า |
|---|---|
| ข้อความ `Showing 1–1 of 1 users` | 13px, สี `--mh-muted`, ตัวเลข `<strong>` สี `--mh-ink` / 600 |
| `Rows per page:` | 13px, สี `--mh-muted` |
| Select จำนวนแถว `.select-page-size` | สูง 32px, กว้างอย่างน้อย 62px, padding `0 28px 0 10px`, รัศมี 6px, ขอบ `--mh-border`, พื้น `--mh-surface`, 13px/500, ลูกศร chevron SVG 14px ชิดขวา 8px; hover ขอบ `--mh-border-strong`; focus ขอบ `--mh-primary` + ring 2px `--mh-primary-soft` |
| ปุ่มหน้า `.pag-btn` | อย่างน้อย 32×32px, รัศมี 6px, ขอบ `--mh-border`, พื้น `--mh-surface`, 13px/500; hover พื้น `--mh-surface-muted`; **active** พื้น `--mh-primary` ตัวอักษรขาว 600; disabled ความโปร่ง 35% |

**แถวว่าง:** ไม่มี component กลาง แต่ละหน้าเขียนข้อความเองในตาราง ถ้าทำใหม่แนะนำข้อความสี `--mh-muted` กึ่งกลาง ใน `td colspan`

## 11. แถบกรอง / แท็บ / ปุ่มหัวหน้า

โครงบนสุดของหน้า: `.page-header` (flex, ชื่อซ้าย ปุ่มขวา, margin-bottom 13px) แล้วตามด้วยแถวกรอง

| ส่วน | ค่า |
|---|---|
| แท็บแบบ pill `.tab-btn` | สูง **36px**, padding-x 16px, รัศมี 8px, 13px/500, ตัวอักษร `--mh-muted`, ขอบโปร่ง |
| แท็บ active | พื้น `--mh-primary-soft`, ตัวอักษร `--mh-primary`, ขอบ 1px `rgba(99,102,241,.2)` |
| ช่องค้นหาในหน้า `.search-wrap` | ไอคอนแว่นขยายซ้าย + `input.search-input` 12.5px ไม่มีขอบในตัว input (ขอบอยู่ที่กรอบ); กรอบสไตล์เดียวกับช่องค้นหา topbar (สูง 36px, รัศมี 9px, พื้น `--mh-surface-muted`, ขอบ `--mh-border`, focus ขอบ `--mh-primary` + ring `rgba(99,102,241,.12)`) |
| ปุ่มมุมขวาบน | ปุ่ม secondary (Export, Sync) สูง 32.5px และปุ่ม primary (+ Add) ขวาสุด; ไอคอนในปุ่ม 14px ห่าง 6.5px |

## 12. Dropdown, กระดิ่ง และข้อความแจ้ง

| ส่วน | ค่า |
|---|---|
| เมนูผู้ใช้ `.dropdown-menu` | กว้าง 230px, ลอยใต้ปุ่ม +6px ชิดขวา, พื้น `--mh-surface`, ขอบ 1px `--mh-border`, รัศมี 12px, เงา `0 10px 25px -5px rgba(0,0,0,.15), 0 8px 10px -6px rgba(0,0,0,.1)`, **z 200**, fade-in 150ms (เลื่อนลง 4px) |
| ส่วนหัวเมนู | padding `12px 14px` อวาตาร์ + ข้อมูลผู้ใช้ เส้นล่าง `--mh-border` |
| รายการเมนู `.menu-item-btn` | padding `9px 14px`, 13px/500, ตัวอักษร `--mh-ink`; hover พื้น `--mh-surface-muted` ตัวอักษร `--mh-primary` |
| Sign out | ตัวอักษร `--mh-muted`; hover พื้น `rgba(239,68,68,.08)` ตัวอักษร `--mh-red` |
| ปุ่มกระดิ่ง | เหมือน `.icon-btn` (36×36) |
| ตัวเลขบนกระดิ่ง `.bell-badge` | พื้น `--mh-red`, ตัวอักษรขาว 10px/700, สูง 17px, padding-x 4px, รัศมี 9px, วงขอบ 2px สี `--mh-surface` ให้ตัดกับพื้นหลัง |
| แผงแจ้งเตือน `.notif-panel` | กว้าง 360px, สูงสุดราว 488px, พื้น/ขอบ/รัศมี/เงาเดียวกับเมนูผู้ใช้, **z 200** |
| หัวแผง | padding `12px 14px`, ชื่อ "Notifications" ซ้าย ลิงก์ "Mark all as read" ขวา |
| รายการ `.notif-item` | padding `10px 14px`; **ยังไม่ได้อ่าน** (`.unread`) พื้น `--mh-primary-soft` |
| Toast | **ไม่มีในโปรเจกต์นี้** ข้อความผลลัพธ์แสดงเป็นแถบในหน้า/ใน modal (`.alert-error`, `.modal-error`) ถ้าต้องการ toast ในโปรเจกต์ใหม่ ควรทำเอง: มุมขวาบน ใต้ topbar กว้าง ~320px สไตล์เดียวกับ dropdown z 300 |

## 13. Breakpoints และ z-index

**Breakpoints ที่ใช้จริง (max-width):** 1024px (ลด padding ของ main เป็น `16px 20px`, grid 4→2 คอลัมน์), 900px, **860px** (ซ่อนช่องค้นหา topbar), **768px** (ซ่อน sidebar, main `margin-left: 0`, padding 12px), 640px (ซ่อนชื่อผู้ใช้ใน topbar เหลือแต่อวาตาร์), 600px. (900 และ 600 ใช้เฉพาะบางหน้า)

**ลำดับชั้น z-index**

| ชั้น | z |
|---|---|
| sidebar | 90 |
| topbar | 100 |
| modal backdrop | 50 (อ่านจากโค้ด: ต่ำกว่า topbar/sidebar ชั้น 90–100 จึงอาจไม่ทับ topbar — ยังไม่ได้ตรวจด้วยตา) |
| dropdown, แผงแจ้งเตือน | 200 |

## 14. Focus และ Accessibility

- ปุ่ม: ไม่มีวงโฟกัสตอนคลิกเมาส์ แต่เมื่อกด Tab (`:focus-visible`) จะขึ้น ring 2px สี `--mh-primary` เว้น offset 2px (ปุ่ม danger ใช้ `red-500`)
- Input: focus → ขอบ `--mh-primary` + ring `--mh-primary-soft` (Tailwind `ring-2`); select page size ring 2px; ช่องค้นหา ring 3px จาง `rgba(99,102,241,.12)`
- ปุ่มที่มีแต่ไอคอนต้องมี `aria-label` และ `title` (hamburger = "Toggle sidebar", สลับธีม = "Switch to Light/Dark Mode", ช่วยเหลือ = "Help & Information")
- ไอคอนเมนูตอน sidebar พับต้องมี `title` เป็นชื่อเมนู; modal ใช้ปุ่ม Cancel และ `✕` ปิดได้
- `prefers-reduced-motion: reduce` ลด animation/transition ทั้งหมดเหลือ 0.01ms
- ข้อความจางสุด (`--mh-muted-2`) ใช้กับ placeholder/ไอคอนที่ไม่ active เท่านั้น ไม่ใช้กับข้อความที่ต้องอ่าน (คอนทราสต์ต่ำ)

## 15. Checklist เมื่อนำไปใช้ในโปรเจกต์อื่น

1. คัดลอก `src/styles/variables.scss` (tokens ทั้ง dark/light) และ `tailwind.config.js`
2. ใส่ `@import` Inter + base style ของ `html, body` (ข้อ 1) ใน `styles.scss`
3. คัดลอก `@layer components` (`.btn*`, `.input`, `.card`, `.badge*`, `.table-wrap`, `.page-title`)
4. สร้าง shell: topbar 56px + sidebar 260/64px + main (ข้อ 5, 8)
5. ใส่ logic สลับธีม (ข้อ 7) และ `SidebarService` (ข้อ 8)
6. ใช้ Lucide ขนาด 18px เส้น 2px สีตาม `currentColor`
7. อย่าเขียนสี hex ตรงๆ ในหน้า ให้ใช้ `--mh-*` / `mh.*` เสมอ เพื่อให้ light/dark ทำงานครบ

(starter kit ที่แยกไว้แล้วอยู่ที่ `D:\MTL Project\design-starter-kit`)
