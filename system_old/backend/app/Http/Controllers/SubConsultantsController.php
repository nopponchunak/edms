<?php

namespace App\Http\Controllers;

use App\Models\SubConsultants;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SubConsultantsController extends Controller
{
    // =========== getList ===========
    public function getList()
    {
        $Item = SubConsultants::orderBy('id', 'desc')->get()->toArray();

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
            'type',
            'name',
            'address',
            'phone',
            'email',
            'contact_person',
            'status',
            'create_by',
            'update_by',
            'created_at',
            'updated_at',
        );

        // DataTables column index -> DB field
        $orderby = array(
            'id',
            'name',
            'type',
            'status',
            'created_at',
        );

        $D = SubConsultants::select($col);

        // filter status
        if (isset($Status) && $Status !== '') {
            $D->where('status', $Status);
        }

        // order
        if ($orderby[$order[0]['column']] ?? false) {
            $D->orderBy($orderby[$order[0]['column']], $order[0]['dir']);
        } else {
            $D->orderBy('id', 'desc');
        }

        // search
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
        $Item = SubConsultants::find($id);

        if (!$Item) {
            return $this->returnErrorData('ไม่พบรายการที่ระบุ', 404);
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $Item);
    }

    // =========== store ===========
    public function store(Request $request)
    {
        $loginBy = $request->login_by;

        // validate (required)
        if (!isset($request->type)) {
            return $this->returnErrorData('กรุณาระบุประเภท (type)', 404);
        }
        if (!isset($request->name)) {
            return $this->returnErrorData('กรุณาระบุชื่อ (name)', 404);
        }

        // validate status (optional แต่ถ้ามีต้องถูกต้อง)
        if (isset($request->status) && !in_array($request->status, ['Active', 'Inactive'])) {
            return $this->returnErrorData('สถานะไม่ถูกต้อง (status ต้องเป็น Active หรือ Inactive)', 404);
        }

        DB::beginTransaction();

        try {

            $Item = new SubConsultants();

            $Item->type           = $request->type;
            $Item->name           = $request->name;

            $Item->address        = $request->address ?? null;
            $Item->phone          = $request->phone ?? null;
            $Item->email          = $request->email ?? null;
            $Item->contact_person = $request->contact_person ?? null;

            $Item->status         = $request->status ?? 'Active';

            // create_by เป็น integer -> ถ้าไม่มี login ให้เป็น null
            $Item->create_by      = $loginBy->id ?? null;

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

        // validate (required)
        if (!isset($request->type)) {
            return $this->returnErrorData('กรุณาระบุประเภท (type)', 404);
        }
        if (!isset($request->name)) {
            return $this->returnErrorData('กรุณาระบุชื่อ (name)', 404);
        }

        if (isset($request->status) && !in_array($request->status, ['Active', 'Inactive'])) {
            return $this->returnErrorData('สถานะไม่ถูกต้อง (status ต้องเป็น Active หรือ Inactive)', 404);
        }

        DB::beginTransaction();

        try {

            $Item = SubConsultants::find($id);

            if (!$Item) {
                return $this->returnErrorData('ไม่พบข้อมูลที่ต้องการแก้ไข', 404);
            }

            $Item->type           = $request->type;
            $Item->name           = $request->name;

            $Item->address        = $request->address ?? null;
            $Item->phone          = $request->phone ?? null;
            $Item->email          = $request->email ?? null;
            $Item->contact_person = $request->contact_person ?? null;

            $Item->status         = $request->status ?? $Item->status;

            // update_by เป็น integer -> ถ้าไม่มี login ให้เป็น null
            $Item->update_by      = $loginBy->id ?? null;

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

            $Item = SubConsultants::find($id);
            if (!$Item) {
                return $this->returnErrorData('ไม่พบข้อมูลในระบบ', 404);
            }

            $Item->delete();

            // log
            $userId      = $loginBy->id ?? null;
            $type        = 'ลบ Sub-consultant';
            $description = 'ผู้ใช้งาน ' . ($userId ?? '-') . ' ได้ทำการ ' . $type . ' #' . $Item->id;
            $this->Log($userId ?? '-', $description, $type);

            DB::commit();

            return $this->returnSuccess('ลบข้อมูลสำเร็จ', []);

        } catch (\Throwable $e) {

            DB::rollback();
            return $this->returnErrorData('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง ' . $e->getMessage(), 500);
        }
    }
}
