# คู่มือเรียกใช้ PMTS Integration API

คู่มือนี้สำหรับผู้พัฒนาระบบปลายทางที่ต้องการอ่านข้อมูล Proposal, Project และ Fee Sheet จาก PMTS ผ่าน HTTP API แบบอ่านอย่างเดียว ข้อมูลตอบกลับเป็น JSON และใช้ API key ของระบบปลายทาง ไม่ใช้บัญชีผู้ใช้ PMTS

> **ก่อนเริ่ม:** endpoint ในคู่มือนี้ต้องถูก deploy บน PMTS host แล้ว และผู้ดูแล PMTS ต้องออก API key ให้ระบบของคุณ ตัวอย่าง `pmts.example.com` เป็นชื่อ host สมมติ

## 1. เตรียมการเชื่อมต่อ

| รายการ | ค่า |
| --- | --- |
| Base URL | `https://<pmts-host>/api/integration/v1` |
| Method | `GET` เท่านั้น |
| Authentication | Header `x-api-key: <API key>` |
| Response | JSON, UTF-8; `Cache-Control: no-store` |
| Rate limit | 120 requests ต่อนาที ต่อ key |
| ข้อมูล | Production เท่านั้น; Training mode ไม่ใช้กับ Integration API |

ให้เรียกจาก backend หรือ server ของระบบปลายทาง เก็บ API key ใน secret store หรือ environment variable ห้ามใส่ key ในเว็บเบราว์เซอร์ แอปมือถือ URL หรือ source code ที่เผยแพร่

ผู้ดูแล PMTS กำหนด client แยกให้แต่ละระบบใน `PMTS_PROJECT_API_CLIENTS` ของ backend แล้ว restart API ตัวอย่างค่า configuration (แทนที่ key ด้วยค่าสุ่มจริงอย่างน้อย 32 ตัวอักษร):

```dotenv
PMTS_PROJECT_API_CLIENTS=[{"name":"ERP","key":"REPLACE_WITH_A_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS","companies":["MTL"],"financials":true}]
```

`companies` คือ company code ที่ key นี้อ่านได้ หากมีหลาย company ต้องส่ง `company=<code>` ใน list request ทุกครั้ง ส่วน `financials: true` เปิดการอ่านจำนวนเงิน อัตราแลกเปลี่ยน และรายการเงิน; ค่าเริ่มต้นคือ `false` การเปลี่ยนหรือเพิกถอน key ต้องแก้ configuration และ restart API

## 2. เลือก endpoint

| ข้อมูล | รายการ | รายตัว | หมายเหตุ |
| --- | --- | --- | --- |
| Proposal | `GET /proposals` | `GET /proposals/{id}` | รวม Proposal ที่ยังไม่มี Project |
| Project | `GET /projects` | `GET /projects/{id}` | แต่ละ Project มี `proposal` และ `feeSheet` ที่เกี่ยวข้องเมื่อมีข้อมูล |
| Fee Sheet | `GET /fee-sheets` | `GET /fee-sheets/{id}` | รวม Fee Sheet ที่เลือกเฉพาะ Proposal และยังไม่มี Project |

`{id}` เป็น UUID ของ record ใน PMTS ให้ใช้ `id` เป็น key ในระบบปลายทาง เพราะเลข Proposal, Project code และเลข Fee Sheet อาจมีการแก้ไขภายหลัง

### ทดสอบการเรียกด้วย PowerShell

กำหนด `PMTS_API_KEY` ใน environment ของ session ผ่านวิธีจัดการ secret ที่องค์กรใช้อยู่ แล้วเรียก:

```powershell
$baseUrl = 'https://pmts.example.com/api/integration/v1'
$headers = @{ 'x-api-key' = $env:PMTS_API_KEY }

$response = Invoke-RestMethod -Method Get -Uri "$baseUrl/proposals?page=1&pageSize=100" -Headers $headers
$response.proposals | Select-Object id, proposalNumber, status, projectIds
```

หากต้องการดู HTTP response ดิบ ใช้ `curl.exe` (ระบุ `.exe` เพื่อไม่ชนกับ alias ใน Windows PowerShell):

```powershell
curl.exe -i -H "x-api-key: $env:PMTS_API_KEY" "https://pmts.example.com/api/integration/v1/projects?page=1&pageSize=2"
```

## 3. ค้นหาและกรองข้อมูล

พารามิเตอร์ร่วมของ list endpoint ทั้งสามรายการ:

| พารามิเตอร์ | ความหมาย |
| --- | --- |
| `company` | Company code; จำเป็นเมื่อ key อ่านได้มากกว่าหนึ่ง company |
| `page` | หน้าที่ต้องการ เริ่มที่ `1` (ค่าเริ่มต้น `1`) |
| `pageSize` | จำนวนรายการต่อหน้า ค่าเริ่มต้น `100` สูงสุด `500` |
| `updatedSince` | วันที่หรือเวลา ISO 8601 เช่น `2026-10-01T00:00:00Z`; รับรายการที่เปลี่ยนตั้งแต่เวลานั้นรวมเวลาที่เท่ากัน |
| `status` | สถานะที่บันทึกไว้ตรงตัว; ค่าแต่ละประเภทข้อมูลต่างกัน |

