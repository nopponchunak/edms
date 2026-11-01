<?php

namespace App\Http\Controllers;

use App\Models\GiftHospitality;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class GiftHospitalityController extends Controller
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

    private function encodeAttachments($normalized)
    {
        if (empty($normalized)) {
            return null;
        }

        return json_encode($normalized, JSON_UNESCAPED_UNICODE);
    }

    // =========== getList ===========
    public function getList()
    {
        $Item = GiftHospitality::orderBy('id', 'desc')->get()->toArray();

        if (!empty($Item)) {
            foreach ($Item as $i => $row) {
                $Item[$i]['No'] = $i + 1;
            }
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $Item);
    }

    // =========== getPage ===========
    public function getPage(Request $request)
    {
        $columns = $request->columns;
        $length  = $request->length;
        $order   = $request->order;
        $search  = $request->search;
        $start   = $request->start;
        $page    = $start / $length + 1;

        $RequestType = $request->request_type;

        $col = [
            'id',
            'request_type',
            'description',
            'purpose',
            'value',
            'company_of_giver',
            'proposed_date',
            'mtl_receiving_staff_by',
            'mtl_receiving_staff_by_date',
            'mtl_receiving_staff_by_status',
            'verified_by',
            'verified_by_date',
            'verified_by_status',
            'acknowledged_by',
            'acknowledged_by_date',
            'acknowledged_by_status',
            'approved_by',
            'approved_by_date',
            'approved_by_status',
            'ims_acknowledged_by',
            'ims_acknowledged_by_date',
            'ims_acknowledged_by_status',
            'attachments',
            'create_by',
            'update_by',
            'created_at',
            'updated_at',
        ];

        $orderby = [
            'description',
            'company_of_giver',
            'request_type',
            'value',
            'proposed_date',
            'created_at',
            'approved_by_status',
        ];

        $D = GiftHospitality::select($col);

        if (!empty($RequestType)) {
            $D->where('request_type', $RequestType);
        }

        // order
        if ($orderby[$order[0]['column']] ?? false) {
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

        $d = $D->paginate($length, ['*'], 'page', $page);

        if ($d->isNotEmpty()) {
            $No = (($page - 1) * $length);
            foreach ($d as $i => $row) {
                $No++;
                $d[$i]->No = $No;
            }
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $d);
    }

    // =========== show ===========
    public function show($id)
    {
        $Item = GiftHospitality::find($id);

        if (!$Item) {
            return $this->returnErrorData('ไม่พบรายการที่ระบุ', 404);
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $Item);
    }

    private function workflowAssignmentError(Request $request): ?string
    {
        $committeeFields = [
            'verified_by' => 'ACSC',
            'ims_acknowledged_by' => 'ACSL',
        ];

        foreach ($committeeFields as $field => $committeeName) {
            $code = trim((string) $request->input($field));
            if ($code === '') {
                return $committeeName . ' assignee is required.';
            }

            $isMember = DB::table('committee_employees')
                ->join('committees', 'committees.id', '=', 'committee_employees.committee_id')
                ->join('employees', 'employees.code', '=', 'committee_employees.employee_code')
                ->whereRaw('UPPER(TRIM(committees.name)) = ?', [$committeeName])
                ->where('employees.code', $code)
                ->whereNull('committee_employees.deleted_at')
                ->whereNull('committees.deleted_at')
                ->whereNull('employees.deleted_at')
                ->exists();

            if (!$isMember) {
                return $committeeName . ' assignee must be selected from Committee Setting.';
            }
        }

        $approver = trim((string) $request->input('approved_by'));
        if ($approver === '' || !DB::table('employees')->where('code', $approver)
            ->whereNull('deleted_at')
            ->whereIn(DB::raw('UPPER(TRIM(level_name))'), ['TL', 'DI', 'MD'])
            ->exists()) {
            return 'Approver must be an active TL, DI, or MD employee.';
        }

        $accountsAcknowledger = trim((string) $request->input('acknowledged_by'));
        if ($accountsAcknowledger === '' || !DB::table('employees')->where('code', $accountsAcknowledger)
            ->whereNull('deleted_at')
            ->whereRaw('UPPER(TRIM(initial)) = ?', ['JN'])
            ->exists()) {
            return 'Accounts acknowledger must be the employee with initial JN.';
        }

        return null;
    }

    private function workflowAssignmentErrorResponse(string $message)
    {
        return response()->json([
            'code' => '422',
            'status' => false,
            'message' => $message,
            'data' => [],
        ], 422);
    }

    // =========== store ===========
    public function store(Request $request)
    {
        $loginBy = $request->login_by;
        $actorCode = $loginBy->employee_code ?? $loginBy->id ?? 'admin';
        $requestedBy = $this->resolveRequestedEmployeeCode($request, (string) $actorCode);
        if ($requestedBy === null) {
            return $this->returnErrorData('Invalid requester employee code', 422);
        }

        // Validate snake_case
        if (!isset($request->request_type)) {
            return $this->returnErrorData('กรุณาระบุ request_type', 404);
        }
        if (!isset($request->description)) {
            return $this->returnErrorData('กรุณาระบุ description', 404);
        }
        if (!isset($request->purpose)) {
            return $this->returnErrorData('กรุณาระบุ purpose', 404);
        }
        if (!isset($request->value)) {
            return $this->returnErrorData('กรุณาระบุ value', 404);
        }
        if (!isset($request->company_of_giver)) {
            return $this->returnErrorData('กรุณาระบุ company_of_giver', 404);
        }
        if (!isset($request->proposed_date)) {
            return $this->returnErrorData('กรุณาระบุ proposed_date', 404);
        }
        if ($assignmentError = $this->workflowAssignmentError($request)) {
            return $this->workflowAssignmentErrorResponse($assignmentError);
        }


        DB::beginTransaction();

        try {

            $Item = new GiftHospitality();
            $Item->request_type           = $request->request_type;
            $Item->description            = $request->description;
            $Item->purpose                = $request->purpose;
            $Item->value                  = $request->value;

            $Item->company_of_giver       = $request->company_of_giver;
            $Item->proposed_date          = $this->normalizeDateTimeInput($request->proposed_date);
            $Item->mtl_receiving_staff_by    = $request->mtl_receiving_staff_by ?? null;
            $Item->mtl_receiving_staff_by_date    = null;
            $Item->mtl_receiving_staff_by_status  = $Item->mtl_receiving_staff_by ? 'pending' : null;
            $Item->verified_by         = $request->verified_by ?? null;
            $Item->verified_by_date    = null;
            $Item->verified_by_status  = $Item->verified_by ? 'pending' : null;
            $Item->acknowledged_by     = $request->acknowledged_by ?? null;
            $Item->acknowledged_by_date    = null;
            $Item->acknowledged_by_status  = $Item->acknowledged_by ? 'pending' : null;
            $Item->approved_by         = $request->approved_by ?? null;
            $Item->approved_by_date    = null;
            $Item->approved_by_status  = $Item->approved_by ? 'pending' : null;
            $Item->ims_acknowledged_by      = $request->ims_acknowledged_by ?? null;
            $Item->ims_acknowledged_by_date = null;
            $Item->ims_acknowledged_by_status = $Item->ims_acknowledged_by ? 'pending' : null;

            $attachments = $request->input('attachments');
            $normalizedAttachments = $this->normalizeAttachments($attachments);
            $Item->attachments = $this->encodeAttachments($normalizedAttachments);

            $Item->create_by = $requestedBy;

            $Item->save();
            $Item->attachments = $normalizedAttachments;

            $this->logDocumentCreateAudit($request, $Item);

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
        $requestedBy = null;
        if ($request->has('requested_by')) {
            $actorCode = $loginBy->employee_code ?? $loginBy->id ?? 'admin';
            $requestedBy = $this->resolveRequestedEmployeeCode($request, (string) $actorCode);
            if ($requestedBy === null) {
                return $this->returnErrorData('Invalid requester employee code', 422);
            }
        }

        // Validate snake_case
        if (!isset($request->request_type)) {
            return $this->returnErrorData('กรุณาระบุ request_type', 404);
        }
        if (!isset($request->description)) {
            return $this->returnErrorData('กรุณาระบุ description', 404);
        }
        if (!isset($request->purpose)) {
            return $this->returnErrorData('กรุณาระบุ purpose', 404);
        }
        if (!isset($request->value)) {
            return $this->returnErrorData('กรุณาระบุ value', 404);
        }
        if (!isset($request->company_of_giver)) {
            return $this->returnErrorData('กรุณาระบุ company_of_giver', 404);
        }
        if (!isset($request->proposed_date)) {
            return $this->returnErrorData('กรุณาระบุ proposed_date', 404);
        }
        if ($assignmentError = $this->workflowAssignmentError($request)) {
            return $this->workflowAssignmentErrorResponse($assignmentError);
        }


        DB::beginTransaction();

        try {

            $Item = GiftHospitality::find($id);
            if (!$Item) {
                return $this->returnErrorData('ไม่พบข้อมูลที่ต้องการแก้ไข', 404);
            }

            $Item->request_type           = $request->request_type;
            $Item->description            = $request->description;
            $Item->purpose                = $request->purpose;
            $Item->value                  = $request->value;

            $Item->company_of_giver       = $request->company_of_giver;
            $Item->proposed_date          = $this->normalizeDateTimeInput($request->proposed_date);
            $Item->mtl_receiving_staff_by    = $request->mtl_receiving_staff_by ?? null;
            $workflowSteps = [
                ['by' => 'verified_by', 'status' => 'verified_by_status', 'date' => 'verified_by_date'],
                ['by' => 'ims_acknowledged_by', 'status' => 'ims_acknowledged_by_status', 'date' => 'ims_acknowledged_by_date'],
                ['by' => 'approved_by', 'status' => 'approved_by_status', 'date' => 'approved_by_date'],
                ['by' => 'acknowledged_by', 'status' => 'acknowledged_by_status', 'date' => 'acknowledged_by_date'],
            ];
            $firstChangedStep = null;
            foreach ($workflowSteps as $index => $step) {
                $newAssignee = trim((string) $request->input($step['by']));
                if ($firstChangedStep === null && (string) $Item->{$step['by']} !== $newAssignee) {
                    $firstChangedStep = $index;
                }
                $Item->{$step['by']} = $newAssignee;
            }
            if ($firstChangedStep !== null) {
                foreach (array_slice($workflowSteps, $firstChangedStep) as $step) {
                    $Item->{$step['status']} = 'pending';
                    $Item->{$step['date']} = null;
                }
            }

            if ($request->has('attachments')) {
                $attachments = $request->input('attachments');
                $normalizedAttachments = $this->normalizeAttachments($attachments);
                $Item->attachments = $this->encodeAttachments($normalizedAttachments);
            }

            if ($requestedBy !== null) {
                $Item->create_by = $requestedBy;
            }
            $Item->update_by = $loginBy->employee_code ?? $loginBy->id ?? 'admin';

            $Item->save();

            if ($request->has('attachments')) {
                $Item->attachments = $normalizedAttachments;
            }

            DB::commit();
            return $this->returnUpdate('อัปเดตข้อมูลสำเร็จ', $Item);

        } catch (\Throwable $e) {

            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด ' . $e->getMessage(), 500);
        }
    }

    public function action($id, $type, Request $request)
    {
        return $this->performSequentialWorkflowAction(
            $request,
            $id,
            $type,
            GiftHospitality::class,
            'gift_hospitalities',
            [
                ['type' => 'verified_by_status', 'by' => 'verified_by', 'status' => 'verified_by_status', 'date' => 'verified_by_date'],
                ['type' => 'ims_acknowledged_by_status', 'by' => 'ims_acknowledged_by', 'status' => 'ims_acknowledged_by_status', 'date' => 'ims_acknowledged_by_date', 'required' => true, 'allow_missing_when_document_completed' => true],
                ['type' => 'approved_by_status', 'by' => 'approved_by', 'status' => 'approved_by_status', 'date' => 'approved_by_date'],
                ['type' => 'acknowledged_by_status', 'by' => 'acknowledged_by', 'status' => 'acknowledged_by_status', 'date' => 'acknowledged_by_date'],
            ]
        );
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

            $Item = GiftHospitality::find($id);
            if (!$Item) {
                return $this->returnErrorData('ไม่พบข้อมูลในระบบ', 404);
            }

            $Item->delete();

            // Log
            $userId      = $loginBy->id ?? 'admin';
            $type        = 'ลบข้อมูล gift_hospitalities';
            $description = "ผู้ใช้งาน {$userId} ได้ทำการ {$type} #{$Item->id}";
            $this->Log($userId, $description, $type);

            DB::commit();
            return $this->returnSuccess('ลบข้อมูลสำเร็จ', []);

        } catch (\Throwable $e) {

            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง ' . $e->getMessage(), 500);
        }
    }
}
