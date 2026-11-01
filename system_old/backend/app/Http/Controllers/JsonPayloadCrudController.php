<?php

namespace App\Http\Controllers;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

abstract class JsonPayloadCrudController extends Controller
{
    protected const EMPLOYEE_REFERENCE_KEYS = [
        'prepared_by',
        'preparedBy',
        'create_by',
        'createBy',
        'filled_in_by',
        'filledInBy',
        'reviewed_by',
        'reviewedBy',
        'reviewed_by_tl',
        'reviewedByTL',
        'reviewed_by_t_l',
        'reviewedByTl',
        'reviewer_for_action',
        'reviewerForAction',
        'responded_by',
        'respondedBy',
        'completed_by',
        'completedBy',
        'signed_by',
        'signedBy',
        'signed_by_tl',
        'signedByTL',
        'signed_by_t_l',
        'signedByTl',
        'signed_by_tl2',
        'signedByTL2',
        'signed_by_t_l2',
        'signedByTl2',
        'signed_by_tl3',
        'signedByTL3',
        'signed_by_vve',
        'signedByVVE',
        'signed_by_v_v_e',
        'signedByVve',
        'team_lead_for_action',
        'teamLeadForAction',
        'client_project_manager_signed_by',
        'clientProjectManagerSignedBy',
        'client_pm_feedback_signed_by',
        'clientPMFeedbackSignedBy',
        'acknowledged_by',
        'acknowledgedBy',
        'acknowledged_by_tl',
        'acknowledgedByTL',
        'acknowledged_by_t_l',
        'acknowledgedByTl',
        'acknowledged_by_di',
        'acknowledgedByDI',
        'acknowledged_by_d_i',
        'acknowledgedByDi',
        'director_for_action',
        'directorForAction',
    ];

    protected const EMPLOYEE_ENRICHED_TABLES = [
        'concept_design_reviews',
        'schematic_design_reviews',
        'submission_reviews',
        'tender_reviews',
        'tender_csa_reviews',
        'tender_csa_verifications',
        'tender_mep_reviews',
        'tender_mep_verifications',
        'construction_validations',
        'engineering_audit_reviews',
        'value_engineering_reviews',
        'leed_reviews',
    ];

    protected string $modelClass;

    protected array $coreFieldMap = [
        'form_type' => ['formType', 'form_type'],
        'project_id' => ['projectId', 'project_id'],
        'project_name' => ['projectName', 'project_name'],
        'project_number' => ['projectNumber', 'project_number'],
        'prepared_by' => ['preparedBy', 'prepared_by'],
        'department' => ['department'],
        'discipline' => ['discipline'],
        'document_location' => ['documentLocation', 'document_location'],
        'review_method' => ['reviewMethod', 'review_method'],
        'status' => ['status'],
    ];

    protected array $exactFilterMap = [
        'project_id' => 'project_id',
        'form_type' => 'form_type',
        'department' => 'department',
        'discipline' => 'discipline',
        'review_method' => 'review_method',
        'status' => 'status',
    ];

    protected array $likeFilterMap = [
        'project_name' => 'project_name',
        'project_number' => 'project_number',
        'prepared_by' => 'prepared_by',
    ];

    protected array $searchableColumns = [
        'form_type',
        'project_id',
        'project_name',
        'project_number',
        'prepared_by',
        'department',
        'discipline',
        'review_method',
        'status',
    ];

    protected array $orderColumns = [
        0 => 'id',
        1 => 'form_type',
        2 => 'project_name',
        3 => 'project_number',
        4 => 'prepared_by',
        5 => 'department',
        6 => 'discipline',
        7 => 'review_method',
        8 => 'status',
        9 => 'created_at',
    ];

    public function index(Request $request)
    {
        return $this->getList($request);
    }

    public function getList(Request $request)
    {
        try {
            $items = $this->applyFilters($this->newQuery(), $request)
                ->orderBy('id', 'desc')
                ->get()
                ->values()
                ->map(function ($item, $index) {
                    $row = $this->transformItem($item);
                    $row['No'] = $index + 1;

                    return $row;
                });

            $items = $this->afterTransformRows($items->all());

            return $this->returnSuccess('success', $items);
        } catch (\Throwable $e) {
            return $this->returnErrorData($e->getMessage(), 500);
        }
    }