พารามิเตอร์เฉพาะ:

| Endpoint | พารามิเตอร์ | ความหมาย |
| --- | --- | --- |
| `/proposals` | `number` | เลข Proposal แบบตรงตัว ไม่สนตัวพิมพ์ใหญ่เล็ก |
| `/projects` | `code` | Project code, legacy code หรือ alias แบบตรงตัว ไม่สนตัวพิมพ์ใหญ่เล็ก |
| `/projects` | `timesheetEligible` | `true` หรือ `false` |
| `/fee-sheets` | `number` | เลข Fee Sheet แบบตรงตัว ไม่สนตัวพิมพ์ใหญ่เล็ก |
| `/fee-sheets` | `projectId` | UUID ของ Project ที่ Fee Sheet เลือกไว้โดยตรง |
| `/fee-sheets` | `proposalId` | UUID ของ Proposal ที่ Fee Sheet เลือกไว้โดยตรง |

ตัวอย่าง:

```http
GET /api/integration/v1/proposals?number=P-2026-0142
GET /api/integration/v1/projects?status=active&page=1&pageSize=200
GET /api/integration/v1/projects?code=MT3298%2F1
GET /api/integration/v1/fee-sheets?projectId=b5a1c0de-0000-4000-8000-000000000001
GET /api/integration/v1/fee-sheets?proposalId=77aa0000-0000-4000-8000-000000000003
```

เมื่อส่งค่าใน URL ให้ URL-encode อักขระพิเศษ เช่น `/` ใน Project code เป็น `%2F` หาก key อ่านได้หลาย company ให้เพิ่ม `&company=MTL` หรือ `?company=MTL` ตามตำแหน่งพารามิเตอร์

## 4. อ่านผลลัพธ์

List response มีโครงสร้างร่วมดังนี้ ชื่อ array เปลี่ยนตาม endpoint (`proposals`, `projects` หรือ `feeSheets`):

```json
{
  "company": { "code": "MTL", "name": "Meinhardt Thailand", "baseCurrency": "THB" },
  "generatedAt": "2026-10-08T03:15:00.000Z",
  "amountsIncluded": true,
  "page": 1,
  "pageSize": 100,
  "total": 1,
  "proposals": [
    {
      "id": "77aa0000-0000-4000-8000-000000000003",
      "proposalNumber": "P-2026-0142",
      "status": "completed",
      "projectIds": ["b5a1c0de-0000-4000-8000-000000000001"],
      "feeSheetIds": []
    }
  ]
}
```

ตัวอย่างข้างต้นตัด field อื่นออกเพื่อแสดงโครงสร้างเท่านั้น ดู field ครบและตัวอย่างจำนวนเงินใน [API contract](PROJECT_INTEGRATION_API.md)

Detail response ใช้ `proposal`, `project` หรือ `feeSheet` แทน array และไม่มี `page`, `pageSize`, `total` เช่น:

```http
GET /api/integration/v1/fee-sheets/55bb0000-0000-4000-8000-000000000004
```

### ความสัมพันธ์ของข้อมูล

- `proposal.projectIds` ระบุ Project ที่เชื่อมกับ Proposal โดยตรง Proposal หนึ่งรายการอาจมีหลาย Project และ Project อาจไม่มี Proposal
- `proposal.feeSheetIds` ระบุ Fee Sheet ที่เลือก Proposal นั้นโดยตรง หาก Fee Sheet เลือกผ่าน Project แต่ไม่ได้เลือก Proposal โดยตรง ให้ค้นด้วย `/fee-sheets?projectId=<id>`
- `project.proposal` และ `project.feeSheet` อาจเป็น `null` ได้ Project ที่เกี่ยวข้องกันอาจอ้าง Proposal ของ Project หลัก
- `feeSheet.projectId` อาจเป็น `null` เมื่อเป็น Fee Sheet ที่มีเฉพาะ Proposal
- `source: "imported"` แสดงข้อมูลประวัติที่นำเข้า Proposal ที่รับเข้าระบบ Native แล้วจะปรากฏเพียงครั้งเดียวใน `/proposals`

### จำนวนเงินและ revision

