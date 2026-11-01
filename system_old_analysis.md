# System Old — EDMS Analysis

> **Purpose:** สรุปข้อมูลระบบ EDMS เก่า (system_old) เพื่อใช้เป็น reference ในการพัฒนาระบบใหม่

---

## 1. Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Laravel (PHP) |
| Frontend | Angular 14+ |
| UI Template | Fuse Admin Template |
| CSS Framework | Tailwind CSS |
| i18n | Transloco (EN / TH) |
| Push Notification | OneSignal |
| Export | Excel (maatwebsite/excel), PDF (barryvdh/laravel-dompdf) |
| Auth | Laravel Sanctum / LDAP (Active Directory) |

---

## 2. รายการ Forms ทั้งหมด (40 Forms)

### 2.1 HR / Admin Forms

| Form | ชื่อไทย | หมายเหตุ |
|------|---------|---------|
| `allowance-after-10pm` | เบี้ยเลี้ยงทำงานหลัง 22:00 | เบิกค่าเดินทาง/อาหารหลังเที่ยงคืน |
| `car` | ขอใช้รถ | จองรถบริษัท |
| `charitable-contribution` | การบริจาคเพื่อการกุศล | |
| `expenses-claim` | เบิกค่าใช้จ่าย | |
| `gift-hospitality` | รับของขวัญ/การต้อนรับ | ฝ่ายรับ |
| `gift-hospitality-offering` | ให้ของขวัญ/การต้อนรับ | ฝ่ายให้ |

### 2.2 Procurement / Finance Forms

| Form | ชื่อไทย | หมายเหตุ |
|------|---------|---------|
| `purchase-requisition` | ใบขอซื้อ (PR) | |
| `purchase-order` | ใบสั่งซื้อ (PO) | |
| `single-source-justification` | เหตุผลการจัดซื้อแหล่งเดียว | |
| `supplier-assessment` | ประเมินผู้จำหน่าย (ก่อนใช้) | |
| `supplier-evaluation` | ประเมินผู้จำหน่าย (หลังใช้) | |
| `sub-consultant-assessment` | ประเมิน Sub-Consultant (ก่อน) | |
| `sub-consultant-evaluation` | ประเมิน Sub-Consultant (หลัง) | |

### 2.3 Tender / Contract Forms

| Form | ชื่อไทย | หมายเหตุ |
|------|---------|---------|
| `tender-review` | ทบทวน Tender | |
| `tender-csa-review` | ทบทวน Tender (CSA) | Civil, Structural, Architectural |
| `tender-csa-verification` | ตรวจสอบ Tender (CSA) | |
| `tender-mep-review` | ทบทวน Tender (MEP) | Mechanical, Electrical, Plumbing |
| `tender-mep-verification` | ตรวจสอบ Tender (MEP) | |
| `proposal-contract-review` | ทบทวน Proposal/Contract | |
| `fee-sheet` (project / facade) | ใบคำนวณค่าบริการ | |
| `project-fee-sheet` | Fee Sheet (Project ทั่วไป) | |
| `project-facade-fee-sheet` | Fee Sheet (Facade) | |
| `project-fee-sheet-general` | Fee Sheet (General) | |
| `project-fee-sheet-lighting` | Fee Sheet (Lighting) | |
| `project-lighting-fee-sheet` | Fee Sheet (Lighting v2) | |
| `project-transportation-fee-sheet` | Fee Sheet (Transportation) | |
| `additional-design-fees` | ค่าออกแบบเพิ่มเติม | |

### 2.4 Engineering / Design Forms

| Form | ชื่อไทย | หมายเหตุ |
|------|---------|---------|
| `concept-design-review` | ทบทวนแบบ Concept | |
| `conceptual-peer-review` | Peer Review แบบ Conceptual | |
| `schematic-design-review` | ทบทวนแบบ Schematic | |
| `design-review` (legacy) | ทบทวนแบบ (รุ่นเก่า) | |
| `design-changes-notification` | แจ้งการเปลี่ยนแปลงแบบ | |
| `design-verification-validation` | ตรวจสอบและ validate แบบ | |
| `design-workflow` | กระบวนการออกแบบ | |
| `value-engineering` | Value Engineering | |
| `leed-review` | ทบทวน LEED | |
| `engineering-audit-review` | ตรวจสอบงานวิศวกรรม | |