    public function getPage(Request $request)
    {
        try {
            $draw = (int) ($request->draw ?? 1);
            $start = (int) ($request->start ?? 0);
            $length = (int) ($request->length ?? 10);

            $query = $this->applyFilters($this->newQuery(), $request, true);
            $recordsTotal = $this->newQuery()->count();
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

            $items = $this->afterTransformRows($items->all());

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
            $item = $this->newQuery()->where('id', $id)->first();

            if (! $item) {
                return $this->returnErrorData('ไม่พบข้อมูล', 404);
            }

            $rows = $this->afterTransformRows([$this->transformItem($item)]);

            return $this->returnSuccess('success', $rows[0] ?? $this->transformItem($item));
        } catch (\Throwable $e) {
            return $this->returnErrorData($e->getMessage(), 500);
        }
    }

    public function store(Request $request)
    {
        DB::beginTransaction();

        try {
            $class = $this->modelClass;
            $item = new $class();

            $this->fillItem($item, $request, true);

            $item->save();

            $this->logDocumentCreateAudit($request, $item);

            DB::commit();

            return $this->returnSuccess('บันทึกข้อมูลสำเร็จ', $this->transformItem($item));
        } catch (\Throwable $e) {
            DB::rollBack();

            return $this->returnErrorData($e->getMessage(), 500);
        }
    }

    public function update(Request $request, $id)
    {
        DB::beginTransaction();

        try {
            $item = $this->newQuery()->where('id', $id)->first();

            if (! $item) {
                return $this->returnErrorData('ไม่พบข้อมูล', 404);
            }

            $oldActionValues = $this->auditActionValues($item);

            $this->fillItem($item, $request);

            $item->save();

            $this->logActionRequestChanges($request, $item, $oldActionValues);

            DB::commit();

            return $this->returnUpdateReturnData('อัปเดตข้อมูลสำเร็จ', $this->transformItem($item));
        } catch (\Throwable $e) {
            DB::rollBack();

            return $this->returnErrorData($e->getMessage(), 500);
        }
    }

    public function destroy(Request $request, $id)
    {
        DB::beginTransaction();

        try {
            $item = $this->newQuery()->where('id', $id)->first();

            if (! $item) {
                return $this->returnErrorData('ไม่พบข้อมูล', 404);
            }

            $item->update_by = $this->resolveActorId($request);
            $item->save();
            $item->delete();

            DB::commit();

            return $this->returnSuccess('ลบข้อมูลสำเร็จ', []);
        } catch (\Throwable $e) {
            DB::rollBack();

            return $this->returnErrorData($e->getMessage(), 500);
        }
    }

    protected function newQuery()
    {
        $class = $this->modelClass;

        return $class::query()->whereNull('deleted_at');
    }

    protected function applyFilters($query, Request $request, bool $dataTables = false)
    {
        foreach ($this->exactFilterMap as $requestKey => $column) {
            $value = $request->input($requestKey);
            if ($value !== null && $value !== '') {
                $query->where($column, $value);
            }
        }

        foreach ($this->likeFilterMap as $requestKey => $column) {
            $value = $request->input($requestKey);
            if ($value !== null && trim((string) $value) !== '') {
                $query->where($column, 'like', '%' . trim((string) $value) . '%');
            }
        }

        $searchValue = $dataTables ? $request->input('search.value') : $request->input('search');

        if ($searchValue !== null && trim((string) $searchValue) !== '') {
            $keyword = trim((string) $searchValue);

            $query->where(function ($subQuery) use ($keyword) {
                foreach ($this->searchableColumns as $index => $column) {
                    if ($index === 0) {
                        $subQuery->where($column, 'like', '%' . $keyword . '%');
                    } else {
                        $subQuery->orWhere($column, 'like', '%' . $keyword . '%');
                    }
                }
            });
        }

        return $query;
    }

    protected function applyOrdering($query, Request $request): void
    {
        $orderColumn = $request->input('order.0.column');
        $orderDir = strtolower((string) $request->input('order.0.dir', 'desc'));
        $orderDir = in_array($orderDir, ['asc', 'desc'], true) ? $orderDir : 'desc';

        if ($orderColumn !== null && isset($this->orderColumns[(int) $orderColumn])) {
            $query->orderBy($this->orderColumns[(int) $orderColumn], $orderDir);

            return;
        }

        $query->orderBy('id', 'desc');
    }

    protected function fillItem(Model $item, Request $request, bool $isNew = false): void
    {
        $payload = $request->except(['login_by', 'login_id']);
        unset($payload['_method']);

        $actorId = $this->resolveActorId($request);

        foreach ($this->coreFieldMap as $column => $keys) {
            $item->{$column} = $this->getPayloadValue($payload, $keys);
        }

        if (array_key_exists('status', $this->coreFieldMap)) {
            $item->status = $this->getPayloadValue($payload, $this->coreFieldMap['status']) ?? ($item->status ?? 'submitted');
        }

        $item->payload = json_encode($payload, JSON_UNESCAPED_UNICODE);

        if ($isNew) {
            $item->create_by = $actorId;
        }

        $item->update_by = $actorId;
    }

