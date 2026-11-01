<?php

namespace App\Http\Controllers;

use App\Mail\NotificationMail;
use App\Models\PostmanProposalContractReview;
use App\Models\PostmanProposalContractReviewProject;
use App\Models\ProposalContractReviewApproval;
use App\Models\ProposalProjectReference;
use App\Services\ProposalContractReviewNumberService;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class PostmanProposalContractReviewController extends JsonPayloadCrudController
{
    private const STATUS_PENDING_PROPOSAL = 'pending_proposal_review';
    private const STATUS_PENDING_CONTRACT = 'pending_contract_review';
    private const STATUS_CONTRACT_APPROVED = 'contract_approved';
    private const STATUS_DECLINED = 'declined';

    protected string $modelClass = PostmanProposalContractReview::class;

    protected array $coreFieldMap = [
        'project_name' => ['project_name', 'projectName'],
        'project_no' => ['project_no', 'projectNo', 'projectNumber'],
        'proposal_number' => ['proposal_number', 'proposalNumber'],
        'primary_discipline' => ['primary_discipline', 'primaryDiscipline'],
        'mt_project_no' => ['mt_project_no', 'mtProjectNo'],
        'client_name' => ['client_name', 'clientName'],
        'project_type' => ['project_type', 'projectType', 'project_type_id'],
        'currency' => ['currency'],
        'estimated_total_fees' => ['estimated_total_fees', 'estimatedTotalFees'],
        'city' => ['city'],
        'country' => ['country'],
        'filled_in_by' => ['filled_in_by', 'preparedBy', 'filledInBy'],
        'proposal_to_be_submitted' => ['proposal_to_be_submitted'],
        'proposal_decision' => ['proposal_decision', 'proposalDecision'],
        'win_probability' => ['win_probability', 'winProbability'],
        'contract_agreed_to_proceed' => ['contract_agreed_to_proceed'],
        'contract_decision' => ['contract_decision', 'contractDecision'],
        'lead_tl' => ['lead_tl', 'leadTl'],
        'tl_name' => ['tl_name', 'tlName'],
        'need_quality_plan_pqp' => ['need_quality_plan_pqp', 'needQualityPlanPqp'],
        'status' => ['status'],
    ];

    protected array $exactFilterMap = [
        'proposal_to_be_submitted' => 'proposal_to_be_submitted',
        'proposal_decision' => 'proposal_decision',
        'contract_agreed_to_proceed' => 'contract_agreed_to_proceed',
        'contract_decision' => 'contract_decision',
        'need_quality_plan_pqp' => 'need_quality_plan_pqp',
        'status' => 'status',
        'primary_discipline' => 'primary_discipline',
        'project_type' => 'project_type',
        'currency' => 'currency',
    ];

    protected array $likeFilterMap = [
        'project_name' => 'project_name',
        'project_no' => 'project_no',
        'proposal_number' => 'proposal_number',
        'mt_project_no' => 'mt_project_no',
        'client_name' => 'client_name',
        'filled_in_by' => 'filled_in_by',
        'city' => 'city',
        'country' => 'country',
    ];

    protected array $searchableColumns = [
        'project_name',
        'project_no',
        'proposal_number',
        'mt_project_no',
        'client_name',
        'city',
        'country',
        'filled_in_by',
        'proposal_decision',
        'contract_decision',
        'status',
    ];

    protected array $orderColumns = [
        0 => 'proposal_number',
        1 => 'created_at',
        2 => 'project_name',
        3 => 'project_no',
        4 => 'project_type',
        5 => 'client_name',
        6 => 'estimated_total_fees',
        7 => 'filled_in_by',
        8 => 'status',
    ];

    private ProposalContractReviewNumberService $numberService;

    public function __construct(ProposalContractReviewNumberService $numberService)
    {
        $this->numberService = $numberService;
    }

    public function getList(Request $request)
    {
        try {
            $items = $this->applyFilters($this->activeReviewQuery()->with(['approvals', 'projects']), $request)
                ->orderBy('id', 'desc')
                ->get()
                ->values()
                ->map(function ($item, $index) {
                    $row = $this->transformItem($item);
                    $row['No'] = $index + 1;

                    return $row;
                });

            return $this->returnSuccess('success', $items);
        } catch (\Throwable $e) {
            return $this->errorResponse($e->getMessage(), 500);
        }
    }

    public function getPage(Request $request)
    {
        try {
            $draw = (int) ($request->draw ?? 1);
            $start = (int) ($request->start ?? 0);
            $length = (int) ($request->length ?? 10);

            $baseQuery = $this->activeReviewQuery();
            $query = $this->applyFilters((clone $baseQuery)->with(['approvals', 'projects']), $request, true);
            $recordsTotal = (clone $baseQuery)->count();
            $recordsFiltered = (clone $query)->count();

            $this->applyOrdering($query, $request);

            $items = $query->skip($start)
                ->take($length)
                ->get()
                ->values()
                ->map(function ($item, $index) use ($start) {
                    $row = $this->transformItem($item);
                    $row['No'] = $start + $index + 1;

                    return $row;
                });

            return response()->json([
                'draw' => $draw,
                'recordsTotal' => $recordsTotal,
                'recordsFiltered' => $recordsFiltered,
                'data' => $items,
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'draw' => (int) ($request->draw ?? 1),
                'recordsTotal' => 0,
                'recordsFiltered' => 0,
                'data' => [],
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function show($id)
    {
        try {
            $item = $this->newQuery()->with(['approvals', 'projects'])->where('id', $id)->first();

            if (! $item) {
                return $this->errorResponse('ไม่พบข้อมูล', 404);
            }

            return $this->returnSuccess('success', $this->transformItem($item));
        } catch (\Throwable $e) {
            return $this->errorResponse($e->getMessage(), 500);
        }
    }

    public function store(Request $request)
    {
        $payload = $this->cleanPayload($request);
        $validation = $this->validateCreatePayload($payload);
        if ($validation !== null) {
            return $this->errorResponse($validation, 422);
        }

        $approvers = $this->resolveApprovers($payload, 'proposal');
        if (count($approvers) < 2) {
            return $this->errorResponse('กรุณาระบุผู้ลงนาม Proposal Review อย่างน้อย 2 คนและต้องไม่ซ้ำกัน', 422);
        }

        $requestedProposalNumber = $this->payloadValue($payload, ['proposal_number', 'proposalNumber']);

        DB::beginTransaction();

        try {
            $actorId = $this->resolveActorId($request);
            $discipline = $this->numberService->normalizeDiscipline(
                $this->payloadValue($payload, ['primary_discipline', 'primaryDiscipline']),
                $payload
            );
            $proposalNumber = $this->numberService->nextProposalNumber($discipline);

            $item = new PostmanProposalContractReview();
            $item->project_name = $this->payloadValue($payload, ['project_name', 'projectName']);
            $item->project_no = null;
            $item->proposal_number = $proposalNumber;
            $item->primary_discipline = $discipline;
            $item->mt_project_no = null;
            $item->client_name = $this->payloadValue($payload, ['client_name', 'clientName']);
            $item->project_type = $this->payloadValue($payload, ['project_type', 'projectType', 'project_type_id']);
            $item->currency = strtoupper((string) $this->payloadValue($payload, ['currency']));
            $item->estimated_total_fees = $this->numericValue($this->payloadValue($payload, ['estimated_total_fees', 'estimatedTotalFees']));
            $item->city = $this->payloadValue($payload, ['city']);
            $item->country = $this->payloadValue($payload, ['country']);
            $item->filled_in_by = $this->payloadValue($payload, ['filled_in_by', 'preparedBy', 'filledInBy']);
            $proposalDecision = $this->resolveProposalDecisionFromPayload($payload);
            $item->proposal_to_be_submitted = $proposalDecision === 'submitted' ? 'Yes' : ($proposalDecision === 'declined' ? 'No' : null);
            $item->proposal_decision = $proposalDecision;
            $item->win_probability = $this->numericValue($this->payloadValue($payload, ['win_probability', 'winProbability']));
            $item->contract_agreed_to_proceed = null;
            $item->contract_decision = null;
            $item->need_quality_plan_pqp = null;
            $item->root_review_id = null;
            $item->revision_no = 0;
            $item->revision_label = 'Rev.0';
            $item->revision_reason = null;
            $item->revision_summary = null;
            $item->revised_from_id = null;
            $item->is_latest_revision = true;
            $item->locked_at = null;
            $item->status = self::STATUS_PENDING_PROPOSAL;
            $item->submitted_at = Carbon::now();
            $item->create_by = $actorId;
            $item->update_by = $actorId;

            $this->putWorkflowValuesIntoPayload($payload, $item);
            $item->payload = json_encode($payload, JSON_UNESCAPED_UNICODE);
            $item->save();

            $item->root_review_id = $item->id;
            $this->putWorkflowValuesIntoPayload($payload, $item);
            $item->payload = json_encode($payload, JSON_UNESCAPED_UNICODE);
            $item->save();

            $this->createApprovalRows($item, $approvers, $actorId, ['proposal']);
            $this->syncProjectReferences($item);

            $this->logDocumentCreateAudit($request, $item);

            DB::commit();

            $item->load(['approvals', 'projects']);
            $this->notifyApprovers($item, 'proposal');

            $data = $this->transformItem($item);
            if ($requestedProposalNumber !== null && $requestedProposalNumber !== $item->proposal_number) {
                $data['proposal_number_warning'] = "เลข Proposal Number {$requestedProposalNumber} ถูกใช้งานแล้ว ระบบจึงบันทึกด้วยเลขใหม่ {$item->proposal_number}";
            }

            return $this->returnSuccess('บันทึกข้อมูลสำเร็จ', $data);
        } catch (\Throwable $e) {
            DB::rollBack();

            return $this->errorResponse($e->getMessage(), 500);
        }
    }

    public function update(Request $request, $id)
    {
        $payload = $this->cleanPayload($request);
        $validation = $this->validateCreatePayload($payload, false);
        if ($validation !== null) {
            return $this->errorResponse($validation, 422);
        }

        DB::beginTransaction();

        try {
            $item = $this->newQuery()->with(['approvals', 'projects'])->where('id', $id)->first();
            if (! $item) {
                DB::rollBack();
                return $this->errorResponse('ไม่พบข้อมูล', 404);
            }

            if (! $item->is_latest_revision || $item->locked_at !== null) {
                DB::rollBack();
                return $this->errorResponse('เอกสารนี้ถูกล็อก ไม่สามารถแก้ไขข้อมูลหลักได้', 422);
            }

            if (! in_array($item->status, [self::STATUS_PENDING_PROPOSAL, self::STATUS_PENDING_CONTRACT, 'submitted', 'draft'], true)) {
                DB::rollBack();
                return $this->errorResponse('เอกสารเข้าสู่ขั้นตอนอนุมัติแล้ว ไม่สามารถแก้ไขข้อมูลหลักได้', 422);
            }

            $actorId = $this->resolveActorId($request);
            if ($item->status !== self::STATUS_PENDING_CONTRACT) {
                $item->project_name = $this->payloadValue($payload, ['project_name', 'projectName']) ?? $item->project_name;
                $item->client_name = $this->payloadValue($payload, ['client_name', 'clientName']) ?? $item->client_name;
                $item->project_type = $this->payloadValue($payload, ['project_type', 'projectType', 'project_type_id']) ?? $item->project_type;
                $item->currency = strtoupper((string) ($this->payloadValue($payload, ['currency']) ?? $item->currency));
                $item->estimated_total_fees = $this->numericValue(
                    $this->payloadValue($payload, ['estimated_total_fees', 'estimatedTotalFees']),
                    $item->estimated_total_fees
                );
                $item->city = $this->payloadValue($payload, ['city']) ?? $item->city;
                $item->country = $this->payloadValue($payload, ['country']) ?? $item->country;
                $item->filled_in_by = $this->payloadValue($payload, ['filled_in_by', 'preparedBy', 'filledInBy']) ?? $item->filled_in_by;
            }
            $item->update_by = $actorId;

            $shouldNotifyContractApprovers = false;
            if ($item->status === self::STATUS_PENDING_CONTRACT && $this->resolveBoolean($this->payloadValue($payload, ['contract_agreed_to_proceed'])) === true) {
                $contractApprovers = $this->resolveApprovers($payload, 'contract');
                if (count($contractApprovers) < 2) {
                    DB::rollBack();
                    return $this->errorResponse('กรุณาระบุผู้ลงนาม Contract Review อย่างน้อย 2 คนและต้องไม่ซ้ำกัน', 422);
                }

                if ($this->payloadValue($payload, ['lead_tl', 'leadTl']) === null) {
                    DB::rollBack();
                    return $this->errorResponse('กรุณาระบุ Lead TL', 422);
                }

                $hasContractAction = $item->approvals
                    ->where('stage', 'contract')
                    ->contains(function ($approval) {
                        return $approval->decision !== 'pending';
                    });

                if ($hasContractAction) {
                    DB::rollBack();
                    return $this->errorResponse('มีผู้อนุมัติ Contract Review ดำเนินการแล้ว ไม่สามารถเปลี่ยนชุดผู้ลงนามได้', 422);
                }

                $item->contract_decision = 'proceed';
                $item->contract_agreed_to_proceed = 'Yes';
                $item->lead_tl = $this->payloadValue($payload, ['lead_tl', 'leadTl']);
                $item->tl_name = $this->payloadValue($payload, ['tl_name', 'tlName']);
                $item->need_quality_plan_pqp = $this->resolveYesNo($this->payloadValue($payload, ['need_quality_plan_pqp', 'needQualityPlanPqp'])) ?? 'No';

                if ($item->projects()->whereNull('deleted_at')->count() === 0) {
                    $projects = $this->createProposalProjects($item, $payload, $actorId);
                    $firstProject = $projects[0] ?? null;
                } else {
                    $firstProject = $item->projects()->whereNull('deleted_at')->orderBy('sequence_no')->orderBy('id')->first();
                }

                if ($firstProject) {
                    $item->mt_project_no = $firstProject->mt_project_no;
                    $item->project_no = $firstProject->project_no ?: $firstProject->mt_project_no;
                }

                ProposalContractReviewApproval::where('proposal_contract_review_id', $item->id)
                    ->where('stage', 'contract')
                    ->delete();
                $this->createApprovalRows($item, $contractApprovers, $actorId, ['contract']);
                $shouldNotifyContractApprovers = true;
                $item->load('projects');
            }

            $storedPayload = json_decode($item->payload ?? '[]', true);
            if (! is_array($storedPayload)) {
                $storedPayload = [];
            }
            $mergedPayload = array_merge($storedPayload, $payload);
            $this->putWorkflowValuesIntoPayload($mergedPayload, $item);
            $item->payload = json_encode($mergedPayload, JSON_UNESCAPED_UNICODE);
            $item->save();

            $newApprovers = $this->resolveApprovers($payload, 'proposal');
            if (count($newApprovers) >= 2 && $item->status !== self::STATUS_PENDING_CONTRACT) {
                $hasApprovalAction = $item->approvals->contains(function ($approval) {
                    return $approval->decision !== 'pending';
                });

                if ($hasApprovalAction) {
                    DB::rollBack();
                    return $this->errorResponse('มีผู้อนุมัติดำเนินการแล้ว ไม่สามารถเปลี่ยนชุดผู้อนุมัติได้', 422);
                }

                ProposalContractReviewApproval::where('proposal_contract_review_id', $item->id)->delete();
                $this->createApprovalRows($item, $newApprovers, $actorId, ['proposal']);
            }

            $this->syncProjectReferences($item);

            DB::commit();

            $fresh = $item->fresh(['approvals', 'projects']);
            if ($shouldNotifyContractApprovers && $fresh) {
                $this->notifyContractSetupParticipants($fresh);
            }

            return $this->returnUpdateReturnData('อัปเดตข้อมูลสำเร็จ', $this->transformItem($fresh));
        } catch (\InvalidArgumentException $e) {
            DB::rollBack();

            return $this->errorResponse($e->getMessage(), 422);
        } catch (\Throwable $e) {
            DB::rollBack();

            return $this->errorResponse($e->getMessage(), 500);
        }
    }

    public function nextNumber(Request $request)
    {
        try {
            $discipline = $this->numberService->normalizeDiscipline(
                $request->input('primary_discipline') ?? $request->input('discipline'),
                $request->all()
            );
            $series = $this->numberService->seriesFor($discipline);

            return $this->returnSuccess('success', [
                'primary_discipline' => $discipline,
                'proposal_prefix' => $series['proposal'],
                'mt_prefix' => $series['contract'],
                'proposal_number' => $this->numberService->nextProposalNumber($discipline),
            ]);
        } catch (\Throwable $e) {
            return $this->errorResponse($e->getMessage(), 500);
        }
    }

    public function actionItems(Request $request)
    {
        $approverCode = $this->resolveActorCode($request);
        if ($approverCode === '') {
            return $this->errorResponse('กรุณาระบุ user_code หรือ approver_code', 422);
        }

        try {
            $approvals = ProposalContractReviewApproval::with(['review.approvals', 'review.projects'])
                ->where('approver_code', $approverCode)
                ->where('decision', 'pending')
                ->whereHas('review', function ($reviewQuery) {
                    $reviewQuery->where('is_latest_revision', true);
                })
                ->where(function ($query) {
                    $query->where(function ($subQuery) {
                        $subQuery->where('stage', 'proposal')
                            ->whereHas('review', function ($reviewQuery) {
                                $reviewQuery->where('status', self::STATUS_PENDING_PROPOSAL)
                                    ->where('is_latest_revision', true);
                            });
                    })->orWhere(function ($subQuery) {
                        $subQuery->where('stage', 'contract')
                            ->whereHas('review', function ($reviewQuery) {
                                $reviewQuery->where('status', self::STATUS_PENDING_CONTRACT)
                                    ->where('is_latest_revision', true);
                            });
                    });
                })
                ->orderBy('id', 'desc')
                ->get();

            $items = $approvals->map(function ($approval) {
                $row = $this->transformItem($approval->review);
                $row['action_stage'] = $approval->stage;
                $row['action_role'] = $approval->role;
                $row['approval_id'] = $approval->id;

                return $row;
            })->values();

            return $this->returnSuccess('success', $items);
        } catch (\Throwable $e) {
            return $this->errorResponse($e->getMessage(), 500);
        }
    }

    public function proposalReview(Request $request, $id)
    {
        $decision = $this->resolveProposalDecision($request);
        if ($decision === null) {
            return $this->errorResponse('กรุณาเลือก Proposal to be submitted หรือ Decline', 422);
        }

        $winProbability = $this->numericValue($request->input('win_probability') ?? $request->input('winProbability'));

        DB::beginTransaction();

        try {
            $item = $this->newQuery()->with(['approvals', 'projects'])->where('id', $id)->lockForUpdate()->first();
            if (! $item) {
                DB::rollBack();
                return $this->errorResponse('ไม่พบข้อมูล', 404);
            }

            if (! $item->is_latest_revision || $item->locked_at !== null) {
                DB::rollBack();
                return $this->errorResponse('เอกสารนี้ถูกล็อก ไม่สามารถอนุมัติได้', 422);
            }

            if ($item->status !== self::STATUS_PENDING_PROPOSAL) {
                DB::rollBack();
                return $this->errorResponse('เอกสารไม่ได้อยู่ในขั้นตอน Proposal Review', 422);
            }

            $approverCode = $this->resolveActorCode($request);
            $approval = $this->pendingApproval($item, 'proposal', $approverCode);
            if (! $approval) {
                DB::rollBack();
                return $this->errorResponse('ผู้ใช้นี้ไม่มีสิทธิ์อนุมัติหรือได้อนุมัติไปแล้ว', 403);
            }

            if ($item->proposal_decision !== null && $item->proposal_decision !== $decision) {
                DB::rollBack();
                return $this->errorResponse('ผลการพิจารณา Proposal ถูกเลือกไว้แล้ว กรุณาใช้ผลเดิม', 422);
            }

            if ($decision === 'submitted' && $item->win_probability === null && $winProbability === null) {
                DB::rollBack();
                return $this->errorResponse('กรุณาระบุ % Win Probability', 422);
            }

            $item->proposal_decision = $decision;
            $item->proposal_to_be_submitted = $decision === 'submitted' ? 'Yes' : 'No';
            if ($decision === 'submitted' && $item->win_probability === null) {
                $item->win_probability = $winProbability;
            }
            $item->update_by = $this->resolveActorId($request);

            $approval->decision = $decision === 'declined' ? 'declined' : 'approved';
            $approval->win_probability = $item->win_probability;
            $approval->comment = $request->input('comment');
            $approval->acted_at = Carbon::now();
            $approval->update_by = $this->resolveActorId($request);
            $approval->save();

            if ($decision === 'declined') {
                $item->status = self::STATUS_DECLINED;
                $item->proposal_reviewed_at = Carbon::now();
                $item->completed_at = Carbon::now();
            } elseif ($this->allStageApproved($item, 'proposal')) {
                $item->status = self::STATUS_PENDING_CONTRACT;
                $item->proposal_reviewed_at = Carbon::now();
            }

            $payload = $this->payloadArray($item);
            $this->putWorkflowValuesIntoPayload($payload, $item);
            $item->payload = json_encode($payload, JSON_UNESCAPED_UNICODE);
            $item->save();
            $this->syncProjectReferences($item);

            $this->logActionRequestAudit(
                $request,
                'postman_proposal_contract_reviews',
                $item->id,
                'proposal_decision',
                'pending',
                $approval->decision,
                $request->input('comment')
            );

            DB::commit();

            $fresh = $item->fresh(['approvals', 'projects']);
            if ($fresh && $fresh->status === self::STATUS_PENDING_CONTRACT) {
                $this->notifyApprovers($fresh, 'contract');
            }

            return $this->returnUpdateReturnData('อัปเดตข้อมูลสำเร็จ', $this->transformItem($fresh));
        } catch (\Throwable $e) {
            DB::rollBack();

            return $this->errorResponse($e->getMessage(), 500);
        }
    }

    public function contractReview(Request $request, $id)
    {
        DB::beginTransaction();

        try {
            $item = $this->newQuery()->with(['approvals', 'projects'])->where('id', $id)->lockForUpdate()->first();
            if (! $item) {
                DB::rollBack();
                return $this->errorResponse('ไม่พบข้อมูล', 404);
            }

            if (! $item->is_latest_revision || $item->locked_at !== null) {
                DB::rollBack();
                return $this->errorResponse('เอกสารนี้ถูกล็อก ไม่สามารถอนุมัติได้', 422);
            }

            if ($item->status !== self::STATUS_PENDING_CONTRACT) {
                DB::rollBack();
                return $this->errorResponse('เอกสารไม่ได้อยู่ในขั้นตอน Contract Review', 422);
            }

            $approverCode = $this->resolveActorCode($request);
            $approval = $this->pendingApproval($item, 'contract', $approverCode);
            if (! $approval) {
                DB::rollBack();
                return $this->errorResponse('ผู้ใช้นี้ไม่มีสิทธิ์อนุมัติหรือได้อนุมัติไปแล้ว', 403);
            }

            $incomingDecision = $this->resolveContractDecision($request);
            $isDecisionMaker = $approval->role === 'MD_DI';

            if (! $isDecisionMaker && $incomingDecision !== null) {
                DB::rollBack();
                return $this->errorResponse('เฉพาะ MD/DI เท่านั้นที่เลือกผล Contract Review ได้', 422);
            }

            if ($isDecisionMaker && $item->contract_decision === null && $incomingDecision === null) {
                DB::rollBack();
                return $this->errorResponse('กรุณาเลือก Contract Agreed to Proceed หรือ Decline', 422);
            }

            if (! $isDecisionMaker && $item->contract_decision === null) {
                DB::rollBack();
                return $this->errorResponse('รอ MD/DI เลือกผล Contract Review ก่อน', 422);
            }

            if ($incomingDecision !== null && $item->contract_decision !== null && $item->contract_decision !== $incomingDecision) {
                DB::rollBack();
                return $this->errorResponse('ผล Contract Review ถูกเลือกไว้แล้ว กรุณาใช้ผลเดิม', 422);
            }

            if ($isDecisionMaker && $incomingDecision === 'proceed') {
                $needPqp = $this->resolveYesNo($request->input('need_quality_plan_pqp') ?? $request->input('needQualityPlanPqp'));
                if ($needPqp === null) {
                    DB::rollBack();
                    return $this->errorResponse('กรุณาเลือก Need to proceed a Project Quality Plan', 422);
                }

                $item->contract_decision = 'proceed';
                $item->contract_agreed_to_proceed = 'Yes';
                $item->need_quality_plan_pqp = $needPqp;

                if ($item->projects()->whereNull('deleted_at')->count() === 0) {
                    $projects = $this->createProposalProjects($item, $request->all(), $this->resolveActorId($request));
                    $firstProject = $projects[0] ?? null;
                } else {
                    $firstProject = $item->projects()->whereNull('deleted_at')->orderBy('sequence_no')->orderBy('id')->first();
                }

                if ($firstProject) {
                    $item->mt_project_no = $firstProject->mt_project_no;
                    $item->project_no = $firstProject->project_no ?: $firstProject->mt_project_no;
                }
                $item->load('projects');
            } elseif ($isDecisionMaker && $incomingDecision === 'declined') {
                $item->contract_decision = 'declined';
                $item->contract_agreed_to_proceed = 'No';
                $item->need_quality_plan_pqp = null;
                $item->mt_project_no = null;
                $item->project_no = null;
                $item->projects()->delete();
                $item->setRelation('projects', collect());
            }

            $approval->decision = $item->contract_decision === 'declined' ? 'declined' : 'approved';
            $approval->comment = $request->input('comment');
            $approval->acted_at = Carbon::now();
            $approval->update_by = $this->resolveActorId($request);
            $approval->save();

            if ($item->contract_decision === 'declined') {
                $item->status = self::STATUS_DECLINED;
                $item->contract_reviewed_at = Carbon::now();
                $item->completed_at = Carbon::now();
            } elseif ($this->allStageApproved($item, 'contract')) {
                $item->status = self::STATUS_CONTRACT_APPROVED;
                $item->contract_reviewed_at = Carbon::now();
                $item->completed_at = Carbon::now();
            }

            $item->update_by = $this->resolveActorId($request);
            $payload = $this->payloadArray($item);
            $this->putWorkflowValuesIntoPayload($payload, $item);
            $item->payload = json_encode($payload, JSON_UNESCAPED_UNICODE);
            $item->save();
            $this->syncProjectReferences($item);

            $this->logActionRequestAudit(
                $request,
                'postman_proposal_contract_reviews',
                $item->id,
                'contract_decision',
                'pending',
                $approval->decision,
                $request->input('comment')
            );

            DB::commit();

            return $this->returnUpdateReturnData('อัปเดตข้อมูลสำเร็จ', $this->transformItem($item->fresh(['approvals', 'projects'])));
        } catch (\InvalidArgumentException $e) {
            DB::rollBack();

            return $this->errorResponse($e->getMessage(), 422);
        } catch (\Throwable $e) {
            DB::rollBack();

            return $this->errorResponse($e->getMessage(), 500);
        }
    }

    public function projects($id)
    {
        try {
            $item = $this->newQuery()->with('projects')->where('id', $id)->first();
            if (! $item) {
                return $this->errorResponse('ไม่พบข้อมูล', 404);
            }

            return $this->returnSuccess('success', $item->projects->map(function ($project) {
                return $this->transformProject($project);
            })->values()->all());
        } catch (\Throwable $e) {
            return $this->errorResponse($e->getMessage(), 500);
        }
    }

    public function storeProject(Request $request, $id)
    {
        DB::beginTransaction();

        try {
            $item = $this->newQuery()->with(['approvals', 'projects'])->where('id', $id)->lockForUpdate()->first();
            if (! $item) {
                DB::rollBack();
                return $this->errorResponse('ไม่พบข้อมูล', 404);
            }

            if ($item->contract_decision !== 'proceed') {
                DB::rollBack();
                return $this->errorResponse('ต้องอนุมัติ Contract Review เป็น Proceed ก่อนเพิ่ม MT Project', 422);
            }

            $actorId = $this->resolveActorId($request);
            $projects = $this->createProposalProjects($item, ['mt_projects' => [$request->all()]], $actorId);
            $firstProject = $item->projects()->whereNull('deleted_at')->orderBy('sequence_no')->orderBy('id')->first();

            if (($item->mt_project_no === null || $item->mt_project_no === '') && $firstProject) {
                $item->mt_project_no = $firstProject->mt_project_no;
                $item->project_no = $firstProject->project_no ?: $firstProject->mt_project_no;
            }

            $item->load('projects');
            $item->update_by = $actorId;
            $payload = $this->payloadArray($item);
            $this->putWorkflowValuesIntoPayload($payload, $item);
            $item->payload = json_encode($payload, JSON_UNESCAPED_UNICODE);
            $item->save();
            $this->syncProjectReferences($item);

            DB::commit();

            return $this->returnSuccess('บันทึกข้อมูลสำเร็จ', [
                'project' => $this->transformProject($projects[0]),
                'review' => $this->transformItem($item->fresh(['approvals', 'projects'])),
            ]);
        } catch (\InvalidArgumentException $e) {
            DB::rollBack();

            return $this->errorResponse($e->getMessage(), 422);
        } catch (\Throwable $e) {
            DB::rollBack();

            return $this->errorResponse($e->getMessage(), 500);
        }
    }

    private function activeReviewQuery()
    {
        return $this->newQuery()->where('is_latest_revision', true);
    }

    private function syncProjectReferences(PostmanProposalContractReview $item): void
    {
        $projects = $item->projects()
            ->whereNull('deleted_at')
            ->orderBy('sequence_no')
            ->orderBy('id')
            ->get();

        if ($projects->isEmpty()) {
            ProposalProjectReference::withTrashed()->updateOrCreate(
                [
                    'proposal_contract_review_id' => $item->id,
                    'proposal_contract_review_project_id' => null,
                ],
                [
                    'proposal_number' => $item->proposal_number,
                    'project_number' => $item->project_no ?: $item->mt_project_no,
                    'project_name' => $item->project_name,
                    'status' => $item->status ?: 'active',
                    'metadata' => ['source' => 'proposal_contract_review'],
                    'deleted_at' => null,
                ]
            );

            ProposalProjectReference::where('proposal_contract_review_id', $item->id)
                ->whereNotNull('proposal_contract_review_project_id')
                ->update(['status' => 'inactive']);

            return;
        }

        $projectIds = [];
        foreach ($projects as $project) {
            $projectIds[] = $project->id;

            ProposalProjectReference::withTrashed()->updateOrCreate(
                ['proposal_contract_review_project_id' => $project->id],
                [
                    'proposal_contract_review_id' => $item->id,
                    'proposal_number' => $project->proposal_number ?: $item->proposal_number,
                    'project_number' => $project->project_no ?: $project->mt_project_no,
                    'project_name' => $project->project_name ?: $item->project_name,
                    'status' => $project->status ?: ($item->status ?: 'active'),
                    'metadata' => ['source' => 'proposal_contract_review_project'],
                    'deleted_at' => null,
                ]
            );
        }

        ProposalProjectReference::where('proposal_contract_review_id', $item->id)
            ->whereNull('proposal_contract_review_project_id')
            ->update(['status' => 'inactive']);

        ProposalProjectReference::where('proposal_contract_review_id', $item->id)
            ->whereNotNull('proposal_contract_review_project_id')
            ->whereNotIn('proposal_contract_review_project_id', $projectIds)
            ->update(['status' => 'inactive']);
    }

    private function documentNumbersFor(PostmanProposalContractReview $item): array
    {
        $contractProceeded = $item->contract_decision === 'proceed'
            || $item->contract_agreed_to_proceed === 'Yes';

        $projectNo = $item->project_no;
        $mtProjectNo = $item->mt_project_no;

        if ($contractProceeded && ($projectNo === null || $projectNo === '' || $mtProjectNo === null || $mtProjectNo === '')) {
            $firstProject = null;
            if ($item->relationLoaded('projects')) {
                $firstProject = $item->projects->first();
            } elseif ($item->exists) {
                $firstProject = $item->projects()->whereNull('deleted_at')->orderBy('sequence_no')->orderBy('id')->first();
            }

            if ($firstProject) {
                $mtProjectNo = $mtProjectNo ?: $firstProject->mt_project_no;
                $projectNo = $projectNo ?: ($firstProject->project_no ?: $firstProject->mt_project_no);
            }
        }

        return [
            'proposal_number' => $item->proposal_number,
            'project_no' => $contractProceeded ? $projectNo : null,
            'mt_project_no' => $contractProceeded ? $mtProjectNo : null,
        ];
    }

    private function createProposalProjects(PostmanProposalContractReview $item, array $payload, string $actorId): array
    {
        $rows = $this->proposalProjectRowsFromPayload($payload);
        if (count($rows) === 0) {
            $rows = [[]];
        }

        $created = [];
        $sequenceNo = ((int) $item->projects()->whereNull('deleted_at')->max('sequence_no')) + 1;
        $seenNumbers = [];

        foreach ($rows as $index => $row) {
            if (! is_array($row)) {
                continue;
            }

            $discipline = $this->numberService->normalizeDiscipline(
                $this->payloadValue($row, ['primary_discipline', 'primaryDiscipline', 'discipline']),
                $row
            );
            if ($discipline === 'general' && ! empty($item->primary_discipline)) {
                $discipline = $item->primary_discipline;
            }

            $mtProjectNo = $this->payloadValue($row, ['mt_project_no', 'mtProjectNo', 'project_no', 'projectNo', 'projectNumber']);
            if ($mtProjectNo === null) {
                $mtProjectNo = $this->numberService->nextContractNumber($discipline);
            }

            if (isset($seenNumbers[$mtProjectNo]) || $this->mtProjectNoExists($mtProjectNo, $item->id)) {
                throw new \InvalidArgumentException("mt_project_no {$mtProjectNo} ถูกใช้แล้ว");
            }
            $seenNumbers[$mtProjectNo] = true;

            $project = new PostmanProposalContractReviewProject();
            $project->proposal_contract_review_id = $item->id;
            $project->proposal_number = $item->proposal_number;
            $project->mt_project_no = $mtProjectNo;
            $project->project_no = $this->payloadValue($row, ['project_no', 'projectNo', 'projectNumber']) ?: $mtProjectNo;
            $project->project_name = $this->payloadValue($row, ['project_name', 'projectName']) ?: $item->project_name;
            $project->primary_discipline = $discipline;
            $project->project_type = $this->payloadValue($row, ['project_type', 'projectType', 'project_type_id']) ?: $item->project_type;
            $project->currency = strtoupper((string) ($this->payloadValue($row, ['currency']) ?: $item->currency));
            $project->estimated_total_fees = $this->numericValue(
                $this->payloadValue($row, ['estimated_total_fees', 'estimatedTotalFees']),
                $item->estimated_total_fees
            );
            $project->sequence_no = (int) ($this->numericValue($this->payloadValue($row, ['sequence_no', 'sequenceNo']), $sequenceNo + $index));
            $project->status = $this->payloadValue($row, ['status']) ?: 'active';
            $project->converted_at = Carbon::now();
            $project->metadata = $row;
            $project->create_by = $actorId;
            $project->update_by = $actorId;
            $project->save();

            $created[] = $project;
        }

        if (count($created) === 0) {
            throw new \InvalidArgumentException('กรุณาระบุข้อมูล MT Project อย่างน้อย 1 รายการ');
        }

        return $created;
    }

    private function proposalProjectRowsFromPayload(array $payload): array
    {
        foreach (['mt_projects', 'mtProjects', 'proposal_projects', 'proposalProjects', 'projects'] as $key) {
            if (! array_key_exists($key, $payload)) {
                continue;
            }

            $rows = $payload[$key];
            if (is_string($rows)) {
                $decoded = json_decode($rows, true);
                $rows = is_array($decoded) ? $decoded : [];
            }

            if (! is_array($rows)) {
                return [];
            }

            if ($this->isAssocArray($rows)) {
                return [$rows];
            }

            return array_values($rows);
        }

        return [];
    }

    private function isAssocArray(array $value): bool
    {
        if ($value === []) {
            return false;
        }

        return array_keys($value) !== range(0, count($value) - 1);
    }

    private function mtProjectNoExists(string $mtProjectNo, int $currentReviewId): bool
    {
        $existsInProjects = PostmanProposalContractReviewProject::withTrashed()
            ->where('mt_project_no', $mtProjectNo)
            ->exists();

        if ($existsInProjects) {
            return true;
        }

        return PostmanProposalContractReview::query()
            ->where('id', '!=', $currentReviewId)
            ->where('mt_project_no', $mtProjectNo)
            ->exists();
    }

    private function transformProject(PostmanProposalContractReviewProject $project): array
    {
        return [
            'id' => $project->id,
            'proposal_contract_review_id' => $project->proposal_contract_review_id,
            'proposal_number' => $project->proposal_number,
            'mt_project_no' => $project->mt_project_no,
            'mtProjectNo' => $project->mt_project_no,
            'project_no' => $project->project_no,
            'projectNo' => $project->project_no,
            'project_name' => $project->project_name,
            'projectName' => $project->project_name,
            'primary_discipline' => $project->primary_discipline,
            'primaryDiscipline' => $project->primary_discipline,
            'project_type' => $project->project_type,
            'projectType' => $project->project_type,
            'currency' => $project->currency,
            'estimated_total_fees' => $project->estimated_total_fees,
            'estimatedTotalFees' => $project->estimated_total_fees,
            'sequence_no' => $project->sequence_no,
            'sequenceNo' => $project->sequence_no,
            'status' => $project->status,
            'converted_at' => $project->converted_at,
            'created_at' => $project->created_at,
            'updated_at' => $project->updated_at,
        ];
    }

    private function stripRuntimePayload(array $payload): array
    {
        foreach ([
            'id',
            'No',
            'approvals',
            'projects',
            'mt_projects',
            'mtProjects',
            'proposal_projects',
            'proposalProjects',
            'approval_id',
            'action_stage',
            'action_role',
            'current_stage',
            'create_by',
            'update_by',
            'created_at',
            'updated_at',
            'submitted_at',
            'proposal_reviewed_at',
            'contract_reviewed_at',
            'completed_at',
            'locked_at',
        ] as $key) {
            unset($payload[$key]);
        }

        return $payload;
    }

    private function approversFromExistingStage(PostmanProposalContractReview $item, string $stage): array
    {
        if (! $item->relationLoaded('approvals')) {
            $item->load('approvals');
        }

        return $item->approvals
            ->where('stage', $stage)
            ->sortBy('sequence')
            ->values()
            ->map(function ($approval) {
                return [
                    'code' => $approval->approver_code,
                    'name' => $approval->approver_name,
                    'email' => $approval->approver_email,
                    'role' => $approval->role,
                    'sequence' => $approval->sequence,
                ];
            })
            ->filter(function ($approver) {
                return trim((string) ($approver['code'] ?? '')) !== '';
            })
            ->values()
            ->all();
    }

    protected function transformItem(Model $item): array
    {
        $payload = $this->payloadArray($item);
        $this->removeRevisionPayloadValues($payload);

        $meta = [
            'id' => $item->id,
            'create_by' => $item->create_by,
            'update_by' => $item->update_by,
            'created_at' => $item->created_at,
            'updated_at' => $item->updated_at,
            'submitted_at' => $item->submitted_at,
            'proposal_reviewed_at' => $item->proposal_reviewed_at,
            'contract_reviewed_at' => $item->contract_reviewed_at,
            'completed_at' => $item->completed_at,
        ];

        foreach (array_keys($this->coreFieldMap) as $column) {
            $meta[$column] = $item->{$column};
        }

        $documentNumbers = $this->documentNumbersFor($item);
        $meta['proposal_number'] = $documentNumbers['proposal_number'];
        $meta['project_no'] = $documentNumbers['project_no'];
        $meta['mt_project_no'] = $documentNumbers['mt_project_no'];

        if (! $item->relationLoaded('approvals')) {
            $item->load('approvals');
        }

        if (! $item->relationLoaded('projects')) {
            $item->load('projects');
        }

        $meta['approvals'] = $item->approvals->values()->map(function ($approval) {
            return [
                'id' => $approval->id,
                'stage' => $approval->stage,
                'approver_code' => $approval->approver_code,
                'approver_name' => $approval->approver_name,
                'approver_email' => $approval->approver_email,
                'role' => $approval->role,
                'sequence' => $approval->sequence,
                'decision' => $approval->decision,
                'win_probability' => $approval->win_probability,
                'comment' => $approval->comment,
                'acted_at' => $approval->acted_at,
            ];
        })->all();

        $projects = $item->projects->values()->map(function ($project) {
            return $this->transformProject($project);
        })->all();

        $meta['projects'] = $projects;
        $meta['mt_projects'] = $projects;

        $meta['current_stage'] = $this->currentStage($item->status);

        return array_merge($payload, $meta);
    }

    private function removeRevisionPayloadValues(array &$payload): void
    {
        foreach ([
            'root_review_id',
            'rootReviewId',
            'revision_no',
            'revisionNo',
            'revision_label',
            'revisionLabel',
            'revision_reason',
            'revisionReason',
            'revision_summary',
            'revisionSummary',
            'revised_from_id',
            'revisedFromId',
            'is_latest_revision',
            'isLatestRevision',
            'locked_at',
            'lockedAt',
            'revision_display',
            'revision_history',
            'revisionHistory',
        ] as $key) {
            unset($payload[$key]);
        }
    }

    private function cleanPayload(Request $request): array
    {
        $payload = $request->except(['login_by', 'login_id']);
        unset($payload['_method']);

        return $payload;
    }

    private function validateCreatePayload(array $payload, bool $requireApprovers = true): ?string
    {
        foreach ([
            'project_name' => ['project_name', 'projectName'],
            'city' => ['city'],
            'country' => ['country'],
            'client_name' => ['client_name', 'clientName'],
            'project_type' => ['project_type', 'projectType', 'project_type_id'],
            'currency' => ['currency'],
            'filled_in_by' => ['filled_in_by', 'preparedBy', 'filledInBy'],
        ] as $label => $keys) {
            if ($this->payloadValue($payload, $keys) === null) {
                return 'กรุณาระบุ ' . $label;
            }
        }

        $currency = strtoupper((string) $this->payloadValue($payload, ['currency']));
        if (! in_array($currency, ['THB', 'USD'], true)) {
            return 'currency ต้องเป็น THB หรือ USD';
        }

        $feeCalculationAttached = $this->resolveBoolean(
            $this->payloadValue($payload, ['fee_calculation_attached', 'feeCalculationAttached'])
        );
        if ($feeCalculationAttached === true && ! $this->hasTypedAttachment($payload, ['fee_calculation', 'fee'])) {
            return 'กรุณาแนบไฟล์ Fee Calculation อย่างน้อย 1 ไฟล์';
        }

        if ($this->resolveProposalDecisionFromPayload($payload) === 'submitted'
            && $this->numericValue($this->payloadValue($payload, ['win_probability', 'winProbability'])) === null) {
            return 'กรุณาระบุ % Win Probability';
        }

        if ($requireApprovers && count($this->resolveApprovers($payload, 'proposal')) < 2) {
            return 'กรุณาระบุผู้ลงนาม Proposal Review อย่างน้อย 2 คน';
        }

        return null;
    }

    private function hasTypedAttachment(array $payload, array $acceptedTypes): bool
    {
        $attachments = $payload['attachments'] ?? $payload['Attachments'] ?? [];
        if (is_string($attachments)) {
            $decoded = json_decode($attachments, true);
            $attachments = is_array($decoded) ? $decoded : [];
        }

        if (! is_array($attachments)) {
            return false;
        }

        $normalizedTypes = array_map(function ($type) {
            return strtolower(trim((string) $type));
        }, $acceptedTypes);

        foreach ($attachments as $attachment) {
            if (is_string($attachment)) {
                continue;
            }

            if (! is_array($attachment)) {
                continue;
            }

            $type = strtolower(trim((string) ($attachment['type'] ?? $attachment['attachment_type'] ?? '')));
            if (! in_array($type, $normalizedTypes, true)) {
                continue;
            }

            foreach (['file_path', 'path', 'file_url', 'url'] as $key) {
                if (isset($attachment[$key]) && trim((string) $attachment[$key]) !== '') {
                    return true;
                }
            }
        }

        return false;
    }

    private function resolveApprovers(array $payload, string $stage = 'proposal'): array
    {
        $raw = [];

        if ($stage === 'proposal' && isset($payload['approvers']) && is_array($payload['approvers'])) {
            $raw = $payload['approvers'];
        } else {
            $reviewerKeySets = $stage === 'contract'
                ? [
                    ['contract_reviewer1', 'contractReviewer1'],
                    ['contract_reviewer2', 'contractReviewer2'],
                    ['contract_reviewer3', 'contractReviewer3'],
                ]
                : [
                    ['proposal_reviewer1', 'proposalReviewer1'],
                    ['proposal_reviewer2', 'proposalReviewer2'],
                    ['proposal_reviewer3', 'proposalReviewer3'],
                ];

            foreach ($reviewerKeySets as $index => $keys) {
                $code = $this->payloadValue($payload, $keys);
                if ($code !== null) {
                    $raw[] = [
                        'code' => $code,
                        'role' => $index === 0 ? 'MD_DI' : 'DI',
                    ];
                }
            }
        }

        $approvers = [];
        $seen = [];
        $hasDuplicate = false;

        foreach (array_values($raw) as $index => $entry) {
            $code = is_array($entry)
                ? ($entry['code'] ?? $entry['employee_code'] ?? $entry['approver_code'] ?? $entry['value'] ?? null)
                : $entry;

            $code = trim((string) $code);
            if ($code === '') {
                continue;
            }

            $employee = $this->employeeByCodeOrId($code);
            if ($employee) {
                $code = (string) $employee->code;
            }

            if (isset($seen[$code])) {
                $hasDuplicate = true;
                continue;
            }
            $seen[$code] = true;

            $role = is_array($entry) && ! empty($entry['role'])
                ? $this->normalizeRole((string) $entry['role'])
                : ($index === 0 ? 'MD_DI' : 'DI');

            if ($index === 0) {
                $role = 'MD_DI';
            }

            $approvers[] = [
                'code' => $code,
                'name' => $employee ? trim(($employee->firstname ?? '') . ' ' . ($employee->lastname ?? '')) : null,
                'email' => $employee->email ?? null,
                'role' => $role,
                'sequence' => $index + 1,
            ];
        }

        if ($hasDuplicate) {
            return [];
        }

        return count($approvers) >= 2 ? $approvers : [];
    }

    private function createApprovalRows(PostmanProposalContractReview $item, array $approvers, string $actorId, array $stages = ['proposal', 'contract']): void
    {
        foreach ($stages as $stage) {
            foreach ($approvers as $index => $approver) {
                ProposalContractReviewApproval::withTrashed()->updateOrCreate([
                    'proposal_contract_review_id' => $item->id,
                    'stage' => $stage,
                    'approver_code' => $approver['code'],
                ], [
                    'approver_name' => $approver['name'],
                    'approver_email' => $approver['email'],
                    'role' => $index === 0 ? 'MD_DI' : 'DI',
                    'sequence' => $index + 1,
                    'decision' => 'pending',
                    'create_by' => $actorId,
                    'update_by' => $actorId,
                    'win_probability' => null,
                    'comment' => null,
                    'acted_at' => null,
                    'deleted_at' => null,
                ]);
            }
        }
    }

    private function pendingApproval(PostmanProposalContractReview $item, string $stage, string $approverCode): ?ProposalContractReviewApproval
    {
        if ($approverCode === '') {
            return null;
        }

        return ProposalContractReviewApproval::query()
            ->where('proposal_contract_review_id', $item->id)
            ->where('stage', $stage)
            ->where('approver_code', $approverCode)
            ->where('decision', 'pending')
            ->first();
    }

    private function allStageApproved(PostmanProposalContractReview $item, string $stage): bool
    {
        return ProposalContractReviewApproval::query()
            ->where('proposal_contract_review_id', $item->id)
            ->where('stage', $stage)
            ->where('decision', '!=', 'approved')
            ->count() === 0;
    }

    private function payloadValue(array $payload, array $keys): ?string
    {
        foreach ($keys as $key) {
            if (! array_key_exists($key, $payload)) {
                continue;
            }

            $value = $payload[$key];
            if ($value === null) {
                return null;
            }

            if (is_bool($value)) {
                return $value ? 'Yes' : 'No';
            }

            if (is_scalar($value)) {
                $string = trim((string) $value);

                return $string === '' ? null : $string;
            }
        }

        return null;
    }

    private function numericValue($value, $default = null)
    {
        if ($value === null || $value === '') {
            return $default;
        }

        if (is_numeric($value)) {
            return (float) $value;
        }

        $normalized = str_replace(',', '', (string) $value);

        return is_numeric($normalized) ? (float) $normalized : $default;
    }

    private function payloadArray(PostmanProposalContractReview $item): array
    {
        $payload = json_decode($item->payload ?? '[]', true);

        return is_array($payload) ? $payload : [];
    }

    private function putWorkflowValuesIntoPayload(array &$payload, PostmanProposalContractReview $item): void
    {
        $documentNumbers = $this->documentNumbersFor($item);

        $payload['proposal_number'] = $item->proposal_number;
        $payload['proposalNumber'] = $item->proposal_number;
        $payload['project_no'] = $documentNumbers['project_no'];
        $payload['projectNo'] = $documentNumbers['project_no'];
        $payload['mt_project_no'] = $documentNumbers['mt_project_no'];
        $payload['mtProjectNo'] = $documentNumbers['mt_project_no'];
        if ($item->relationLoaded('projects')) {
            $projects = $item->projects->values()->map(function ($project) {
                return $this->transformProject($project);
            })->all();

            $payload['projects'] = $projects;
            $payload['mt_projects'] = $projects;
            $payload['mtProjects'] = $projects;
        }
        $payload['primary_discipline'] = $item->primary_discipline;
        $payload['primaryDiscipline'] = $item->primary_discipline;
        $payload['proposal_decision'] = $item->proposal_decision;
        $payload['proposalDecision'] = $item->proposal_decision;
        $payload['proposal_to_be_submitted'] = $item->proposal_to_be_submitted;
        $payload['win_probability'] = $item->win_probability;
        $payload['winProbability'] = $item->win_probability;
        $payload['contract_decision'] = $item->contract_decision;
        $payload['contractDecision'] = $item->contract_decision;
        $payload['contract_agreed_to_proceed'] = $item->contract_agreed_to_proceed;
        $payload['contractAgreedToProceed'] = $item->contract_agreed_to_proceed;
        $payload['need_quality_plan_pqp'] = $item->need_quality_plan_pqp;
        $payload['needQualityPlanPqp'] = $item->need_quality_plan_pqp;
        $payload['status'] = $item->status;
    }

    private function resolveProposalDecision(Request $request): ?string
    {
        $raw = strtolower(trim((string) ($request->input('proposal_decision') ?? $request->input('proposalDecision'))));
        if (in_array($raw, ['submitted', 'submit', 'proposal_to_be_submitted', 'proposal to be submitted'], true)) {
            return 'submitted';
        }
        if (in_array($raw, ['declined', 'decline', 'no'], true)) {
            return 'declined';
        }

        $submitted = $this->resolveBoolean($request->input('proposal_to_be_submitted'));
        $declined = $this->resolveBoolean($request->input('proposal_decline') ?? $request->input('proposalDecline'));

        if ($submitted === true && $declined === true) {
            return null;
        }

        if ($submitted === true) {
            return 'submitted';
        }

        if ($declined === true || $submitted === false) {
            return 'declined';
        }

        return null;
    }

    private function resolveProposalDecisionFromPayload(array $payload): ?string
    {
        $raw = strtolower(trim((string) $this->payloadValue($payload, ['proposal_decision', 'proposalDecision'])));
        if (in_array($raw, ['submitted', 'submit', 'proposal_to_be_submitted', 'proposal to be submitted'], true)) {
            return 'submitted';
        }
        if (in_array($raw, ['declined', 'decline', 'no'], true)) {
            return 'declined';
        }

        $submitted = $this->resolveBoolean($this->payloadValue($payload, ['proposal_to_be_submitted', 'proposalToBeSubmitted']));
        $declined = $this->resolveBoolean($this->payloadValue($payload, ['proposal_decline', 'proposalDecline']));

        if ($submitted === true && $declined !== true) {
            return 'submitted';
        }
        if ($declined === true) {
            return 'declined';
        }

        return null;
    }

    private function resolveContractDecision(Request $request): ?string
    {
        $raw = strtolower(trim((string) ($request->input('contract_decision') ?? $request->input('contractDecision'))));
        if (in_array($raw, ['proceed', 'agreed', 'contract_agreed_to_proceed', 'contract agreed to proceed'], true)) {
            return 'proceed';
        }
        if (in_array($raw, ['declined', 'decline', 'no'], true)) {
            return 'declined';
        }

        $proceed = $this->resolveBoolean($request->input('contract_agreed_to_proceed'));
        $declined = $this->resolveBoolean($request->input('contract_decline') ?? $request->input('contractDecline'));

        if ($proceed === true && $declined === true) {
            return null;
        }

        if ($proceed === true) {
            return 'proceed';
        }

        if ($declined === true || $proceed === false) {
            return 'declined';
        }

        return null;
    }

    private function resolveYesNo($value): ?string
    {
        $bool = $this->resolveBoolean($value);

        if ($bool === null) {
            return null;
        }

        return $bool ? 'Yes' : 'No';
    }

    private function resolveBoolean($value): ?bool
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_bool($value)) {
            return $value;
        }

        $normalized = strtolower(trim((string) $value));
        if (in_array($normalized, ['1', 'true', 'yes', 'y'], true)) {
            return true;
        }
        if (in_array($normalized, ['0', 'false', 'no', 'n'], true)) {
            return false;
        }

        return null;
    }

    private function resolveActorCode(Request $request): string
    {
        foreach (['approver_code', 'approverCode', 'user_code', 'userCode'] as $key) {
            $value = $request->input($key);
            if ($value !== null && trim((string) $value) !== '') {
                return trim((string) $value);
            }
        }

        $loginBy = $request->input('login_by');
        if (is_array($loginBy)) {
            foreach (['code', 'employee_code', 'employeeCode'] as $key) {
                if (! empty($loginBy[$key])) {
                    return trim((string) $loginBy[$key]);
                }
            }
        }

        if (is_object($loginBy)) {
            foreach (['code', 'employee_code', 'employeeCode'] as $key) {
                if (! empty($loginBy->{$key})) {
                    return trim((string) $loginBy->{$key});
                }
            }
        }

        return '';
    }

    private function employeeByCodeOrId(string $code)
    {
        return DB::table('employees')
            ->where('code', $code)
            ->orWhere('id', $code)
            ->first();
    }

    private function normalizeRole(string $role): string
    {
        $normalized = strtoupper(str_replace(['/', '-', ' '], '_', trim($role)));

        return in_array($normalized, ['MD_DI', 'MD', 'DI_MD'], true) ? 'MD_DI' : 'DI';
    }

    private function currentStage(?string $status): ?string
    {
        if ($status === self::STATUS_PENDING_PROPOSAL) {
            return 'proposal';
        }

        if ($status === self::STATUS_PENDING_CONTRACT) {
            return 'contract';
        }

        return null;
    }

    private function notifyApprovers(PostmanProposalContractReview $item, string $stage): void
    {
        try {
            if (! $item->relationLoaded('approvals')) {
                $item->load('approvals');
            }

            $approvals = $item->approvals
                ->where('stage', $stage)
                ->filter(function ($approval) {
                    return ! empty($approval->approver_email) || ! empty($approval->approver_code);
                })
                ->values();

            $testRecipients = $this->notificationTestRecipients();
            $documentName = $this->notificationDocumentName($item, $stage);
            $requesterName = $this->notificationRequesterName($item);
            $requestDate = $this->notificationDate($item->submitted_at ?? $item->created_at);
            $link = $this->notificationActionLink($item);

            foreach ($approvals as $approval) {
                $targets = $testRecipients->isNotEmpty()
                    ? $testRecipients
                    : collect([$approval->approver_email])->filter()->values();

                foreach ($targets as $email) {
                    Mail::to($email)->send(new NotificationMail('action_request', "[Action Required] {$documentName}", [
                        'approver_name' => $approval->approver_name ?: ($approval->approver_code ?: 'Approver'),
                        'document_name' => $documentName,
                        'requested_by' => $requesterName,
                        'request_date' => $requestDate,
                        'link' => $link,
                    ]));
                }
            }
        } catch (\Throwable $e) {
            Log::warning('Proposal Contract Review notification failed: ' . $e->getMessage());
        }
    }

    private function notifyContractSetupParticipants(PostmanProposalContractReview $item): void
    {
        try {
            if (! $item->relationLoaded('approvals')) {
                $item->load('approvals');
            }

            $payload = $this->payloadArray($item);
            $codes = $item->approvals
                ->where('stage', 'contract')
                ->pluck('approver_code')
                ->filter()
                ->values()
                ->all();

            foreach ([
                $payload['lead_tl'] ?? $payload['leadTl'] ?? null,
                $payload['tl_name'] ?? $payload['tlName'] ?? null,
            ] as $code) {
                if (trim((string) $code) !== '') {
                    $codes[] = trim((string) $code);
                }
            }

            $codes = collect($codes)->filter()->unique()->values();
            if ($codes->isEmpty()) {
                return;
            }

            $testRecipients = $this->notificationTestRecipients();
            $documentName = $this->notificationDocumentName($item, 'contract');
            $requesterName = $this->notificationRequesterName($item);
            $requestDate = $this->notificationDate($item->updated_at ?? $item->submitted_at ?? $item->created_at);
            $link = $this->notificationActionLink($item);

            foreach ($codes as $code) {
                $employee = $this->employeeByCodeOrId((string) $code);
                $targets = $testRecipients->isNotEmpty()
                    ? $testRecipients
                    : collect([$employee->email ?? null])->filter()->values();

                foreach ($targets as $email) {
                    Mail::to($email)->send(new NotificationMail('action_request', "[Action Required] {$documentName}", [
                        'approver_name' => $employee ? trim(($employee->firstname ?? '') . ' ' . ($employee->lastname ?? '')) : (string) $code,
                        'document_name' => $documentName,
                        'requested_by' => $requesterName,
                        'request_date' => $requestDate,
                        'link' => $link,
                    ]));
                }
            }
        } catch (\Throwable $e) {
            Log::warning('Proposal Contract Review contract setup notification failed: ' . $e->getMessage());
        }
    }

    private function notificationTestRecipients()
    {
        $testRecipient = trim((string) env('PCR_NOTIFICATION_TEST_TO', ''));
        if ($testRecipient === '') {
            return collect();
        }

        return collect(preg_split('/[,;]+/', $testRecipient))
            ->map(fn ($email) => trim((string) $email))
            ->filter()
            ->unique()
            ->values();
    }

    private function notificationDocumentName(PostmanProposalContractReview $item, string $stage): string
    {
        $parts = ["Proposal Contract Review #{$item->id}"];

        if (! empty($item->proposal_number)) {
            $parts[] = "({$item->proposal_number})";
        }

        $parts[] = '-';
        $parts[] = $stage === 'contract' ? 'Contract Review' : 'Proposal Review';

        return implode(' ', $parts);
    }

    private function notificationRequesterName(PostmanProposalContractReview $item): string
    {
        $filledInBy = trim((string) ($item->filled_in_by ?? ''));
        if ($filledInBy === '') {
            return '-';
        }

        $employee = $this->employeeByCodeOrId($filledInBy);
        if (! $employee) {
            return $filledInBy;
        }

        $fullName = trim(($employee->firstname ?? '') . ' ' . ($employee->lastname ?? ''));

        return $fullName !== '' ? "{$filledInBy}, {$fullName}" : $filledInBy;
    }

    private function notificationDate($value): string
    {
        if ($value instanceof Carbon) {
            return $value->format('d-M-Y');
        }

        if (! empty($value)) {
            try {
                return Carbon::parse($value)->format('d-M-Y');
            } catch (\Throwable $e) {
                return (string) $value;
            }
        }

        return '-';
    }

    private function notificationActionLink(PostmanProposalContractReview $item): string
    {
        $baseUrl = rtrim((string) env('PCR_NOTIFICATION_APP_URL', env('APP_FRONTEND_URL', 'https://edms.meinhardt.net')), '/');

        return $baseUrl . '/proposal-contract-review/review/' . urlencode((string) $item->id);
    }

    private function errorResponse(string $message, int $code)
    {
        return response()->json([
            'code' => (string) $code,
            'status' => false,
            'message' => $message,
            'data' => [],
        ], $code);
    }
}
