# Form Detail Analysis — expenses-claim & allowance-after-10pm

> **จุดประสงค์:** วิเคราะห์รายละเอียดของ 2 forms เพื่อใช้เป็น blueprint ในการ clone มาระบบใหม่

---

## 1. Expenses Claim (เบิกค่าใช้จ่าย)

### 1.1 จุดประสงค์

ให้พนักงานยื่นขอเบิกค่าใช้จ่ายที่ตัวเองสำรองจ่ายไปก่อน (out-of-pocket expenses) เช่น ค่าเดินทาง ค่าอาหาร ค่าที่พัก โดยระบุรายการแยกตาม Project

---

### 1.2 โครงสร้าง DB

#### Table: `expenses_claims` (header)

| Column | Type | หมายเหตุ |
|--------|------|---------|
| `id` | int (PK) | Auto increment |
| `voucher_no` | varchar(100) UNIQUE | รหัสเลขที่เอกสาร เช่น `EC-20260502-0001` |
| `claimant_name` | varchar(255) | รหัสพนักงานผู้ขอเบิก |
| `recive_by` | varchar(100) | ผู้รับเงิน (อาจเป็นคนละคนกับผู้ขอ) |
| `claim_date` | date | วันที่ขอเบิก |
| `total_baht` | decimal(15,2) | ยอดรวมทั้งหมด (คำนวณจาก items) |
| `verified_by` | varchar(100) | รหัสพนักงาน ผู้ตรวจสอบ (ระดับ 1) |
| `verified_by_status` | varchar(50) | `pending` / `approve` / `reject` |
| `verified_by_date` | datetime | วันที่ verified |
| `approved_by` | varchar(100) | รหัสพนักงาน ผู้อนุมัติ (ระดับ 2) |
| `approved_by_status` | varchar(50) | `pending` / `approve` / `reject` |
| `approved_by_date` | datetime | วันที่ approved |
| `account_by` | varchar(100) | (deprecated — set null เสมอ) |
| `account_by_status` | varchar(50) | (deprecated) |
| `account_by_date` | datetime | (deprecated) |
| `status` | varchar(50) | Overall status (computed) |
| `attachments` | JSON array | paths ไฟล์แนบ |
| `draft_payload` | JSON | บันทึก form ทั้งหมดระหว่าง draft |
| `create_by` | varchar(100) | รหัสผู้สร้าง |
| `update_by` | varchar(100) | รหัสผู้แก้ไขล่าสุด |
| `created_at`, `updated_at` | timestamp | Laravel timestamps |
| `deleted_at` | timestamp | SoftDelete |

#### Table: `expenses_claim_items` (รายการย่อย)

| Column | Type | หมายเหตุ |
|--------|------|---------|
| `id` | int (PK) | |
| `expenses_claim_id` | int (FK) | FK → expenses_claims.id (CASCADE DELETE) |
| `seq` | smallint | ลำดับที่ |
| `item_date` | date | วันที่รายการ |
| `project_detail_id` | int (nullable) | FK → project_details.id |
| `project_code` | varchar(100) | รหัส project (denormalized) |
| `project_name` | varchar(255) | ชื่อ project (denormalized) |
| `details` | text | รายละเอียดค่าใช้จ่าย |
| `baht` | decimal(15,2) | จำนวนเงิน |
| `create_by`, `update_by` | varchar | |
| timestamps, softDeletes | | |

---

### 1.3 Approval Workflow (2 ระดับ)

```
Submit
  ↓
[Verified By] — ระดับ 1 (หัวหน้า / Line Manager)
  verified_by_status: pending → approve / reject
  ↓ (ถ้า approve)
[Approved By] — ระดับ 2 (ผู้อนุมัติสูงสุด)
  approved_by_status: pending → approve / reject
  ↓ (ถ้า approve)
Completed (status = 'approved')
```

**Overall `status` field (computed ตอน save):**

| เงื่อนไข | status |
|---------|--------|
| ยังไม่ส่ง | `draft` |
| ส่งแล้ว รอ verified | `submitted` |
| verified approve แล้ว รอ approved | `verified` |
| ทั้ง 2 approve | `approved` |
| ใครก็ตาม reject | `rejected` |