### 2.5 Construction / QA Forms

| Form | ชื่อไทย | หมายเหตุ |
|------|---------|---------|
| `construction-validation` | ตรวจสอบงานก่อสร้าง | |
| `submission-review` | ทบทวนเอกสารส่งมอบ | |
| `project-quality-assurance-plan` | แผนประกันคุณภาพโครงการ | |
| `controlled-document-request` | ขอเอกสารควบคุม | |

---

## 3. Flow ของ Form (Pattern ที่ใช้ร่วมกัน)

ทุก Form มี lifecycle เหมือนกัน:

```
Draft → Submit → Review/Approve (multi-level) → Complete / Reject
```

### 3.1 สถานะของ Form
- **Draft** — ผู้ขอกรอกข้อมูล ยังไม่ส่ง
- **Pending** — ส่งแล้ว รออนุมัติ
- **In Review** — อยู่ระหว่างการตรวจสอบ
- **Approved** — อนุมัติแล้ว
- **Rejected** — ไม่อนุมัติ (มี comment)
- **Cancelled** — ยกเลิก
- **Completed** — เสร็จสมบูรณ์

### 3.2 Approval Workflow
- แต่ละ Form มี Approver หลายระดับ (Checker → Reviewer → Approver)
- ใช้ shared component `approval-workflow` ใน Frontend
- มีการส่ง Email notification และ OneSignal push notification ทุก step

### 3.3 หน้าใน Frontend (ทุก Module)
แต่ละ Form มีหน้าย่อยดังนี้:
- **List** — ตารางรายการ form ทั้งหมด (กรองได้ด้วย status, date, project)
- **Form / New** — สร้าง form ใหม่
- **View / Detail** — ดูรายละเอียด (read-only)
- **Actions** — จัดการ approval steps

---

## 4. โครงสร้างฐานข้อมูล (จาก Laravel Models)

### 4.1 Core Tables

| Table | Model | หมายเหตุ |
|-------|-------|---------|
| `users` | User | รองรับทั้ง LDAP และ Local |
| `employees` | Employee | ข้อมูลพนักงาน (sync จาก HRIS) |
| `projects` | Project | โครงการ |
| `roles` / `permissions` | Role, Permission | RBAC |
| `departments` | Department | แผนก |
| `companies` | Company | บริษัทในเครือ |

### 4.2 Form Tables (ตัวอย่าง)
แต่ละ Form มี table ของตัวเอง เช่น:
- `purchase_requisitions`, `purchase_requisition_items`
- `purchase_orders`, `purchase_order_items`
- `tender_reviews`, `tender_review_attachments`
- `expenses_claims`, `expenses_claim_items`
- `fee_sheets`, `fee_sheet_disciplines`
- `design_reviews`, `design_review_comments`
- `supplier_assessments`, `supplier_assessment_criteria`

### 4.3 Supporting Tables
- `attachments` / `documents` — ไฟล์แนบ (shared)
- `approval_workflows`, `approval_steps` — ขั้นตอนการอนุมัติ
- `notifications` — push/email notifications
- `audit_logs` — บันทึกการเปลี่ยนแปลง
- `comments` — ความเห็นในแต่ละ form

---

## 5. Backend Architecture (Laravel)

```
app/
├── Http/
│   ├── Controllers/
│   │   ├── Auth/           — Login, LDAP, Token
│   │   ├── Forms/          — 1 Controller per Form
│   │   ├── ApprovalController.php
│   │   ├── EmployeeController.php
│   │   ├── ProjectController.php
│   │   └── ReportController.php
│   ├── Middleware/
│   │   ├── CheckRole.php
│   │   └── CheckPermission.php
│   └── Requests/           — Form validation per Form
├── Models/                 — ~75+ Models
├── Services/
│   ├── ApprovalService.php
│   ├── NotificationService.php  (OneSignal + Email)
│   └── HrisService.php
└── Exports/                — Excel export per Form
```