- เมื่อ key ไม่มี `financials: true`, `amountsIncluded` เป็น `false`; field จำนวนเงินและอัตราแลกเปลี่ยนเป็น `null` และไม่มี financial detail lines หรือ `rateComponents`
- จำนวนเงินเป็น **decimal string** เช่น `"40000.00"` ให้แปลงด้วย decimal type ของระบบปลายทาง ไม่ใช้ binary floating point ในการคำนวณยอดเงิน `null` หมายถึงไม่มีข้อมูลหรือไม่มีสิทธิ์ ไม่ใช่ศูนย์
- Fee Sheet แสดง revision ที่อนุมัติล่าสุด หากไม่มี จะใช้ revision ที่ส่งล่าสุด `status` คือสถานะปัจจุบันของ Fee Sheet; `revisionApproved` ระบุสถานะของ revision ที่แสดง
- Draft ที่ไม่เคยส่งจะมี `revisionId`, `revisionNo` และ field รายละเอียด revision เป็น `null` โดย `revisionApproved` เป็น `false`; API ไม่เปิดเผย Draft working copy
- หาก `hasMixedRates` เป็น `true`, ยอดฐานสกุลเงินต้องอ้าง `grossFeeBase`, `nettFeeBase` หรือ `rateComponents` ที่บันทึกไว้ ห้ามคำนวณยอดสะสมด้วย `exchangeRate` เดียว
- วันที่อยู่ในรูป `YYYY-MM-DD`; timestamp เป็น ISO 8601 UTC

## 5. ดึงทุกหน้าและซิงก์ข้อมูล

รอบแรก เรียก `page=1` แล้วเพิ่ม `page` จน `page * pageSize >= total` ตัวอย่าง PowerShell สำหรับ Project:

```powershell
$baseUrl = 'https://pmts.example.com/api/integration/v1'
$headers = @{ 'x-api-key' = $env:PMTS_API_KEY }
$page = 1
$pageSize = 100
$projects = [System.Collections.Generic.List[object]]::new()

do {
    $result = Invoke-RestMethod -Method Get -Uri "$baseUrl/projects?page=$page&pageSize=$pageSize" -Headers $headers
    if ($page -eq 1) { $watermark = $result.generatedAt }
    foreach ($project in $result.projects) { $projects.Add($project) }
    $page++
} while ((($page - 1) * $pageSize) -lt $result.total)

"Fetched $($projects.Count) Projects; next updatedSince: $watermark"
```

รอบถัดไป ส่ง `updatedSince=<watermark>` ของ **หน้าแรกในรอบก่อน** แยกตาม Proposal, Project และ Fee Sheet แล้ว upsert ด้วย `id` การเปลี่ยนระหว่างแบ่งหน้าอาจทำให้บาง record กลับมาอีกครั้ง จึงต้องรองรับรายการซ้ำและผลลัพธ์แบบ idempotent:

```http
GET /api/integration/v1/projects?updatedSince=2026-10-08T03%3A15%3A00.000Z&page=1&pageSize=100
```

API ไม่ส่งรายการลบเป็น tombstone ให้ทำ full reconciliation เป็นระยะเพื่อตรวจ record ที่ถูกลบหรือไม่อยู่ใน list แล้ว Project ที่สิ้นสุดงานยังคงอยู่ใน list และเปลี่ยนที่ `status`

## 6. HTTP status และการแก้ปัญหา

ข้อผิดพลาดตอบกลับเป็น JSON ที่มี `message`:

| Status | สาเหตุที่พบบ่อย | วิธีตรวจสอบ |
| --- | --- | --- |
| `400` | พารามิเตอร์ไม่ถูกต้อง หรือ key อ่านได้หลาย company แต่ไม่ส่ง `company` | ตรวจ UUID, `page`, `pageSize`, `updatedSince` และ company code |
| `401` | ไม่ส่ง key หรือ key ไม่ตรง configuration | ตรวจ header `x-api-key`, key ที่ออกให้ และการ restart backend |
| `403` | key ไม่มีสิทธิ์อ่าน company ที่ขอ | ตรวจ `companies` ของ client |
| `404` | ไม่พบ record/company หรือ record อยู่ต่าง company | ตรวจ UUID และ company ที่ key อ่านได้ |
| `429` | เกิน 120 requests ต่อนาที | ลดความถี่และลองใหม่หลังประมาณหนึ่งนาที |
| `500` | ข้อผิดพลาดภายใน PMTS | บันทึกเวลา, endpoint, status และ request ID หากมี แล้วแจ้งผู้ดูแล โดยไม่ส่ง API key ใน log หรือข้อความแจ้ง |

## 7. รายการตรวจรับก่อนเปิดใช้งานจริง

1. ทดสอบ `GET /proposals`, `/projects`, `/fee-sheets` โดยใช้ key ของระบบปลายทาง และตรวจ `company.code`
2. ตรวจ `amountsIncluded` ว่าตรงกับสิทธิ์ financials ที่ตกลงกัน
3. ทดสอบ pagination, `updatedSince` และการ upsert ด้วย `id`
4. ตรวจการจัดการ `null`, Draft Fee Sheet, imported Proposal และ Project ที่ไม่มี Proposal
5. จัดเก็บ key ใน secret store และตั้งเวลาทำ full reconciliation เพื่อตรวจรายการลบ

รายละเอียด field ทั้งหมดและตัวอย่าง response เพิ่มเติมอยู่ใน [PROJECT_INTEGRATION_API.md](PROJECT_INTEGRATION_API.md)