**Action scope rules (Tab "Action"):**
- **Verified By** เห็น form ที่ตัวเองเป็น `verified_by` และ `verified_by_status` เป็น pending
- **Approved By** เห็น form ที่ตัวเองเป็น `approved_by` และ `verified_by_status = approve` และ `approved_by_status` เป็น pending

---

### 1.4 API Endpoints

| Method | Path | Action |
|--------|------|--------|
| GET | `/api/expenses-claims` | list all (no pagination) |
| GET | `/api/expenses-claims/page` | paginated list + search + tab filter |
| GET | `/api/expenses-claims/create` | preview voucher_no |
| POST | `/api/expenses-claims` | create (or save draft) |
| GET | `/api/expenses-claims/{id}` | show detail |
| PUT | `/api/expenses-claims/{id}` | update (or save draft) |
| DELETE | `/api/expenses-claims/{id}` | delete |
| GET | `/api/expenses-claims/{id}/print-pdf` | inline PDF |
| GET | `/api/expenses-claims/{id}/combined-pdf/preview` | PDF + attachments (preview) |
| GET | `/api/expenses-claims/{id}/combined-pdf/download` | PDF + attachments (download) |
| GET | `/api/expenses-claims/draft` | get latest draft ของ user |

**Query params สำหรับ `/page`:**

| Param | ค่า | หมายเหตุ |
|-------|-----|---------|
| `start` | int | offset (DataTables style) |
| `length` | int | page size |
| `search[value]` | string | full-text search |
| `tab` | `all` / `my` / `pending` / `action` | filter scope |
| `status` | `draft` / `pending` / `verified` / `reject` / `approve` | workflow status filter |
| `approved_by` | employee code | กรองตาม approver |
| `approved_date_from` | YYYY-MM-DD | กรองช่วงวันที่ approve |
| `approved_date_to` | YYYY-MM-DD | |
| `approved_month` | YYYY-MM | กรองตามเดือน |
| `login_by` | object | ใช้ระบุ actor สำหรับ tab my/pending/action |
| `order[0][column]` | int | index คอลัมน์ sort |
| `order[0][dir]` | asc / desc | ทิศทาง sort |

**Voucher No format:** `EC-YYYYMMDD-XXXX` (เช่น `EC-20260502-0001`)

---

### 1.5 ฟีเจอร์พิเศษ

1. **Draft system** — บันทึก form ทั้งหมดเป็น JSON ใน `draft_payload` ก่อน submit ได้ทีเดียว; ผู้สร้างเท่านั้นที่แก้ draft ตัวเองได้
2. **Voucher No race-condition protection** — retry loop สูงสุด 10 ครั้ง หาก `UNIQUE` constraint ชนกัน
3. **Combined PDF** — merge form PDF + ไฟล์แนบ PDF เป็นไฟล์เดียว; ถ้าแนบมีปัญหาจะ fallback เป็น form อย่างเดียว
4. **Employee name resolution** — search ค้นได้ด้วยชื่อ-นามสกุล (ผ่าน subquery `employees` table) ไม่ใช่แค่ employee code
5. **Employee order** — sort ตามชื่อจริงจาก `employees` table แม้ column เก็บแค่ employee code
6. **Print payload** — ส่ง data ทั้งหมดผ่าน base64url query param ไปยัง frontend print page (ไม่ต้อง hit API อีกครั้ง)
7. **`recive_by`** — ผู้รับเงินอาจไม่ใช่ผู้ขอ (Spelling ผิดจงใจในระบบเก่า — ใช้ `recive_by` ไม่ใช่ `receive_by`)

---

## 2. Allowance After 10PM (เบี้ยเลี้ยงทำงานหลัง 22:00)

### 2.1 จุดประสงค์

ให้พนักงานยื่นขอเบี้ยเลี้ยงสำหรับการทำงานล่วงเวลาหลัง 22:00 น. โดยระบุรายการแต่ละวันที่ทำงาน พร้อมช่วงเวลาและ Project ที่ทำ

