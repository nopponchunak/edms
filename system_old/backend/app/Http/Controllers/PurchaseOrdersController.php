<?php

namespace App\Http\Controllers;

use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PurchaseController extends Controller
{
    // =========== getList ===========
    public function getList()
    {
        $Item = PurchaseOrder::orderBy('id', 'desc')->get()->toArray();

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
        $length  = $request->length ?? 10;
        $order   = $request->order;
        $search  = $request->search;
        $start   = $request->start ?? 0;
        $page    = $start / $length + 1;

        $col = array(
            'id',
            'po_no',
            'po_date',
            'requisition_date',
            'to',
            'company',
            'from',
            'quotation_no',
            'delivery_date',
            'payment_term',
            'create_by',
            'update_by',
            'created_at',
            'updated_at',
        );

        $orderby = array(
            '',
            'po_no',
            'po_date',
            'requisition_date',
            'to',
            'company',
            'from',
            'quotation_no',
            'delivery_date',
            'create_by',
        );

        $D = PurchaseOrder::select($col);

        // order by
        if (!empty($order) && ($orderby[$order[0]['column']] ?? false)) {
            $D->orderBy($orderby[$order[0]['column']], $order[0]['dir']);
        }

        // search all columns
        if (!empty($search['value'])) {
            $D->where(function ($query) use ($search, $col) {
                foreach ($col as $c) {
                    $query->orWhere($c, 'like', '%' . $search['value'] . '%');
                }
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
        $Item = PurchaseOrder::with('items')->find($id);

        if (!$Item) {
            return $this->returnErrorData('ไม่พบรายการที่ระบุ', 404);
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $Item);
    }

    // =========== store ===========
    public function store(Request $request)
    {
        $loginBy = $request->login_by;

        // validate field หลัก ๆ
        if (!isset($request->to)) {
            return $this->returnErrorData('กรุณาระบุ to', 404);
        }
        if (!isset($request->company)) {
            return $this->returnErrorData('กรุณาระบุ company', 404);
        }
        if (!isset($request->from)) {
            return $this->returnErrorData('กรุณาระบุ from', 404);
        }
        if (!isset($request->po_date)) {
            return $this->returnErrorData('กรุณาระบุ po_date', 404);
        }
        if (!isset($request->requisition_date)) {
            return $this->returnErrorData('กรุณาระบุ requisition_date', 404);
        }
        if (empty($request->items) || !is_array($request->items)) {
            return $this->returnErrorData('กรุณาระบุ items อย่างน้อย 1 รายการ', 404);
        }

        DB::beginTransaction();

        try {

            $Item = new PurchaseOrder();

            // Header
            $Item->to       = $request->to;
            $Item->company  = $request->company;
            $Item->fax      = $request->fax ?? null;
            $Item->from     = $request->from;
            $Item->cc       = $request->cc ?? null;

            // PO Info (ใช้ค่าที่ส่งมา ตรง ๆ)
            $Item->po_no            = $request->po_no ?? null;
            $Item->po_date          = $request->po_date;
            $Item->requisition_date = $request->requisition_date;
            $Item->page             = $request->page ?? 1;
            $Item->total_page       = $request->total_page ?? 1;
            $Item->circ             = $request->circ ?? null;

            // General
            $Item->quotation_no     = $request->quotation_no ?? null;
            $Item->quotation_date   = $request->quotation_date;
            $Item->delivery_date    = $request->delivery_date;
            $Item->payment_term     = $request->payment_term ?? null;
            $Item->other_conditions = $request->other_conditions ?? null;

            // Approval & Review
            $Item->purchase_request_by   = $request->purchase_request_by ?? null;
            $Item->purchase_request_date = $request->purchase_request_date;
            $Item->verified_by           = $request->verified_by ?? null;
            $Item->verified_date         = $request->verified_date;
            $Item->approved_by           = $request->approved_by ?? null;
            $Item->approved_date         = $request->approved_date;

            // Checklist
            $Item->delivery_on_time          = $request->delivery_on_time ?? null;
            $Item->meet_quality_requirement  = $request->meet_quality_requirement ?? null;
            $Item->meet_equipment_guidelines = $request->meet_equipment_guidelines ?? null;

            // Comments & Signatures
            $Item->comments          = $request->comments ?? null;
            $Item->signed_by         = $request->signed_by ?? null;
            $Item->signed_date       = $request->signed_date;
            $Item->acknowledged_by   = $request->acknowledged_by ?? null;
            $Item->acknowledged_date = $request->acknowledged_date;

            $Item->create_by = $loginBy->id ?? 'admin';
            $Item->save();

            // Items
            foreach ($request->items as $row) {
                if (empty($row['item']) && empty($row['description'])) {
                    continue;
                }

                $qty   = isset($row['quantity']) ? (int)$row['quantity'] : 0;
                $price = isset($row['unit_price']) ? (float)$row['unit_price'] : 0;
                $amt   = isset($row['amount']) ? (float)$row['amount'] : $qty * $price;

                $detail                    = new PurchaseOrderItem();
                $detail->purchase_order_id = $Item->id;
                $detail->item              = $row['item'] ?? '';
                $detail->description       = $row['description'] ?? null;
                $detail->quantity          = $qty;
                $detail->unit_price        = $price;
                $detail->amount            = $amt;
                $detail->save();
            }

            DB::commit();
            return $this->returnSuccess('บันทึกข้อมูลสำเร็จ', $Item->load('items'));

        } catch (\Throwable $e) {

            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด ' . $e->getMessage(), 500);
        }
    }

    // =========== update ===========
    public function update(Request $request, $id)
    {
        $loginBy = $request->login_by;

        if (!isset($request->to)) {
            return $this->returnErrorData('กรุณาระบุ to', 404);
        }
        if (!isset($request->company)) {
            return $this->returnErrorData('กรุณาระบุ company', 404);
        }
        if (!isset($request->from)) {
            return $this->returnErrorData('กรุณาระบุ from', 404);
        }
        if (!isset($request->po_date)) {
            return $this->returnErrorData('กรุณาระบุ po_date', 404);
        }
        if (!isset($request->requisition_date)) {
            return $this->returnErrorData('กรุณาระบุ requisition_date', 404);
        }
        if (empty($request->items) || !is_array($request->items)) {
            return $this->returnErrorData('กรุณาระบุ items อย่างน้อย 1 รายการ', 404);
        }

        DB::beginTransaction();

        try {

            $Item = PurchaseOrder::find($id);
            if (!$Item) {
                return $this->returnErrorData('ไม่พบข้อมูลที่ต้องการแก้ไข', 404);
            }

            // Header
            $Item->to       = $request->to;
            $Item->company  = $request->company;
            $Item->fax      = $request->fax ?? null;
            $Item->from     = $request->from;
            $Item->cc       = $request->cc ?? null;

            // PO Info
            $Item->po_no            = $request->po_no ?? null;
            $Item->po_date          = $request->po_date;
            $Item->requisition_date = $request->requisition_date;
            $Item->page             = $request->page ?? 1;
            $Item->total_page       = $request->total_page ?? 1;
            $Item->circ             = $request->circ ?? null;

            // General
            $Item->quotation_no     = $request->quotation_no ?? null;
            $Item->quotation_date   = $request->quotation_date;
            $Item->delivery_date    = $request->delivery_date;
            $Item->payment_term     = $request->payment_term ?? null;
            $Item->other_conditions = $request->other_conditions ?? null;

            // Approval & Review
            $Item->purchase_request_by   = $request->purchase_request_by ?? null;
            $Item->purchase_request_date = $request->purchase_request_date;
            $Item->verified_by           = $request->verified_by ?? null;
            $Item->verified_date         = $request->verified_date;
            $Item->approved_by           = $request->approved_by ?? null;
            $Item->approved_date         = $request->approved_date;

            // Checklist
            $Item->delivery_on_time          = $request->delivery_on_time ?? null;
            $Item->meet_quality_requirement  = $request->meet_quality_requirement ?? null;
            $Item->meet_equipment_guidelines = $request->meet_equipment_guidelines ?? null;

            // Comments & Signatures
            $Item->comments          = $request->comments ?? null;
            $Item->signed_by         = $request->signed_by ?? null;
            $Item->signed_date       = $request->signed_date;
            $Item->acknowledged_by   = $request->acknowledged_by ?? null;
            $Item->acknowledged_date = $request->acknowledged_date;

            $Item->update_by = $loginBy->id ?? 'admin';
            $Item->save();

            // ลบ items เดิมแล้วสร้างใหม่
            PurchaseOrderItem::where('purchase_order_id', $Item->id)->delete();

            foreach ($request->items as $row) {
                if (empty($row['item']) && empty($row['description'])) {
                    continue;
                }

                $qty   = isset($row['quantity']) ? (int)$row['quantity'] : 0;
                $price = isset($row['unit_price']) ? (float)$row['unit_price'] : 0;
                $amt   = isset($row['amount']) ? (float)$row['amount'] : $qty * $price;

                $detail                    = new PurchaseOrderItem();
                $detail->purchase_order_id = $Item->id;
                $detail->item              = $row['item'] ?? '';
                $detail->description       = $row['description'] ?? null;
                $detail->quantity          = $qty;
                $detail->unit_price        = $price;
                $detail->amount            = $amt;
                $detail->save();
            }

            DB::commit();
            return $this->returnUpdate('อัปเดตข้อมูลสำเร็จ', $Item->load('items'));

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

            $Item = PurchaseOrder::find($id);
            if (!$Item) {
                return $this->returnErrorData('ไม่พบข้อมูลในระบบ', 404);
            }

            $Item->delete();

            // log
            $userId      = $loginBy->id ?? 'admin';
            $type        = 'ลบข้อมูล purchase_order';
            $description = 'ผู้ใช้งาน ' . $userId . ' ได้ทำการ ' . $type . ' #' . $Item->id;
            $this->Log($userId, $description, $type);

            DB::commit();
            return $this->returnSuccess('ลบข้อมูลสำเร็จ', []);

        } catch (\Throwable $e) {

            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง ' . $e->getMessage(), 500);
        }
    }
}