    protected function auditActionColumns(): array
    {
        $columns = [];

        foreach (array_keys($this->coreFieldMap) as $column) {
            if ($column === 'status' || $this->endsWith($column, '_status') || strpos($column, 'decision') !== false) {
                $columns[] = $column;
            }
        }

        foreach (array_keys($this->roleStatusFieldMap ?? []) as $column) {
            $columns[] = $column;
        }

        return array_values(array_unique($columns));
    }

    protected function auditActionValues(Model $item): array
    {
        $values = [];

        foreach ($this->auditActionColumns() as $column) {
            $values[$column] = $item->{$column} ?? null;
        }

        return $values;
    }

    protected function logActionRequestChanges(Request $request, Model $item, array $oldValues): void
    {
        $changed = [];

        foreach ($this->auditActionColumns() as $column) {
            $oldValue = $oldValues[$column] ?? null;
            $newValue = $item->{$column} ?? null;

            if ($this->normalizeAuditComparableValue($oldValue) === $this->normalizeAuditComparableValue($newValue)) {
                continue;
            }

            $changed[$column] = [
                'old' => $oldValue,
                'new' => $newValue,
            ];
        }

        if (empty($changed)) {
            return;
        }

        $roleChanges = array_filter($changed, function ($value, $column) {
            return $column !== 'status';
        }, ARRAY_FILTER_USE_BOTH);

        $changesToLog = !empty($roleChanges) ? $roleChanges : $changed;
        $table = method_exists($item, 'getTable') ? $item->getTable() : class_basename($item);

        foreach ($changesToLog as $column => $change) {
            $this->logActionRequestAudit(
                $request,
                $table,
                $item->id,
                $column,
                $change['old'],
                $change['new'],
                $request->input('comment') ?? $request->input('comments') ?? null
            );
        }
    }

    protected function normalizeAuditComparableValue($value): string
    {
        if ($value === null) {
            return '';
        }

        return strtolower(trim((string) $value));
    }

    protected function endsWith(string $value, string $suffix): bool
    {
        return $suffix === '' || substr($value, -strlen($suffix)) === $suffix;
    }

    protected function transformItem(Model $item): array
    {
        $payload = json_decode($item->payload ?? '[]', true);
        if (! is_array($payload)) {
            $payload = [];
        }

        $meta = [
            'id' => $item->id,
            'create_by' => $item->create_by,
            'update_by' => $item->update_by,
            'created_at' => $item->created_at,
            'updated_at' => $item->updated_at,
        ];

        foreach (array_keys($this->coreFieldMap) as $column) {
            $meta[$column] = $item->{$column};
        }

        return array_merge($payload, $meta);
    }

    protected function afterTransformRows(array $rows): array
    {
        if (empty($rows) || ! $this->shouldAppendEmployeeReferenceDetails()) {
            return $rows;
        }

        $references = [];

        foreach ($rows as $row) {
            foreach (self::EMPLOYEE_REFERENCE_KEYS as $key) {
                $code = $this->normalizeEmployeeReference($row[$key] ?? null);
                if ($code !== null) {
                    $references[$code] = true;
                }
            }
        }

        if (empty($references)) {
            return $rows;
        }

        $employees = $this->loadEmployeeDisplayMap(array_keys($references));

        if (empty($employees)) {
            return $rows;
        }

        return array_map(function (array $row) use ($employees) {
            foreach (self::EMPLOYEE_REFERENCE_KEYS as $key) {
                if (! array_key_exists($key, $row)) {
                    continue;
                }

                $code = $this->normalizeEmployeeReference($row[$key] ?? null);
                if ($code === null || ! isset($employees[$code])) {
                    continue;
                }

                $employee = $employees[$code];
                $row[$this->employeeNameKey($key)] = $employee['display_label'];
                $row[$this->employeeObjectKey($key)] = $employee;
            }

            return $row;
        }, $rows);
    }

    protected function shouldAppendEmployeeReferenceDetails(): bool
    {
        if (! isset($this->modelClass) || ! class_exists($this->modelClass)) {
            return false;
        }

        $class = $this->modelClass;
        $model = new $class();

        return in_array($model->getTable(), self::EMPLOYEE_ENRICHED_TABLES, true);
    }