---

### 2.2 โครงสร้าง DB

#### Table: `allowance_after_10pm` (header)

| Column | Type | หมายเหตุ |
|--------|------|---------|
| `id` | int (PK) | Auto increment |
| `voucher_no` | varchar | รหัสเลขที่เอกสาร เช่น `AL-20260504-0001` (เพิ่มทีหลัง migration) |
| `claimant_name` | varchar(255) | รหัสพนักงานผู้ขอ |
| `discipline` | varchar(50→255) | สายงาน/วิศวกรรม เช่น Civil, Structural, MEP (ขยายเป็น 255 ใน migration ล่าสุด) |
| `request_date` | date | วันที่ยื่นคำขอ |
| `total_baht` | decimal(15,2) | ยอดรวมทั้งหมด |
| `attachments` | JSON array / longText | paths ไฟล์แนบ |
| `tl_by` | varchar(100) | Team Leader — ผู้ตรวจสอบ (ระดับ 1) |
| `tl_by_status` | varchar(50) | `pending` / `approve` / `reject` |
| `tl_by_date` | datetime | วันที่ TL ตัดสินใจ |
| `di_by` | varchar(100) | Discipline In-Charge — ผู้อนุมัติ (ระดับ 2) |
| `di_by_status` | varchar(50) | `pending` / `approve` / `reject` |
| `di_by_date` | datetime | วันที่ DI ตัดสินใจ |
| `account_by` | varchar(100) | (deprecated — set null เสมอ) |
| `account_by_status` | varchar(50) | (deprecated) |
| `account_by_date` | datetime | (deprecated) |
| `notified_user` | varchar(100) | ผู้รับแจ้งผล (ปกติ = claimant) |
| `notified_user_status` | varchar(50) | `pending` / `notified` |
| `notified_user_date` | datetime | วันที่แจ้ง |
| `status` | varchar(50) | Overall status (computed) |
| `draft_payload` | JSON | บันทึก form ทั้งหมดระหว่าง draft |
| `create_by` | varchar(100) | |
| `update_by` | varchar(100) | |
| timestamps, softDeletes | | |

#### Table: `allowance_after_10pm_items` (รายการย่อย)

| Column | Type | หมายเหตุ |
|--------|------|---------|
| `id` | int (PK) | |
| `allowance_after_10pm_id` | int (FK) | FK → allowance_after_10pm.id (CASCADE DELETE) |
| `seq` | smallint | ลำดับที่ |
| `work_date` | date | วันที่ทำงาน |
| `project_detail_id` | int (nullable) | FK → project_details.id |
| `project_code` | varchar(100) | รหัส project (denormalized) |
| `project_name` | varchar(255) | ชื่อ project (denormalized) |
| `description` | text | รายละเอียดงานที่ทำ |
| `time_from` | time | เวลาเริ่มต้น |
| `time_to` | time | เวลาสิ้นสุด |
| `baht` | decimal(15,2) | จำนวนเบี้ยเลี้ยง |
| `create_by`, `update_by` | varchar | |
| timestamps, softDeletes | | |

---

### 2.3 Approval Workflow (2 ระดับ + Notification)

```
Submit
  ↓
[TL By] — Team Leader ตรวจสอบ (ระดับ 1)
  tl_by_status: pending → approve / reject
  ↓ (ถ้า approve)
[DI By] — Discipline In-Charge อนุมัติ (ระดับ 2)
  di_by_status: pending → approve / reject
  ↓ (ถ้า approve)
[Notify] — ระบบ set notified_user_status = 'notified' อัตโนมัติ
  status = 'notified'
```

**Overall `status` field (computed ตอน save):**

| เงื่อนไข | status |
|---------|--------|
| ยังไม่ส่ง | `draft` |
| ส่งแล้ว รอ TL | `submitted` |
| TL approve แล้ว รอ DI | `tl_approved` |
| ทั้ง 2 approve → auto-notify | `notified` |
| ใครก็ตาม reject | `rejected` |

