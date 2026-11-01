<?php

namespace App\Http\Controllers;

use App\Models\CharitableContribution;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class OrderPurchaseController extends Controller
{
    // =========== getList ===========
    public function getList()
    {
        $Item = CharitableContribution::orderBy('id', 'desc')->get()->toArray();

        if (!empty($Item)) {
            for ($i = 0; $i < count($Item); $i++) {
                $Item[$i]['No'] = $i + 1;
            }
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $Item);
    }

    // =========== getPage (DataTables style) ===========
    public function getPage(Request $request)
    {
        $columns = $request->columns;
        $length  = $request->length;
        $order   = $request->order;
        $search  = $request->search;
        $start   = $request->start;
        $page    = $start / $length + 1;

        $Status  = $request->status;

        $col = array(
            'id',
            'request_type',
            'event_description',
            'event_purpose',
            'organizer_name',
            'value_amount',
            'proposed_date',
            'vat_amount',
            'status',
            'create_by',
            'update_by',
            'created_at',
            'updated_at',
        );

        $orderby = array(
            '',
            'request_type',
            'organizer_name',
            'value_amount',
            'proposed_date',
            'status',
            'create_by',
        );

        $D = CharitableContribution::select($col);

        if (isset($Status)) {
            $D->where('status', $Status);
        }

        if ($orderby[$order[0]['column']] ?? false) {
            $D->orderBy($orderby[$order[0]['column']], $order[0]['dir']);
        }

        if ($search['value'] != '' && $search['value'] != null) {

            $D->where(function ($query) use ($search, $col) {

                $query->orWhere(function ($query) use ($search, $col) {
                    foreach ($col as &$c) {
                        $query->orWhere($c, 'like', '%' . $search['value'] . '%');
                    }
                });

            });
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

    // =========== show ===========
    public function show($id)
    {
        $Item = CharitableContribution::find($id);

        if (!$Item) {
            return $this->returnErrorData('ไม่พบรายการที่ระบุ', 404);
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $Item);
    }

    // =========== store ===========
    public function store(Request $request)
    {
        $loginBy = $request->login_by;

        // validate
        if (!isset($request->request_type)) {
            return $this->returnErrorData('กรุณาระบุประเภทคำขอ (request_type)', 404);
        }
        if (!isset($request->organizer_name)) {
            return $this->returnErrorData('กรุณาระบุชื่อผู้จัดงาน (organizer_name)', 404);
        }
        if (!isset($request->value_amount)) {
            return $this->returnErrorData('กรุณาระบุมูลค่า (value_amount)', 404);
        }
        if (!isset($request->proposed_date)) {
            return $this->returnErrorData('กรุณาระบุวันที่เสนอ (proposed_date)', 404);
        }

        DB::beginTransaction();

        try {

            $Item = new CharitableContribution();
            $Item->request_type             = $request->request_type;
            $Item->event_description        = $request->event_description ?? null;
            $Item->event_purpose            = $request->event_purpose ?? null;
            $Item->organizer_name           = $request->organizer_name;
            $Item->contribution_description = $request->contribution_description ?? null;

            $Item->value_amount             = $request->value_amount ?? 0;
            $Item->vat_amount               = $request->vat_amount ?? 0;
            $Item->proposed_date            = $request->proposed_date;

            $Item->acsc_id                  = $request->acsc_id ?? null;
            $Item->acsl_id                  = $request->acsl_id ?? null;
            $Item->approver_id              = $request->approver_id ?? null;

            $Item->status                   = $request->status ?? 'pending';
            $Item->create_by                = $loginBy->id ?? 'admin';

            $Item->save();

            DB::commit();
            return $this->returnSuccess('บันทึกข้อมูลสำเร็จ', $Item);

        } catch (\Throwable $e) {

            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด ' . $e->getMessage(), 500);
        }
    }

    // =========== update ===========
    public function update(Request $request, $id)
    {
        $loginBy = $request->login_by;

        // ===== Validate Minimal Required Fields =====
        if (!isset($request->request_type)) {
            return $this->returnErrorData('กรุณาระบุประเภทคำขอ (request_type)', 404);
        }
        if (!isset($request->organizer_name)) {
            return $this->returnErrorData('กรุณาระบุชื่อผู้จัดงาน (organizer_name)', 404);
        }
        if (!isset($request->value_amount)) {
            return $this->returnErrorData('กรุณาระบุมูลค่า (value_amount)', 404);
        }
        if (!isset($request->proposed_date)) {
            return $this->returnErrorData('กรุณาระบุวันที่เสนอ (proposed_date)', 404);
        }

        DB::beginTransaction();

        try {

            $Item = CharitableContribution::find($id);

            if (!$Item) {
                return $this->returnErrorData('ไม่พบข้อมูลที่ต้องการแก้ไข', 404);
            }

            // ===== Update Fields =====
            $Item->request_type             = $request->request_type;
            $Item->event_description        = $request->event_description ?? null;
            $Item->event_purpose            = $request->event_purpose ?? null;
            $Item->organizer_name           = $request->organizer_name;
            $Item->contribution_description = $request->contribution_description ?? null;

            $Item->value_amount             = $request->value_amount ?? 0;
            $Item->vat_amount               = $request->vat_amount ?? 0;
            $Item->proposed_date            = $request->proposed_date;

            $Item->acsc_id                  = $request->acsc_id ?? null;
            $Item->acsl_id                  = $request->acsl_id ?? null;
            $Item->approver_id              = $request->approver_id ?? null;

            $Item->status                   = $request->status ?? $Item->status;
            $Item->update_by                = $loginBy->id ?? 'admin';

            $Item->save();

            DB::commit();
            return $this->returnUpdate('อัปเดตข้อมูลสำเร็จ', $Item);

        } catch (\Throwable $e) {

            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด ' . $e->getMessage(), 500);
        }
    }


    // =========== destroy ===========
    public function destroy($id, Request $request)
    {
        $loginBy = $request->login_by;

        if (!isset($id)) {
            return $this->returnErrorData('ไม่พบข้อมูล id', 404);
        }

        DB::beginTransaction();
        try {

            $Item = CharitableContribution::find($id);
            if (!$Item) {
                return $this->returnErrorData('ไม่พบข้อมูลในระบบ', 404);
            }

            $Item->delete();

            // log
            $userId      = $loginBy->id ?? 'admin';
            $type        = 'ลบคำขอสนับสนุนการกุศล';
            $description = 'ผู้ใช้งาน ' . $userId . ' ได้ทำการ ' . $type . ' #' . $Item->id;
            $this->Log($userId, $description, $type);

            DB::commit();

            return $this->returnSuccess('ลบข้อมูลสำเร็จ', []);

        } catch (\Throwable $e) {

            DB::rollback();
            return $this->returnErrorData('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง ' . $e->getMessage(), 500);
        }
    }
}
