<?php

namespace App\Http\Controllers;

use App\Models\SupplierEvaluation;
use App\Models\SupplierEvaluationItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SupplierEvaluationController extends Controller
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

    // -----------------------------------------
    // GET LIST (ไม่มี paginate)
    // -----------------------------------------
    public function getList(Request $request)
    {
        $Items = SupplierEvaluation::orderBy('id', 'desc')->get();
        return $this->returnSuccess('Success', $Items);
    }

    // -----------------------------------------
    // GET PAGE (มี paginate)
    // -----------------------------------------
    public function getPage(Request $request)
    {
        $columns = $request->columns;
        $length  = $request->length;
        $order   = $request->order;
        $search  = $request->search;
        $start   = $request->start;
        $page    = $start / ($length ?: 10) + 1;

        // filter เพิ่มเติมถ้ามี เช่น decision
        $Decision = $request->decision;

        $col = [
            'id',
            'supplier_name',
            'project_name',
            'project_no',
            'department_value_duration',
            'average_rating',
            'decision',
            'attachments',
            'evaluated_by',
            'evaluated_by_date',
            'evaluated_by_status',
            'acknowledged_by',
            'acknowledged_by_date',
            'acknowledged_by_status',
            'approved_by',
            'approved_by_date',
            'approved_by_status',
            'create_by',
            'update_by',
            'created_at',
            'updated_at',
        ];

        $orderby = [
            'supplier_name',
            'project_name',
            'average_rating',
            'evaluated_by',
            'created_at',
            'updated_at',
            'acknowledged_by_status',
        ];

        $D = SupplierEvaluation::select($col);

        // filter decision (ถ้ามี)
        if (!empty($Decision)) {
            $D->where('decision', $Decision);
        }

        // sort (กันเคส column = 0 ไม่ให้สั่ง orderBy ค่าว่าง)
        if (!empty($order) && ($orderby[$order[0]['column']] ?? false)) {
            $D->orderBy($orderby[$order[0]['column']], $order[0]['dir']);
        }

        // search
        if (!empty($search['value'])) {
            $D->where(function ($query) use ($search, $col) {
                foreach ($col as $c) {
                    $query->orWhere($c, 'like', '%' . $search['value'] . '%');
                }
            });
        }

        if (!$length || (int)$length <= 0) {
            $length = 10;
        }

        $d = $D->paginate($length, ['*'], 'page', $page);

        // เติมเลขลำดับ No เหมือนที่คุณใช้ตลอด
        if ($d->isNotEmpty()) {
            $No = (($page - 1) * $length);
            for ($i = 0; $i < count($d); $i++) {
                $No        = $No + 1;
                $d[$i]->No = $No;
            }
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $d);
    }



    // -----------------------------------------
    // SHOW
    // -----------------------------------------
    public function show($id)
    {
        $Item = SupplierEvaluation::with(['items'])->find($id);

        if (!$Item) {
            return $this->returnErrorData('ไม่พบข้อมูล', 404);
        }

        return $this->returnSuccess('Success', $Item);
    }

    // -----------------------------------------
    // STORE (สร้างใหม่)
    // -----------------------------------------
    public function store(Request $request)
    {
        DB::beginTransaction();

        try {

            $Item = new SupplierEvaluation();
            $Item->supplier_name                = $request->supplier_name;
            $Item->project_name                 = $request->project_name;
            $Item->project_no                   = $request->project_no;
            $Item->department_value_duration    = $request->department_value_duration;
            $Item->anti_corruption_flag         = $request->anti_corruption_flag;
            $Item->average_rating               = $request->average_rating;
            $Item->decision                     = $request->decision;

            // POST: evaluated_by_date = created_at หลัง save
            $Item->evaluated_by                  = $request->evaluated_by ?? null;
            $Item->evaluated_by_status           = $request->evaluated_by_status ?? null;
            $Item->acknowledged_by              = $request->acknowledged_by ?? null;
            $Item->acknowledged_by_date         = $this->normalizeDateTimeInput($request->acknowledged_by_date ?? null);
            $Item->acknowledged_by_status       = $request->acknowledged_by_status ?? null;
            $Item->approved_by              = $request->approved_by ?? null;
            $Item->approved_by_date         = $this->normalizeDateTimeInput($request->approved_by_date ?? null);
            $Item->approved_by_status       = $request->approved_by_status ?? null;

            $attachments = $request->input('attachments');
            $normalizedAttachments = $this->normalizeAttachments($attachments);
            $Item->attachments = $this->encodeAttachments($normalizedAttachments);

            $Item->create_by = $request->login_by->employee_code ?? $request->login_by->id ?? 'admin';
            $Item->save();

            $Item->evaluated_by_date = $Item->created_at;
            $Item->timestamps = false;
            $Item->save();
            $Item->timestamps = true;

            $Item->attachments = $normalizedAttachments;

            // ----------------------
            // Save items (8 ข้อ)
            // ----------------------
            if (isset($request->items) && is_array($request->items)) {
                foreach ($request->items as $row) {
                    $detail = new SupplierEvaluationItem();
                    $detail->supplier_evaluation_id = $Item->id;
                    $detail->item_name              = $row['item_name'];
                    $detail->rating                 = $row['rating'] ?? 0;
                    $detail->comment                = $row['comment'] ?? null;
                    $detail->create_by              = $request->login_by->employee_code ?? $request->login_by->id ?? 'admin';
                    $detail->save();
                }
            }

            $this->logDocumentCreateAudit($request, $Item);

            DB::commit();
            return $this->returnSuccess('บันทึกข้อมูลสำเร็จ', $Item);

        } catch (\Exception $e) {
            DB::rollBack();
            return $this->returnErrorData($e->getMessage(), 500);
        }
    }

    // -----------------------------------------
    // UPDATE
    // -----------------------------------------
    public function update(Request $request, $id)
    {
        DB::beginTransaction();

        try {
            $Item = SupplierEvaluation::find($id);

            if (!$Item) {
                return $this->returnErrorData('ไม่พบข้อมูล', 404);
            }

            $Item->supplier_name                = $request->supplier_name;
            $Item->project_name                 = $request->project_name;
            $Item->project_no                   = $request->project_no;
            $Item->department_value_duration    = $request->department_value_duration;
            $Item->anti_corruption_flag         = $request->anti_corruption_flag;
            $Item->average_rating               = $request->average_rating;
            $Item->decision                     = $request->decision;

            $Item->evaluated_by                  = $request->evaluated_by ?? null;
            $Item->evaluated_by_date             = $this->normalizeDateTimeInput($request->evaluated_by_date ?? null);
            $Item->evaluated_by_status           = $request->evaluated_by_status ?? null;
            $Item->acknowledged_by              = $request->acknowledged_by ?? null;
            $Item->acknowledged_by_date         = $this->normalizeDateTimeInput($request->acknowledged_by_date ?? null);
            $Item->acknowledged_by_status       = $request->acknowledged_by_status ?? null;
            $Item->approved_by              = $request->approved_by ?? null;
            $Item->approved_by_date         = $this->normalizeDateTimeInput($request->approved_by_date ?? null);
            $Item->approved_by_status       = $request->approved_by_status ?? null;

            if ($request->has('attachments')) {
                $attachments = $request->input('attachments');
                $normalizedAttachments = $this->normalizeAttachments($attachments);
                $Item->attachments = $this->encodeAttachments($normalizedAttachments);
            }

            $Item->update_by = $request->login_by->employee_code ?? $request->login_by->id ?? 'admin';
            $Item->save();
            if (isset($normalizedAttachments)) {
                $Item->attachments = $normalizedAttachments;
            }

            // ล้างของเก่า
            SupplierEvaluationItem::where('supplier_evaluation_id', $Item->id)->delete();

            // เพิ่มชุดใหม่
            if (isset($request->items)) {
                foreach ($request->items as $row) {
                    $detail = new SupplierEvaluationItem();
                    $detail->supplier_evaluation_id = $Item->id;
                    $detail->item_name              = $row['item_name'];
                    $detail->rating                 = $row['rating'];
                    $detail->comment                = $row['comment'];
                    $detail->create_by              = $request->login_by->employee_code ?? $request->login_by->id ?? 'admin';
                    $detail->save();
                }
            }

            DB::commit();
            return $this->returnUpdate('อัปเดตข้อมูลสำเร็จ');

        } catch (\Exception $e) {
            DB::rollBack();
            return $this->returnErrorData($e->getMessage(), 500);
        }
    }

    // -----------------------------------------
    // DELETE
    // -----------------------------------------
    public function destroy($id)
    {
        $Item = SupplierEvaluation::find($id);

        if (!$Item) {
            return $this->returnErrorData('ไม่พบข้อมูล', 404);
        }

        $Item->delete();

        return $this->returnSuccess('ลบข้อมูลสำเร็จ');
    }
}
