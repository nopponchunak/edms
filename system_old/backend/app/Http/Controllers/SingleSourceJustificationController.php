<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\SingleSourceJustification;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class SingleSourceJustificationController extends Controller
{
    private function normalizeAttachments($attachments)
    {
        if (is_array($attachments)) {
            return $attachments;
        }

        if (is_string($attachments)) {
            $decoded = json_decode($attachments, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                return $decoded;
            }

            $trimmed = trim($attachments);
            if ($trimmed !== '') {
                return [$trimmed];
            }
        }

        return [];
    }

    private function attachmentsToJson($attachments)
    {
        $normalized = $this->normalizeAttachments($attachments);
        return $this->encodeAttachments($normalized);
    }

    private function encodeAttachments($normalized)
    {
        if (empty($normalized)) {
            return null;
        }

        return json_encode($normalized, JSON_UNESCAPED_UNICODE);
    }

    // =========================================================
    // getList
    // =========================================================
    public function getList()
    {
        $Item = SingleSourceJustification::orderBy('id', 'desc')->get()->toArray();

        if (!empty($Item)) {
            for ($i = 0; $i < count($Item); $i++) {
                $Item[$i]['No'] = $i + 1;
            }
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $Item);
    }

    // =========================================================
    // getPage (DataTable style เดิม)
    // =========================================================
    public function getPage(Request $request)
    {
        $columns = $request->columns;
        $length  = $request->length ?? 10;
        $order   = $request->order;
        $search  = $request->search;
        $start   = $request->start ?? 0;

        if (!$length || $length <= 0) {
            $length = 10;
        }
        $page = floor($start / $length) + 1;

        $col = [
            'id',
            'sub_consultant_supplier_name',
            'items_supplied',
            'justification_type',
            'attachments',
            'circumstances_selection',
            'alternatives_considered',
            'reason_no_alternatives',
            'comments',
            'rationale_selection',
            'assessed_by',
            'assessed_by_date',
            'assessed_by_status',
            'verify_by',
            'verify_by_date',
            'verify_by_status',
            'verify_by_comment',
            'corresponding_po_no',
            'approved_by',
            'approved_by_date',
            'approved_by_status',
            'approved_by_comments',
            'acknowledged_by',
            'acknowledged_by_date',
            'acknowledged_by_status',
            'acknowledged_by_comments',
            'verify_by',
            'verify_by_status',
            'verify_by_date',
            'verify_by_comment',
            'create_by',
            'update_by',
            'created_at',
            'updated_at',
        ];

        $orderby = [
            'sub_consultant_supplier_name',
            'items_supplied',
            'justification_type',
            'assessed_by',
            'created_at',
            'updated_at',
            'acknowledged_by_status',
        ];

        $D = SingleSourceJustification::select($col);

        // ================= Filter อื่น ๆ (ถ้ามีในอนาคต) =================
        // ตัวนี้ยังไม่ใส่เงื่อนไขเพิ่ม เพราะยังไม่มี requirement

        // ================= Search ======================
        if (!empty($search['value'])) {
            $keyword = '%' . $search['value'] . '%';

            $D->where(function ($q) use ($keyword, $col) {
                foreach ($col as $c) {
                    $q->orWhere($c, 'like', $keyword);
                }
            });
        }

        // ================= Sorting ======================
        if (!empty($order)) {
            $idx = $order[0]['column'] ?? 0;
            $dir = $order[0]['dir'] ?? 'asc';

            if (isset($orderby[$idx]) && !empty($orderby[$idx])) {
                $D->orderBy($orderby[$idx], $dir);
            }
        }

        $d = $D->paginate($length, ['*'], 'page', $page);

        if ($d->isNotEmpty()) {
            $No = (($page - 1) * $length);
            for ($i = 0; $i < count($d); $i++) {
                $No        = $No + 1;
                $d[$i]->No = $No;
            }
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $d);
    }

    // =========================================================
    // show
    // =========================================================
    public function show($id)
    {
        $Item = SingleSourceJustification::find($id);

        if (!$Item) {
            return $this->returnErrorData('ไม่พบข้อมูลที่ระบุ', 404);
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $Item);
    }

    // =========================================================
    // store
    // =========================================================
    public function store(Request $request)
    {
        $loginBy = $request->login_by;

        // === Validate ตามฟิลด์ที่บังคับในแบบฟอร์ม ===
        if (!isset($request->sub_consultant_supplier_name)) {
            return $this->returnErrorData('กรุณาระบุ sub_consultant_supplier_name', 404);
        }
        if (!isset($request->items_supplied)) {
            return $this->returnErrorData('กรุณาระบุ items_supplied', 404);
        }
        if (!isset($request->justification_type)) {
            return $this->returnErrorData('กรุณาระบุ justification_type', 404);
        }
        if (!isset($request->circumstances_selection)) {
            return $this->returnErrorData('กรุณาระบุ circumstances_selection', 404);
        }
        if (!isset($request->rationale_selection)) {
            return $this->returnErrorData('กรุณาระบุ rationale_selection', 404);
        }

        // === แปลงวันที่จาก DD-MM-YYYY เป็น Y-m-d ตามสไตล์เดิม ===
        // POST: assessed_by_date ใช้ created_at หลัง save
        $verify_by_date         = $this->convertDMY($request->verify_by_date);
        $approved_by_date       = $this->convertDMY($request->approved_by_date);
        $acknowledged_by_date   = $this->convertDMY($request->acknowledged_by_date);

        // === แปลงค่า alternatives_considered เป็น boolean 0/1 แบบง่าย ๆ ===
        $alternatives_considered = null;
        if (isset($request->alternatives_considered)) {
            $val = $request->alternatives_considered;
            $alternatives_considered = in_array($val, ['1', 1, true, 'true', 'yes', 'y'], true) ? 1 : 0;
        }

        DB::beginTransaction();

        try {
            $Item = new SingleSourceJustification();

            // Basic Information
            $Item->sub_consultant_supplier_name = $request->sub_consultant_supplier_name;
            $Item->items_supplied               = $request->items_supplied;
            $Item->justification_type           = $request->justification_type;

            // Justification Details
            $Item->circumstances_selection      = $request->circumstances_selection;
            $Item->alternatives_considered      = $alternatives_considered;
            $Item->reason_no_alternatives       = $request->reason_no_alternatives;
            $Item->comments                     = $request->comments;
            $Item->rationale_selection          = $request->rationale_selection;

            // Assessed by (ADM / Purchase)
            $Item->assessed_by             = $request->assessed_by ?? null;
            $Item->assessed_by_status           = $request->assessed_by_status ?? null;
            $Item->verify_by                    = $request->verify_by ?? null;
            $Item->verify_by_date               = $verify_by_date;
            $Item->verify_by_status             = $request->verify_by_status ?? null;
            $Item->verify_by_comment            = $request->verify_by_comment ?? null;
            $Item->corresponding_po_no          = $request->corresponding_po_no;

            // Approved by (DI / MD)
            $Item->approved_by             = $request->approved_by ?? null;
            $Item->approved_by_date             = $approved_by_date;
            $Item->approved_by_status           = $request->approved_by_status ?? null;
            $Item->approved_by_comments         = $request->approved_by_comments;

            // Acknowledged by (IMR)
            $Item->acknowledged_by         = $request->acknowledged_by ?? null;
            $Item->acknowledged_by_date         = $acknowledged_by_date;
            $Item->acknowledged_by_status       = $request->acknowledged_by_status ?? null;
            $Item->acknowledged_by_comments     = $request->acknowledged_by_comments;

            // Verify by
            $Item->verify_by         = $request->verify_by ?? null;
            $Item->verify_by_status  = $request->verify_by_status ?? null;
            $verifyByDate            = $request->input('verify_by_date');
            $Item->verify_by_date    = ($verifyByDate === null || $verifyByDate === '') ? null : $this->normalizeDateTimeInput($verifyByDate);
            $Item->verify_by_comment = $request->verify_by_comment ?? null;

            $attachments = $request->input('attachments');
            $normalizedAttachments = $this->normalizeAttachments($attachments);
            $Item->attachments = $this->encodeAttachments($normalizedAttachments);

            // Standard fields
            $Item->create_by                    = $loginBy->employee_code ?? $loginBy->id ?? 'admin';

            $Item->save();

            $Item->assessed_by_date = $Item->created_at;
            $Item->timestamps = false;
            $Item->save();
            $Item->timestamps = true;

            $Item->attachments = $normalizedAttachments;

            $this->logDocumentCreateAudit($request, $Item);

            DB::commit();
            return $this->returnSuccess('บันทึกข้อมูลสำเร็จ', $Item);

        } catch (\Throwable $e) {

            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด ' . $e->getMessage(), 500);
        }
    }

    // =========================================================
    // update
    // =========================================================
    public function update(Request $request, $id)
    {
        $loginBy = $request->login_by;

        if (!isset($request->sub_consultant_supplier_name)) {
            return $this->returnErrorData('กรุณาระบุ sub_consultant_supplier_name', 404);
        }
        if (!isset($request->items_supplied)) {
            return $this->returnErrorData('กรุณาระบุ items_supplied', 404);
        }
        if (!isset($request->justification_type)) {
            return $this->returnErrorData('กรุณาระบุ justification_type', 404);
        }
        if (!isset($request->circumstances_selection)) {
            return $this->returnErrorData('กรุณาระบุ circumstances_selection', 404);
        }
        if (!isset($request->rationale_selection)) {
            return $this->returnErrorData('กรุณาระบุ rationale_selection', 404);
        }

        $assessed_by_date       = $this->convertDMY($request->assessed_by_date);
        $verify_by_date         = $this->convertDMY($request->verify_by_date);
        $approved_by_date       = $this->convertDMY($request->approved_by_date);
        $acknowledged_by_date   = $this->convertDMY($request->acknowledged_by_date);

        $alternatives_considered = null;
        if (isset($request->alternatives_considered)) {
            $val = $request->alternatives_considered;
            $alternatives_considered = in_array($val, ['1', 1, true, 'true', 'yes', 'y'], true) ? 1 : 0;
        }

        DB::beginTransaction();

        try {
            $Item = SingleSourceJustification::find($id);
            if (!$Item) {
                return $this->returnErrorData('ไม่พบข้อมูล', 404);
            }

            // Basic Information
            $Item->sub_consultant_supplier_name = $request->sub_consultant_supplier_name;
            $Item->items_supplied               = $request->items_supplied;
            $Item->justification_type           = $request->justification_type;

            // Justification Details
            $Item->circumstances_selection      = $request->circumstances_selection;
            $Item->alternatives_considered      = $alternatives_considered;
            $Item->reason_no_alternatives       = $request->reason_no_alternatives;
            $Item->comments                     = $request->comments;
            $Item->rationale_selection          = $request->rationale_selection;

            // Assessed by (ADM / Purchase)
            $Item->assessed_by             = $request->assessed_by;
            $Item->assessed_by_date             = $assessed_by_date;
            $Item->assessed_by_status           = $request->assessed_by_status ?? null;
            $Item->verify_by                    = $request->verify_by ?? null;
            $Item->verify_by_date               = $verify_by_date;
            $Item->verify_by_status             = $request->verify_by_status ?? null;
            $Item->verify_by_comment            = $request->verify_by_comment ?? null;
            $Item->corresponding_po_no          = $request->corresponding_po_no;

            // Approved by (DI / MD)
            $Item->approved_by             = $request->approved_by;
            $Item->approved_by_date             = $approved_by_date;
            $Item->approved_by_status           = $request->approved_by_status ?? null;
            $Item->approved_by_comments         = $request->approved_by_comments;

            // Acknowledged by (IMR)
            $Item->acknowledged_by         = $request->acknowledged_by;
            $Item->acknowledged_by_date         = $acknowledged_by_date;
            $Item->acknowledged_by_status       = $request->acknowledged_by_status ?? null;
            $Item->acknowledged_by_comments     = $request->acknowledged_by_comments;

            // Verify by
            $Item->verify_by         = $request->verify_by ?? null;
            $Item->verify_by_status  = $request->verify_by_status ?? null;
            $verifyByDate            = $request->input('verify_by_date');
            $Item->verify_by_date    = ($verifyByDate === null || $verifyByDate === '') ? null : $this->normalizeDateTimeInput($verifyByDate);
            $Item->verify_by_comment = $request->verify_by_comment ?? null;

            if ($request->has('attachments')) {
                $attachments = $request->input('attachments');
                $normalizedAttachments = $this->normalizeAttachments($attachments);
                $Item->attachments = $this->encodeAttachments($normalizedAttachments);
            }

            $Item->update_by                    = $loginBy->employee_code ?? $loginBy->id ?? 'admin';
            $Item->save();
            if (isset($normalizedAttachments)) {
                $Item->attachments = $normalizedAttachments;
            }

            DB::commit();
            return $this->returnUpdate('อัปเดตข้อมูลสำเร็จ', $Item);

        } catch (\Throwable $e) {

            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด ' . $e->getMessage(), 500);
        }
    }

    // =========================================================
    // destroy
    // =========================================================
    public function destroy($id, Request $request)
    {
        $loginBy = $request->login_by;

        if (!isset($id)) {
            return $this->returnErrorData('ไม่พบข้อมูล id', 404);
        }

        DB::beginTransaction();

        try {
            $Item = SingleSourceJustification::find($id);

            if (!$Item) {
                return $this->returnErrorData('ไม่พบข้อมูลในระบบ', 404);
            }

            $Item->delete();

            // log ตามสไตล์เดิม
            $userId      = $loginBy->employee_code ?? $loginBy->id ?? 'admin';
            $type        = 'ลบข้อมูล single_source_justifications';
            $description = 'ผู้ใช้งาน ' . $userId . ' ได้ทำการ ' . $type . ' #' . $Item->id;
            $this->Log($userId, $description, $type);

            DB::commit();
            return $this->returnSuccess('ลบข้อมูลสำเร็จ', []);

        } catch (\Throwable $e) {

            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง ' . $e->getMessage(), 500);
        }
    }

    // =========================================================
    // Convert DD-MM-YYYY -> Y-m-d (สไตล์เดิม)
    // =========================================================
    private function convertDMY($value)
    {
        if (empty($value)) {
            return null;
        }

        try {
            if (preg_match('/^\d{2}-\d{2}-\d{4}$/', $value)) {
                return Carbon::createFromFormat('d-m-Y', $value)->format('Y-m-d');
            }
        } catch (\Throwable $e) {
            // ถ้าแปลงไม่ได้ ใช้ค่าเดิม (กันระบบล้ม)
            return $value;
        }

        return $value;
    }
}
