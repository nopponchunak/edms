<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use App\Models\PostmanProposalContractReview;
use App\Models\ProjectQualityAssurancePlan;
use App\Models\ProjectQualityAssurancePlanSchedule;
use App\Models\ProjectQualityAssurancePlanDocument;

class ProjectQualityAssurancePlanController extends Controller
{
    // =========================================================
    // index
    // =========================================================
    public function index()
    {
        return $this->getList();
    }

    // =========================================================
    // getList
    // =========================================================
    public function getList()
    {
        try {
            $items = ProjectQualityAssurancePlan::with(['quality_plan_schedule', 'documents_required'])
                ->orderBy('id', 'desc')
                ->get();

            $items->each(function ($item, $index) {
                $item->No = $index + 1;
            });

            return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $items);
        } catch (\Throwable $e) {
            Log::error('PQA list failed: ' . $e->getMessage());
            return $this->systemReadErrorResponse();
        }
    }

    // =========================================================
    // getPage (DataTable)
    // =========================================================
    public function getPage(Request $request)
    {
        try {
            $draw   = (int)($request->draw ?? 1);
            $start  = (int)($request->start ?? 0);
            $length = (int)($request->length ?? 10);

            $col = [
                'id', 'revision', 'date', 'prepared_by_tl', 'approved_by_di',
                'acknowledged_by_vve', 'project_name', 'project_no', 'status',
                'created_at', 'updated_at'
            ];

            $query = ProjectQualityAssurancePlan::query()->whereNull('deleted_at');

            // Search
            $searchValue = $request->input('search.value');
            if ($searchValue !== null && trim($searchValue) !== '') {
                $keyword = '%' . trim($searchValue) . '%';
                $query->where(function ($q) use ($keyword, $col) {
                    foreach ($col as $c) {
                        $q->orWhere($c, 'like', $keyword);
                    }
                });
            }

            $recordsTotal = ProjectQualityAssurancePlan::whereNull('deleted_at')->count();
            $recordsFiltered = (clone $query)->count();

            // Order
            $orderColIndex = $request->input('order.0.column');
            $orderDir      = $request->input('order.0.dir', 'desc');
            $orderby = [
                0 => 'id',
                1 => 'revision',
                2 => 'date',
                3 => 'prepared_by_tl',
                4 => 'approved_by_di',
                5 => 'acknowledged_by_vve',
                6 => 'project_name',
                7 => 'project_no',
                8 => 'status',
                9 => 'created_at'
            ];

            if ($orderColIndex !== null && isset($orderby[(int)$orderColIndex])) {
                $query->orderBy($orderby[(int)$orderColIndex], $orderDir);
            } else {
                $query->orderBy('id', 'desc');
            }

            $items = $query->skip($start)->take($length)->get();

            // เติม No
            $no = $start + 1;
            foreach ($items as $row) {
                $row->No = $no++;
            }

            return response()->json([
                'draw' => $draw,
                'recordsTotal' => $recordsTotal,
                'recordsFiltered' => $recordsFiltered,
                'data' => $items,
            ]);
        } catch (\Throwable $e) {
            Log::error('PQA page failed: ' . $e->getMessage());
            return $this->systemReadErrorResponse();
        }
    }

    // =========================================================
    // show
    // =========================================================
    public function show($id)
    {
        try {
            $item = ProjectQualityAssurancePlan::with(['quality_plan_schedule', 'documents_required'])->find($id);

            if (!$item) {
                return $this->returnErrorData('ไม่พบข้อมูลที่ระบุ', 404);
            }

            return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $item);
        } catch (\Throwable $e) {
            Log::error('PQA show failed: ' . $e->getMessage());
            return $this->systemReadErrorResponse();
        }
    }

    // =========================================================
    // store
    // =========================================================
    public function store(Request $request)
    {
        if ($validationError = $this->validatePlanRequest($request)) {
            return $validationError;
        }

        $actorId = $this->resolveActorId($request);

        DB::beginTransaction();

        try {
            $item = new ProjectQualityAssurancePlan();
            $this->fillPlan($item, $request);
            $item->create_by = $actorId;
            $item->update_by = $actorId;
            $item->save();

            $this->saveSchedules($item, $request->quality_plan_schedule ?? []);
            $this->saveDocuments($item, $request->documents_required ?? []);

            $this->logDocumentCreateAudit($request, $item);

            DB::commit();
            return $this->returnSuccess('บันทึกข้อมูลสำเร็จ', $item->load(['quality_plan_schedule', 'documents_required']));

        } catch (\Throwable $e) {
            DB::rollBack();
            Log::error('PQA store failed: ' . $e->getMessage());
            return $this->systemSaveErrorResponse();
        }
    }

    // =========================================================
    // createFromProposalContractReview
    // =========================================================
    public function createFromProposalContractReview(Request $request, $proposalContractReviewId)
    {
        $actorId = $this->resolveActorId($request);

        DB::beginTransaction();

        try {
            $review = PostmanProposalContractReview::with('approvals')->find($proposalContractReviewId);
            if (!$review) {
                DB::rollBack();
                return $this->workflowError('ไม่พบ Proposal Contract Review', 404);
            }

            if ($review->status !== 'contract_approved') {
                DB::rollBack();
                return $this->workflowError('ต้องอนุมัติ Contract Review ให้เสร็จก่อนสร้าง Project Quality Assurance Plan', 422);
            }

            if ($review->need_quality_plan_pqp !== 'Yes') {
                DB::rollBack();
                return $this->workflowError('เอกสารนี้ไม่ได้เลือก Need to proceed a Project Quality Plan', 422);
            }

            $existing = ProjectQualityAssurancePlan::where('proposal_contract_review_id', $review->id)
                ->whereNull('deleted_at')
                ->first();
            if ($existing) {
                DB::commit();
                return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $existing->load(['quality_plan_schedule', 'documents_required']));
            }

            $payload = json_decode($review->payload ?? '[]', true);
            if (!is_array($payload)) {
                $payload = [];
            }

            $item = new ProjectQualityAssurancePlan();
            $item->proposal_contract_review_id = $review->id;
            $item->revision = $request->revision ?? '0';
            $item->date = $this->normalizeDateTimeInput($request->date ?? now()->format('Y-m-d'));
            $item->prepared_by_tl = $request->prepared_by_tl ?? ($payload['lead_tl'] ?? $payload['leadTl'] ?? $review->filled_in_by ?? '');
            $item->approved_by_di = $request->approved_by_di ?? $this->firstApprovalNameOrCode($review, 'contract', 'MD_DI');
            $item->acknowledged_by_vve = $request->acknowledged_by_vve ?? '';
            $item->project_name = $review->project_name;
            $item->project_no = $review->mt_project_no ?: $review->project_no;
            $item->proposal_number = $review->proposal_number;
            $item->source_contract_decision = $review->contract_decision;
            $this->fillPlanScopeFromReview($item, $review->primary_discipline, $payload);
            $item->status = $request->status ?? 'draft';
            $item->create_by = $actorId;
            $item->update_by = $actorId;
            $item->save();

            $this->saveSchedules($item, $request->quality_plan_schedule ?? []);
            $this->saveDocuments($item, $request->documents_required ?? []);

            $this->logDocumentCreateAudit($request, $item);

            DB::commit();

            return $this->returnSuccess('บันทึกข้อมูลสำเร็จ', $item->load(['quality_plan_schedule', 'documents_required']));
        } catch (\Throwable $e) {
            DB::rollBack();
            Log::error('PQA create from PCR failed: ' . $e->getMessage());
            return $this->systemSaveErrorResponse();
        }
    }

    // =========================================================
    // update
    // =========================================================
    public function update(Request $request, $id)
    {
        if ($validationError = $this->validatePlanRequest($request)) {
            return $validationError;
        }

        $actorId = $this->resolveActorId($request);

        DB::beginTransaction();

        try {
            $item = ProjectQualityAssurancePlan::find($id);
            if (!$item) return $this->returnErrorData('ไม่พบข้อมูล', 404);

            $this->fillPlan($item, $request);
            $item->update_by = $actorId;
            $item->save();

            // Refresh schedules
            ProjectQualityAssurancePlanSchedule::where('project_quality_assurance_plan_id', $id)->delete();
            $this->saveSchedules($item, $request->quality_plan_schedule ?? []);

            // Refresh documents
            ProjectQualityAssurancePlanDocument::where('project_quality_assurance_plan_id', $id)->delete();
            $this->saveDocuments($item, $request->documents_required ?? []);

            DB::commit();
            return $this->returnUpdateReturnData('อัปเดตข้อมูลสำเร็จ', $item->load(['quality_plan_schedule', 'documents_required']));

        } catch (\Throwable $e) {
            DB::rollBack();
            Log::error('PQA update failed: ' . $e->getMessage());
            return $this->systemSaveErrorResponse();
        }
    }

    // =========================================================
    // destroy
    // =========================================================
    public function destroy($id, Request $request)
    {
        $actorId = $this->resolveActorId($request);

        DB::beginTransaction();
        try {
            $item = ProjectQualityAssurancePlan::find($id);
            if (!$item) return $this->returnErrorData('ไม่พบข้อมูล', 404);

            $item->delete();
            $this->Log($actorId, "ลบข้อมูล PQA Plan #{$id}", "ลบข้อมูล");

            DB::commit();
            return $this->returnSuccess('ลบข้อมูลสำเร็จ', []);

        } catch (\Throwable $e) {
            DB::rollBack();
            Log::error('PQA delete failed: ' . $e->getMessage());
            return $this->systemDeleteErrorResponse();
        }
    }

    // =========================================================
    // Helper Methods
    // =========================================================
    private function validatePlanRequest(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'revision' => ['required', 'string', 'max:50'],
            'date' => ['required', 'date'],
            'prepared_by_tl' => ['required', 'string', 'max:255'],
            'approved_by_di' => ['required', 'string', 'max:255'],
            'acknowledged_by_vve' => ['required', 'string', 'max:255'],
            'project_name' => ['required', 'string', 'max:255'],
            'project_no' => ['required', 'string', 'max:100'],
            'quality_plan_schedule' => ['sometimes', 'array'],
            'quality_plan_schedule.*.item_key' => ['nullable', 'string', 'max:100'],
            'quality_plan_schedule.*.item' => ['nullable', 'string', 'max:255'],
            'quality_plan_schedule.*.proposed_schedule' => ['nullable', 'date'],
            'documents_required' => ['sometimes', 'array'],
            'documents_required.*.document' => ['nullable', 'string', 'max:255'],
            'documents_required.*.completion_stage' => ['nullable', 'string', 'max:255'],
            'documents_required.*.responsible_personnel' => ['nullable', 'string', 'max:255'],
        ], [
            'revision.required' => 'Please enter the revision.',
            'date.required' => 'Please enter the date.',
            'date.date' => 'Please enter a valid date.',
            'prepared_by_tl.required' => 'Please select Prepared by (TL).',
            'approved_by_di.required' => 'Please select Approved by (DI).',
            'acknowledged_by_vve.required' => 'Please select Acknowledged by.',
            'project_name.required' => 'Please select a project.',
            'project_no.required' => 'Please select a project with a project number.',
        ]);

        if (!$validator->fails()) {
            return null;
        }

        return response()->json([
            'code' => '422',
            'status' => false,
            'message' => 'Please complete all required Project Quality Plan fields.',
            'data' => [],
            'errors' => $validator->errors(),
        ], 422);
    }

    private function fillPlan($item, $request)
    {
        $item->proposal_contract_review_id = $request->proposal_contract_review_id;
        $item->revision = $request->revision;
        $item->date = $this->normalizeDateTimeInput($request->date);
        $item->prepared_by_tl = $request->prepared_by_tl;
        $item->approved_by_di = $request->approved_by_di;
        $item->acknowledged_by_vve = $request->acknowledged_by_vve;
        $item->project_name = $request->project_name;
        $item->project_no = $request->project_no;
        $item->proposal_number = $request->proposal_number;
        $item->source_contract_decision = $request->source_contract_decision;

        // Scopes
        $item->scope_cs = $request->boolean('scope_cs');
        $item->scope_me = $request->boolean('scope_me');
        $item->scope_leed_esd = $request->boolean('scope_leed_esd');
        $item->scope_facade = $request->boolean('scope_facade');
        $item->scope_lighting = $request->boolean('scope_lighting');
        $item->scope_pm = $request->boolean('scope_pm');
        $item->scope_cm = $request->boolean('scope_cm');
        $item->scope_transport = $request->boolean('scope_transport');
        $item->scope_geotechnical = $request->boolean('scope_geotechnical');
        $item->scope_qs = $request->boolean('scope_qs');
        $item->scope_engineering_audit = $request->boolean('scope_engineering_audit');
        $item->scope_others_flag = $request->boolean('scope_others_flag');
        $item->scope_others_text = $request->scope_others_text;

        // Team
        $item->team_di = $request->team_di;
        $item->team_tl = $request->team_tl;
        $item->team_pm = $request->team_pm;
        $item->team_bm = $request->team_bm;
        $item->team_cm = $request->team_cm;
        $item->team_re = $request->team_re;

        // Coordinators
        $item->coord_cs = $request->coord_cs;
        $item->coord_facade = $request->coord_facade;
        $item->coord_others = $request->coord_others;
        $item->coord_me = $request->coord_me;
        $item->coord_lighting = $request->coord_lighting;
        $item->coord_leed_esd = $request->coord_leed_esd;
        $item->coord_transport = $request->coord_transport;
        $item->coord_bco = $request->coord_bco;

        // Validations
        $item->validation_before_docs_issued = $request->boolean('validation_before_docs_issued');
        $item->validation_within_14days_after_docs = $request->boolean('validation_within_14days_after_docs');

        // Status
        $item->status = $request->status ?? 'draft';
    }

    private function saveSchedules($item, $schedules)
    {
        foreach ($schedules as $row) {
            $sched = new ProjectQualityAssurancePlanSchedule();
            $sched->project_quality_assurance_plan_id = $item->id;
            $sched->item_key = $row['item_key'] ?? null;
            $sched->item = $row['item'] ?? null;
            $sched->proposed_schedule = $this->normalizeDateTimeInput($row['proposed_schedule'] ?? null);
            $sched->review_required_cs = filter_var($row['review_required_cs'] ?? false, FILTER_VALIDATE_BOOLEAN);
            $sched->review_required_mep = filter_var($row['review_required_mep'] ?? false, FILTER_VALIDATE_BOOLEAN);
            $sched->reviewer_cs = $row['reviewer_cs'] ?? null;
            $sched->reviewer_mep = $row['reviewer_mep'] ?? null;
            $sched->initial_cs = $row['initial_cs'] ?? null;
            $sched->initial_mep = $row['initial_mep'] ?? null;
            $sched->review_date = $this->normalizeDateTimeInput($row['review_date'] ?? null);
            $sched->save();
        }
    }

    private function saveDocuments($item, $documents)
    {
        foreach ($documents as $row) {
            $doc = new ProjectQualityAssurancePlanDocument();
            $doc->project_quality_assurance_plan_id = $item->id;
            $doc->document = $row['document'] ?? null;
            $doc->detail = $row['detail'] ?? null;
            $doc->required = filter_var($row['required'] ?? false, FILTER_VALIDATE_BOOLEAN);
            $doc->completion_stage = $row['completion_stage'] ?? null;
            $doc->responsible_personnel = $row['responsible_personnel'] ?? null;
            $doc->save();
        }
    }

    private function firstApprovalNameOrCode($review, string $stage, string $role): string
    {
        $approval = $review->approvals
            ->where('stage', $stage)
            ->where('role', $role)
            ->first();

        if (!$approval) {
            return '';
        }

        return $approval->approver_name ?: $approval->approver_code;
    }

    private function fillPlanScopeFromReview($item, ?string $primaryDiscipline, array $payload): void
    {
        $item->scope_cs = $this->payloadBoolean($payload, ['discipline_cs', 'disc_cs', 'scope_cs']);
        $item->scope_me = $this->payloadBoolean($payload, ['discipline_me', 'disc_me', 'scope_me']);
        $item->scope_facade = $primaryDiscipline === 'facade' || $this->payloadBoolean($payload, ['discipline_facade', 'disc_facade', 'scope_facade']);
        $item->scope_lighting = $primaryDiscipline === 'lighting' || $this->payloadBoolean($payload, ['discipline_lighting', 'disc_lighting', 'scope_lighting']);
        $item->scope_transport = $primaryDiscipline === 'transportation' || $this->payloadBoolean($payload, ['discipline_transport', 'disc_transport', 'scope_transport']);
        $item->scope_others_flag = $this->payloadBoolean($payload, ['discipline_others', 'disc_others', 'scope_others_flag']);
        $item->scope_others_text = $payload['discipline_others_text'] ?? $payload['scope_others_text'] ?? null;
    }

    private function payloadBoolean(array $payload, array $keys): bool
    {
        foreach ($keys as $key) {
            if (!array_key_exists($key, $payload)) {
                continue;
            }

            $value = $payload[$key];
            if (is_bool($value)) {
                return $value;
            }

            $normalized = strtolower(trim((string) $value));
            return in_array($normalized, ['1', 'true', 'yes', 'y'], true);
        }

        return false;
    }

    private function workflowError(string $message, int $code)
    {
        return response()->json([
            'code' => (string) $code,
            'status' => false,
            'message' => $message,
            'data' => [],
        ], $code);
    }

    private function systemSaveErrorResponse()
    {
        return response()->json([
            'code' => '500',
            'status' => false,
            'message' => 'The system could not save the Project Quality Plan. Please try again. If the problem continues, contact support.',
            'data' => [],
        ], 500);
    }

    private function systemReadErrorResponse()
    {
        return response()->json([
            'code' => '500',
            'status' => false,
            'message' => 'The system could not load the Project Quality Plan. Please try again. If the problem continues, contact support.',
            'data' => [],
        ], 500);
    }

    private function systemDeleteErrorResponse()
    {
        return response()->json([
            'code' => '500',
            'status' => false,
            'message' => 'The system could not delete the Project Quality Plan. Please try again. If the problem continues, contact support.',
            'data' => [],
        ], 500);
    }
}
