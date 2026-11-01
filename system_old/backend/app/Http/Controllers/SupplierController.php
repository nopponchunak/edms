<?php

namespace App\Http\Controllers;

use App\Models\Supplier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SupplierController extends Controller
{
    // =========== getList ===========
    public function getList()
    {
        $Item = Supplier::orderBy('id', 'desc')->get()->toArray();

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
        $length  = (int) ($request->length ?? 10);
        if ($length <= 0 || $length > 10000) {
            $length = 100;
        }
        $order   = $request->order;
        $search  = $request->search;
        $start   = max(0, (int) ($request->start ?? 0));
        $page    = (int) floor($start / $length) + 1;

        $Status  = $request->status;

        $col = array(
            'id',
            'type',
            'name',
            'status',
            'address',
            'phone',
            'email',
            'contact_person',
            'create_by',
            'update_by',
            'created_at',
            'updated_at',
        );

        $orderby = array(
            'id',
            'type',
            'name',
            'status',
            'address',
            'phone',
            'email',
            'contact_person',
            'created_at',
        );

        $D = Supplier::select($col);

        // filter status
        if (isset($Status) && $Status !== '') {
            $D->where('status', $Status);
        }

        // order
        $orderColumnIndex = $order[0]['column'] ?? null;
        if ($orderColumnIndex !== null && ($orderby[$orderColumnIndex] ?? false)) {
            $orderColumn = $orderby[$orderColumnIndex];
            $orderDirection = strtolower((string) ($order[0]['dir'] ?? 'asc')) === 'desc' ? 'desc' : 'asc';
            $D->orderBy($orderColumn, $orderDirection);
            if ($orderColumn !== 'id') {
                $D->orderBy('id', 'desc');
            }
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
        $Item = Supplier::find($id);

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
        if (!isset($request->type)) {
            return $this->returnErrorData('กรุณาระบุ Supplier Type (type)', 404);
        }
        if (!isset($request->name)) {
            return $this->returnErrorData('กรุณาระบุ Supplier Name (name)', 404);
        }

        if (isset($request->status) && !in_array($request->status, ['Active', 'Inactive'])) {
            return $this->returnErrorData('สถานะไม่ถูกต้อง (status ต้องเป็น Active หรือ Inactive)', 404);
        }

        DB::beginTransaction();

        try {

            $Item = new Supplier();

            $Item->type           = $request->type;
            $Item->name           = $request->name;

            $Item->status         = $request->status ?? 'Active';

            $Item->address        = $request->address ?? null;
            $Item->phone          = $request->phone ?? null;
            $Item->email          = $request->email ?? null;
            $Item->contact_person = $request->contact_person ?? null;

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

        // validate
        if (!isset($request->type)) {
            return $this->returnErrorData('กรุณาระบุ Supplier Type (type)', 404);
        }
        if (!isset($request->name)) {
            return $this->returnErrorData('กรุณาระบุ Supplier Name (name)', 404);
        }

        if (isset($request->status) && !in_array($request->status, ['Active', 'Inactive'])) {
            return $this->returnErrorData('สถานะไม่ถูกต้อง (status ต้องเป็น Active หรือ Inactive)', 404);
        }

        DB::beginTransaction();

        try {

            $Item = Supplier::find($id);

            if (!$Item) {
                return $this->returnErrorData('ไม่พบข้อมูลที่ต้องการแก้ไข', 404);
            }

            $Item->type           = $request->type;
            $Item->name           = $request->name;

            $Item->status         = $request->status ?? $Item->status;

            $Item->address        = $request->address ?? null;
            $Item->phone          = $request->phone ?? null;
            $Item->email          = $request->email ?? null;
            $Item->contact_person = $request->contact_person ?? null;

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

            $Item = Supplier::find($id);
            if (!$Item) {
                return $this->returnErrorData('ไม่พบข้อมูลในระบบ', 404);
            }

            $Item->delete();

            // log
            $userId      = $loginBy->id ?? null;
            $type        = 'ลบ Supplier';
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
