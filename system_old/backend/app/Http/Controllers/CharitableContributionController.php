<?php

namespace App\Http\Controllers;

use App\Models\CharitableContribution;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class CharitableContributionController extends Controller
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
            'currency_code',
            'proposed_date',
            'acsc_by',
            'acsc_by_date',
            'acsc_by_status',
            'acsl_by',
            'acsl_by_date',
            'acsl_by_status',
            'approver_by',
            'approver_by_date',
            'approver_by_status',
            'approver_by_2',
            'approver_by_2_date',
            'approver_by_2_status',
            'ims_acknowledged_by',
            'ims_acknowledged_by_date',
            'ims_acknowledged_by_status',
            'vat_amount',
            'status',
            'create_by',
            'update_by',
            'created_at',
            'updated_at',
        );

        $orderby = array(
            'event_description',
            'organizer_name',
            'request_type',
            'value_amount',
            'proposed_date',
            'created_at',
            'status',
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

        $this->appendWorkflowEmployeeNames($Item);

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $Item);
    }

    private function appendWorkflowEmployeeNames(CharitableContribution $item): void
    {
        if (!Schema::hasTable('employees')) {
            return;
        }

        $fields = [
            'acsc_by',
            'ims_acknowledged_by',
            'approver_by',
            'approver_by_2',
            'acsl_by',
            'create_by',
        ];
        $references = array_values(array_unique(array_filter(array_map(function ($field) use ($item) {
            return trim((string) ($item->{$field} ?? ''));
        }, $fields))));

        if (empty($references)) {
            return;
        }

        $numericIds = array_values(array_filter($references, function ($reference) {
            return ctype_digit($reference);
        }));
        $employees = DB::table('employees')
            ->where(function ($query) use ($references, $numericIds) {
                $query->whereIn('code', $references);
                if (!empty($numericIds)) {
                    $query->orWhereIn('id', array_map('intval', $numericIds));
                }
            })
            ->get(['id', 'code', 'initial', 'firstname', 'lastname', 'title_name']);

        $names = [];
        foreach ($employees as $employee) {
            $fullName = trim(trim((string) $employee->firstname) . ' ' . trim((string) $employee->lastname));
            $displayName = implode(', ', array_filter([
                trim((string) $employee->initial),
                $fullName,
            ], function ($value) {
                return $value !== '';
            }));
            if ($displayName === '') {
                continue;
            }

            $details = ['name' => $displayName, 'title' => trim((string) $employee->title_name)];
            $names[trim((string) $employee->code)] = $details;
            $names[(string) $employee->id] = $details;
        }

        foreach ($fields as $field) {
            $reference = trim((string) ($item->{$field} ?? ''));
            if ($reference !== '' && isset($names[$reference])) {
                $item->setAttribute($field . '_name', $names[$reference]['name']);
                $item->setAttribute($field . '_title', $names[$reference]['title']);
            }
        }
    }

    private function workflowAssignmentError(Request $request): ?string
    {
        $committeeFields = [
            'acsc_by' => 'ACSC',
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

        $approver = trim((string) $request->input('approver_by'));
        if ($approver === '' || !DB::table('employees')->where('code', $approver)
            ->whereNull('deleted_at')
            ->whereIn(DB::raw('UPPER(TRIM(level_name))'), ['DI', 'MD'])
            ->exists()) {
            return 'Approver must be an active DI or MD employee.';
        }

        $secondApprover = trim((string) $request->input('approver_by_2'));
        if ($secondApprover !== '' && !DB::table('employees')->where('code', $secondApprover)
            ->whereNull('deleted_at')
            ->whereRaw('UPPER(TRIM(level_name)) = ?', ['DI'])
            ->exists()) {
            return 'Second approver must be an active DI employee.';
        }

        $accountsAcknowledger = trim((string) $request->input('acsl_by'));
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

    private function requesterEligibilityError(string $code): ?string
    {
        $level = DB::table('employees')
            ->where('code', $code)
            ->whereNull('deleted_at')
            ->value('level_name');

        if (!is_string($level) || !preg_match('/^(EE|AD|DI|MD)(?:$|[^A-Z])/i', trim($level))) {
            return 'Requester must be an active employee at EE level or above.';
        }

        return null;
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
        if ($requesterError = $this->requesterEligibilityError($requestedBy)) {
            return $this->workflowAssignmentErrorResponse($requesterError);
        }

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
        if ($assignmentError = $this->workflowAssignmentError($request)) {
            return $this->workflowAssignmentErrorResponse($assignmentError);
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
            $Item->currency_code            = $this->normalizeCurrencyCodeInput($request->currency_code ?? null);
            $Item->vat_amount               = $request->vat_amount ?? 0;
            $Item->proposed_date            = $this->normalizeDateTimeInput($request->proposed_date);

            $Item->acsc_by                  = $request->acsc_by ?? null;
            $Item->acsc_by_date             = null;
            $Item->acsc_by_status           = $Item->acsc_by ? 'pending' : null;
            $Item->acsl_by                  = $request->acsl_by ?? null;
            $Item->acsl_by_date             = null;
            $Item->acsl_by_status           = $Item->acsl_by ? 'pending' : null;
            $Item->approver_by              = $request->approver_by ?? null;
            $Item->approver_by_date         = null;
            $Item->approver_by_status       = $Item->approver_by ? 'pending' : null;
            $Item->approver_by_2            = $request->approver_by_2 ?? null;
            $Item->approver_by_2_date       = null;
            $Item->approver_by_2_status     = $Item->approver_by_2 ? 'pending' : null;
            $Item->ims_acknowledged_by      = $request->ims_acknowledged_by;
            $Item->ims_acknowledged_by_date = null;
            $Item->ims_acknowledged_by_status = $Item->ims_acknowledged_by ? 'pending' : null;

            $Item->status                   = 'pending';
            $Item->create_by                = $requestedBy;

            $Item->save();

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
            if ($requesterError = $this->requesterEligibilityError($requestedBy)) {
                return $this->workflowAssignmentErrorResponse($requesterError);
            }
        }

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
        if ($assignmentError = $this->workflowAssignmentError($request)) {
            return $this->workflowAssignmentErrorResponse($assignmentError);
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
            $Item->currency_code            = $this->normalizeCurrencyCodeInput($request->currency_code ?? null, $Item->currency_code ?? 'THB');
            $Item->vat_amount               = $request->vat_amount ?? 0;
            $Item->proposed_date            = $this->normalizeDateTimeInput($request->proposed_date);

            $Item->acsc_by                  = $request->acsc_by ?? null;
            $Item->acsl_by                  = $request->acsl_by ?? null;
            $Item->approver_by              = $request->approver_by ?? null;
            $Item->approver_by_2            = $request->approver_by_2 ?? null;
            $imsAcknowledgedBy = $request->ims_acknowledged_by;
            if ((string) $Item->ims_acknowledged_by !== (string) $imsAcknowledgedBy) {
                $Item->ims_acknowledged_by_status = 'pending';
                $Item->ims_acknowledged_by_date = null;
            }
            $Item->ims_acknowledged_by      = $imsAcknowledgedBy;
            if ($requestedBy !== null) {
                $Item->create_by = $requestedBy;
            }
            $Item->update_by                = $loginBy->employee_code ?? $loginBy->id ?? 'admin';

            $Item->save();

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
            CharitableContribution::class,
            'charitable_contributions',
            [
                ['type' => 'acsc_by_status', 'by' => 'acsc_by', 'status' => 'acsc_by_status', 'date' => 'acsc_by_date'],
                ['type' => 'ims_acknowledged_by_status', 'by' => 'ims_acknowledged_by', 'status' => 'ims_acknowledged_by_status', 'date' => 'ims_acknowledged_by_date', 'required' => true, 'allow_missing_when_document_completed' => true],
                ['type' => 'approver_by_status', 'by' => 'approver_by', 'status' => 'approver_by_status', 'date' => 'approver_by_date'],
                ['type' => 'approver_by_2_status', 'by' => 'approver_by_2', 'status' => 'approver_by_2_status', 'date' => 'approver_by_2_date'],
                ['type' => 'acsl_by_status', 'by' => 'acsl_by', 'status' => 'acsl_by_status', 'date' => 'acsl_by_date'],
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

            $Item = CharitableContribution::find($id);
            if (!$Item) {
                return $this->returnErrorData('ไม่พบข้อมูลในระบบ', 404);
            }

            $Item->delete();

            // log
            $userId      = $loginBy->employee_code ?? $loginBy->id ?? 'admin';
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