### API Pattern
- RESTful API: `GET /api/{resource}`, `POST`, `PUT`, `DELETE`
- Response format: `{ data: ..., meta: { total, page, per_page } }`
- Auth: Bearer Token (Sanctum)

---

## 6. Frontend Architecture (Angular 14+)

```
src/app/
├── modules/
│   ├── {form-name}/
│   │   ├── list/           — Component แสดงตาราง
│   │   ├── form/           — Component กรอก/แก้ไข
│   │   ├── view/           — Component ดูรายละเอียด
│   │   └── actions/        — Component จัดการ approval
│   └── ...
├── shared/
│   ├── components/
│   │   ├── approval-workflow/   — Shared approval UI
│   │   ├── purchase-forms-filter/
│   │   └── view-actions/
│   └── services/
│       ├── auth.service.ts
│       ├── notification.service.ts
│       └── employee.service.ts
├── layout/
│   └── app-shell/          — Sidebar + Topbar (Fuse)
└── i18n/
    ├── en/                 — English translations
    └── th/                 — Thai translations
```

### Shared Patterns ใน Frontend
- **Transloco** สำหรับ i18n (รองรับ EN และ TH ทุกหน้า)
- **Fuse Admin Template** — Layout, Theme, Components
- **Tailwind CSS** — Utility classes
- **Angular Reactive Forms** — ทุก Form ใช้ `FormGroup`
- **NgRx หรือ Service** สำหรับ state management
- **File upload** — ทุก form มี attachment/upload section
- **Print / Export** — บาง form มีปุ่ม Print PDF หรือ Export Excel

---

## 7. Features หลัก

| Feature | รายละเอียด |
|---------|-----------|
| **Multi-level Approval** | ทุก form มี approval chain ที่กำหนดได้ |
| **Push Notification** | OneSignal แจ้งเตือน Mobile และ Web |
| **Email Notification** | แจ้งผู้อนุมัติทุก step |
| **HRIS Sync** | sync ข้อมูลพนักงานจากระบบ HR |
| **LDAP / AD Auth** | Login ด้วย Active Directory |
| **File Attachment** | แนบไฟล์ได้ทุก form |
| **PDF Export** | พิมพ์ form เป็น PDF |
| **Excel Export** | export รายงานเป็น Excel |
| **i18n EN/TH** | รองรับ 2 ภาษา |
| **Audit Log** | บันทึกทุกการเปลี่ยนแปลง |
| **RBAC** | กำหนดสิทธิ์ตาม Role |
| **Dashboard** | สรุปสถิติ form และ approval |
| **Mobile Responsive** | Fuse template รองรับ mobile |

---

## 8. สิ่งที่ควร Clone มาระบบใหม่ (Priority)

### High Priority
1. **Form List + Status Filter** — ทุก form ต้องมีหน้า list กรองตาม status/date
2. **Multi-level Approval** — approval workflow ที่ยืดหยุ่น
3. **Email Notification** — แจ้งผู้เกี่ยวข้องทุก step
4. **File Attachment** — upload/download ไฟล์แนบ
5. **PDF Export** — พิมพ์ form
6. **HRIS Sync** — sync พนักงาน (มีแล้วในระบบใหม่)
7. **Audit Log** — บันทึกการเปลี่ยนแปลง (มีแล้วบางส่วน)

### Medium Priority
8. **OneSignal Push** — แจ้งเตือน mobile
9. **Excel Export** — export รายงาน
10. **i18n TH/EN** — รองรับภาษาไทย
11. **Dashboard / Stats** — สรุปสถิติ

### Low Priority
12. **Legacy Design Review** — form เก่าที่อาจไม่ใช้แล้ว
13. **LDAP Auth** — ระบบใหม่ใช้ HRIS แล้ว

---

## 9. จำนวนสรุป

| รายการ | จำนวน |
|--------|-------|
| Forms ทั้งหมด | **40 forms** |
| Laravel Models | **~75+** |
| Angular Modules | **40+** |
| ภาษาที่รองรับ | 2 (EN, TH) |
| Approval Levels | ยืดหยุ่น (1-5 ระดับขึ้นอยู่กับ form) |