> **ต่างจาก expenses-claim:** เมื่อ TL + DI approve ครบ ระบบจะ auto-set `notified_user_status = 'notified'` และบันทึกวันที่ไว้ใน `notified_user_date` (ไม่ต้องรอ action เพิ่มเติม)

**Action scope rules (Tab "Action"):**
- **TL By** เห็น form ที่ตัวเองเป็น `tl_by` และ `tl_by_status` เป็น pending
- **DI By** เห็น form ที่ตัวเองเป็น `di_by` และ `tl_by_status = approve` และ `di_by_status` เป็น pending

---

### 2.4 API Endpoints

| Method | Path | Action |
|--------|------|--------|
| GET | `/api/allowance-after-10pm` | list all (no pagination) |
| GET | `/api/allowance-after-10pm/page` | paginated list + search + tab filter |
| GET | `/api/allowance-after-10pm/create` | preview voucher_no |
| POST | `/api/allowance-after-10pm` | create (or save draft) |
| GET | `/api/allowance-after-10pm/{id}` | show detail |
| PUT | `/api/allowance-after-10pm/{id}` | update (or save draft) |
| DELETE | `/api/allowance-after-10pm/{id}` | delete |
| GET | `/api/allowance-after-10pm/{id}/print-pdf` | inline PDF |
| GET | `/api/allowance-after-10pm/{id}/combined-pdf/preview` | PDF + attachments (preview) |
| GET | `/api/allowance-after-10pm/{id}/combined-pdf/download` | PDF + attachments (download) |
| GET | `/api/allowance-after-10pm/draft` | get latest draft ของ user |
| GET | `/api/allowance-after-10pm/attachment-data-url` | อ่านไฟล์แนบเป็น base64 data URL |

**Query params สำหรับ `/page` (เพิ่มจาก expenses-claim):**

| Param | ค่า | หมายเหตุ |
|-------|-----|---------|
| `discipline` | string | กรองตาม discipline |
| `approved_by` | employee code | กรองตาม di_by |
| ... | ... | params อื่น เหมือน expenses-claim |

**Response `/page` มี extra field:**
- `discipline_options` — array of distinct discipline values ในระบบ (สำหรับ dropdown filter)
- `action_request_count` — จำนวน records ใน tab "Action" ของ actor ปัจจุบัน

**Voucher No format:** `AL-YYYYMMDD-XXXX` (เช่น `AL-20260504-0001`)

---

### 2.5 ฟีเจอร์พิเศษ

1. **`discipline` field** — เป็น field พิเศษ (ไม่มีใน expenses-claim) แยกตามสายงาน เช่น Civil, Structural, MEP, Architecture; ค่า `Site` จะถูก normalize เป็น `Other` อัตโนมัติ
2. **Auto-notification** — เมื่อ TL + DI approve ครบ ระบบ set `notified_user_status = 'notified'` อัตโนมัติโดยไม่ต้องรอ action
3. **Attachment data URL endpoint** — มี endpoint พิเศษ return ไฟล์แนบเป็น base64 data URL (สำหรับ inline ใน PDF?)
4. **Discipline filter** — list page ส่ง `discipline_options` กลับมาพร้อมกับ data (ไม่ต้อง call API แยก)
5. **Draft system + Combined PDF** — เหมือน expenses-claim

---

## 3. Pattern ที่ใช้ร่วมกัน (ทั้ง 2 forms)

### 3.1 Tab System

| Tab | แสดงอะไร |
|-----|---------|
| `all` | ทุก record |
| `my` | record ที่ user เป็น claimant / approver / creator |
| `pending` | ของตัวเอง + รายการที่ต้องการ action จาก user |
| `action` | รายการที่ user ต้อง take action ตอนนี้ (แสดง badge count) |

### 3.2 Search Pattern

- search ด้วย keyword จะ OR ทุก column ที่เกี่ยวข้อง (voucher_no, claimant_name, approver, ฯลฯ)
- รองรับ search ด้วยชื่อ-นามสกุลจริง (ผ่าน `employees` table) ไม่ใช่แค่ employee code
- **Pagination แบบ DataTables** — ส่ง `start` (offset) และ `length` (page size); backend แปลงเป็น page number

