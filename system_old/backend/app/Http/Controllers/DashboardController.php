<?php

namespace App\Http\Controllers;

use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class DashboardController extends Controller
{
    private $tableExistsCache = [];
    private $tableColumnsCache = [];

    public function personalSummary(Request $request)
    {
        $userCode = trim((string) ($request->user_code ?? $request->employee_code ?? $request->code ?? ''));

        if ($userCode === '') {
            return $this->returnErrorData('กรุณาระบุ user_code', 422);
        }

        $items = [];
        $actionItems = [];
        $recentItems = [];
        $revisionItems = [];
        $summary = [
            'my_requests_count' => 0,
            'pending_my_action_count' => 0,
            'pending_count' => 0,
            'draft_count' => 0,
            'rejected_count' => 0,
            'completed_this_month_count' => 0,
        ];

        foreach ($this->formSources() as $source) {
            if (!$this->hasTable($source['table'])) {
                continue;
            }

            $rows = $this->loadRows($source);
            $actionApprovals = $this->loadActionApprovals($source, $rows, $userCode);

            foreach ($rows as $row) {
                $record = $this->mapRecord($source, $row);
                $isMine = $this->isMine($source, $row, $userCode);
                $workflowStatus = $this->workflowStatus($source, $row);
                $record['status'] = $workflowStatus ?: $record['status'];

                if ($isMine) {
                    $summary['my_requests_count']++;
                    $recentItems[] = $record;

                    if ($this->isDraftStatus($record['status'])) {
                        $summary['draft_count']++;
                    } elseif ($this->isRejectedStatus($record['status'])) {
                        $summary['rejected_count']++;
                        $revisionItems[] = $record;
                    } elseif ($this->isCompletedStatus($record['status'])) {
                        if ($this->isThisMonth($record['updatedAt'])) {
                            $summary['completed_this_month_count']++;
                        }
                    } else {
                        $summary['pending_count']++;
                    }
                }

                $action = $this->resolveAction($source, $row, $userCode, $record, $actionApprovals);
                if ($action !== null) {
                    $actionItems[] = $action;
                }

                $items[] = $record;
            }
        }

        usort($actionItems, [$this, 'sortByUpdatedDesc']);
        usort($recentItems, [$this, 'sortByUpdatedDesc']);
        usort($revisionItems, [$this, 'sortByUpdatedDesc']);

        $summary['pending_my_action_count'] = count($actionItems);

        return $this->returnSuccess('success', [
            'summary' => $summary,
            'actionItems' => array_slice($actionItems, 0, 12),
            'recentRequests' => array_slice($recentItems, 0, 10),
            'needRevision' => array_slice($revisionItems, 0, 8),
        ]);
    }

    private function formSources()
    {
        return [
            [
                'formType' => 'Purchase Requisition',
                'table' => 'purchase_requisitions',
                'baseUrl' => '/purchase-requisition',
                'titleColumns' => ['to', 'reasons_for_purchase'],
                'referenceColumns' => ['pr_no', 'id'],
                'statusColumns' => ['status'],
                'mineColumns' => ['create_by', 'requested_by'],
                'createdByColumns' => ['create_by', 'requested_by'],
                'steps' => [
                    ['by' => 'verified_by_is', 'status' => 'verified_by_is_status', 'type' => 'verified_by_is_status', 'label' => 'Verify by IS'],
                    ['by' => 'verified_by', 'status' => 'verified_by_status', 'type' => 'verified_by_status', 'label' => 'Verify'],
                    ['by' => 'approved_by', 'status' => 'approved_by_status', 'type' => 'approved_by_status', 'label' => 'Approve'],
                    ['by' => 'approved_by_2', 'status' => 'approved_by_2_status', 'type' => 'approved_by_2_status', 'label' => 'Second approve'],
                    ['by' => 'acknowledged_by', 'status' => 'acknowledged_by_status', 'type' => 'acknowledged_by_status', 'label' => 'Acknowledge'],
                    ['by' => 'action_by_admin', 'status' => 'action_by_admin_status', 'type' => 'action_by_admin', 'label' => 'Admin action'],
                ],
            ],
            [
                'formType' => 'Purchase Order',
                'table' => 'purchase_orders',
                'baseUrl' => '/purchase-order',
                'titleColumns' => ['subject', 'company', 'to'],
                'referenceColumns' => ['po_no', 'id'],
                'statusColumns' => ['status'],
                'mineColumns' => ['create_by', 'purchase_request_by'],
                'createdByColumns' => ['create_by', 'purchase_request_by'],
                'steps' => [
                    ['by' => 'verified_by', 'status' => 'verified_by_status', 'type' => 'verified_by_status', 'label' => 'Verify'],
                    ['by' => 'approved_by', 'status' => 'approved_by_status', 'type' => 'approved_by_status', 'label' => 'Approve'],
                    ['by' => 'circ', 'status' => 'circ_status', 'type' => 'circ_status', 'label' => 'Circ'],
                    ['by' => 'signed_by', 'status' => 'signed_by_status', 'type' => 'signed_by_status', 'label' => 'Sign'],
                    ['by' => 'acknowledged_by', 'status' => 'acknowledged_by_status', 'type' => 'acknowledged_by_status', 'label' => 'Acknowledge'],
                ],
            ],
            [
                'formType' => 'Proposal & Contract Review',
                'table' => 'postman_proposal_contract_reviews',
                'baseUrl' => '/proposal-contract-review',
                'titleColumns' => ['project_name', 'client_name'],
                'referenceColumns' => ['proposal_number', 'project_no', 'id'],
                'statusColumns' => ['status'],
                'mineColumns' => ['create_by', 'filled_in_by'],
                'createdByColumns' => ['create_by', 'filled_in_by'],
                'actionTable' => 'proposal_contract_review_approvals',
                'actionByColumn' => 'approver_code',
                'actionStatusColumn' => 'decision',
                'actionTypeColumn' => 'stage',
            ],
            [
                'formType' => 'Charitable Contribution',
                'table' => 'charitable_contributions',
                'baseUrl' => '/charitable-contributions',
                'titleColumns' => ['event_description', 'organizer_name', 'name'],
                'referenceColumns' => ['ref_no', 'id'],
                'statusColumns' => ['status'],
                'mineColumns' => ['create_by'],
                'createdByColumns' => ['create_by'],
                'steps' => [
                    ['by' => 'acsc_by', 'status' => 'acsc_by_status', 'type' => 'acsc_by_status', 'label' => 'ACSC verify'],
                    ['by' => 'ims_acknowledged_by', 'status' => 'ims_acknowledged_by_status', 'type' => 'ims_acknowledged_by_status', 'label' => 'ACSL acknowledge', 'required' => true, 'allowMissingWhenDocumentCompleted' => true],
                    ['by' => 'approver_by', 'status' => 'approver_by_status', 'type' => 'approver_by_status', 'label' => 'Approve'],
                    ['by' => 'approver_by_2', 'status' => 'approver_by_2_status', 'type' => 'approver_by_2_status', 'label' => 'Second approve'],
                    ['by' => 'acsl_by', 'status' => 'acsl_by_status', 'type' => 'acsl_by_status', 'label' => 'Accounts acknowledge (CA)'],
                ],
            ],
            [
                'formType' => 'Expenses Claim',
                'table' => 'expenses_claims',
                'baseUrl' => '/expenses-claim',
                'titleColumns' => ['claimant_name', 'voucher_no', 'description'],
                'referenceColumns' => ['voucher_no', 'id'],
                'statusColumns' => ['status'],
                'mineColumns' => ['create_by', 'recive_by'],
                'createdByColumns' => ['create_by', 'recive_by'],
                'steps' => [
                    ['by' => 'verified_by', 'status' => 'verified_by_status', 'type' => 'verified_by_status', 'label' => 'Verify'],
                    ['by' => 'approved_by', 'status' => 'approved_by_status', 'type' => 'approved_by_status', 'label' => 'Approve'],
                ],
            ],
            [
                'formType' => 'Allowance After 10PM',
                'table' => 'allowance_after_10pm',
                'baseUrl' => '/allowance-after-10pm',
                'titleColumns' => ['voucher_no', 'description'],
                'referenceColumns' => ['voucher_no', 'id'],
                'statusColumns' => ['status'],
                'mineColumns' => ['create_by', 'claimant_name'],
                'createdByColumns' => ['create_by', 'claimant_name'],
                'steps' => [
                    ['by' => 'tl_by', 'status' => 'tl_by_status', 'type' => 'tl_by_status', 'label' => 'Verify'],
                    ['by' => 'di_by', 'status' => 'di_by_status', 'type' => 'di_by_status', 'label' => 'Approve'],
                ],
            ],
            [
                'formType' => 'Gift / Hospitality',
                'table' => 'gift_hospitalities',
                'baseUrl' => '/gift-hospitality',
                'titleColumns' => ['description', 'name'],
                'referenceColumns' => ['ref_no', 'id'],
                'statusColumns' => ['status'],
                'mineColumns' => ['create_by'],
                'createdByColumns' => ['create_by'],
                'steps' => [
                    ['by' => 'verified_by', 'status' => 'verified_by_status', 'type' => 'verified_by_status', 'label' => 'Verify'],
                    ['by' => 'ims_acknowledged_by', 'status' => 'ims_acknowledged_by_status', 'type' => 'ims_acknowledged_by_status', 'label' => 'ACSL acknowledge', 'required' => true, 'allowMissingWhenDocumentCompleted' => true],
                    ['by' => 'approved_by', 'status' => 'approved_by_status', 'type' => 'approved_by_status', 'label' => 'Approve'],
                    ['by' => 'acknowledged_by', 'status' => 'acknowledged_by_status', 'type' => 'acknowledged_by_status', 'label' => 'Accounts acknowledge (CA)'],
                ],
            ],
            [
                'formType' => 'Gift / Hospitality Offering',
                'table' => 'gift_hospitality_offerings',
                'baseUrl' => '/gift-hospitality-offering',
                'titleColumns' => ['description', 'name'],
                'referenceColumns' => ['ref_no', 'id'],
                'statusColumns' => ['status'],
                'mineColumns' => ['create_by'],
                'createdByColumns' => ['create_by'],
                'steps' => [
                    ['by' => 'verified_by', 'status' => 'verified_by_status', 'type' => 'verified_by_status', 'label' => 'Verify'],
                    ['by' => 'ims_acknowledged_by', 'status' => 'ims_acknowledged_by_status', 'type' => 'ims_acknowledged_by_status', 'label' => 'ACSL acknowledge', 'required' => true, 'allowMissingWhenDocumentCompleted' => true],
                    ['by' => 'approved_by', 'status' => 'approved_by_status', 'type' => 'approved_by_status', 'label' => 'Approve'],
                    ['by' => 'approved_by_2', 'status' => 'approved_by_2_status', 'type' => 'approved_by_2_status', 'label' => 'Second approve'],
                    ['by' => 'acknowledged_by', 'status' => 'acknowledged_by_status', 'type' => 'acknowledged_by_status', 'label' => 'Accounts acknowledge (CA)'],
                ],
            ],
            [
                'formType' => 'Controlled Document Request',
                'table' => 'controlled_document_requests',
                'baseUrl' => '/controlled-document-request',
                'titleColumns' => ['document_title', 'description', 'name'],
                'referenceColumns' => ['document_no', 'id'],
                'statusColumns' => ['status'],
                'mineColumns' => ['create_by'],
                'createdByColumns' => ['create_by'],
                'steps' => [
                    ['by' => 'reviewed_by', 'status' => 'reviewed_by_status', 'type' => 'reviewed_by_status', 'label' => 'Review'],
                    ['by' => 'approved_by', 'status' => 'approved_by_status', 'type' => 'approved_by_status', 'label' => 'Approve'],
                    ['by' => 'acknowledged_by', 'status' => 'acknowledged_by_status_2', 'type' => 'acknowledged_by_status_2', 'label' => 'Final action'],
                ],
            ],
            [
                'formType' => 'CAR',
                'table' => 'cars',
                'baseUrl' => '/cars',
                'titleColumns' => ['problem_description', 'description', 'name'],
                'referenceColumns' => ['car_no', 'id'],
                'statusColumns' => ['status'],
                'mineColumns' => ['create_by', 'car_issued_by', 'issued_by'],
                'createdByColumns' => ['create_by', 'car_issued_by', 'issued_by'],
                'steps' => [
                    ['by' => 'approved_by', 'status' => 'approved_by_status', 'type' => 'approved_by_status', 'label' => 'Approve'],
                    ['by' => 'acknowledged_by', 'status' => 'acknowledged_by_status', 'type' => 'acknowledged_by_status', 'label' => 'Acknowledge'],
                ],
            ],
            [
                'formType' => 'Concept Design Review',
                'table' => 'concept_design_reviews',
                'baseUrl' => '/concept-design-review',
                'titleColumns' => ['project_name', 'project_no'],
                'referenceColumns' => ['project_no', 'id'],
                'statusColumns' => ['status'],
                'mineColumns' => ['create_by', 'prepared_by'],
                'createdByColumns' => ['create_by', 'prepared_by'],
                'steps' => $this->projectReviewSteps(),
            ],
            [
                'formType' => 'Construction Validation',
                'table' => 'construction_validations',
                'baseUrl' => '/construction-validation',
                'titleColumns' => ['project_name', 'project_no'],
                'referenceColumns' => ['project_no', 'id'],
                'statusColumns' => ['status'],
                'mineColumns' => ['create_by', 'prepared_by'],
                'createdByColumns' => ['create_by', 'prepared_by'],
                'steps' => $this->projectReviewSteps(),
            ],
        ];
    }

    private function loadActionApprovals(array $source, $rows, string $userCode)
    {
        if (!isset($source['actionTable']) || !$this->hasTable($source['actionTable'])) {
            return [];
        }

        $foreignKey = $source['actionForeignKey'] ?? 'proposal_contract_review_id';
        $requiredColumns = [
            $foreignKey,
            $source['actionByColumn'],
            $source['actionStatusColumn'],
            $source['actionTypeColumn'],
        ];

        if (!$this->hasColumns($source['actionTable'], $requiredColumns)) {
            return [];
        }

        $ids = [];
        foreach ($rows as $row) {
            if (isset($row->id) && trim((string) $row->id) !== '') {
                $ids[] = $row->id;
            }
        }

        $ids = array_values(array_unique($ids));
        if (count($ids) === 0) {
            return [];
        }

        $approvals = DB::table($source['actionTable'])
            ->whereIn($foreignKey, $ids)
            ->where($source['actionByColumn'], $userCode)
            ->where($source['actionStatusColumn'], 'pending')
            ->get();

        $byRowId = [];
        foreach ($approvals as $approval) {
            $rowId = trim((string) ($approval->{$foreignKey} ?? ''));
            if ($rowId !== '' && !array_key_exists($rowId, $byRowId)) {
                $byRowId[$rowId] = $approval;
            }
        }

        return $byRowId;
    }

    private function projectReviewSteps()
    {
        return [
            ['by' => 'reviewed_by', 'status' => 'reviewed_by_status', 'type' => 'reviewed_by_status', 'label' => 'Review'],
            ['by' => 'responded_by', 'status' => 'responded_by_status', 'type' => 'responded_by_status', 'label' => 'Respond'],
            ['by' => 'signed_by_vve', 'status' => 'signed_by_vve_status', 'type' => 'signed_by_vve_status', 'label' => 'VVE sign'],
            ['by' => 'signed_by_tl', 'status' => 'signed_by_tl_status', 'type' => 'signed_by_tl_status', 'label' => 'TL sign'],
            ['by' => 'acknowledged_by', 'status' => 'acknowledged_by_status', 'type' => 'acknowledged_by_status', 'label' => 'Acknowledge'],
        ];
    }

    private function loadRows(array $source)
    {
        $query = DB::table($source['table']);

        if ($this->hasColumn($source['table'], 'deleted_at')) {
            $query->whereNull('deleted_at');
        }

        if ($this->hasColumn($source['table'], 'is_latest_revision')) {
            $query->where(function ($q) use ($source) {
                $q->where($source['table'] . '.is_latest_revision', true)
                    ->orWhereNull($source['table'] . '.is_latest_revision');
            });
        }

        if ($this->hasColumn($source['table'], 'updated_at')) {
            $query->orderBy($source['table'] . '.updated_at', 'desc');
        } else {
            $query->orderBy($source['table'] . '.id', 'desc');
        }

        return $query->limit(300)->get();
    }

    private function mapRecord(array $source, $row)
    {
        $id = (string) ($row->id ?? '');
        $status = $this->firstValue($source, $row, $source['statusColumns'] ?? []) ?: 'pending';

        return [
            'id' => $id,
            'formType' => $source['formType'],
            'title' => $this->firstValue($source, $row, $source['titleColumns']) ?: $source['formType'] . ' #' . $id,
            'referenceNo' => $this->firstValue($source, $row, $source['referenceColumns']) ?: $id,
            'status' => $status,
            'currentStep' => $this->currentStepLabel($source, $row),
            'createdBy' => $this->firstValue($source, $row, $source['createdByColumns'] ?? []),
            'createdAt' => $row->created_at ?? null,
            'updatedAt' => $row->updated_at ?? $row->created_at ?? null,
            'viewUrl' => $source['baseUrl'] . '/view/' . $id,
            'actionUrl' => $source['baseUrl'] . '/view/' . $id,
        ];
    }

    private function resolveAction(array $source, $row, string $userCode, array $record, array $actionApprovals)
    {
        $documentStatus = $this->firstValue($source, $row, $source['statusColumns'] ?? []);
        if ($this->isDraftStatus($documentStatus)) {
            return null;
        }

        if (isset($source['actionTable']) && $this->hasTable($source['actionTable'])) {
            $approval = $actionApprovals[trim((string) ($row->id ?? ''))] ?? null;

            if ($approval) {
                $stage = $approval->{$source['actionTypeColumn']} ?? 'review';
                $record['currentStep'] = ucfirst((string) $stage) . ' review';
                $record['actionUrl'] = $source['baseUrl'] . '/review/' . $row->id;
                return $record;
            }
        }

        $previousApproved = true;
        foreach (($source['steps'] ?? []) as $stepIndex => $step) {
            if (!$this->hasColumns($source['table'], [$step['by'], $step['status']])) {
                continue;
            }

            $by = $row->{$step['by']} ?? null;
            $status = $row->{$step['status']} ?? null;

            $canSkipMissingRequired = $this->canSkipMissingRequiredStep($source, $row, $step, $stepIndex);
            if (($step['required'] ?? false) === true && !$canSkipMissingRequired && ($by === null || trim((string) $by) === '')) {
                $previousApproved = false;
                continue;
            }

            if ($previousApproved && $this->equalsCode($by, $userCode) && $this->isPendingStatus($status)) {
                $record['currentStep'] = $step['label'];
                $record['actionUrl'] = $source['baseUrl'] . '/action/' . $row->id . '/' . $step['type'];
                return $record;
            }

            if ($by !== null && $by !== '' && !$this->isApprovedStatus($status)) {
                $previousApproved = false;
            }
        }

        return null;
    }

    private function workflowStatus(array $source, $row)
    {
        $hasWorkflow = false;
        $allApproved = true;

        foreach (($source['steps'] ?? []) as $stepIndex => $step) {
            if (!$this->hasColumns($source['table'], [$step['by'], $step['status']])) {
                continue;
            }

            $by = $row->{$step['by']} ?? null;
            if ($by === null || trim((string) $by) === '') {
                $canSkipMissingRequired = $this->canSkipMissingRequiredStep($source, $row, $step, $stepIndex);
                if (($step['required'] ?? false) === true && !$canSkipMissingRequired) {
                    $hasWorkflow = true;
                    $allApproved = false;
                }
                continue;
            }

            $hasWorkflow = true;
            $status = $row->{$step['status']} ?? null;

            if ($this->isRejectedStatus($status)) {
                return 'rejected';
            }

            if (!$this->isApprovedStatus($status)) {
                $allApproved = false;
            }
        }

        $status = $this->firstValue($source, $row, $source['statusColumns'] ?? []);
        if ($this->isRejectedStatus($status) || $this->isDraftStatus($status) || $this->isCompletedStatus($status)) {
            return $status;
        }

        return $hasWorkflow && $allApproved ? 'completed' : ($status ?: 'pending');
    }

    private function currentStepLabel(array $source, $row)
    {
        if ($this->isCompletedStatus($this->firstValue($source, $row, $source['statusColumns'] ?? []))) {
            return 'Completed';
        }

        foreach (($source['steps'] ?? []) as $stepIndex => $step) {
            if (!$this->hasColumns($source['table'], [$step['by'], $step['status']])) {
                continue;
            }

            $by = $row->{$step['by']} ?? null;
            if ($by === null || trim((string) $by) === '') {
                if (($step['required'] ?? false) === true) {
                    if ($this->canSkipMissingRequiredStep($source, $row, $step, $stepIndex)) {
                        continue;
                    }
                    return $step['label'] . ' (unassigned)';
                }
                continue;
            }

            if (!$this->isApprovedStatus($row->{$step['status']} ?? null)) {
                return $step['label'];
            }
        }

        return 'Completed';
    }

    private function canSkipMissingRequiredStep(array $source, $row, array $step, int $stepIndex): bool
    {
        if (($step['allowMissingWhenDocumentCompleted'] ?? false) !== true) {
            return false;
        }

        if ($this->isCompletedStatus($this->firstValue($source, $row, $source['statusColumns'] ?? []))) {
            return true;
        }

        $hasAssignedLaterStep = false;
        foreach (array_slice($source['steps'] ?? [], $stepIndex + 1) as $laterStep) {
            if (!$this->hasColumns($source['table'], [$laterStep['by'], $laterStep['status']])) {
                continue;
            }

            $assignee = trim((string) ($row->{$laterStep['by']} ?? ''));
            if ($assignee === '') {
                continue;
            }

            $hasAssignedLaterStep = true;
            if (!$this->isApprovedStatus($row->{$laterStep['status']} ?? null)) {
                return false;
            }
        }

        return $hasAssignedLaterStep;
    }

    private function isMine(array $source, $row, string $userCode)
    {
        foreach (($source['mineColumns'] ?? []) as $column) {
            if ($this->hasColumn($source['table'], $column) && $this->equalsCode($row->{$column} ?? null, $userCode)) {
                return true;
            }
        }

        return false;
    }

    private function firstValue(array $source, $row, array $columns)
    {
        foreach ($columns as $column) {
            if ($this->hasColumn($source['table'], $column) && isset($row->{$column}) && trim((string) $row->{$column}) !== '') {
                return (string) $row->{$column};
            }
        }

        return null;
    }

    private function hasColumns(string $table, array $columns)
    {
        foreach ($columns as $column) {
            if (!$this->hasColumn($table, $column)) {
                return false;
            }
        }

        return true;
    }

    private function hasTable(string $table)
    {
        if (!array_key_exists($table, $this->tableExistsCache)) {
            $this->tableExistsCache[$table] = Schema::hasTable($table);
        }

        return $this->tableExistsCache[$table];
    }

    private function hasColumn(string $table, string $column)
    {
        $columns = $this->tableColumns($table);
        return array_key_exists(strtolower($column), $columns);
    }

    private function tableColumns(string $table)
    {
        if (!array_key_exists($table, $this->tableColumnsCache)) {
            if (!$this->hasTable($table)) {
                $this->tableColumnsCache[$table] = [];
            } else {
                $this->tableColumnsCache[$table] = array_flip(array_map('strtolower', Schema::getColumnListing($table)));
            }
        }

        return $this->tableColumnsCache[$table];
    }

    private function equalsCode($value, string $userCode)
    {
        return strtolower(trim((string) $value)) === strtolower(trim($userCode));
    }

    private function normalizeStatus($status)
    {
        return strtolower(trim((string) ($status ?? '')));
    }

    private function isPendingStatus($status)
    {
        $status = $this->normalizeStatus($status);
        return $status === '' || $status === 'pending' || $status === 'waiting';
    }

    private function isApprovedStatus($status)
    {
        $status = $this->normalizeStatus($status);
        return in_array($status, ['approve', 'approved', 'signed', 'acknowledged', 'completed', 'done'], true);
    }

    private function isRejectedStatus($status)
    {
        $status = $this->normalizeStatus($status);
        return in_array($status, ['reject', 'rejected', 'declined'], true);
    }

    private function isDraftStatus($status)
    {
        return $this->normalizeStatus($status) === 'draft';
    }

    private function isCompletedStatus($status)
    {
        $status = $this->normalizeStatus($status);
        return in_array($status, ['approve', 'approved', 'completed', 'done', 'contract_approved'], true);
    }

    private function isThisMonth($date)
    {
        if (!$date) {
            return false;
        }

        try {
            return Carbon::parse($date)->isSameMonth(Carbon::now());
        } catch (\Throwable $e) {
            return false;
        }
    }

    private function sortByUpdatedDesc($a, $b)
    {
        return strtotime($b['updatedAt'] ?? $b['createdAt'] ?? '1970-01-01')
            <=> strtotime($a['updatedAt'] ?? $a['createdAt'] ?? '1970-01-01');
    }
}
