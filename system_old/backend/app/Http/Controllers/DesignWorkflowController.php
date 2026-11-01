<?php

namespace App\Http\Controllers;

use App\Models\ConceptDesignReview;
use App\Models\ConstructionValidation;
use App\Models\SchematicDesignReview;
use App\Models\SubmissionReview;
use App\Models\TenderCsaReview;
use App\Models\TenderCsaVerification;
use App\Models\TenderMepReview;
use App\Models\TenderMepVerification;
use App\Models\TenderReview;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DesignWorkflowController extends Controller
{
    private const OVERDUE_GRACE_DAYS = 5;

    private $employeeLookup = null;

    private const TYPE_CONFIG = [
        'concept_design_review' => [
            'label' => 'Concept Design Review',
            'modelClass' => ConceptDesignReview::class,
            'route' => '/concept-design-review/view',
            'steps' => 'standard',
        ],
        'schematic_design_review' => [
            'label' => 'Schematic Design Review',
            'modelClass' => SchematicDesignReview::class,
            'route' => '/schematic-design-review/view',
            'steps' => 'standard',
        ],
        'submission_review' => [
            'label' => 'Submission Review',
            'modelClass' => SubmissionReview::class,
            'route' => '/submission-review/view',
            'steps' => 'standard',
        ],
        'tender_review' => [
            'label' => 'Tender Review',
            'modelClass' => TenderReview::class,
            'route' => '/tender-review/view',
            'steps' => 'tender',
        ],
        'construction_validation' => [
            'label' => 'Construction Validation',
            'modelClass' => ConstructionValidation::class,
            'route' => '/construction-validation/view',
            'steps' => 'construction',
        ],
        'tender_csa_review' => [
            'label' => 'Tender CSA Review',
            'modelClass' => TenderCsaReview::class,
            'route' => '/tender/csa/review/view',
            'steps' => 'tender',
        ],
        'tender_csa_verification' => [
            'label' => 'Tender CSA Verification',
            'modelClass' => TenderCsaVerification::class,
            'route' => '/tender/csa/verification/view',
            'steps' => 'tender',
        ],
        'tender_mep_review' => [
            'label' => 'Tender MEP Review',
            'modelClass' => TenderMepReview::class,
            'route' => '/tender/mep/review/view',
            'steps' => 'tender',
        ],
        'tender_mep_verification' => [
            'label' => 'Tender MEP Verification',
            'modelClass' => TenderMepVerification::class,
            'route' => '/tender/mep/verification/view',
            'steps' => 'tender',
        ],
    ];

    public function documentTypes()
    {
        $types = collect(self::TYPE_CONFIG)->map(function (array $config, string $type) {
            return [
                'type' => $type,
                'label' => $config['label'],
            ];
        })->values();

        return $this->returnSuccess('success', $types);
    }

    public function documents(Request $request)
    {
        $config = $this->resolveConfig((string) $request->query('type'));

        if (! $config) {
            return $this->returnErrorData('Unsupported design review type', 422);
        }

        $search = trim((string) $request->query('search', ''));
        $limit = (int) $request->query('limit', 100);
        $limit = max(1, min($limit, 500));

        $query = $this->newQuery($config);

        if ($search !== '') {
            $query->where(function ($subQuery) use ($search) {
                $subQuery->where('project_name', 'like', '%' . $search . '%')
                    ->orWhere('project_number', 'like', '%' . $search . '%')
                    ->orWhere('discipline', 'like', '%' . $search . '%')
                    ->orWhere('document_location', 'like', '%' . $search . '%');
            });
        }

        $documents = $query
            ->orderBy('id', 'desc')
            ->limit($limit)
            ->get()
            ->map(fn (Model $item) => $this->buildDocumentOption($item, $config))
            ->values();

        return $this->returnSuccess('success', $documents);
    }

    public function show(string $type, $id)
    {
        $config = $this->resolveConfig($type);

        if (! $config) {
            return $this->returnErrorData('Unsupported design review type', 422);
        }

        $item = $this->newQuery($config)->where('id', $id)->first();

        if (! $item) {
            return $this->returnErrorData('ไม่พบข้อมูล', 404);
        }

        $payload = $this->payload($item);
        $document = $this->buildDocumentOption($item, $config);
        $steps = $this->buildWorkflowSteps($item, $payload, $config);
        $completedCount = collect($steps)->where('status', 'complete')->count();
        $currentStep = collect($steps)->first(fn (array $step) => in_array($step['status'], ['in_process', 'overdue', 'rejected'], true));

        return $this->returnSuccess('success', [
            'type' => $type,
            'typeLabel' => $config['label'],
            'document' => $document,
            'summary' => [
                'totalSteps' => count($steps),
                'completedSteps' => $completedCount,
                'progressPercent' => count($steps) > 0 ? (int) round(($completedCount / count($steps)) * 100) : 0,
                'currentStep' => $currentStep,
                'isComplete' => $completedCount === count($steps),
            ],
            'steps' => $steps,
        ]);
    }

    public function report(Request $request)
    {
        $limit = (int) $request->query('limit', 1000);
        $limit = max(1, min($limit, 5000));
        $rows = collect();

        foreach (self::TYPE_CONFIG as $type => $config) {
            $this->newQuery($config)
                ->orderBy('id', 'desc')
                ->limit($limit)
                ->get()
                ->each(function (Model $item) use ($type, $config, $rows) {
                    $payload = $this->payload($item);
                    $steps = $this->buildWorkflowSteps($item, $payload, $config);
                    $currentStep = collect($steps)->first(fn (array $step) => in_array($step['status'], ['in_process', 'overdue', 'rejected'], true));

                    if (! $currentStep || $currentStep['status'] !== 'overdue') {
                        return;
                    }

                    $document = $this->buildDocumentOption($item, $config);

                    $rows->push([
                        'type' => $type,
                        'typeLabel' => $config['label'],
                        'document' => $document,
                        'currentStep' => $currentStep,
                        'responsiblePerson' => ($currentStep['assigneeInitial'] ?? null) ?: $currentStep['assignee'],
                        'responsiblePersonCode' => $currentStep['assigneeCode'] ?? null,
                        'responsiblePersonInitial' => $currentStep['assigneeInitial'] ?? null,
                        'responsiblePersonName' => $currentStep['assigneeName'] ?? null,
                        'projectNumber' => $document['projectNumber'],
                        'projectName' => $document['projectName'],
                        'discipline' => $document['discipline'],
                        'stage' => strtoupper($config['label']),
                        'statusLabel' => $this->reportStatusLabel($currentStep),
                        'days' => $currentStep['overdueDays'],
                        'totalWaitingDays' => $currentStep['waitingDays'],
                        'lastStatus' => 'Active',
                    ]);
                });
        }

        $excludedTypes = $this->requestStringList($request, ['exclude_type', 'exclude_types']);
        $baseRows = $rows->filter(function (array $row) use ($excludedTypes) {
            return ! in_array((string) ($row['type'] ?? ''), $excludedTypes, true);
        })->values();
        $filteredRows = $this->filterReportRows($baseRows, $request);

        return $this->returnSuccess('success', [
            'generatedAt' => Carbon::now()->toDateTimeString(),
            'totalRows' => $baseRows->count(),
            'filteredRows' => $filteredRows->count(),
            'filters' => $this->reportFilterOptions($baseRows),
            'appliedFilters' => [
                'responsiblePerson' => trim((string) $request->query('responsible_person', '')),
                'stage' => trim((string) $request->query('stage', '')),
                'status' => trim((string) $request->query('status', '')),
                'dateStart' => trim((string) $request->query('date_start', '')),
                'dateEnd' => trim((string) $request->query('date_end', '')),
            ],
            'rows' => $filteredRows
                ->sortByDesc('days')
                ->values(),
        ]);
    }

    private function filterReportRows($rows, Request $request)
    {
        $responsiblePerson = $this->normalizeReportFilter($request->query('responsible_person'));
        $stage = $this->normalizeReportFilter($request->query('stage'));
        $status = $this->normalizeReportFilter($request->query('status'));
        $dateStart = $this->parseReportDate($request->query('date_start'));
        $dateEnd = $this->parseReportDate($request->query('date_end'));

        return $rows->filter(function (array $row) use ($responsiblePerson, $stage, $status, $dateStart, $dateEnd) {
            if ($responsiblePerson !== '') {
                $responsibleValues = [
                    $row['responsiblePerson'] ?? null,
                    $row['responsiblePersonInitial'] ?? null,
                    $row['responsiblePersonCode'] ?? null,
                    $row['responsiblePersonName'] ?? null,
                    $row['currentStep']['assignee'] ?? null,
                    $row['currentStep']['assigneeInitial'] ?? null,
                    $row['currentStep']['assigneeCode'] ?? null,
                    $row['currentStep']['assigneeName'] ?? null,
                ];

                if (! $this->matchesAnyReportValue($responsibleValues, $responsiblePerson)) {
                    return false;
                }
            }

            if ($stage !== '' && $this->normalizeReportFilter($row['stage'] ?? null) !== $stage) {
                return false;
            }

            if ($status !== '' && $this->normalizeReportFilter($row['statusLabel'] ?? null) !== $status) {
                return false;
            }

            if ($dateStart || $dateEnd) {
                $receivedAt = $this->parseReportDate($row['currentStep']['receivedAt'] ?? null);

                if (! $receivedAt) {
                    return false;
                }

                if ($dateStart && $receivedAt->copy()->startOfDay()->lt($dateStart->copy()->startOfDay())) {
                    return false;
                }

                if ($dateEnd && $receivedAt->copy()->endOfDay()->gt($dateEnd->copy()->endOfDay())) {
                    return false;
                }
            }

            return true;
        })->values();
    }

    private function reportFilterOptions($rows): array
    {
        return [
            'responsiblePersons' => $this->sortedReportOptions($rows->map(fn (array $row) => $row['responsiblePerson'] ?? null)->all()),
            'stages' => $this->sortedReportOptions($rows->map(fn (array $row) => $row['stage'] ?? null)->all()),
            'statuses' => $this->sortedReportOptions($rows->map(fn (array $row) => $row['statusLabel'] ?? null)->all()),
        ];
    }

    private function matchesAnyReportValue(array $values, string $filter): bool
    {
        foreach ($values as $value) {
            if ($this->normalizeReportFilter($value) === $filter) {
                return true;
            }
        }

        return false;
    }

    private function sortedReportOptions(array $values): array
    {
        return collect($values)
            ->map(fn ($value) => trim((string) $value))
            ->filter(fn (string $value) => $value !== '' && $value !== '-')
            ->uniqueStrict()
            ->sortBy(fn (string $value) => strtolower($value))
            ->values()
            ->all();
    }

    private function requestStringList(Request $request, array $keys): array
    {
        $values = [];

        foreach ($keys as $key) {
            $raw = $request->query($key);

            if ($raw === null || $raw === '') {
                continue;
            }

            $entries = is_array($raw) ? $raw : explode(',', (string) $raw);

            foreach ($entries as $entry) {
                $value = trim((string) $entry);

                if ($value !== '') {
                    $values[] = $value;
                }
            }
        }

        return array_values(array_unique($values));
    }

    private function normalizeReportFilter($value): string
    {
        return strtoupper(trim((string) $value));
    }

    private function parseReportDate($value): ?Carbon
    {
        if ($value === null || trim((string) $value) === '') {
            return null;
        }

        try {
            return Carbon::parse($value);
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function resolveConfig(string $type): ?array
    {
        $normalized = trim(strtolower($type));

        return self::TYPE_CONFIG[$normalized] ?? null;
    }

    private function newQuery(array $config)
    {
        $class = $config['modelClass'];

        return $class::query()->whereNull('deleted_at');
    }

    private function buildDocumentOption(Model $item, array $config): array
    {
        $payload = $this->payload($item);
        $projectNumber = $this->pick($item, $payload, ['project_number', 'projectNumber', 'project_no']) ?: '-';
        $projectName = $this->pick($item, $payload, ['project_name', 'projectName', 'name']) ?: '-';
        $discipline = $this->pick($item, $payload, ['discipline', 'disciplineOther', 'discipline_other']) ?: '-';

        return [
            'id' => $item->id,
            'label' => trim($projectNumber . ' | ' . $projectName . ' | ' . $discipline),
            'projectNumber' => $projectNumber,
            'projectName' => $projectName,
            'discipline' => $discipline,
            'documentLocation' => $this->pick($item, $payload, ['document_location', 'documentLocation']) ?: '',
            'documentTypes' => $this->pickArray($item, $payload, ['documentTypes', 'document_types', 'documentsReviewed', 'documents_reviewed']),
            'createdAt' => $item->created_at,
            'updatedAt' => $item->updated_at,
            'viewRoute' => $config['route'] . '/' . $item->id,
        ];
    }

    private function buildWorkflowSteps(Model $item, array $payload, array $config): array
    {
        switch ($config['steps']) {
            case 'tender':
                $definitions = $this->tenderSteps(str_contains(strtolower($config['label'] ?? ''), 'verification'));
                break;
            case 'construction':
                $definitions = $this->constructionSteps();
                break;
            default:
                $definitions = $this->standardSteps();
                break;
        }

        $steps = [];
        $foundCurrent = false;
        $previousCompletedAt = null;

        foreach ($definitions as $index => $definition) {
            $statusValue = $this->pick($item, $payload, $definition['statusKeys'] ?? []);
            $dateValue = $this->pick($item, $payload, $definition['dateKeys'] ?? []);
            $assignee = $this->pick($item, $payload, $definition['assigneeKeys'] ?? []);
            $assigneeInfo = $this->resolveEmployeeReference($assignee);

            // Status and Assignee derivation
            $isRejected = $this->isRejectedStatus($statusValue);
            $isComplete = $this->isCompleteStatus($statusValue) || $dateValue !== null;

            // Assignment step is complete if any reviewer is assigned
            if ($definition['key'] === 'assignment' && !empty($statusValue)) {
                $isComplete = true;
            }
            $status = 'pending';

            if ($index === 0) {
                $isComplete = true;
                $dateValue = $dateValue ?: $item->created_at;
            }

            if ($isRejected) {
                $status = 'rejected';
                $foundCurrent = true;
            } elseif ($isComplete) {
                $status = 'complete';
            } elseif (! $foundCurrent) {
                $status = 'in_process';
                $foundCurrent = true;
            }

            $receivedAt = $index === 0 ? $dateValue : $previousCompletedAt;
            $waitingDays = $this->workflowWaitingDays($receivedAt, $dateValue, $status);
            $overdueDays = 0;

            if ($status === 'in_process' && $waitingDays >= self::OVERDUE_GRACE_DAYS) {
                $status = 'overdue';
                $overdueDays = $waitingDays - self::OVERDUE_GRACE_DAYS + 1;
            }

            $steps[] = [
                'key' => $definition['key'],
                'role' => $definition['role'],
                'action' => $definition['action'],
                'assignee' => $assigneeInfo['label'],
                'assigneeCode' => $assigneeInfo['code'],
                'assigneeInitial' => $assigneeInfo['initial'],
                'assigneeName' => $assigneeInfo['name'],
                'assigneeRaw' => $assigneeInfo['raw'],
                'date' => $dateValue,
                'receivedAt' => $receivedAt,
                'waitingDays' => $waitingDays,
                'overdueDays' => $overdueDays,
                'isOverdue' => $status === 'overdue',
                'status' => $status,
                'statusText' => $this->statusText($statusValue, $status),
                'order' => $index + 1,
            ];

            if ($status === 'complete') {
                $previousCompletedAt = $dateValue ?: $previousCompletedAt;
            }
        }

        return $steps;
    }

    private function standardSteps(): array
    {
        return [
            [
                'key' => 'created',
                'role' => 'TE',
                'action' => 'Create document',
                'assigneeKeys' => ['prepared_by', 'preparedBy', 'create_by'],
                'dateKeys' => ['created_at', 'createdAt'],
            ],
            [
                'key' => 'reviewed',
                'role' => 'Reviewer',
                'action' => 'Review',
                'assigneeKeys' => ['reviewed_by', 'reviewedBy', 'reviewer_for_action', 'reviewerForAction'],
                'dateKeys' => ['reviewed_by_date', 'reviewedByDate', 'reviewed_by_tl_date', 'reviewed_by_t_l_date'],
                'statusKeys' => ['reviewed_by_status', 'reviewedByStatus', 'reviewed_by_tl_status', 'reviewed_by_t_l_status'],
            ],
            [
                'key' => 'responded',
                'role' => 'TE',
                'action' => 'Respond',
                'assigneeKeys' => ['responded_by', 'respondedBy', 'prepared_by', 'preparedBy'],
                'dateKeys' => ['responded_by_date', 'respondedByDate'],
                'statusKeys' => ['responded_by_status', 'respondedByStatus'],
            ],
            [
                'key' => 'signed_tl',
                'role' => 'Team Lead',
                'action' => 'Review',
                'assigneeKeys' => ['signed_by_tl', 'signedByTL', 'signed_by_t_l', 'team_lead_for_action', 'teamLeadForAction'],
                'dateKeys' => ['signed_by_tl_date', 'signedByTLDate', 'signed_by_t_l_date'],
                'statusKeys' => ['signed_by_tl_status', 'signedByTLStatus', 'signed_by_t_l_status'],
            ],
            [
                'key' => 'signed_tl2',
                'role' => 'Reviewer',
                'action' => 'Approve',
                'assigneeKeys' => ['signed_by_tl2', 'signedByTL2', 'signed_by_t_l2'],
                'dateKeys' => ['signed_by_tl2_date', 'signedByTL2Date', 'signed_by_t_l2_date'],
                'statusKeys' => ['signed_by_tl2_status', 'signedByTL2Status', 'signed_by_t_l2_status'],
            ],
            [
                'key' => 'acknowledged',
                'role' => 'Director',
                'action' => 'Acknowledge',
                'assigneeKeys' => ['acknowledged_by', 'acknowledgedBy', 'acknowledged_by_d_i', 'director_for_action', 'directorForAction'],
                'dateKeys' => ['acknowledged_by_date', 'acknowledgedByDate', 'acknowledged_by_d_i_date'],
                'statusKeys' => ['acknowledged_by_status', 'acknowledgedByStatus', 'acknowledged_by_d_i_status'],
            ],
        ];
    }

    private function tenderSteps(bool $isVerification = false): array
    {
        $steps = $this->standardSteps();

        if ($isVerification) {
            // Insert assignment step for VVE at index 1 (after created)
            array_splice($steps, 1, 0, [[
                'key' => 'assignment',
                'role' => 'VVE (Coordinator)',
                'action' => 'Assign Team',
                'assigneeKeys' => ['signed_by_vve', 'signedByVVE', 'signed_by_v_v_e'],
                'statusKeys' => ['reviewed_by', 'reviewedBy'], // Complete if reviewers are assigned
            ]]);
        }

        // Add VVE signature step later in the flow
        // For verification, standard steps are 0:created, 1:assignment, 2:reviewed, 3:responded
        // So we insert at index 4
        $insertAt = $isVerification ? 4 : 3;
        array_splice($steps, $insertAt, 0, [[
            'key' => 'signed_vve',
            'role' => 'VVE',
            'action' => 'Sign',
            'assigneeKeys' => ['signed_by_vve', 'signedByVVE', 'signed_by_v_v_e'],
            'dateKeys' => ['signed_by_vve_date', 'signedByVVEDate', 'signed_by_v_v_e_date'],
            'statusKeys' => ['signed_by_vve_status', 'signedByVVEStatus', 'signed_by_v_v_e_status'],
        ]]);

        return array_values($steps);
    }

    private function constructionSteps(): array
    {
        return [
            [
                'key' => 'created',
                'role' => 'TE',
                'action' => 'Create document',
                'assigneeKeys' => ['prepared_by', 'preparedBy', 'create_by'],
                'dateKeys' => ['created_at', 'createdAt'],
            ],
            [
                'key' => 'completed',
                'role' => 'Reviewer',
                'action' => 'Complete checklist',
                'assigneeKeys' => ['completed_by', 'completedBy', 'prepared_by', 'preparedBy'],
                'dateKeys' => ['completed_by_date', 'completedByDate'],
                'statusKeys' => ['completed_by_status', 'completedByStatus', 'completed_by_t_l_status'],
            ],
            [
                'key' => 'responded',
                'role' => 'TE',
                'action' => 'Respond',
                'assigneeKeys' => ['responded_by', 'respondedBy', 'prepared_by', 'preparedBy'],
                'dateKeys' => ['responded_by_date', 'respondedByDate'],
                'statusKeys' => ['responded_by_status', 'respondedByStatus'],
            ],
            [
                'key' => 'signed_tl',
                'role' => 'Team Lead',
                'action' => 'Review',
                'assigneeKeys' => ['signed_by_tl', 'signedByTL', 'signed_by_t_l', 'team_lead_for_action', 'teamLeadForAction'],
                'dateKeys' => ['signed_by_tl_date', 'signedByTLDate', 'signed_by_t_l_date'],
                'statusKeys' => ['signed_by_tl_status', 'signedByTLStatus', 'signed_by_t_l_status'],
            ],
            [
                'key' => 'acknowledged_tl',
                'role' => 'Team Lead',
                'action' => 'Acknowledge',
                'assigneeKeys' => ['acknowledged_by_tl', 'acknowledgedByTL', 'acknowledged_by_t_l'],
                'dateKeys' => ['acknowledged_by_tl_date', 'acknowledgedByTLDate', 'acknowledged_by_t_l_date'],
                'statusKeys' => ['acknowledged_by_tl_status', 'acknowledgedByTLStatus', 'acknowledged_by_t_l_status'],
            ],
            [
                'key' => 'acknowledged_di',
                'role' => 'Director',
                'action' => 'Acknowledge',
                'assigneeKeys' => ['acknowledged_by_di', 'acknowledgedByDI', 'acknowledged_by_d_i', 'director_for_action', 'directorForAction'],
                'dateKeys' => ['acknowledged_by_di_date', 'acknowledgedByDIDate', 'acknowledged_by_d_i_date'],
                'statusKeys' => ['acknowledged_by_di_status', 'acknowledgedByDIStatus', 'acknowledged_by_d_i_status'],
            ],
        ];
    }

    private function payload(Model $item): array
    {
        $payload = json_decode($item->payload ?? '[]', true);

        return is_array($payload) ? $payload : [];
    }

    private function pick(Model $item, array $payload, array $keys)
    {
        foreach ($keys as $key) {
            $value = $payload[$key] ?? $item->{$key} ?? null;

            if ($value !== null && $value !== '') {
                return $value;
            }
        }

        return null;
    }

    private function pickArray(Model $item, array $payload, array $keys): array
    {
        $value = $this->pick($item, $payload, $keys);

        if (is_array($value)) {
            return array_values(array_filter($value, fn ($entry) => $entry !== null && $entry !== ''));
        }

        if (is_string($value)) {
            $trimmed = trim($value);

            if ($trimmed === '') {
                return [];
            }

            if (substr($trimmed, 0, 1) === '[') {
                $decoded = json_decode($trimmed, true);

                if (is_array($decoded)) {
                    return array_values(array_filter($decoded, fn ($entry) => $entry !== null && $entry !== ''));
                }
            }

            return array_values(array_filter(array_map('trim', explode(',', $trimmed))));
        }

        return [];
    }

    private function resolveEmployeeReference($value): array
    {
        $raw = $this->normalizeAssigneeRawValue($value);
        $tokens = $this->extractEmployeeReferenceTokens($value);
        $lookup = $this->employeeLookup();
        $entries = [];

        foreach ($tokens as $token) {
            $key = $this->normalizeLookupKey($token);

            if ($key === '' || ! isset($lookup[$key])) {
                continue;
            }

            $entry = $lookup[$key];
            $entries[$entry['identity']] = $entry;
        }

        if (empty($entries)) {
            $fallback = $raw !== '' ? $raw : '-';

            return [
                'raw' => $raw !== '' ? $raw : null,
                'code' => null,
                'initial' => null,
                'name' => null,
                'label' => $fallback,
            ];
        }

        $entries = array_values($entries);

        return [
            'raw' => $raw !== '' ? $raw : null,
            'code' => $this->joinEmployeeParts($entries, 'code'),
            'initial' => $this->joinEmployeeParts($entries, 'initial'),
            'name' => $this->joinEmployeeParts($entries, 'name'),
            'label' => implode('; ', array_map(fn (array $entry) => $entry['label'], $entries)),
        ];
    }

    private function employeeLookup(): array
    {
        if ($this->employeeLookup !== null) {
            return $this->employeeLookup;
        }

        $lookup = [];
        $employees = DB::table('employees')
            ->whereNull('deleted_at')
            ->get(['id', 'code', 'initial', 'firstname', 'lastname']);

        foreach ($employees as $employee) {
            $code = trim((string) ($employee->code ?? ''));
            $initial = trim((string) ($employee->initial ?? ''));
            $name = trim(implode(' ', array_filter([
                trim((string) ($employee->firstname ?? '')),
                trim((string) ($employee->lastname ?? '')),
            ])));
            $identity = $code !== '' ? $code : (string) $employee->id;
            $label = trim(implode(', ', array_filter([$initial, $name])));

            if ($label === '') {
                $label = $code !== '' ? $code : (string) $employee->id;
            }

            $entry = [
                'identity' => $identity,
                'id' => (string) $employee->id,
                'code' => $code !== '' ? $code : null,
                'initial' => $initial !== '' ? $initial : ($code !== '' ? $code : null),
                'name' => $name !== '' ? $name : null,
                'label' => $label,
            ];

            foreach ([$employee->id, $code, $initial] as $key) {
                $normalized = $this->normalizeLookupKey($key);

                if ($normalized !== '') {
                    $lookup[$normalized] = $entry;
                }
            }
        }

        $this->employeeLookup = $lookup;

        return $this->employeeLookup;
    }

    private function extractEmployeeReferenceTokens($value): array
    {
        $tokens = [];

        if ($value === null || $value === '') {
            return $tokens;
        }

        if (is_object($value)) {
            $value = (array) $value;
        }

        if (is_array($value)) {
            if ($this->isAssocArray($value)) {
                foreach (['code', 'employee_code', 'employeeCode', 'id', 'employee_id', 'employeeId', 'initial'] as $key) {
                    if (array_key_exists($key, $value)) {
                        $tokens = array_merge($tokens, $this->extractEmployeeReferenceTokens($value[$key]));
                    }
                }
            }

            foreach ($value as $entry) {
                $tokens = array_merge($tokens, $this->extractEmployeeReferenceTokens($entry));
            }

            return $this->uniqueTokens($tokens);
        }

        $raw = trim((string) $value);

        if ($raw === '') {
            return $tokens;
        }

        $decoded = null;

        if (in_array(substr($raw, 0, 1), ['[', '{'], true)) {
            $decoded = json_decode($raw, true);
        }

        if (is_array($decoded)) {
            $tokens = array_merge($tokens, $this->extractEmployeeReferenceTokens($decoded));
        }

        $tokens[] = $raw;

        $firstSegment = trim(explode(',', $raw)[0] ?? '');
        if ($firstSegment !== '') {
            $tokens[] = $firstSegment;
        }

        if (preg_match_all('/\b[A-Z]{2,}\d{2,}\b/i', $raw, $matches)) {
            foreach ($matches[0] as $match) {
                $tokens[] = $match;
            }
        }

        return $this->uniqueTokens($tokens);
    }

    private function normalizeAssigneeRawValue($value): string
    {
        if ($value === null) {
            return '';
        }

        if (is_object($value)) {
            $value = (array) $value;
        }

        if (is_array($value)) {
            if ($this->isAssocArray($value)) {
                foreach (['displayLabel', 'display_label', 'label', 'name', 'code', 'employee_code', 'employeeCode', 'id', 'employee_id', 'employeeId', 'initial'] as $key) {
                    if (! array_key_exists($key, $value)) {
                        continue;
                    }

                    $raw = $this->normalizeAssigneeRawValue($value[$key]);
                    if ($raw !== '') {
                        return $raw;
                    }
                }
            }

            return implode(', ', array_values(array_filter(array_map(
                fn ($entry) => $this->normalizeAssigneeRawValue($entry),
                $value
            ))));
        }

        return trim((string) $value);
    }

    private function joinEmployeeParts(array $entries, string $key): ?string
    {
        $values = [];

        foreach ($entries as $entry) {
            $value = trim((string) ($entry[$key] ?? ''));

            if ($value !== '' && ! in_array($value, $values, true)) {
                $values[] = $value;
            }
        }

        return ! empty($values) ? implode(', ', $values) : null;
    }

    private function uniqueTokens(array $tokens): array
    {
        $unique = [];

        foreach ($tokens as $token) {
            $normalized = $this->normalizeLookupKey($token);

            if ($normalized !== '' && ! isset($unique[$normalized])) {
                $unique[$normalized] = trim((string) $token);
            }
        }

        return array_values($unique);
    }

    private function normalizeLookupKey($value): string
    {
        return strtoupper(trim((string) $value));
    }

    private function isAssocArray(array $value): bool
    {
        if ($value === []) {
            return false;
        }

        return array_keys($value) !== range(0, count($value) - 1);
    }

    private function isCompleteStatus($status): bool
    {
        $normalized = strtolower(trim((string) $status));

        return in_array($normalized, ['approved', 'approve', 'signed', 'acknowledged', 'completed', 'complete', 'done'], true);
    }

    private function isRejectedStatus($status): bool
    {
        $normalized = strtolower(trim((string) $status));

        return in_array($normalized, ['rejected', 'reject', 'declined', 'decline'], true);
    }

    private function statusText($rawStatus, string $status): string
    {
        if ($rawStatus !== null && trim((string) $rawStatus) !== '') {
            return (string) $rawStatus;
        }

        switch ($status) {
            case 'complete':
                return 'Complete';
            case 'in_process':
                return 'On process';
            case 'overdue':
                return 'Overdue';
            case 'rejected':
                return 'Rejected';
            default:
                return 'Pending';
        }
    }

    private function reportStatusLabel(array $step): string
    {
        $role = strtolower((string) ($step['role'] ?? ''));
        $action = strtolower((string) ($step['action'] ?? 'action'));

        if (strpos($role, 'director') !== false) {
            $roleLabel = 'DI';
        } elseif (strpos($role, 'team lead') !== false) {
            $roleLabel = 'TL';
        } elseif ($role === 'te') {
            $roleLabel = 'TE';
        } else {
            $roleLabel = (string) ($step['role'] ?? '-');
        }

        return trim($roleLabel . ' to ' . $action);
    }

    private function workflowWaitingDays($receivedAt, $completedAt, string $status): int
    {
        if ($receivedAt === null || $status === 'pending') {
            return 0;
        }

        $start = $this->parseWorkflowDate($receivedAt);

        if (! $start) {
            return 0;
        }

        $end = in_array($status, ['complete', 'rejected'], true)
            ? $this->parseWorkflowDate($completedAt)
            : Carbon::now();

        if (! $end) {
            $end = Carbon::now();
        }

        return max(0, $start->copy()->startOfDay()->diffInDays($end->copy()->startOfDay()));
    }

    private function parseWorkflowDate($value): ?Carbon
    {
        if ($value instanceof Carbon) {
            return $value->copy();
        }

        if ($value instanceof \DateTimeInterface) {
            return Carbon::instance($value);
        }

        if ($value === null || trim((string) $value) === '') {
            return null;
        }

        try {
            return Carbon::parse($value);
        } catch (\Throwable $e) {
            return null;
        }
    }
}