### 3.3 Audit / Logging

- ทั้ง 2 forms มี `create_by` และ `update_by` ทุก table
- มีการเรียก `logDocumentCreateAudit()` ตอน create
- SoftDelete ทุก table (ไม่ลบจริง)

### 3.4 PDF Generation

- ใช้ `FrontendPrintPdfService` render HTML ที่ frontend ให้เป็น PDF
- ส่ง data ผ่าน `base64url` query param (`printPayload=...`) ไปยัง frontend
- มี combined PDF mode (merge form + ไฟล์แนบ) โดยใช้ `PurchaseCombinedPdfService`
- Fallback ถ้าแนบมีปัญหา: ใช้แค่ form PDF

### 3.5 Employee Lookup สำหรับ PDF

- ก่อน render PDF จะ resolve employee reference columns ทั้งหมด
- ดึง employee ข้อมูล (firstname, lastname, initial, title_name) จาก `employees` table
- ดึง `signature_settings` สำหรับแต่ละ employee ที่เกี่ยวข้อง
- ส่ง `employeeLookup`, `employeeLookupWithTitle`, `activeSignatureSettings` พร้อมกับ document data

---

## 4. ข้อแตกต่างหลักระหว่าง 2 Forms

| Feature | expenses-claim | allowance-after-10pm |
|---------|---------------|----------------------|
| Voucher prefix | `EC-` | `AL-` |
| Approver L1 | `verified_by` | `tl_by` (Team Leader) |
| Approver L2 | `approved_by` | `di_by` (Discipline In-Charge) |
| Extra header field | `recive_by` (ผู้รับเงิน) | `discipline` (สายงาน) |
| Item date field | `item_date` | `work_date` |
| Item description field | `details` | `description` |
| Item time range | ไม่มี | `time_from`, `time_to` |
| Final status | `approved` | `notified` |
| Auto-notification | ไม่มี | มี (set notified อัตโนมัติ) |
| Discipline filter | ไม่มี | มี |
| Attachment endpoint | ไม่มี | มี `/attachment-data-url` |
| Race-condition protection | retry 10 ครั้ง | ไม่มี retry loop (แต่มี do-while check) |

---

## 5. สิ่งที่ต้องสร้างในระบบใหม่ (NestJS + Angular 17+)

### Backend (NestJS)

#### Entities / Tables ที่ต้องสร้าง

```
expenses_claims
expenses_claim_items
allowance_after_10pm
allowance_after_10pm_items
```

#### Endpoints ที่ต้อง implement

- CRUD: `GET /`, `POST /`, `GET /:id`, `PUT /:id`, `DELETE /:id`
- Pagination: `GET /page?tab=all|my|pending|action&search=...&status=...`
- Draft: `GET /draft`, `POST /` with `status=draft`
- PDF: `GET /:id/print-pdf`, `GET /:id/combined-pdf/preview`, `GET /:id/combined-pdf/download`
- Voucher preview: `GET /create`

#### Business Logic

- Voucher No generation (format + race-condition protection)
- Workflow status resolution (`resolveOverallStatus`)
- Tab scope filtering (my / pending / action)
- Employee name search (cross-join employees)
- Draft payload (save/restore)
- Auto-notification (allowance only)

### Frontend (Angular 17+)

#### Components ต้องสร้าง

```
expenses-claim/
  list/          — DataTable + tabs + search + status filter
  form/          — Create/Edit form
  view/          — Read-only detail + workflow status
  actions/       — Approve/Reject actions

allowance-after-10pm/
  list/          — DataTable + tabs + discipline filter + search
  form/          — Create/Edit form (พิเศษ: time_from/time_to ต่อ item)
  view/          — Read-only detail + workflow status
  actions/       — Approve/Reject actions
```

#### Shared Patterns

- Workflow badge component (แสดง status chip ของแต่ละ approver)
- Approval action panel (approve/reject + comment)
- File attachment upload
- PDF preview/download button
- Draft save/restore
- Search + Autocomplete (ตาม design.md pattern)
- Pagination (ตาม design.md pattern)
