<?php

namespace App\Http\Controllers;

use App\Models\LeedReview;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class LeedReviewController extends JsonPayloadCrudController
{
    protected string $modelClass = LeedReview::class;

    protected array $coreFieldMap = [
        'form_type' => ['formType', 'form_type'],
        'project_id' => ['projectId', 'project_id'],
        'project_name' => ['projectName', 'project_name'],
        'project_number' => ['projectNumber', 'project_number', 'project_no'],
        'prepared_by' => ['preparedBy', 'prepared_by'],
        'project_stage' => ['projectStage', 'project_stage'],
        'document_location' => ['documentLocation', 'document_location'],
        'review_method' => ['reviewMethod', 'review_method'],
        'status' => ['status'],
    ];

    protected array $roleFieldMap = [
        'reviewed_by' => ['reviewedBy', 'reviewed_by'],
        'responded_by' => ['respondedBy', 'responded_by'],
        'signed_by' => ['signedBy', 'signed_by'],
        'signed_by_tl' => ['signedByTL', 'signed_by_tl'],
        'acknowledged_by' => ['acknowledgedBy', 'acknowledged_by'],
    ];

    protected array $roleDateFieldMap = [
        'reviewed_by_date' => ['reviewedByDate', 'reviewed_by_date'],
        'responded_by_date' => ['respondedByDate', 'responded_by_date', 'peResponseDate', 'pe_response_date'],
        'signed_by_date' => ['signedByDate', 'signed_by_date', 'reviewerFollowUpDate', 'reviewer_follow_up_date'],
        'signed_by_tl_date' => ['signedByTLDate', 'signed_by_tl_date', 'tlReviewDate', 'tl_review_date'],
        'acknowledged_by_date' => ['acknowledgedByDate', 'acknowledged_by_date', 'diAcknowledgeDate', 'di_acknowledge_date'],
    ];

    protected array $roleStatusFieldMap = [
        'reviewed_by_status' => ['reviewedByStatus', 'reviewed_by_status'],
        'responded_by_status' => ['respondedByStatus', 'responded_by_status'],
        'signed_by_status' => ['signedByStatus', 'signed_by_status'],
        'signed_by_tl_status' => ['signedByTLStatus', 'signed_by_tl_status'],
        'acknowledged_by_status' => ['acknowledgedByStatus', 'acknowledged_by_status'],
    ];

    protected array $exactFilterMap = [
        'project_id' => 'project_id',
        'form_type' => 'form_type',
        'project_stage' => 'project_stage',
        'review_method' => 'review_method',
        'status' => 'status',
        'reviewed_by_status' => 'reviewed_by_status',
        'responded_by_status' => 'responded_by_status',
        'signed_by_status' => 'signed_by_status',
        'signed_by_tl_status' => 'signed_by_tl_status',
        'acknowledged_by_status' => 'acknowledged_by_status',
    ];

    protected array $likeFilterMap = [
        'project_name' => 'project_name',
        'project_number' => 'project_number',
        'prepared_by' => 'prepared_by',
        'reviewed_by' => 'reviewed_by',
        'responded_by' => 'responded_by',
        'signed_by' => 'signed_by',
        'signed_by_tl' => 'signed_by_tl',
        'acknowledged_by' => 'acknowledged_by',
    ];

    protected array $searchableColumns = [
        'form_type',
        'project_id',
        'project_name',
        'project_number',
        'prepared_by',
        'project_stage',
        'review_method',
        'status',
        'reviewed_by',
        'responded_by',
        'signed_by',
        'signed_by_tl',
        'acknowledged_by',
        'reviewed_by_status',
        'responded_by_status',
        'signed_by_status',
        'signed_by_tl_status',
        'acknowledged_by_status',
    ];

    protected array $orderColumns = [
        0 => 'project_number',
        1 => 'project_name',
        2 => 'project_stage',
        3 => 'created_at',
        4 => 'responded_by',
        5 => 'reviewed_by',
        6 => 'signed_by_tl',
        7 => 'acknowledged_by',
        8 => 'status',
    ];

    protected function fillItem(Model $item, Request $request, bool $isNew = false): void
    {
        $payload = $this->sanitizePayloadDates($request->except(['login_by', 'login_id']));
        unset($payload['_method']);

        $actorId = $this->resolveActorId($request);

        foreach ($this->coreFieldMap as $column => $keys) {
            $item->{$column} = $this->getPayloadValue($payload, $keys);
        }

        foreach ($this->roleFieldMap as $column => $keys) {
            $item->{$column} = $this->getPayloadValue($payload, $keys);
        }

        foreach ($this->roleDateFieldMap as $column => $keys) {
            $item->{$column} = $this->getNormalizedDateTimeValue($payload, $keys);
        }

        foreach ($this->roleStatusFieldMap as $column => $keys) {
            $item->{$column} = $this->getRoleStatusValue($payload, $column, $keys, $item->{$column} ?? null);
            $payload[$column] = $item->{$column};
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

        foreach ($this->getTransformColumns() as $column) {
            $meta[$column] = $item->{$column};
        }

        return array_merge($payload, $meta);
    }

    protected function getTransformColumns(): array
    {
        return array_values(array_unique(array_merge(
            array_keys($this->coreFieldMap),
            array_keys($this->roleFieldMap),
            array_keys($this->roleDateFieldMap),
            array_keys($this->roleStatusFieldMap)
        )));
    }

    protected function sanitizePayloadDates($value, ?string $key = null)
    {
        if (is_array($value)) {
            $sanitized = [];
            foreach ($value as $childKey => $childValue) {
                $sanitized[$childKey] = $this->sanitizePayloadDates($childValue, is_string($childKey) ? $childKey : null);
            }

            return $sanitized;
        }

        if ($key !== null && $this->isDateKey($key)) {
            return $this->normalizeDateTime($value);
        }

        return $value;
    }

    protected function isDateKey(string $key): bool
    {
        return (bool) preg_match('/(?:Date|_date)$/', $key);
    }

    protected function getNormalizedDateTimeValue(array $payload, array $keys): ?string
    {
        foreach ($keys as $key) {
            if (! array_key_exists($key, $payload)) {
                continue;
            }

            return $this->normalizeDateTime($payload[$key]);
        }

        return null;
    }

    protected function normalizeDateTime($value): ?string
    {
        if ($value === null) {
            return null;
        }

        if (is_string($value) && trim($value) === '') {
            return null;
        }

        try {
            return Carbon::parse($value)->format('Y-m-d H:i:s');
        } catch (\Throwable $e) {
            return null;
        }
    }

    protected function getRoleStatusValue(array $payload, string $column, array $keys, ?string $currentValue = null): string
    {
        $explicit = $this->getPayloadValue($payload, $keys);
        if ($explicit !== null) {
            return $explicit;
        }

        $roleDateColumn = str_replace('_status', '_date', $column);
        $roleByColumn = str_replace('_status', '', $column);

        if (! empty($payload[$roleDateColumn]) || ! empty($this->getPayloadValue($payload, [$this->toCamelCase($roleDateColumn), $roleDateColumn]))) {
            return 'completed';
        }

        if (! empty($payload[$roleByColumn]) || ! empty($this->getPayloadValue($payload, [$this->toCamelCase($roleByColumn), $roleByColumn]))) {
            return $currentValue ?? 'pending';
        }

        return $currentValue ?? 'pending';
    }

    protected function toCamelCase(string $value): string
    {
        return lcfirst(str_replace(' ', '', ucwords(str_replace('_', ' ', $value))));
    }
}