    protected function loadEmployeeDisplayMap(array $references): array
    {
        $references = array_values(array_unique(array_filter(array_map(function ($value) {
            return $this->normalizeEmployeeReference($value);
        }, $references))));

        if (empty($references)) {
            return [];
        }

        $numericIds = array_values(array_filter($references, function (string $value) {
            return preg_match('/^\d+$/', $value) === 1;
        }));

        $query = DB::table('employees')
            ->whereNull('deleted_at')
            ->where(function ($query) use ($references, $numericIds) {
                $query->whereIn('code', $references);

                if (! empty($numericIds)) {
                    $query->orWhereIn('id', array_map('intval', $numericIds));
                }
            });

        $rows = $query
            ->get([
                'id',
                'code',
                'initial',
                'firstname',
                'lastname',
                'email',
                'level_name',
                'title_name',
                'department_name',
                'employee_type_name',
            ]);

        $map = [];

        foreach ($rows as $employee) {
            $payload = $this->employeePayload($employee);

            if (! empty($employee->code)) {
                $map[trim((string) $employee->code)] = $payload;
            }

            if (! empty($employee->id)) {
                $map[(string) $employee->id] = $payload;
            }
        }

        return $map;
    }

    protected function employeePayload($employee): array
    {
        $initial = trim((string) ($employee->initial ?? ''));
        $firstname = trim((string) ($employee->firstname ?? ''));
        $lastname = trim((string) ($employee->lastname ?? ''));
        $name = trim($firstname . ' ' . $lastname);
        $displayLabel = trim(implode(', ', array_filter([$initial, $name], function ($value) {
            return trim((string) $value) !== '';
        })));

        if ($displayLabel === '') {
            $displayLabel = trim((string) ($employee->code ?? $employee->id ?? ''));
        }

        return [
            'id' => $employee->id,
            'code' => $employee->code,
            'initial' => $initial,
            'name' => $name,
            'firstname' => $firstname,
            'lastname' => $lastname,
            'first_name' => $firstname,
            'last_name' => $lastname,
            'email' => $employee->email,
            'level_name' => $employee->level_name,
            'title_name' => $employee->title_name,
            'department_name' => $employee->department_name,
            'employee_type_name' => $employee->employee_type_name,
            'display_label' => $displayLabel,
            'displayLabel' => $displayLabel,
        ];
    }

    protected function normalizeEmployeeReference($value): ?string
    {
        if (is_array($value)) {
            foreach (['code', 'employee_code', 'employeeCode', 'id', 'employee_id', 'employeeId'] as $key) {
                if (array_key_exists($key, $value)) {
                    return $this->normalizeEmployeeReference($value[$key]);
                }
            }

            return null;
        }

        if (is_object($value)) {
            foreach (['code', 'employee_code', 'employeeCode', 'id', 'employee_id', 'employeeId'] as $key) {
                if (isset($value->{$key})) {
                    return $this->normalizeEmployeeReference($value->{$key});
                }
            }

            return null;
        }

        $normalized = trim((string) ($value ?? ''));

        return $normalized === '' || $normalized === '-' ? null : $normalized;
    }

    protected function employeeNameKey(string $key): string
    {
        return strpos($key, '_') !== false ? "{$key}_name" : "{$key}Name";
    }

    protected function employeeObjectKey(string $key): string
    {
        return strpos($key, '_') !== false ? "{$key}_employee" : "{$key}Employee";
    }

    protected function getPayloadValue(array $payload, array $keys): ?string
    {
        foreach ($keys as $key) {
            if (! array_key_exists($key, $payload)) {
                continue;
            }

            $value = $payload[$key];

            if ($value === null) {
                return null;
            }

            if (is_string($value) && trim($value) === '') {
                return null;
            }

            if (is_bool($value)) {
                return $value ? '1' : '0';
            }

            if (is_scalar($value)) {
                return (string) $value;
            }

            if (is_array($value)) {
                if ($value === []) {
                    return null;
                }

                $allScalar = true;
                foreach ($value as $entry) {
                    if (! is_scalar($entry) && $entry !== null) {
                        $allScalar = false;
                        break;
                    }
                }

                if ($allScalar) {
                    return implode(', ', array_map(function ($entry) {
                        return (string) $entry;
                    }, array_filter($value, function ($entry) {
                        return $entry !== null && $entry !== '';
                    })));
                }

                return json_encode($value, JSON_UNESCAPED_UNICODE);
            }
        }

        return null;
    }
}
