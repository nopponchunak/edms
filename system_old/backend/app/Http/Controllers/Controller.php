<?php

namespace App\Http\Controllers;

use App\Mail\SendMail;
use App\Models\Log;
use App\Models\MenuPermission;
use App\Models\Orders;
use App\Models\Signature;
use App\Models\Clients;
use App\Models\Factory;
use App\Models\OrderList;
use App\Models\Products;
use App\Models\CategoryProduct;
use App\Models\SubCategoryProduct;
use App\Models\User;
use App\Models\Employee;
use App\Models\unit;
use App\Models\ProductUnit;
use App\Models\Promotion;
use App\Models\ProductImages;
use App\Models\ProductImagesPanorama;
use App\Models\ZoneMarket;
use App\Models\ZoneMarketList;
use App\Models\UserZoneMarket;
use App\Models\Commission;
use App\Models\CommissionStep;
use App\Models\Banner;
use App\Models\Text;
use App\Models\TextPosition;
use App\Models\Meeting;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Foundation\Bus\DispatchesJobs;
use Illuminate\Foundation\Validation\ValidatesRequests;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller as BaseController;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Mail;
use Intervention\Image\Facades\Image;
use Illuminate\Support\Facades\DB;
use Berkayk\OneSignal\OneSignalFacade;
use Haruncpi\LaravelIdGenerator\IdGenerator;
use App\Imports\ClientsImport;
use Maatwebsite\Excel\Facades\Excel;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Schema;
use \Firebase\JWT\JWT;
use Carbon\Carbon;
use Exception;

class Controller extends BaseController
{
    use AuthorizesRequests, DispatchesJobs, ValidatesRequests;

    protected function normalizeDateTimeInput($value)
    {
        if ($value === null || $value === '') {
            return $value;
        }

        if (!is_string($value)) {
            return $value;
        }

        try {
            if (preg_match('/^\d{2}-\d{2}-\d{4}$/', $value)) {
                return Carbon::createFromFormat('d-m-Y', $value)
                    ->startOfDay()
                    ->format('Y-m-d H:i:s');
            }

            if (preg_match('/^\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}$/', $value)) {
                return Carbon::createFromFormat('d-m-Y H:i', $value)
                    ->format('Y-m-d H:i:s');
            }

            if (preg_match('/^\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2}$/', $value)) {
                return Carbon::createFromFormat('d-m-Y H:i:s', $value)
                    ->format('Y-m-d H:i:s');
            }

            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
                return Carbon::createFromFormat('Y-m-d', $value)
                    ->startOfDay()
                    ->format('Y-m-d H:i:s');
            }

            if (preg_match('/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/', $value)) {
                return Carbon::createFromFormat('Y-m-d H:i', $value)
                    ->format('Y-m-d H:i:s');
            }

            if (preg_match('/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/', $value)) {
                return Carbon::createFromFormat('Y-m-d H:i:s', $value)
                    ->format('Y-m-d H:i:s');
            }

            return Carbon::parse($value)->format('Y-m-d H:i:s');
        } catch (\Throwable $e) {
            return $value;
        }
    }

    protected function normalizeCurrencyCodeInput($value, string $default = 'THB'): string
    {
        if (is_array($value) || is_object($value)) {
            return $default;
        }

        $currencyCode = strtoupper(trim((string) $value));

        if ($currencyCode === '') {
            return $default;
        }

        return substr($currencyCode, 0, 10);
    }

    protected function normalizeAllowedUploadExtensions($value): array
    {
        if ($value === null || $value === '') {
            return [];
        }

        $items = is_array($value) ? $value : preg_split('/[,|]+/', (string) $value);

        return array_values(array_unique(array_filter(array_map(function ($extension) {
            return strtolower(ltrim(trim((string) $extension), '.'));
        }, $items ?: []), function ($extension) {
            return $extension !== '';
        })));
    }

    protected function uploadedFileMatchesAllowedExtensions($file, array $allowedExtensions): bool
    {
        if (empty($allowedExtensions)) {
            return true;
        }

        $extension = strtolower((string) $file->getClientOriginalExtension());
        if ($extension === '') {
            $extension = strtolower((string) $file->extension());
        }

        if (!in_array($extension, $allowedExtensions, true)) {
            return false;
        }

        if ($allowedExtensions === ['pdf']) {
            $mimeType = strtolower((string) ($file->getMimeType() ?: $file->getClientMimeType()));
            return in_array($mimeType, ['application/pdf', 'application/x-pdf'], true);
        }

        return true;
    }

    protected function attachmentPathForValidation($attachment): string
    {
        if (is_string($attachment)) {
            return trim($attachment);
        }

        if (is_object($attachment)) {
            $attachment = (array) $attachment;
        }

        if (is_array($attachment)) {
            foreach (['file_path', 'path', 'file_url', 'url', 'fileName', 'file_name', 'name'] as $key) {
                $path = $this->extractAttachmentPathValue($attachment[$key] ?? null);
                if ($path !== '') {
                    return $path;
                }
            }

            return $this->extractAttachmentPathValue($attachment);
        }

        return '';
    }

    protected function extractAttachmentPathValue($value, int $depth = 0): string
    {
        if ($depth > 3 || $value === null) {
            return '';
        }

        if (is_string($value)) {
            return trim($value);
        }

        if (is_scalar($value)) {
            return trim((string) $value);
        }

        if (is_object($value)) {
            $value = (array) $value;
        }

        if (!is_array($value)) {
            return '';
        }

        foreach (['file_path', 'path', 'file_url', 'url', 'fileName', 'file_name', 'name'] as $key) {
            if (!array_key_exists($key, $value)) {
                continue;
            }

            $path = $this->extractAttachmentPathValue($value[$key], $depth + 1);
            if ($path !== '') {
                return $path;
            }
        }

        foreach ($value as $item) {
            if (!is_array($item) && !is_object($item)) {
                continue;
            }

            $path = $this->extractAttachmentPathValue($item, $depth + 1);
            if ($path !== '') {
                return $path;
            }
        }

        return '';
    }

    protected function attachmentPathHasExtension($attachment, string $extension): bool
    {
        $path = $this->attachmentPathForValidation($attachment);
        if ($path === '') {
            return false;
        }

        $parsedPath = parse_url($path, PHP_URL_PATH);
        $pathExtension = strtolower(pathinfo((string) ($parsedPath ?: $path), PATHINFO_EXTENSION));

        return $pathExtension === strtolower(ltrim($extension, '.'));
    }

    protected function firstNonPdfAttachment($attachments)
    {
        if (is_string($attachments)) {
            $decoded = json_decode($attachments, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                $attachments = $decoded;
            } elseif (trim($attachments) !== '') {
                $attachments = [$attachments];
            } else {
                $attachments = [];
            }
        }

        if (!is_array($attachments)) {
            return null;
        }

        foreach ($attachments as $attachment) {
            if (!$this->attachmentPathHasExtension($attachment, 'pdf')) {
                return $this->attachmentPathForValidation($attachment) ?: 'unknown attachment';
            }
        }

        return null;
    }

    protected function resolveActorId(Request $request): string
    {
        // Prefer middleware-decoded JWT fields.
        if (isset($request->login_id) && $request->login_id !== null && $request->login_id !== '') {
            return (string) $request->login_id;
        }

        // Support legacy client payloads.
        $loginBy = $request->login_by ?? null;
        if (is_object($loginBy)) {
            foreach (['username', 'code', 'employee_code', 'name', 'email'] as $key) {
                if (isset($loginBy->{$key}) && $loginBy->{$key} !== null && trim((string) $loginBy->{$key}) !== '') {
                    return trim((string) $loginBy->{$key});
                }
            }
            if (isset($loginBy->user_id) && $loginBy->user_id !== null && $loginBy->user_id !== '') {
                return (string) $loginBy->user_id;
            }
            if (isset($loginBy->id) && $loginBy->id !== null && $loginBy->id !== '') {
                return (string) $loginBy->id;
            }
        }
        if (is_array($loginBy)) {
            foreach (['username', 'code', 'employee_code', 'name', 'email'] as $key) {
                if (!empty($loginBy[$key])) {
                    return trim((string) $loginBy[$key]);
                }
            }
            if (!empty($loginBy['user_id'])) {
                return (string) $loginBy['user_id'];
            }
            if (!empty($loginBy['id'])) {
                return (string) $loginBy['id'];
            }
        }

        // Try decoding JWT directly for endpoints that don't run checkjwt middleware.
        try {
            $header = (string) $request->header('Authorization');
            if ($header !== '' && stripos($header, 'Bearer ') === 0) {
                $token = trim(substr($header, 7));
                if ($token !== '') {
                    $payload = JWT::decode($token, 'key', ['HS256']);
                    if (isset($payload->aud) && $payload->aud !== null && $payload->aud !== '') {
                        return (string) $payload->aud;
                    }
                }
            }
        } catch (Exception $e) {
            // ignore
        }

        return 'system';
    }

    protected function isSystemAdminRequest(Request $request): bool
    {
        $candidates = [];

        if (isset($request->login_by)) {
            $candidates = array_merge($candidates, $this->systemAdminCandidateValues($request->login_by));
        }

        foreach (['login_username', 'username_by', 'user_id', 'login_id', 'created_by', 'updated_by'] as $key) {
            if (isset($request->{$key}) && $request->{$key} !== null && trim((string) $request->{$key}) !== '') {
                $candidates[] = trim((string) $request->{$key});
            }
        }

        $jwtPayload = $this->jwtPayloadFromRequest($request);
        if ($jwtPayload) {
            if (isset($jwtPayload->aud) && $jwtPayload->aud !== null && trim((string) $jwtPayload->aud) !== '') {
                $candidates[] = trim((string) $jwtPayload->aud);
            }
            if (isset($jwtPayload->lun)) {
                $candidates = array_merge($candidates, $this->systemAdminCandidateValues($jwtPayload->lun));
            }
        }

        $actorId = $this->resolveActorId($request);
        if ($actorId !== '') {
            $candidates[] = $actorId;
        }

        $actorUser = $this->findSystemAdminCheckUser($candidates);
        return $actorUser ? $this->isExactAuditLogAdminUser($actorUser) : false;
    }

    protected function jwtPayloadFromRequest(Request $request)
    {
        try {
            $header = (string) $request->header('Authorization');
            if ($header === '' || stripos($header, 'Bearer ') !== 0) {
                return null;
            }

            $token = trim(substr($header, 7));
            if ($token === '') {
                return null;
            }

            return JWT::decode($token, 'key', ['HS256']);
        } catch (Exception $e) {
            return null;
        }
    }

    /**
     * Resolve the employee code used by approval workflows from the authenticated
     * login payload. Action endpoints must not trust an employee code supplied as
     * a standalone request field.
     */
    protected function resolveWorkflowActorCode(Request $request): string
    {
        $extractCode = function ($source): ?string {
            if (is_object($source)) {
                foreach (['employee_code', 'employeeCode', 'code', 'username'] as $key) {
                    if (isset($source->{$key}) && trim((string) $source->{$key}) !== '') {
                        return trim((string) $source->{$key});
                    }
                }
            }

            if (is_array($source)) {
                foreach (['employee_code', 'employeeCode', 'code', 'username'] as $key) {
                    if (isset($source[$key]) && trim((string) $source[$key]) !== '') {
                        return trim((string) $source[$key]);
                    }
                }
            }

            return null;
        };

        $payload = $this->jwtPayloadFromRequest($request);
        $jwtCode = $payload && isset($payload->lun) ? $extractCode($payload->lun) : null;
        if ($jwtCode !== null) {
            return $jwtCode;
        }

        return $extractCode($request->login_by ?? null) ?? '';
    }

    /**
     * Apply one server-authorized action to a sequential document workflow.
     * Only the current assignee can change the current step; dates and actor are
     * always generated on the server.
     */
    protected function performSequentialWorkflowAction(
        Request $request,
        $id,
        string $type,
        string $modelClass,
        string $table,
        array $steps
    ) {
        $decision = strtolower(trim((string) $request->input('decision', $request->input('status'))));
        if (in_array($decision, ['approve', 'approved'], true)) {
            $decision = 'approved';
        } elseif (in_array($decision, ['reject', 'rejected'], true)) {
            $decision = 'rejected';
        } else {
            return $this->workflowActionError('Decision must be approved or rejected.', 422);
        }

        $actorCode = $this->resolveWorkflowActorCode($request);
        if ($actorCode === '') {
            return $this->workflowActionError('Unable to identify the signed-in employee.', 401);
        }

        DB::beginTransaction();

        try {
            /** @var Model|null $document */
            $document = $modelClass::query()->lockForUpdate()->find($id);
            if (!$document) {
                DB::rollBack();
                return $this->workflowActionError('Document not found.', 404);
            }

            $currentStep = null;
            foreach ($steps as $stepIndex => $step) {
                $assignee = trim((string) ($document->{$step['by']} ?? ''));
                if ($assignee === '') {
                    if (($step['required'] ?? false) === true) {
                        $documentStatus = strtolower(trim((string) ($document->status ?? '')));
                        $isLegacyCompleted = ($step['allow_missing_when_document_completed'] ?? false) === true
                            && (
                                in_array($documentStatus, ['approve', 'approved', 'complete', 'completed'], true)
                                || $this->hasApprovedLaterWorkflowSteps($document, $steps, $stepIndex)
                            );
                        if ($isLegacyCompleted) {
                            continue;
                        }
                        DB::rollBack();
                        return $this->workflowActionError('A required workflow assignee has not been assigned.', 422);
                    }
                    continue;
                }

                $status = strtolower(trim((string) ($document->{$step['status']} ?? '')));
                if (!in_array($status, ['approve', 'approved'], true)) {
                    $currentStep = $step;
                    break;
                }
            }

            if ($currentStep === null) {
                DB::rollBack();
                return $this->workflowActionError('This workflow has already been completed.', 409);
            }

            if (($currentStep['type'] ?? '') !== $type) {
                DB::rollBack();
                return $this->workflowActionError('The previous workflow step must be completed first.', 409);
            }

            if (strtolower(trim((string) $document->{$currentStep['by']})) !== strtolower($actorCode)) {
                DB::rollBack();
                return $this->workflowActionError('You are not assigned to this workflow step.', 403);
            }

            $oldValue = $document->{$currentStep['status']} ?? null;
            $oldStatus = strtolower(trim((string) $oldValue));
            if (in_array($oldStatus, ['approve', 'approved', 'reject', 'rejected'], true)) {
                DB::rollBack();
                return $this->workflowActionError('This workflow step has already been completed.', 409);
            }

            $document->{$currentStep['status']} = $decision;
            $document->{$currentStep['date']} = now()->format('Y-m-d H:i:s');
            $document->update_by = $actorCode;
            $document->save();

            $this->logActionRequestAudit(
                $request,
                $table,
                $document->getKey(),
                $currentStep['status'],
                $oldValue,
                $decision,
                $request->input('comments') ?? $request->input('comment')
            );

            DB::commit();

            return $this->returnUpdateReturnData('Workflow status updated successfully.', $document->fresh());
        } catch (\Throwable $e) {
            DB::rollBack();
            \Illuminate\Support\Facades\Log::error('Sequential workflow action failed', [
                'table' => $table,
                'id' => $id,
                'type' => $type,
                'error' => $e->getMessage(),
            ]);

            return $this->workflowActionError('Unable to update the workflow status. Please try again.', 500);
        }
    }

    protected function hasApprovedLaterWorkflowSteps($document, array $steps, int $stepIndex): bool
    {
        $hasAssignedLaterStep = false;

        foreach (array_slice($steps, $stepIndex + 1) as $laterStep) {
            $assignee = trim((string) ($document->{$laterStep['by']} ?? ''));
            if ($assignee === '') {
                continue;
            }

            $hasAssignedLaterStep = true;
            $status = strtolower(trim((string) ($document->{$laterStep['status']} ?? '')));
            if (!in_array($status, ['approve', 'approved'], true)) {
                return false;
            }
        }

        return $hasAssignedLaterStep;
    }

    protected function workflowActionError(string $message, int $status)
    {
        return response()->json([
            'code' => (string) $status,
            'status' => false,
            'message' => $message,
            'data' => [],
        ], $status);
    }

    protected function systemAdminCandidateValues($value): array
    {
        $candidates = [];

        if (is_string($value) || is_numeric($value)) {
            $trimmed = trim((string) $value);
            return $trimmed !== '' ? [$trimmed] : [];
        }

        if (is_object($value)) {
            foreach (['id', 'user_id', 'username', 'userName', 'code', 'employee_code', 'employeeCode', 'email'] as $key) {
                if (isset($value->{$key}) && $value->{$key} !== null && trim((string) $value->{$key}) !== '') {
                    $candidates[] = trim((string) $value->{$key});
                }
            }
        }

        if (is_array($value)) {
            foreach (['id', 'user_id', 'username', 'userName', 'code', 'employee_code', 'employeeCode', 'email'] as $key) {
                if (isset($value[$key]) && $value[$key] !== null && trim((string) $value[$key]) !== '') {
                    $candidates[] = trim((string) $value[$key]);
                }
            }
        }

        return $candidates;
    }

    protected function findSystemAdminCheckUser(array $candidates)
    {
        foreach (array_unique(array_filter(array_map('trim', $candidates))) as $candidate) {
            if (is_numeric($candidate)) {
                $user = User::query()->where('id', (int) $candidate)->first();
                if ($user) {
                    return $user;
                }
                continue;
            }

            $user = User::query()
                ->where('username', $candidate)
                ->orWhere('code', $candidate)
                ->orWhere('email', $candidate)
                ->first();

            if ($user) {
                return $user;
            }
        }

        return null;
    }

    protected function hasSystemAdminCandidate(array $candidates): bool
    {
        foreach ($candidates as $candidate) {
            $value = strtolower(trim((string) $candidate));
            if ($value === 'admin') {
                return true;
            }

            if (strpos($value, '@') !== false && strtok($value, '@') === 'admin') {
                return true;
            }
        }

        return false;
    }

    protected function isExactAuditLogAdminUser($user): bool
    {
        if ($this->isActiveDirectoryUser($user)) {
            return false;
        }

        return strtolower(trim((string) ($user->username ?? ''))) === 'admin'
            && strtolower(trim((string) ($user->name ?? ''))) === 'administrator'
            && strtolower(trim((string) ($user->email ?? ''))) === 'admin@local';
    }

    protected function isActiveDirectoryUser($user): bool
    {
        $type = strtolower(trim((string) ($user->type ?? '')));
        return in_array($type, ['sync_ad', 'ad', 'active_directory', 'ldap'], true);
    }

    protected function auditLogSettingsMenuIds(): array
    {
        static $ids = null;

        if ($ids !== null) {
            return $ids;
        }

        if (!Schema::hasTable('menus')) {
            $ids = [];
            return $ids;
        }

        $ids = DB::table('menus')
            ->where('key', 'mm6.audit_log_settings')
            ->orWhere('path', '/settings/audit-logs')
            ->pluck('id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->toArray();

        return $ids;
    }

    protected function isAuditLogSettingsMenuId(int $menuId): bool
    {
        return in_array($menuId, $this->auditLogSettingsMenuIds(), true);
    }

    protected function menuPermissionActionColumns(): array
    {
        return [
            'create',
            'view_own',
            'edit_own',
            'delete_own',
            'view_all',
            'edit_all',
            'delete_all',
        ];
    }

    protected function emptyMenuPermissionActions(): array
    {
        return array_fill_keys($this->menuPermissionActionColumns(), 0);
    }

    protected function normalizeMenuPermissionActions($payload): array
    {
        $actions = $this->emptyMenuPermissionActions();

        foreach ($actions as $column => $value) {
            $actions[$column] = (int) data_get($payload, $column, 0);
        }

        $hasCreateAction = data_get($payload, 'create') !== null;
        $hasViewActions = data_get($payload, 'view_own') !== null || data_get($payload, 'view_all') !== null;
        $hasEditActions = data_get($payload, 'edit_own') !== null || data_get($payload, 'edit_all') !== null;
        $hasDeleteActions = data_get($payload, 'delete_own') !== null || data_get($payload, 'delete_all') !== null;

        // Backward compatibility for clients still sending view/edit/save/delete.
        // Do not let derived legacy fields overwrite the more precise Excel actions.
        if (!$hasViewActions && data_get($payload, 'view') !== null) {
            $actions['view_own'] = (int) data_get($payload, 'view', 0);
            $actions['view_all'] = (int) data_get($payload, 'view', 0);
        }
        if (!$hasEditActions && data_get($payload, 'edit') !== null) {
            $actions['edit_own'] = (int) data_get($payload, 'edit', 0);
            $actions['edit_all'] = (int) data_get($payload, 'edit', 0);
        }
        if (!$hasCreateAction && data_get($payload, 'save') !== null) {
            $actions['create'] = (int) data_get($payload, 'save', 0);
        }
        if (!$hasDeleteActions && data_get($payload, 'delete') !== null) {
            $actions['delete_own'] = (int) data_get($payload, 'delete', 0);
            $actions['delete_all'] = (int) data_get($payload, 'delete', 0);
        }

        foreach ($actions as $column => $value) {
            $actions[$column] = $value ? 1 : 0;
        }

        return $actions;
    }

    protected function legacyMenuPermissionActions(array $actions): array
    {
        return [
            'view' => (!empty($actions['view_own']) || !empty($actions['view_all'])) ? 1 : 0,
            'edit' => (!empty($actions['edit_own']) || !empty($actions['edit_all'])) ? 1 : 0,
            'save' => (!empty($actions['create']) || !empty($actions['edit_own']) || !empty($actions['edit_all'])) ? 1 : 0,
            'delete' => (!empty($actions['delete_own']) || !empty($actions['delete_all'])) ? 1 : 0,
        ];
    }

    protected function serializeMenuPermissionActions($row): array
    {
        if (!$row) {
            $actions = $this->emptyMenuPermissionActions();
        } else {
            $actions = [];
            foreach ($this->menuPermissionActionColumns() as $column) {
                $actions[$column] = (int) data_get($row, $column, 0);
            }

            // Rows created before the Excel matrix migration may not have new columns populated.
            $actions = array_merge(
                $actions,
                $this->normalizeMenuPermissionActions(array_merge(
                    [
                        'view' => data_get($row, 'view', 0),
                        'edit' => data_get($row, 'edit', 0),
                        'save' => data_get($row, 'save', 0),
                        'delete' => data_get($row, 'delete', 0),
                    ],
                    $actions
                ))
            );
        }

        return array_merge($this->legacyMenuPermissionActions($actions), $actions);
    }

    protected function replaceMenuPermissions(int $permissionId, array $menus, string $actorId): void
    {
        MenuPermission::where('permission_id', $permissionId)->delete();

        foreach ($menus as $menu) {
            $menuId = (int) data_get($menu, 'menu_id');
            if ($menuId <= 0 || ! $this->isAssignablePermissionMenu($menuId)) {
                continue;
            }

            $actions = $this->normalizeMenuPermissionActions($menu);
            $row = MenuPermission::withTrashed()->firstOrNew([
                'permission_id' => $permissionId,
                'menu_id' => $menuId,
            ]);

            if (! $row->exists || empty($row->create_by)) {
                $row->create_by = $actorId;
            }

            foreach (array_merge($this->legacyMenuPermissionActions($actions), $actions) as $column => $value) {
                $row->{$column} = $value;
            }

            $row->update_by = $actorId;
            $row->deleted_at = null;
            $row->save();
        }

    }

    protected function isAssignablePermissionMenu(int $menuId): bool
    {
        if ($this->isAuditLogSettingsMenuId($menuId) || !Schema::hasTable('menus')) {
            return false;
        }

        $menuQuery = DB::table('menus')->where('id', $menuId);
        if (Schema::hasColumn('menus', 'deleted_at')) {
            $menuQuery->whereNull('deleted_at');
        }

        $menu = $menuQuery->first();
        if (!$menu) {
            return false;
        }

        if (Schema::hasColumn('menus', 'path') && trim((string) ($menu->path ?? '')) === '') {
            return false;
        }

        $childQuery = DB::table('menus')->where('parent_id', $menuId);
        if (Schema::hasColumn('menus', 'deleted_at')) {
            $childQuery->whereNull('deleted_at');
        }

        return !$childQuery->exists();
    }

    protected function syncParentMenuPermissions(int $permissionId, string $actorId): void
    {
        if (!Schema::hasTable('menus') || !Schema::hasTable('menu_permissions')) {
            return;
        }

        $parentIds = DB::table('menus as parent')
            ->whereExists(function ($query) {
                $query->select(DB::raw(1))
                    ->from('menus as child')
                    ->whereColumn('child.parent_id', 'parent.id');

                if (Schema::hasColumn('menus', 'deleted_at')) {
                    $query->whereNull('child.deleted_at');
                }
            })
            ->when(Schema::hasColumn('menus', 'deleted_at'), function ($query) {
                $query->whereNull('parent.deleted_at');
            })
            ->pluck('parent.id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->toArray();

        foreach ($parentIds as $parentId) {
            $leafMenuIds = $this->assignableDescendantMenuIds($parentId);

            if (empty($leafMenuIds)) {
                MenuPermission::where('permission_id', $permissionId)
                    ->where('menu_id', $parentId)
                    ->delete();
                continue;
            }

            $childRows = MenuPermission::where('permission_id', $permissionId)
                ->whereIn('menu_id', $leafMenuIds)
                ->get();

            if ($childRows->isEmpty()) {
                MenuPermission::where('permission_id', $permissionId)
                    ->where('menu_id', $parentId)
                    ->delete();
                continue;
            }

            $actions = $this->emptyMenuPermissionActions();
            foreach ($childRows as $childRow) {
                foreach ($this->menuPermissionActionColumns() as $column) {
                    if ((int) data_get($childRow, $column, 0) === 1) {
                        $actions[$column] = 1;
                    }
                }
            }

            $row = MenuPermission::withTrashed()->firstOrNew([
                'permission_id' => $permissionId,
                'menu_id' => $parentId,
            ]);

            if (! $row->exists || empty($row->create_by)) {
                $row->create_by = $actorId;
            }

            foreach (array_merge($this->legacyMenuPermissionActions($actions), $actions) as $column => $value) {
                $row->{$column} = $value;
            }

            $row->update_by = $actorId;
            $row->deleted_at = null;
            $row->save();
        }
    }

    protected function assignableDescendantMenuIds(int $parentMenuId): array
    {
        if (!Schema::hasTable('menus')) {
            return [];
        }

        $menuQuery = DB::table('menus')->select('id', 'parent_id', 'path');
        if (Schema::hasColumn('menus', 'deleted_at')) {
            $menuQuery->whereNull('deleted_at');
        }

        $childrenByParent = [];
        foreach ($menuQuery->get() as $menu) {
            $parentId = $menu->parent_id === null ? 0 : (int) $menu->parent_id;
            $childrenByParent[$parentId][] = $menu;
        }

        $leafIds = [];
        $walk = function (int $menuId) use (&$walk, &$leafIds, $childrenByParent) {
            $children = $childrenByParent[$menuId] ?? [];
            foreach ($children as $child) {
                $childId = (int) $child->id;
                $grandChildren = $childrenByParent[$childId] ?? [];
                $hasPath = trim((string) ($child->path ?? '')) !== '';

                if (empty($grandChildren) && $hasPath && ! $this->isAuditLogSettingsMenuId($childId)) {
                    $leafIds[] = $childId;
                    continue;
                }

                if (!empty($grandChildren)) {
                    $walk($childId);
                }
            }
        };

        $walk($parentMenuId);

        return array_values(array_unique($leafIds));
    }

    public function returnSuccess($massage, $data)
    {

        return response()->json([
            'code' => strval(200),
            'status' => true,
            'message' => $massage,
            'data' => $data,
        ], 200);
    }

    public function returnUpdate($massage)
    {
        return response()->json([
            'code' => strval(201),
            'status' => true,
            'message' => $massage,
            'data' => [],
        ], 201);
    }

    public function returnUpdateReturnData($massage, $data)
    {
        return response()->json([
            'code' => strval(201),
            'status' => true,
            'message' => $massage,
            'data' => $data,
        ], 201);
    }

    protected function resolveRequestedEmployeeCode(Request $request, string $fallback): ?string
    {
        if (!$request->has('requested_by')) {
            return $fallback;
        }

        $code = trim((string) $request->input('requested_by'));
        if ($code === '' || !Employee::where('code', $code)->exists()) {
            return null;
        }

        return $code;
    }

    public function returnErrorData($massage, $code)
    {
        return response()->json([
            'code' => strval($code),
            'status' => false,
            'message' => $massage,
            'data' => [],
        ], 404);
    }

    public function returnError($massage)
    {
        return response()->json([
            'code' => strval(401),
            'status' => false,
            'message' => $massage,
            'data' => [],
        ], 401);
    }

    public function Log($userId, $description, $type)
    {
        // Feature tests build only the tables required by their subject. Keep
        // audit logging mandatory in real environments while allowing those
        // isolated in-memory schemas to exercise the business transaction.
        if (app()->environment('testing') && ! DB::getSchemaBuilder()->hasTable((new Log())->getTable())) {
            return;
        }

        [$description, $type] = $this->normalizeAuditLogPayload($userId, $description, $type);

        $Log = new Log();
        $Log->user_id = $userId;
        $Log->description = $description;
        $Log->type = $type;
        $Log->save();
    }

    protected function normalizeAuditLogPayload($userId, $description, $type)
    {
        $originalType = trim((string) $type);
        $originalDescription = trim((string) $description);
        $normalizedType = $this->normalizeAuditLogType($originalType, $originalDescription);
        $normalizedDescription = $this->normalizeAuditLogDescription(
            (string) $userId,
            $originalDescription,
            $originalType,
            $normalizedType
        );

        return [
            $this->limitAuditLogText($normalizedDescription),
            $this->limitAuditLogText($normalizedType),
        ];
    }

    protected function normalizeAuditLogType($type, $description)
    {
        $exactMap = [
            'เข้าสู่ระบบ' => 'Login',
            'เข้าสู่ระบบ (LDAP)' => 'LDAP Login',
            'เพิ่มผู้ใช้งาน' => 'Create User',
            'แก้ไขผู้ใช้งาน' => 'Update User',
            'ลบผู้ใช้งาน' => 'Delete User',
            'เพิ่ม admin' => 'Create Admin User',
            'เพิ่มรายการ' => 'Create Item',
            'เพิ่มรายการผ่านอัปโหลด' => 'Import Records',
            'แก้ไข การทำรายการข่าววัด' => 'Update Menu Permission',
            'Setting Menu Permission' => 'Update Menu Permission',
            'ลบ Supplier' => 'Delete Supplier',
            'ลบ Sub-consultant' => 'Delete Sub-consultant',
            'ลบ Supplier Assessment' => 'Delete Supplier Assessment',
            'ลบข้อมูล sub_consultant_evaluations' => 'Delete Sub-consultant Evaluation',
            'ลบข้อมูล purchase_order' => 'Delete Purchase Order',
            'ลบข้อมูล gift_hospitality_offerings' => 'Delete Gift & Hospitality Offering',
            'ลบข้อมูล gift_hospitalities' => 'Delete Gift & Hospitality',
            'ลบข้อมูล single_source_justifications' => 'Delete Single Source Justification',
            'ลบคำขอสนับสนุนการกุศล' => 'Delete Charitable Contribution',
            'ลบแบบประเมินผู้รับเหมาช่วง' => 'Delete Sub-consultant Assessment',
            'ลบ Expenses Claim' => 'Delete Expenses Claim',
            'ลบ Allowance After 10.00 PM' => 'Delete Allowance After 10.00 PM',
            'Add Main Menu' => 'Create Main Menu',
        ];

        if (isset($exactMap[$type])) {
            return $exactMap[$type];
        }

        if (!$this->containsThaiText($type) && !$this->containsThaiText($description)) {
            return $type !== '' ? $type : 'Audit Log';
        }

        $formName = $this->inferAuditLogFormName($type . ' ' . $description);
        $action = $this->inferAuditLogAction($type, $description);

        if ($action === 'Login') {
            return $this->containsAuditText($type . ' ' . $description, 'LDAP') ? 'LDAP Login' : 'Login';
        }

        if ($action !== '' && $formName !== '') {
            return $action . ' ' . $formName;
        }

        if ($this->containsThaiText($type)) {
            return $action !== '' ? $action . ' Record' : 'Audit Log';
        }

        return $type !== '' ? $type : 'Audit Log';
    }

    protected function auditLogFormNameForTable($table)
    {
        $formName = $this->inferAuditLogFormName(str_replace('_', ' ', (string) $table));
        return $formName !== '' ? $formName : ucwords(str_replace('_', ' ', (string) $table));
    }

    protected function logDocumentCreateAudit(Request $request, $document, ?string $formName = null, $recordId = null): void
    {
        $actorId = $this->resolveActorId($request);
        $resolvedFormName = trim((string) ($formName ?? ''));

        if ($resolvedFormName === '') {
            if (is_object($document) && method_exists($document, 'getTable')) {
                $resolvedFormName = $this->auditLogFormNameForTable($document->getTable());
            } elseif (is_string($document) && trim($document) !== '') {
                $resolvedFormName = $this->auditLogFormNameForTable($document);
            }
        }

        if ($resolvedFormName === '') {
            $resolvedFormName = 'Record';
        }

        if ($recordId === null || trim((string) $recordId) === '') {
            if (is_object($document) && method_exists($document, 'getKey')) {
                $recordId = $document->getKey();
            } elseif (is_object($document) && isset($document->id)) {
                $recordId = $document->id;
            } elseif (is_array($document) && isset($document['id'])) {
                $recordId = $document['id'];
            }
        }

        $type = 'Create ' . $resolvedFormName;
        $description = 'User ' . $actorId . ' created ' . $this->auditLogDescriptionObjectName($resolvedFormName);

        if ($recordId !== null && trim((string) $recordId) !== '') {
            $description .= ' #' . $recordId;
        }

        $this->Log($actorId, $description, $type);
    }

    protected function logActionRequestAudit(Request $request, $table, $recordId, $field, $oldValue, $newValue, $remark = null)
    {
        $actorId = $this->resolveActorId($request);
        $formName = $this->auditLogFormNameForTable($table);
        $fieldLabel = $this->auditWorkflowFieldLabel($field);
        $oldLabel = $this->auditWorkflowStatusLabel($oldValue);
        $newLabel = $this->auditWorkflowStatusLabel($newValue);
        $type = 'Update ' . $formName . ' Action Request';

        $description = 'User ' . $actorId . ' updated ' . $fieldLabel . ' action request for '
            . $formName . ' #' . $recordId . ' from ' . $oldLabel . ' to ' . $newLabel;

        if ($remark !== null && trim((string) $remark) !== '') {
            $description .= ' - Remark: ' . trim((string) $remark);
        }

        $this->Log($actorId, $description, $type);
    }

    protected function auditWorkflowFieldLabel($field)
    {
        $normalized = strtolower((string) $field);
        $normalized = preg_replace('/_status$/', '', $normalized);

        $labels = [
            'requested_by' => 'Requested By',
            'purchase_request_by' => 'Purchase Request By',
            'verified_by_is' => 'Verified By IS',
            'verified_by' => 'Verified By',
            'reviewed_by' => 'Reviewed By',
            'responded_by' => 'Responded By',
            'assessed_by' => 'Assessed By',
            'evaluated_by' => 'Evaluated By',
            'approved_by' => 'Approved By',
            'approved_by_2' => 'Second Approved By',
            'signed_by' => 'Signed By',
            'signed_by_tl' => 'Team Leader Signed By',
            'signed_by_tl2' => 'Second Team Leader Signed By',
            'signed_by_tl3' => 'Third Team Leader Signed By',
            'signed_by_vve' => 'VVE Signed By',
            'client_project_manager_signed_by' => 'Client Project Manager Signed By',
            'acknowledged_by' => 'Acknowledged By',
            'tl_by' => 'Team Leader',
            'di_by' => 'Director',
            'account_by' => 'Account',
            'notified_user' => 'Notified User',
            'action_by_admin' => 'Admin Action',
            'approved_by_ch' => 'Commercial Head Approval',
            'proposal_decision' => 'Proposal Decision',
            'contract_decision' => 'Contract Decision',
            'decision' => 'Decision',
            'status' => 'Status',
        ];

        if (isset($labels[$normalized])) {
            return $labels[$normalized];
        }

        return ucwords(str_replace('_', ' ', $normalized));
    }

    protected function auditWorkflowStatusLabel($value)
    {
        if ($value === null || $value === '') {
            return 'Empty';
        }

        $normalized = strtolower(trim((string) $value));
        $labels = [
            'pending' => 'Pending',
            'approve' => 'Approved',
            'approved' => 'Approved',
            'reject' => 'Rejected',
            'rejected' => 'Rejected',
            'decline' => 'Declined',
            'declined' => 'Declined',
            'completed' => 'Completed',
            'complete' => 'Completed',
            'submitted' => 'Submitted',
            'proceed' => 'Proceed',
            'contract_approved' => 'Contract Approved',
            'in_review' => 'In Review',
            'responded' => 'Responded',
            'signed' => 'Signed',
            'acknowledged' => 'Acknowledged',
        ];

        return $labels[$normalized] ?? ucwords(str_replace('_', ' ', $normalized));
    }

    protected function normalizeAuditLogDescription($userId, $description, $originalType, $normalizedType)
    {
        if (!$this->containsThaiText($description)) {
            return $description !== '' ? $description : $normalizedType;
        }

        $actor = $this->extractAuditLogActor($userId, $description);

        if ($normalizedType === 'Login') {
            return 'User ' . $actor . ' logged in';
        }

        if ($normalizedType === 'LDAP Login') {
            return 'User ' . $actor . ' logged in with LDAP';
        }

        $target = $this->extractAuditLogTarget($description, $originalType);
        $formName = $this->auditLogFormNameFromType($normalizedType);
        $action = $this->auditLogActionVerb($normalizedType);

        if ($action !== '' && $formName !== '') {
            return 'User ' . $actor . ' ' . $action . ' ' . $this->auditLogDescriptionObjectName($formName) . $target;
        }

        if ($action !== '') {
            return 'User ' . $actor . ' ' . $action . ' a record' . $target;
        }

        return 'User ' . $actor . ' performed ' . $normalizedType . $target;
    }

    protected function inferAuditLogAction($type, $description)
    {
        $text = $type . ' ' . $description;

        if ($this->containsAuditText($text, 'login') || $this->containsAuditText($text, 'เข้าสู่ระบบ')) {
            return 'Login';
        }

        if (
            $this->containsAuditText($text, 'delete') ||
            $this->containsAuditText($text, 'ลบ')
        ) {
            return 'Delete';
        }

        if (
            $this->containsAuditText($text, 'update') ||
            $this->containsAuditText($text, 'edit') ||
            $this->containsAuditText($text, 'setting') ||
            $this->containsAuditText($text, 'แก้ไข')
        ) {
            return 'Update';
        }

        if (
            $this->containsAuditText($text, 'upload') ||
            $this->containsAuditText($text, 'import') ||
            $this->containsAuditText($text, 'อัปโหลด')
        ) {
            return 'Import';
        }

        if (
            $this->containsAuditText($text, 'create') ||
            $this->containsAuditText($text, 'add') ||
            $this->containsAuditText($text, 'เพิ่ม')
        ) {
            return 'Create';
        }

        return '';
    }

    protected function inferAuditLogFormName($text)
    {
        $normalized = strtolower(str_replace(['_', '-'], ' ', (string) $text));
        $forms = [
            'proposal contract review' => 'Proposal Contract Review',
            'postman proposal contract review' => 'Proposal Contract Review',
            'concept design review' => 'Concept Design Review',
            'schematic design review' => 'Schematic Design Review',
            'design review' => 'Design Review',
            'submission review' => 'Submission Review',
            'tender review' => 'Tender Review',
            'tender csa review' => 'Tender CSA Review',
            'tender csa verification' => 'Tender CSA Verification',
            'tender mep review' => 'Tender MEP Review',
            'tender mep verification' => 'Tender MEP Verification',
            'construction validation' => 'Construction Validation',
            'engineering audit review' => 'Engineering Audit Review',
            'value engineering review' => 'Value Engineering Review',
            'leed review' => 'LEED Review',
            'fee sheet' => 'Fee Sheet',
            'postman fee sheet' => 'Fee Sheet',
            'purchase requisition' => 'Purchase Requisition',
            'project quality assurance plan' => 'Project Quality Assurance Plan',
            'pqa plan' => 'Project Quality Assurance Plan',
            'controlled document request' => 'Controlled Document Request',
            'cdr' => 'Controlled Document Request',
            'corrective action request' => 'CAR - Corrective Action Request',
            'cars' => 'CAR - Corrective Action Request',
            'car' => 'CAR - Corrective Action Request',
            'allowance after 10.00 pm' => 'Allowance After 10.00 PM',
            'allowance after 10pm' => 'Allowance After 10.00 PM',
            'expenses claim' => 'Expenses Claim',
            'gift hospitality offering' => 'Gift & Hospitality Offering',
            'gift hospitality offerings' => 'Gift & Hospitality Offering',
            'gift hospitalities' => 'Gift & Hospitality',
            'gift hospitality' => 'Gift & Hospitality',
            'single source justification' => 'Single Source Justification',
            'single source justifications' => 'Single Source Justification',
            'sub consultant assessment' => 'Sub-consultant Assessment',
            'sub consultant assessments' => 'Sub-consultant Assessment',
            'sub consultant evaluation' => 'Sub-consultant Evaluation',
            'sub consultant evaluations' => 'Sub-consultant Evaluation',
            'supplier assessment' => 'Supplier Assessment',
            'supplier assessments' => 'Supplier Assessment',
            'supplier evaluation' => 'Supplier Evaluation',
            'supplier evaluations' => 'Supplier Evaluation',
            'purchase order' => 'Purchase Order',
            'charitable contribution' => 'Charitable Contribution',
            'manual' => 'Manual',
            'main menu' => 'Main Menu',
            'menu permission' => 'Menu Permission',
            'menu' => 'Menu',
            'sub consultant' => 'Sub-consultant',
            'sub consultants' => 'Sub-consultant',
            'supplier' => 'Supplier',
            'user' => 'User',
        ];

        foreach ($forms as $needle => $formName) {
            if (strpos($normalized, $needle) !== false) {
                return $formName;
            }
        }

        if ($this->containsAuditText($text, 'คำขอสนับสนุนการกุศล')) {
            return 'Charitable Contribution';
        }

        if ($this->containsAuditText($text, 'แบบประเมินผู้รับเหมาช่วง')) {
            return 'Sub-consultant Assessment';
        }

        if ($this->containsAuditText($text, 'สิทธิเมนู')) {
            return 'Menu Permission';
        }

        if ($this->containsAuditText($text, 'ผู้ใช้งาน')) {
            return 'User';
        }

        return '';
    }

    protected function auditLogActionVerb($type)
    {
        $lower = strtolower((string) $type);

        if (strpos($lower, 'create ') === 0) {
            return 'created';
        }
        if (strpos($lower, 'update ') === 0) {
            return 'updated';
        }
        if (strpos($lower, 'delete ') === 0) {
            return 'deleted';
        }
        if (strpos($lower, 'import ') === 0) {
            return 'imported';
        }

        return '';
    }

    protected function auditLogFormNameFromType($type)
    {
        return trim(preg_replace('/^(Create|Update|Delete|Import)\s+/i', '', (string) $type));
    }

    protected function auditLogDescriptionObjectName($formName)
    {
        if (in_array($formName, ['User', 'Admin User', 'Record', 'Records'], true)) {
            return lcfirst($formName);
        }

        return $formName;
    }

    protected function extractAuditLogActor($fallbackUserId, $description)
    {
        if (preg_match('/ผู้ใช้งาน\s+(.+?)\s+ได้ทำการ/u', $description, $matches)) {
            $actor = trim($matches[1]);
            if ($actor !== '') {
                return $actor;
            }
        }

        $fallback = trim((string) $fallbackUserId);
        return $fallback !== '' ? $fallback : 'system';
    }

    protected function extractAuditLogTarget($description, $originalType)
    {
        if (preg_match('/#\s*([A-Za-z0-9_\-]+)/', $description, $matches)) {
            return ' #' . $matches[1];
        }

        $target = preg_replace('/^ผู้ใช้งาน\s+.+?\s+ได้ทำการ\s*/u', '', (string) $description);
        $target = str_replace((string) $originalType, '', $target);
        $target = preg_replace('/^(เพิ่ม|แก้ไข|ลบ|ลบข้อมูล)\s*/u', '', $target);
        $target = trim($target);

        if ($target === '' || $this->containsThaiText($target)) {
            return '';
        }

        return ' ' . $target;
    }

    protected function containsThaiText($text)
    {
        return preg_match('/[\x{0E00}-\x{0E7F}]/u', (string) $text) === 1;
    }

    protected function containsAuditText($text, $needle)
    {
        return strpos(strtolower((string) $text), strtolower((string) $needle)) !== false;
    }

    protected function limitAuditLogText($value)
    {
        $text = trim((string) $value);
        if (function_exists('mb_substr')) {
            return mb_substr($text, 0, 255, 'UTF-8');
        }

        return substr($text, 0, 255);
    }

    public function sendMail($email, $data, $title, $type)
    {

        $mail = new SendMail($email, $data, $title, $type);
        Mail::to($email)->send($mail);
    }

    public function sendLine($line_token, $text)
    {

        $sToken = $line_token;
        $sMessage = $text;

        $chOne = curl_init();
        curl_setopt($chOne, CURLOPT_URL, "https://notify-api.line.me/api/notify");
        curl_setopt($chOne, CURLOPT_SSL_VERIFYHOST, 0);
        curl_setopt($chOne, CURLOPT_SSL_VERIFYPEER, 0);
        curl_setopt($chOne, CURLOPT_POST, 1);
        curl_setopt($chOne, CURLOPT_POSTFIELDS, "message=" . $sMessage);
        $headers = array('Content-type: application/x-www-form-urlencoded', 'Authorization: Bearer ' . $sToken . '');
        curl_setopt($chOne, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($chOne, CURLOPT_RETURNTRANSFER, 1);
        $result = curl_exec($chOne);

        curl_close($chOne);
    }

    // public function uploadImages(Request $request)
    // {

    //     $image = $request->image;
    //     $path = $request->path;

    //     $input['imagename'] = md5(rand(0, 999999) . $image->getClientOriginalName()) . '.' . $image->extension();
    //     $destinationPath = public_path('/thumbnail');
    //     if (!File::exists($destinationPath)) {
    //         File::makeDirectory($destinationPath, 0777, true);
    //     }

    //     $img = Image::make($image->path());
    //     $img->save($destinationPath . '/' . $input['imagename']);
    //     $destinationPath = public_path($path);
    //     $image->move($destinationPath, $input['imagename']);

    //     return $this->returnSuccess('ดำเนินการสำเร็จ', $path . $input['imagename']);
    // }

    public function uploadImages(Request $request)
    {
        $image = $request->image;
        $path = $request->path;
        $original = $request->original;

        // ✅ ตรวจสอบว่าจะใช้ชื่อไฟล์เดิมหรือสุ่มใหม่
        if ($original === 'Y') {
            $imageName = $image->getClientOriginalName();
        } else {
            $imageName = md5(rand(0, 999999) . $image->getClientOriginalName()) . '.' . $image->extension();
        }

        // สร้างโฟลเดอร์ thumbnail ถ้ายังไม่มี
        $thumbnailPath = public_path('/thumbnail');
        if (!File::exists($thumbnailPath)) {
            File::makeDirectory($thumbnailPath, 0777, true);
        }

        // บันทึกภาพ thumbnail
        $img = Image::make($image->path());
        $img->save($thumbnailPath . '/' . $imageName);

        // บันทึกภาพต้นฉบับตาม path ที่กำหนด
        $destinationPath = public_path($path);
        if (!File::exists($destinationPath)) {
            File::makeDirectory($destinationPath, 0777, true);
        }
        $image->move($destinationPath, $imageName);

        return $this->returnSuccess('ดำเนินการสำเร็จ', $path . $imageName);
    }

    public function uploadMultipleImages(Request $request)
    {
        $images = $request->file('images'); // รับไฟล์หลายไฟล์
        $path = $request->path;
        $original = $request->original;

        // ตรวจสอบว่ามีไฟล์ถูกส่งมาหรือไม่
        if (!$images || !is_array($images)) {
            return $this->returnError('กรุณาเลือกไฟล์ที่ต้องการอัปโหลด', null);
        }

        $uploadedPaths = [];

        // สร้างโฟลเดอร์ thumbnail ถ้ายังไม่มี
        $thumbnailPath = public_path('/thumbnail');
        if (!File::exists($thumbnailPath)) {
            File::makeDirectory($thumbnailPath, 0777, true);
        }

        // สร้างโฟลเดอร์ปลายทางถ้ายังไม่มี
        $destinationPath = public_path($path);
        if (!File::exists($destinationPath)) {
            File::makeDirectory($destinationPath, 0777, true);
        }

        // วนลูปอัปโหลดแต่ละไฟล์
        foreach ($images as $image) {
            // ตรวจสอบว่าจะใช้ชื่อไฟล์เดิมหรือสุ่มใหม่
            if ($original === 'Y') {
                $imageName = $image->getClientOriginalName();
            } else {
                $imageName = md5(rand(0, 999999) . $image->getClientOriginalName()) . '.' . $image->extension();
            }

            // บันทึกภาพ thumbnail
            $img = Image::make($image->path());
            $img->save($thumbnailPath . '/' . $imageName);

            // บันทึกภาพต้นฉบับตาม path ที่กำหนด
            $image->move($destinationPath, $imageName);

            // เก็บ path ของไฟล์ที่อัปโหลดสำเร็จ
            $uploadedPaths[] = $path . $imageName;
        }

        return $this->returnSuccess('อัปโหลด ' . count($uploadedPaths) . ' ไฟล์สำเร็จ', $uploadedPaths);
    }


    public function uploadSignature(Request $request)
    {

        $image = $request->image;
        $path = $request->path;
        $refno = $request->refno;
        $action = $request->action;

        $input['imagename'] = md5(rand(0, 999999) . $image->getClientOriginalName()) . '.' . $image->extension();
        $destinationPath = public_path('/thumbnail');
        if (!File::exists($destinationPath)) {
            File::makeDirectory($destinationPath, 0777, true);
        }

        $img = Image::make($image->path());
        $img->save($destinationPath . '/' . $input['imagename']);
        $destinationPath = public_path($path);
        $image->move($destinationPath, $input['imagename']);

        DB::beginTransaction();

        try {

            $Item = new Signature();
            $Item->refno = $refno;
            $Item->path = $path . $input['imagename'];
            $Item->action = $action;
            $Item->save();

            $ItemOrder = Orders::where('code', $refno)->first();
            if ($ItemOrder) {
                if ($Item->action == "Receive to Client") {
                    $ItemOrder->status = "ToClient";
                } else {
                    $ItemOrder->status = "Recived";
                }

                $ItemOrder->save();

                OneSignalFacade::sendNotificationToAll("แจ้งเตือนรายการนำเข้าโกดังสำเร็จรายการ : " . $refno);
            }

            //

            //log
            $userId = "admin";
            $type = 'เพิ่มรายการ';
            $description = 'ผู้ใช้งาน ' . $userId . ' ได้ทำการ ' . $type . ' ' . $request->name;
            $this->Log($userId, $description, $type);
            //

            DB::commit();

            return $this->returnSuccess('ดำเนินการสำเร็จ', $Item);
        } catch (\Throwable $e) {

            DB::rollback();

            return $this->returnErrorData('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง ', 404);
        }

        // return $this->returnSuccess('ดำเนินการสำเร็จ', $path . $input['imagename']);
    }

    public function uploadImage($image, $path)
    {
        $input['imagename'] = md5(rand(0, 999999) . $image->getClientOriginalName()) . '.' . $image->extension();
        $destinationPath = public_path('/thumbnail');
        if (!File::exists($destinationPath)) {
            File::makeDirectory($destinationPath, 0777, true);
        }

        $img = Image::make($image->path());
        $img->save($destinationPath . '/' . $input['imagename']);
        $destinationPath = public_path($path);
        $image->move($destinationPath, $input['imagename']);

        return $path . $input['imagename'];
    }

    public function uploadFile(Request $request)
    {

        $file = $request->file;
        $path = $request->path;

        $input['filename'] = time() . '.' . $file->extension();

        $destinationPath = public_path('/file_thumbnail');
        if (!File::exists($destinationPath)) {
            File::makeDirectory($destinationPath, 0777, true);
        }

        $destinationPath = public_path($path);
        $file->move($destinationPath, $input['filename']);

        return $path . $input['filename'];
    }

    public function uploadMultipleFiles(Request $request)
    {
        $files = $request->file('files'); // รับไฟล์หลายไฟล์
        $path = $request->path;
        $original = $request->original;
        $allowedExtensions = $this->normalizeAllowedUploadExtensions(
            $request->input('allowed_extensions', $request->input('allowedExtensions'))
        );

        // ตรวจสอบว่ามีไฟล์ถูกส่งมาหรือไม่
        if (!$files || !is_array($files)) {
            return $this->returnError('กรุณาเลือกไฟล์ที่ต้องการอัปโหลด');
        }

        foreach ($files as $file) {
            if (!$this->uploadedFileMatchesAllowedExtensions($file, $allowedExtensions)) {
                $allowedText = strtoupper(implode(', ', $allowedExtensions));
                return $this->returnErrorData('รองรับเฉพาะไฟล์ ' . ($allowedText ?: 'ที่กำหนด') . ' เท่านั้น', 422);
            }
        }

        $uploadedPaths = [];

        // สร้างโฟลเดอร์ file_thumbnail ถ้ายังไม่มี
        $fileThumbnailPath = public_path('/file_thumbnail');
        if (!File::exists($fileThumbnailPath)) {
            File::makeDirectory($fileThumbnailPath, 0777, true);
        }

        // สร้างโฟลเดอร์ปลายทางถ้ายังไม่มี
        $destinationPath = public_path($path);
        if (!File::exists($destinationPath)) {
            File::makeDirectory($destinationPath, 0777, true);
        }

        // วนลูปอัปโหลดแต่ละไฟล์
        foreach ($files as $file) {
            // ตรวจสอบว่าจะใช้ชื่อไฟล์เดิมหรือสร้างใหม่
            if ($original === 'Y') {
                $fileName = $file->getClientOriginalName();
            } else {
                $fileName = time() . '_' . rand(1000, 9999) . '.' . $file->extension();
            }

            // บันทึกไฟล์ตาม path ที่กำหนด
            $file->move($destinationPath, $fileName);

            // เก็บ path ของไฟล์ที่อัปโหลดสำเร็จ
            $uploadedPaths[] = $path . $fileName;
        }

        return $this->returnSuccess('อัปโหลด ' . count($uploadedPaths) . ' ไฟล์สำเร็จ', $uploadedPaths);
    }

    // public function uploadFile($file, $path)
    // {
    //     $input['filename'] = time() . '.' . $file->extension();
    //     $destinationPath = public_path('/file_thumbnail');
    //     if (!File::exists($destinationPath)) {
    //         File::makeDirectory($destinationPath, 0777, true);
    //     }

    //     $destinationPath = public_path($path);
    //     $file->move($destinationPath, $input['filename']);

    //     return $path . $input['filename'];
    // }

    public function getDropDownYear()
    {
        $Year = intval(((date('Y')) + 1) + 543);

        $data = [];

        for ($i = 0; $i < 10; $i++) {

            $Year = $Year - 1;
            $data[$i]['year'] = $Year;
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $data);
    }

    public function getDropDownProvince()
    {

        $province = array("กระบี่", "กรุงเทพมหานคร", "กาญจนบุรี", "กาฬสินธุ์", "กำแพงเพชร", "ขอนแก่น", "จันทบุรี", "ฉะเชิงเทรา", "ชลบุรี", "ชัยนาท", "ชัยภูมิ", "ชุมพร", "เชียงราย", "เชียงใหม่", "ตรัง", "ตราด", "ตาก", "นครนายก", "นครปฐม", "นครพนม", "นครราชสีมา", "นครศรีธรรมราช", "นครสวรรค์", "นนทบุรี", "นราธิวาส", "น่าน", "บุรีรัมย์", "บึงกาฬ", "ปทุมธานี", "ประจวบคีรีขันธ์", "ปราจีนบุรี", "ปัตตานี", "พะเยา", "พังงา", "พัทลุง", "พิจิตร", "พิษณุโลก", "เพชรบุรี", "เพชรบูรณ์", "แพร่", "ภูเก็ต", "มหาสารคาม", "มุกดาหาร", "แม่ฮ่องสอน", "ยโสธร", "ยะลา", "ร้อยเอ็ด", "ระนอง", "ระยอง", "ราชบุรี", "ลพบุรี", "ลำปาง", "ลำพูน", "เลย", "ศรีสะเกษ", "สกลนคร", "สงขลา", "สตูล", "สมุทรปราการ", "สมุทรสงคราม", "สมุทรสาคร", "สระแก้ว", "สระบุรี", "สิงห์บุรี", "สุโขทัย", "สุพรรณบุรี", "สุราษฎร์ธานี", "สุรินทร์", "หนองคาย", "หนองบัวลำภู", "อยุธยา", "อ่างทอง", "อำนาจเจริญ", "อุดรธานี", "อุตรดิตถ์", "อุทัยธานี", "อุบลราชธานี");

        $data = [];

        for ($i = 0; $i < count($province); $i++) {

            $data[$i]['province'] = $province[$i];
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $data);
    }

    public function getDownloadFomatImport($params)
    {

        $file = $params;
        $destinationPath = public_path() . "/fomat_import/";

        return response()->download($destinationPath . $file);
    }

    public function checkDigitMemberId($memberId)
    {

        $sum = 0;
        for ($i = 0; $i < 12; $i++) {

            $sum += (int) ($memberId[$i]) * (13 - $i);
        }

        if ((11 - ($sum % 11)) % 10 == (int) ($memberId[12])) {
            return 'true';
        } else {
            return 'false';
        }
    }

    public function genCode(Model $model, $prefix, $number)
    {

        $countPrefix = strlen($prefix);
        $countRunNumber = strlen($number);

        //get last code
        $Property_type = $model::orderby('code', 'desc')->first();
        if ($Property_type) {
            $lastCode = $Property_type->code;
        } else {
            $lastCode = $prefix . $number;
        }

        $codelast = substr($lastCode, $countPrefix, $countRunNumber);

        $newNumber = intval($codelast) + 1;
        $Number = sprintf('%0' . strval($countRunNumber) . 'd', $newNumber);

        $runNumber = $prefix . $Number;

        return $runNumber;
    }


    // public function dateBetween($dateStart, $dateStop)
    // {
    //     $datediff = strtotime($dateStop) - strtotime($this->dateform($dateStart));
    //     return abs($datediff / (60 * 60 * 24));
    // }

    // public function log_noti($Title, $Description, $Url, $Pic, $Type)
    // {
    //     $log_noti = new Log_noti();
    //     $log_noti->title = $Title;
    //     $log_noti->description = $Description;
    //     $log_noti->url = $Url;
    //     $log_noti->pic = $Pic;
    //     $log_noti->log_noti_type = $Type;

    //     $log_noti->save();
    // }

    /////////////////////////////////////////// seach datatable  ///////////////////////////////////////////

    public function withPermission($query, $search)
    {

        $col = array('id', 'name', 'create_by', 'update_by', 'created_at', 'updated_at');

        $query->orWhereHas('permission', function ($query) use ($search, $col) {

            $query->Where(function ($query) use ($search, $col) {

                //search datatable
                $query->orwhere(function ($query) use ($search, $col) {
                    foreach ($col as &$c) {
                        $query->orWhere($c, 'like', '%' . $search['value'] . '%');
                    }
                });
            });
        });

        return $query;
    }

    public function withMember($query, $search)
    {

        // $col = array('id', 'member_group_id','code', 'name', 'status', 'create_by', 'update_by', 'created_at', 'updated_at');

        // $query->orWhereHas('member', function ($query) use ($search, $col) {

        //     $query->Where(function ($query) use ($search, $col) {

        //         //search datatable
        //         $query->orwhere(function ($query) use ($search, $col) {
        //             foreach ($col as &$c) {
        //                 $query->orWhere($c, 'like', '%' . $search['value'] . '%');
        //             }
        //         });
        //     });

        // });

        // return $query;
    }


    public function withInquiryType($query, $search)
    {

        $col = array('id', 'code', 'name', 'status', 'create_by', 'update_by', 'created_at', 'updated_at');

        $query->orWhereHas('inquiry_type', function ($query) use ($search, $col) {

            $query->Where(function ($query) use ($search, $col) {

                //search datatable
                $query->orwhere(function ($query) use ($search, $col) {
                    foreach ($col as &$c) {
                        $query->orWhere($c, 'like', '%' . $search['value'] . '%');
                    }
                });
            });
        });

        return $query;
    }

    public function withPropertyType($query, $search)
    {

        $col = array('id', 'code', 'name', 'status', 'create_by', 'update_by', 'created_at', 'updated_at');

        $query->orWhereHas('property_type', function ($query) use ($search, $col) {

            $query->Where(function ($query) use ($search, $col) {

                //search datatable
                $query->orwhere(function ($query) use ($search, $col) {
                    foreach ($col as &$c) {
                        $query->orWhere($c, 'like', '%' . $search['value'] . '%');
                    }
                });
            });
        });

        return $query;
    }

    public function withPropertySubType($query, $search)
    {

        $col = array('id', 'property_type_id', 'code', 'name', 'status', 'create_by', 'update_by', 'created_at', 'updated_at');

        $query->orWhereHas('property_sub_type', function ($query) use ($search, $col) {

            $query->Where(function ($query) use ($search, $col) {

                //search datatable
                $query->orwhere(function ($query) use ($search, $col) {
                    foreach ($col as &$c) {
                        $query->orWhere($c, 'like', '%' . $search['value'] . '%');
                    }
                });
            });
        });

        return $query;
    }

    public function withPropertyAnnouncer($query, $search)
    {

        $col = array('id', 'name', 'status', 'create_by', 'update_by', 'created_at', 'updated_at');

        $query->orWhereHas('property_announcer', function ($query) use ($search, $col) {

            $query->Where(function ($query) use ($search, $col) {

                //search datatable
                $query->orwhere(function ($query) use ($search, $col) {
                    foreach ($col as &$c) {
                        $query->orWhere($c, 'like', '%' . $search['value'] . '%');
                    }
                });
            });
        });

        return $query;
    }

    public function withPropertyColorLand($query, $search)
    {

        $col = array('id', 'name', 'status', 'create_by', 'update_by', 'created_at', 'updated_at');

        $query->orWhereHas('property_color_land', function ($query) use ($search, $col) {

            $query->Where(function ($query) use ($search, $col) {

                //search datatable
                $query->orwhere(function ($query) use ($search, $col) {
                    foreach ($col as &$c) {
                        $query->orWhere($c, 'like', '%' . $search['value'] . '%');
                    }
                });
            });
        });

        return $query;
    }

    public function withPropertyOwnership($query, $search)
    {

        $col = array('id', 'name', 'status', 'create_by', 'update_by', 'created_at', 'updated_at');

        $query->orWhereHas('property_ownership', function ($query) use ($search, $col) {

            $query->Where(function ($query) use ($search, $col) {

                //search datatable
                $query->orwhere(function ($query) use ($search, $col) {
                    foreach ($col as &$c) {
                        $query->orWhere($c, 'like', '%' . $search['value'] . '%');
                    }
                });
            });
        });

        return $query;
    }

    public function withPropertyFacility($query, $search)
    {

        $col = array('id', 'name', 'status', 'create_by', 'update_by', 'created_at', 'updated_at');

        $query->orWhereHas('property_facility', function ($query) use ($search, $col) {

            $query->Where(function ($query) use ($search, $col) {

                //search datatable
                $query->orwhere(function ($query) use ($search, $col) {
                    foreach ($col as &$c) {
                        $query->orWhere($c, 'like', '%' . $search['value'] . '%');
                    }
                });
            });
        });

        return $query;
    }

    public function withPropertySubFacility($query, $search)
    {

        $col = array('id', 'property_facility_id', 'name', 'icon', 'status', 'create_by', 'update_by', 'created_at', 'updated_at');

        $query->orWhereHas('property_sub_facility', function ($query) use ($search, $col) {

            $query->Where(function ($query) use ($search, $col) {

                //search datatable
                $query->orwhere(function ($query) use ($search, $col) {
                    foreach ($col as &$c) {
                        $query->orWhere($c, 'like', '%' . $search['value'] . '%');
                    }
                });

                $query = $this->withPropertyFacility($query, $search);
            });
        });

        return $query;
    }

    public function withPropertySubFacilityExplend($query, $search)
    {

        $col = array('id', 'property_sub_facility_id', 'name', 'status', 'create_by', 'update_by', 'created_at', 'updated_at');

        $query->orWhereHas('property_sub_facility_explend', function ($query) use ($search, $col) {

            $query->Where(function ($query) use ($search, $col) {

                //search datatable
                $query->orwhere(function ($query) use ($search, $col) {
                    foreach ($col as &$c) {
                        $query->orWhere($c, 'like', '%' . $search['value'] . '%');
                    }
                });

                $query = $this->withPropertySubFacility($query, $search);
            });
        });

        return $query;
    }

    /////////////////////////////////////////// seach datatable  ///////////////////////////////////////////


    public function getSyncDataF(Request $request)
    {
        $loginBy = $request->login_by;

        $orders = $request->orders;

        if ($orders) {
            foreach ($orders as $orderData) {
                if($orderData) {
                    // --- จัดการข้อมูลลูกค้า ---
                    $client = null;
                    if (isset($orderData['client_id']) && !empty($orderData['client_id'])) {
                        $client = Clients::find($orderData['client_id']);
                        if ($client) {
                            $client->name    = $orderData['client_name'] ?? $client->name;
                            $client->phone   = $orderData['client_phone'] ?? $client->phone;
                            $client->email   = $orderData['client_email'] ?? $client->email;
                            $client->address = $orderData['client_address'] ?? $client->address;
                            $client->save();
                        } else {
                            $client = new Clients();
                            $client->name    = $orderData['client_name'] ?? null;
                            $client->phone   = $orderData['client_phone'] ?? null;
                            $client->email   = $orderData['client_email'] ?? null;
                            $client->address = $orderData['client_address'] ?? null;
                            $client->save();
                        }
                    } else {
                        // สร้างลูกค้าใหม่ หากไม่มี client_id
                        $client = new Clients();
                        $client->name    = $orderData['client_name'] ?? null;
                        $client->phone   = $orderData['client_phone'] ?? null;
                        $client->email   = $orderData['client_email'] ?? null;
                        $client->address = $orderData['client_address'] ?? null;
                        $client->save();
                    }

                    // --- สร้าง Order ---
                    // สร้าง order code ด้วย timestamp และตัวเลขสุ่ม
                    $prefix = "#OR-";
                    $id = IdGenerator::generate(['table' => 'orders', 'field' => 'code', 'length' => 9, 'prefix' => $prefix]);


                    $order = new Orders();
                    $order->code        = $id;
                    $order->date        = $orderData['date'] ?? now()->format('Y-m-d');
                    $order->client_id   = $client->id;
                    $order->client_name = $client->name;
                    $order->client_phone = $client->phone;
                    $order->client_email = $client->email;
                    $order->client_address = $client->address;
                    $order->total_price = $orderData['total_price'] ?? 0;
                    $order->status      = 'Ordered';
                    $order->create_by = $loginBy->id;
                    $order->save();

                    // --- สร้าง OrderList สำหรับสินค้าภายใน Order ---
                    if (isset($orderData['products']) && is_array($orderData['products'])) {
                        foreach ($orderData['products'] as $prodData) {
                            // ตรวจสอบสต็อกใน ProductUnit ตาม product_id และ unit_id
                            $checkStock = ProductUnit::where('product_id', $prodData['product_id'])
                                ->where('unit_id', $prodData['unit_id'])
                                ->first();

                            // ดึงข้อมูลหน่วย (Unit)
                            $unit = unit::find($prodData['unit_id']);

                            if ($checkStock) {
                                if ($checkStock->qty < $prodData['qty']) {
                                    $qtyOrder = $prodData['qty'] - $checkStock->qty;

                                    // สร้าง Factory code ด้วย IdGenerator
                                    $prefix = "#FAC-";
                                    $factoryCode = IdGenerator::generate([
                                        'table'  => 'factories',
                                        'field'  => 'code',
                                        'length' => 13,
                                        'prefix' => $prefix
                                    ]);

                                    $factory = new Factory();
                                    $factory->code      = $factoryCode;
                                    $factory->date      = date('Y-m-d');
                                    $factory->order_id  = $order->id;
                                    $factory->product_id = $prodData['product_id'];
                                    $factory->qty       = $qtyOrder;
                                    $factory->unit_id   = $prodData['unit_id'];
                                    $factory->detail    = "สินค้าไม่เพียงพอต่อการจำหน่าย ขาดไปทั้งหมด "
                                        . $qtyOrder . ' ' . ($unit ? $unit->name : '') . " จำเป็นต้องสั่งผลิต";
                                    $factory->save();
                                }
                            } else {
                                DB::rollBack();
                                return $this->returnErrorData('ไม่พบหน่วยของสินค้านี้ในระบบ', 404);
                            }

                            $orderList = new OrderList();
                            $orderList->order_id     = $order->id;
                            $orderList->product_id   = $prodData['product_id'];
                            $orderList->cost         = $prodData['cost'] ?? 0;
                            $orderList->price        = $prodData['price'] ?? 0;
                            $orderList->qty          = $prodData['qty'] ?? 0;
                            $orderList->unit_id      = $prodData['unit_id'] ?? null;
                            $orderList->promotion_id = $prodData['promotion_id'] ?? null;
                            $orderList->discount     = $prodData['discount'] ?? 0;
                            $orderList->create_by = $loginBy->id;
                            $orderList->save();
                        }
                    }
                }
            }
        }

        $UserzoneMarkets = UserZoneMarket::where('user_id', $loginBy->id)->get();

        $allClients = collect(); // สะสมลูกค้าทั้งหมดที่พบ

        foreach ($UserzoneMarkets as $value) {
            $zoneMarket = ZoneMarket::find($value->zone_market_id);

            if ($zoneMarket) {

                // ดึงรายการพื้นที่ในโซนตลาดนั้น
                $zoneMarketLists = ZoneMarketList::where("zone_market_id", $value->zone_market_id)
                    ->select('province', 'district', 'subdistrict', 'postal_code')
                    ->get();

                if ($zoneMarketLists->isNotEmpty()) {
                    // เตรียมเงื่อนไขเพื่อค้นหาลูกค้าในพื้นที่
                    $clients = Clients::where(function($query) use ($zoneMarketLists) {
                        foreach ($zoneMarketLists as $zone) {
                            $query->orWhere(function($q) use ($zone) {
                                $q->where('province', $zone->province);
                                // ->where('district', $zone->district)
                                // ->where('subdistrict', $zone->subdistrict)
                                // ->where('postal_code', $zone->postal_code);
                            });
                        }
                    })->get();

                    // รวมลูกค้าเข้ากับ collection หลัก
                    $allClients = $allClients->merge($clients);
                }
            }
        }

        // กรองข้อมูลซ้ำ (เผื่อว่าลูกค้าคนเดียวอยู่หลายโซน)
        $allClients = $allClients->unique('id')->values();

        // หากไม่มี last_sync ส่งข้อมูลทั้งหมด
        $sub_categories   = SubCategoryProduct::all();
        $categories   = CategoryProduct::all();
        $products   = Products::with('product_add_ons.product.product_images')->get();
        $products = Products::with('product_add_ons.product.product_images')->get();

        $products->each(function ($product) {
            $product->product_add_ons->each(function ($addOn) {
                $addOn->product->product_images->each(function ($image) {
                    $image->image = url($image->image);
                });
            });
        });

        $clients    = $allClients;
        $productIds = $products->pluck('id')->unique();
        $allPromotions = Promotion::whereIn('product_id', $productIds)->get();
        $allUnits = ProductUnit::whereIn('product_id', $productIds)->get();
        $orders     = Orders::all();
        $orderIds   = $orders->pluck('id')->unique();
        $orderLists = OrderList::whereIn('order_id', $orderIds)->get();

         // --- แนบโปรโมชั่นเข้าไปในสินค้า ---
        // จัดกลุ่มโปรโมชั่นโดยใช้ product_id เป็น key
        $unitsByProduct = $allUnits->groupBy('product_id');
        foreach ($products as $product) {
            // แนบ array ของโปรโมชั่นให้กับ property promotions (ถ้าไม่มีจะได้เป็น array ว่าง)
            $product->category = CategoryProduct::find($product->category_product_id);
            $product->sub_category = SubCategoryProduct::find($product->sub_category_product_id);
            $product->units = $unitsByProduct->get($product->id, []);
            foreach ($product->units as $key => $value) {
                $product->units[$key]->unit = unit::find($value['unit_id']);
            }

            $product->images = ProductImages::where('product_id', $product->id)->get();

            for ($n = 0; $n <= count($product->images) - 1; $n++) {
                $product->images[$n]->image = url($product->images[$n]->image);
            }

            // $product->panorama_images = ProductImagesPanorama::where('product_id', $product->id)->get();

            // for ($n = 0; $n <= count($product->panorama_images) - 1; $n++) {
            //     $product->panorama_images[$n]->image = url($product->panorama_images[$n]->image);
            // }
        }

        // --- แนบโปรโมชั่นเข้าไปในสินค้า ---
        // จัดกลุ่มโปรโมชั่นโดยใช้ product_id เป็น key
        $promotionsByProduct = $allPromotions->groupBy('product_id');
        foreach ($products as $product) {
            // แนบ array ของโปรโมชั่นให้กับ property promotions (ถ้าไม่มีจะได้เป็น array ว่าง)
            $product->promotions = $promotionsByProduct->get($product->id, []);
            foreach ($product->promotions as $key => $value) {
                $product->promotions[$key]->product_fee = Products::find($value['product_free_id']);
            }
        }

        // --- แนบ order_lists เข้าไปใน orders ---
        // จัดกลุ่ม order_lists โดยใช้ order_id เป็น key
        $orderListsByOrder = $orderLists->groupBy('order_id');
        foreach ($orders as $order) {
            $order->order_lists = $orderListsByOrder->get($order->id, []);
        }

        // --- แนบ orders เข้าไปใน clients ---
        // จัดกลุ่ม orders โดยใช้ client_id เป็น key
        $ordersByClient = $orders->groupBy('client_id');
        foreach ($clients as $client) {
            $client->orders = $ordersByClient->get($client->id, []);
        }

        return response()->json([
            'success' => true,
            'data'    => [
                'categories' => $categories,
                'sub_categories' => $sub_categories,
                'products' => $products,
                'clients'  => $clients,
                'orders'   => $orders,
            ]
        ]);
    }

    public function getSyncData(Request $request)
    {
        $loginBy = $request->login_by;

        // รับค่า last_sync จาก query parameter (ตัวอย่าง: ?last_sync=2025-03-06T12:00:00Z)
        $lastSync = $request->last_sync;
        $orders = $request->orders;

        if ($orders) {
            foreach ($orders as $orderData) {
                if($orderData) {
                    // --- จัดการข้อมูลลูกค้า ---
                    $client = null;
                    if (isset($orderData['client_id']) && !empty($orderData['client_id'])) {
                        $client = Clients::find($orderData['client_id']);
                        if ($client) {
                            $client->name    = $orderData['client_name'] ?? $client->name;
                            $client->phone   = $orderData['client_phone'] ?? $client->phone;
                            $client->email   = $orderData['client_email'] ?? $client->email;
                            $client->address = $orderData['client_address'] ?? $client->address;
                            $client->save();
                        } else {
                            $client = new Clients();
                            $client->name    = $orderData['client_name'] ?? null;
                            $client->phone   = $orderData['client_phone'] ?? null;
                            $client->email   = $orderData['client_email'] ?? null;
                            $client->address = $orderData['client_address'] ?? null;
                            $client->save();
                        }
                    } else {
                        // สร้างลูกค้าใหม่ หากไม่มี client_id
                        $client = new Clients();
                        $client->name    = $orderData['client_name'] ?? null;
                        $client->phone   = $orderData['client_phone'] ?? null;
                        $client->email   = $orderData['client_email'] ?? null;
                        $client->address = $orderData['client_address'] ?? null;
                        $client->save();
                    }

                    // --- สร้าง Order ---
                    // สร้าง order code ด้วย timestamp และตัวเลขสุ่ม
                    $prefix = "#OR-";
                    $id = IdGenerator::generate(['table' => 'orders', 'field' => 'code', 'length' => 9, 'prefix' => $prefix]);


                    $order = new Orders();
                    $order->code        = $id;
                    $order->date        = $orderData['date'] ?? now()->format('Y-m-d');
                    $order->client_id   = $client->id;
                    $order->client_name = $client->name;
                    $order->client_phone = $client->phone;
                    $order->client_email = $client->email;
                    $order->client_address = $client->address;
                    $order->total_price = $orderData['total_price'] ?? 0;
                    $order->status      = 'Ordered';
                    $order->create_by = $loginBy->id;
                    $order->save();

                    // --- สร้าง OrderList สำหรับสินค้าภายใน Order ---
                    if (isset($orderData['products']) && is_array($orderData['products'])) {
                        foreach ($orderData['products'] as $prodData) {
                            // ตรวจสอบสต็อกใน ProductUnit ตาม product_id และ unit_id
                            $checkStock = ProductUnit::where('product_id', $prodData['product_id'])
                                ->where('unit_id', $prodData['unit_id'])
                                ->first();

                            // ดึงข้อมูลหน่วย (Unit)
                            $unit = unit::find($prodData['unit_id']);

                            if ($checkStock) {
                                if ($checkStock->qty < $prodData['qty']) {
                                    $qtyOrder = $prodData['qty'] - $checkStock->qty;

                                    // สร้าง Factory code ด้วย IdGenerator
                                    $prefix = "#FAC-";
                                    $factoryCode = IdGenerator::generate([
                                        'table'  => 'factories',
                                        'field'  => 'code',
                                        'length' => 13,
                                        'prefix' => $prefix
                                    ]);

                                    $factory = new Factory();
                                    $factory->code      = $factoryCode;
                                    $factory->date      = date('Y-m-d');
                                    $factory->order_id  = $order->id;
                                    $factory->product_id = $prodData['product_id'];
                                    $factory->qty       = $qtyOrder;
                                    $factory->unit_id   = $prodData['unit_id'];
                                    $factory->detail    = "สินค้าไม่เพียงพอต่อการจำหน่าย ขาดไปทั้งหมด "
                                        . $qtyOrder . ' ' . ($unit ? $unit->name : '') . " จำเป็นต้องสั่งผลิต";
                                    $factory->save();
                                }
                            } else {
                                DB::rollBack();
                                return $this->returnErrorData('ไม่พบหน่วยของสินค้านี้ในระบบ', 404);
                            }

                            $orderList = new OrderList();
                            $orderList->order_id     = $order->id;
                            $orderList->product_id   = $prodData['product_id'];
                            $orderList->cost         = $prodData['cost'] ?? 0;
                            $orderList->price        = $prodData['price'] ?? 0;
                            $orderList->qty          = $prodData['qty'] ?? 0;
                            $orderList->unit_id      = $prodData['unit_id'] ?? null;
                            $orderList->promotion_id = $prodData['promotion_id'] ?? null;
                            $orderList->discount     = $prodData['discount'] ?? 0;
                            $orderList->create_by = $loginBy->id;
                            $orderList->save();
                        }
                    }
                }
            }
        }

        if ($lastSync) {
            // ดึงข้อมูลที่มีการเปลี่ยนแปลงใหม่ โดยตรวจสอบทั้ง created_at และ updated_at
            $categories = CategoryProduct::where(function ($query) use ($lastSync) {
                $query->where('created_at', '>', $lastSync)
                      ->orWhere('updated_at', '>', $lastSync);
            })->get();

            $sub_categories = SubCategoryProduct::where(function ($query) use ($lastSync) {
                $query->where('created_at', '>', $lastSync)
                      ->orWhere('updated_at', '>', $lastSync);
            })->get();

            $products = Products::with('product_add_ons.product.product_images')->where(function ($query) use ($lastSync) {
                $query->where('created_at', '>', $lastSync)
                      ->orWhere('updated_at', '>', $lastSync);
            })->get();

            $products->each(function ($product) {
                $product->product_add_ons->each(function ($addOn) {
                    $addOn->product->product_images->each(function ($image) {
                        $image->image = url($image->image);
                    });
                });
            });

            $clients = Clients::where(function ($query) use ($lastSync) {
                $query->where('created_at', '>', $lastSync)
                      ->orWhere('updated_at', '>', $lastSync);
            })->get();

            // ดึงโปรโมชั่นที่เกี่ยวข้องกับสินค้าที่ได้มา
            $productIds = $products->pluck('id')->unique();
            $allPromotions = Promotion::whereIn('product_id', $productIds)->get();
            $allUnits = ProductUnit::whereIn('product_id', $productIds)->get();

            // ดึงข้อมูล orders ที่เปลี่ยนแปลง
            $orders = Orders::where(function ($query) use ($lastSync) {
                $query->where('created_at', '>', $lastSync)
                      ->orWhere('updated_at', '>', $lastSync);
            })->get();

            // ดึง order_lists ที่เกี่ยวข้องกับ orders ที่ได้มา
            $orderIds = $orders->pluck('id')->unique();
            $orderLists = OrderList::whereIn('order_id', $orderIds)->get();
        } else {
            // หากไม่มี last_sync ส่งข้อมูลทั้งหมด
            $sub_categories   = SubCategoryProduct::all();
            $categories   = CategoryProduct::all();
            $products   = Products::with('product_add_ons.product.product_images')->get();
            $products->each(function ($product) {
                $product->product_add_ons->each(function ($addOn) {
                    $addOn->product->product_images->each(function ($image) {
                        $image->image = url($image->image);
                    });
                });
            });
            $clients    = Clients::all();
            $productIds = $products->pluck('id')->unique();
            $allPromotions = Promotion::whereIn('product_id', $productIds)->get();
            $allUnits = ProductUnit::whereIn('product_id', $productIds)->get();
            $orders     = Orders::all();
            $orderIds   = $orders->pluck('id')->unique();
            $orderLists = OrderList::whereIn('order_id', $orderIds)->get();
        }

         // --- แนบโปรโมชั่นเข้าไปในสินค้า ---
        // จัดกลุ่มโปรโมชั่นโดยใช้ product_id เป็น key
        $unitsByProduct = $allUnits->groupBy('product_id');
        foreach ($products as $product) {
            // แนบ array ของโปรโมชั่นให้กับ property promotions (ถ้าไม่มีจะได้เป็น array ว่าง)
            $product->units = $unitsByProduct->get($product->id, []);
            $product->category = CategoryProduct::find($product->category_product_id);
            $product->sub_category = SubCategoryProduct::find($product->sub_category_product_id);
            foreach ($product->units as $key => $value) {
                $product->units[$key]->unit = unit::find($value['unit_id']);
            }

            $product->images = ProductImages::where('product_id', $product->id)->get();

            for ($n = 0; $n <= count($product->images) - 1; $n++) {
                $product->images[$n]->image = url($product->images[$n]->image);
            }

            $product->panorama_images = ProductImagesPanorama::where('product_id', $product->id)->get();

            for ($n = 0; $n <= count($product->panorama_images) - 1; $n++) {
                $product->panorama_images[$n]->image = url($product->panorama_images[$n]->image);
            }
        }

        // --- แนบโปรโมชั่นเข้าไปในสินค้า ---
        // จัดกลุ่มโปรโมชั่นโดยใช้ product_id เป็น key
        $promotionsByProduct = $allPromotions->groupBy('product_id');
        foreach ($products as $product) {
            // แนบ array ของโปรโมชั่นให้กับ property promotions (ถ้าไม่มีจะได้เป็น array ว่าง)
            $product->promotions = $promotionsByProduct->get($product->id, []);
            foreach ($product->promotions as $key => $value) {
                $product->promotions[$key]->product_fee = Products::find($value['product_free_id']);
            }
        }

        // --- แนบ order_lists เข้าไปใน orders ---
        // จัดกลุ่ม order_lists โดยใช้ order_id เป็น key
        $orderListsByOrder = $orderLists->groupBy('order_id');
        foreach ($orders as $order) {
            $order->order_lists = $orderListsByOrder->get($order->id, []);
        }

        // --- แนบ orders เข้าไปใน clients ---
        // จัดกลุ่ม orders โดยใช้ client_id เป็น key
        $ordersByClient = $orders->groupBy('client_id');
        foreach ($clients as $client) {
            $client->orders = $ordersByClient->get($client->id, []);
        }

        return response()->json([
            'success' => true,
            'data'    => [
                'categories' => $categories,
                'sub_categories' => $sub_categories,
                'products' => $products,
                'clients'  => $clients,
                'orders'   => $orders,
            ]
        ]);
    }

    public function importClients(Request $request)
    {
        $file = $request->file('file');

        $data = Excel::toArray([], $file);
        $rows = $data[0];


        foreach ($rows as $index => $row) {
            if ($index === 0) continue; // ข้าม header ถ้ามี

            $code = trim($row[0]);
            $name = trim($row[1]);
            $phone = trim($row[3] ?? '');
            $addressRaw = trim($row[2] ?? '');

            // แยกจังหวัด อำเภอ ตำบล จากที่อยู่
            preg_match('/ตำบล\s*([^\s]+)/u', $addressRaw, $subdistrictMatch);
            preg_match('/อำเภอ\s*([^\s]+)/u', $addressRaw, $districtMatch);
            preg_match('/จังหวัด\s*([^\s]+)/u', $addressRaw, $provinceMatch);

            $subdistrict = isset($subdistrictMatch[1]) ? trim($subdistrictMatch[1]) : null;
            $district    = isset($districtMatch[1]) ? trim($districtMatch[1]) : null;
            $province    = isset($provinceMatch[1]) ? trim($provinceMatch[1]) : null;

            // $subdistrict = trim($row[4] ?? '');
            // $district = trim($row[5] ?? '');
            // $province = trim($row[6] ?? '');
            $note = trim($row[4] ?? '');


            Clients::create([
                'code' => $code,
                'name' => $name,
                'address' => $addressRaw,
                'phone' => $phone,
                'subdistrict' => $subdistrict ?? null,
                'district' => $district ?? null,
                'province' => $province ?? null,
                'note' => $note ?? null,
                'create_by' => auth()->user()->name ?? 'import',
            ]);
        }

        return response()->json(['message' => 'นำเข้าสำเร็จ']);
    }

    public function dashboardSales(Request $request)
    {
        $month = $request->input('month');
        $year = $request->input('year');
        $target = 1000000; // เป้ายอดขาย 100% = 1,000,000 บาท (แก้ได้ตามจริง)

        try {
            $ordersQuery = Orders::with('user')->where('status', 'Approve');

            if ($month) {
                $ordersQuery->whereMonth('date', $month);
            }
            if ($year) {
                $ordersQuery->whereYear('date', $year);
            }

            $orders = $ordersQuery->get();

            $sales = [];

            foreach ($orders as $order) {
                $totalQty = OrderList::where('order_id', $order->id)->sum('qty');
                if (!isset($sales[$order->create_by])) {
                    $sales[$order->create_by] = [
                        'name' => $order->user ? $order->user->name : '-',
                        'total_sales' => 0,
                        'total_qty' => 0,
                        'commission' => 0,
                        'percent' => 0,
                        'target_percent' => 0,
                    ];
                }

                $sales[$order->create_by]['total_sales'] += $order->total_price;
                $sales[$order->create_by]['total_qty'] += $totalQty;
            }

            foreach ($sales as $key => &$data) {
                $productIdsQuery = OrderList::join('orders', 'orders.id', '=', 'order_lists.order_id')
                    ->where('orders.create_by', $key)
                    ->where('orders.status', 'Approve');

                if ($month) {
                    $productIdsQuery->whereMonth('orders.date', $month);
                }
                if ($year) {
                    $productIdsQuery->whereYear('orders.date', $year);
                }

                $productIds = $productIdsQuery->pluck('product_id')->unique();
                $totalCommission = 0;
                $percentUsed = 0;

                foreach ($productIds as $productId) {
                    $commission = Commission::where('product_id', $productId)
                        ->whereNull('deleted_at')
                        ->with(['steps' => function ($q) {
                            $q->whereNull('deleted_at');
                        }])->first();

                    if ($commission && $commission->steps->count()) {
                        foreach ($commission->steps as $step) {
                            if (
                                $data['total_sales'] >= $step->min_sales &&
                                $data['total_sales'] <= $step->max_sales
                            ) {
                                $percentUsed = $step->percent;
                                $totalCommission += ($data['total_sales'] * ($percentUsed / 100));
                                break;
                            }
                        }
                    }
                }

                $data['commission'] = round($totalCommission);
                $data['percent'] = $percentUsed;
                $data['target_percent'] = $target > 0 ? round(($data['total_sales'] / $target) * 100) : 0;

                // ดึงชื่อจาก users เผื่อไม่มี relation
                $user = User::where('username', $key)->first();
                if ($user) {
                    $data['name'] = $user->name;
                }
            }

            $sorted = collect($sales)->sortByDesc('commission')->values();
            $top10 = $sorted->take(10);
            $totalCommission = $sorted->sum('commission');
            $topSales = $top10->first();

            return response()->json([
                'total_commission' => $totalCommission,
                'top_sales' => [
                    'name' => $topSales['name'] ?? null,
                    'amount' => $topSales['commission'] ?? 0,
                    'sales' => $topSales['total_sales'] ?? 0,
                    'percent' => $topSales['percent'] ?? 0,
                    'target_percent' => $topSales['target_percent'] ?? 0,
                ],
                'top_10' => $top10->map(function ($row) {
                    return [
                        'name' => $row['name'],
                        'total_sales' => $row['total_sales'],
                        'commission' => $row['commission'],
                        'percent' => $row['percent'],
                        'target_percent' => $row['target_percent'],
                    ];
                })->values(),
            ]);

        } catch (\Throwable $e) {
            return response()->json([
                'error' => true,
                'message' => $e->getMessage(),
            ], 500);
        }
    }



    public function getPersonalSalesDashboard(Request $request)
    {
        $loginBy = $request->login_by;
        $month = $request->input('month');
        $year = $request->input('year');

        $userId = $loginBy->id;
        $userName = $loginBy->name;

        try {
            $orderQuery = Orders::with('order_lists.product')
                ->where('status', 'Approve')
                ->where('create_by', $userId);

            if ($month) {
                $orderQuery->whereMonth('date', $month);
            }
            if ($year) {
                $orderQuery->whereYear('date', $year);
            }

            $orders = $orderQuery->get();

            $totalSales = $orders->sum('total_price');
            $productSales = [];

            foreach ($orders as $order) {
                foreach ($order->order_lists as $item) {
                    $productId = $item->product_id;

                    if (!isset($productSales[$productId])) {
                        $productSales[$productId] = [
                            'product_name' => $item->product->name ?? 'ไม่พบชื่อสินค้า',
                            'total_qty' => 0,
                            'total_amount' => 0,
                            'commission_rate' => 0,
                            'commission_amount' => 0,
                        ];
                    }

                    $productSales[$productId]['total_qty'] += $item->qty;
                    $productSales[$productId]['total_amount'] += $item->qty * $item->price;
                }
            }

            $totalCommission = 0;

            foreach ($productSales as $productId => &$data) {
                $commission = Commission::where('product_id', $productId)->with('steps')->first();

                if ($commission && $commission->steps) {
                    $steps = $commission->steps->sortBy('min_sales');
                    foreach ($steps as $step) {
                        if (
                            $data['total_amount'] >= $step->min_sales &&
                            $data['total_amount'] <= $step->max_sales
                        ) {
                            $rate = $step->percent;
                            $amount = $data['total_amount'] * ($rate / 100);
                            $data['commission_rate'] = $rate;
                            $data['commission_amount'] = round($amount);
                            $totalCommission += $amount;
                            break;
                        }
                    }
                }
            }

            $topProducts = collect($productSales)->sortByDesc('total_amount')->take(10)->values();

            return response()->json([
                'user' => $userName,
                'total_sales' => round($totalSales),
                'total_commission' => round($totalCommission),
                'top_10_products' => $topProducts
            ]);

        } catch (\Throwable $e) {
            return response()->json([
                'error' => true,
                'message' => $e->getMessage()
            ], 500);
        }
    }


    public function getHomeData()
    {
        // ------------------ BANNERS ------------------
        $banners = Banner::orderBy('id', 'desc')->get();

        // แปลง image เป็น URL เต็ม
        foreach ($banners as $b) {
            if (!empty($b->image)) {
                $b->image_url = url($b->image);
            } else {
                $b->image_url = null;
            }
        }

        // ------------------ TEXTS (ตำแหน่งหน้าแรก) ------------------
        // สมมติว่าหน้าแรกใช้ text_position.name = 'หน้าแรก'
        $textPosition = TextPosition::where('name', 'หน้าแรก')->first();

        $texts = [];
        if ($textPosition) {
            $texts = Text::where('text_position_id', $textPosition->id)
                ->orderBy('sequence_no', 'asc')
                ->orderBy('id', 'asc')
                ->get();
        }

        // ------------------ MEETINGS ------------------
        // ถ้ายังไม่มีเงื่อนไขอะไร ดึงทั้งหมดเรียงล่าสุดก่อน
        $meetings = Meeting::orderBy('id', 'desc')->get();

        // ถ้าอยากแปลง field อะไรพิเศษของ meeting เพิ่ม ตรงนี้ได้เลย
        // เช่น แปลงวันที่เป็น format ไทย ฯลฯ

        // ------------------ RESPONSE รวม ------------------
        $data = [
            'banners'       => $banners,
            'text_position' => $textPosition,
            'texts'         => $texts,
            'meetings'      => $meetings,
        ];

        return $this->returnSuccess('เรียกดูข้อมูลหน้าแรกสำเร็จ', $data);
    }

    public function overview(Request $request)
    {
        // ถ้าอยากกรองตามช่วงวันที่ยื่นเรื่อง (submitted_at)
        $dateStart = $request->date_start; // รูปแบบ YYYY-MM-DD
        $dateEnd   = $request->date_end;   // รูปแบบ YYYY-MM-DD

        // helper สำหรับใส่เงื่อนไขช่วงวันที่
        $scope = function () use ($dateStart, $dateEnd) {
            $q = Projects::query();

            if (!empty($dateStart) && !empty($dateEnd)) {
                $start = Carbon::parse($dateStart)->startOfDay();
                $end   = Carbon::parse($dateEnd)->endOfDay();
                $q->whereBetween('submitted_at', [$start, $end]);
            }

            return $q;
        };

        // ---------- SUMMARY CARD ด้านบน ----------
        $totalProjects = $scope()->count();

        // ถ้าระบบคุณนับผู้ใช้งานจากตารางอื่น เช่น Member ให้เปลี่ยนเป็น Model นั้น
        $totalUsers    = User::count();

        // กำลังพิจารณา = รอการประเมิน + รอชำระค่าธรรมเนียม (แล้วแต่ที่คุณต้องการ)
        $underReview   = $scope()
            ->whereIn('status', ['awaiting_review', 'awaiting_fee'])
            ->count();

        // ---------- PIPELINE ตามสถานะ ----------
        $submittedCount      = $scope()->where('status', 'submitted')->count();        // ยื่นเรื่อง
        $awaitingFeeCount    = $scope()->where('status', 'awaiting_fee')->count();     // รอชำระค่าธรรมเนียม
        $awaitingReviewCount = $scope()->where('status', 'awaiting_review')->count();  // รอการประเมิน

        // เผื่อมีสถานะสำหรับ "ปรับปรุง" ในอนาคต เช่น revision / need_revision
        $revisionCount       = $scope()->where('status', 'revision')->count();         // ปรับปรุง (ถ้ายังไม่มี ให้ได้ 0 ไปก่อน)

        $certifiedCount      = $scope()->where('status', 'certified')->count();        // อนุมัติแล้ว

        // ---------- RESPONSE ----------
        $data = [
            'summary' => [
                'total_projects' => $totalProjects,
                'total_users'    => $totalUsers,
                'under_review'   => $underReview,
                'last_updated'   => Carbon::now()->toDateTimeString(),
            ],
            'pipeline' => [
                'submitted'       => $submittedCount,
                'awaiting_fee'    => $awaitingFeeCount,
                'awaiting_review' => $awaitingReviewCount,
                'revision'        => $revisionCount,
                'certified'       => $certifiedCount,
            ],
        ];

        return $this->returnSuccess('เรียกดูข้อมูลสรุป Dashboard สำเร็จ', $data);
    }

    public function updateStatus(Request $request, $id)
    {
        $loginBy = $request->login_by;

        // ===== 1) ตรวจสอบ input =====
        if (empty($request->table)) {
            return $this->returnErrorData('กรุณาระบุ table', 400);
        }
        if (empty($request->field)) {
            return $this->returnErrorData('กรุณาระบุ field', 400);
        }
        if (!isset($request->status)) {
            return $this->returnErrorData('กรุณาระบุ status', 400);
        }

        $table  = $request->table;
        $field  = $request->field;          // เช่น approver_by หรือ approver_by_status
        $status = $request->status;
        $col    = preg_match('/_status$/', (string) $field) ? (string) $field : $field . '_status'; // คอลัมน์จริงในตาราง

        // ===== 2) ตรวจสอบว่าตาราง / ฟิลด์มีอยู่จริง =====
        if (!\Schema::hasTable($table)) {
            return $this->returnErrorData('ไม่พบบนตารางที่ระบุ', 404);
        }

        if (!\Schema::hasColumn($table, $col)) {
            return $this->returnErrorData("ไม่พบฟิลด์ '{$col}' ในตาราง {$table}", 404);
        }

        DB::beginTransaction();

        try {

            // ===== 3) ตรวจสอบว่ามี id นี้อยู่จริง + เก็บค่าเดิมไว้ทำ log =====
            $record = DB::table($table)->where('id', $id)->first();
            if (!$record) {
                return $this->returnErrorData('ไม่พบข้อมูล id นี้ในตาราง', 404);
            }

            $oldValue = $record->{$col} ?? null;

            // ===== 4) อัปเดตสถานะในตารางเป้าหมาย =====
            DB::table($table)
                ->where('id', $id)
                ->update([
                    $col        => $status,
                    'updated_at'=> now()
                ]);

            // ===== 5) บันทึกประวัติลง update_status_logs =====
            $actorId = $this->resolveActorId($request);

            $changedByName = $actorId;
            if (is_object($loginBy)) {
                $changedByName = $loginBy->name ?? $loginBy->username ?? $loginBy->code ?? $actorId;
            } elseif (is_array($loginBy)) {
                $changedByName = $loginBy['name'] ?? $loginBy['username'] ?? $loginBy['code'] ?? $actorId;
            }

            DB::table('update_status_logs')->insert([
                'table_name'       => $table,
                'record_id'        => $id,
                'field_name'       => $col,
                'old_value'        => is_null($oldValue) ? null : (string) $oldValue,
                'new_value'        => (string) $status,
                'changed_by'       => is_numeric($actorId) ? (int) $actorId : null,
                'changed_by_name'  => $changedByName,
                'remark'           => $request->remark ?? null,
                'created_at'       => now(),
                'updated_at'       => now(),
            ]);

            $this->logActionRequestAudit(
                $request,
                $table,
                $id,
                $col,
                $oldValue,
                $status,
                $request->remark ?? null
            );

            DB::commit();

            return $this->returnSuccess('อัปเดตสถานะสำเร็จ', [
                'table'        => $table,
                'id'           => $id,
                'field'        => $field,
                $col           => $status,
            ]);

        } catch (\Throwable $e) {

            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด: ' . $e->getMessage(), 500);
        }
    }

    public function getStatusHistory($table, $id)
    {
        // ===== ตรวจสอบว่าตารางมีอยู่จริง =====
        if (!Schema::hasTable($table)) {
            return $this->returnErrorData("ไม่พบตาราง {$table}", 404);
        }

        // ===== ตรวจสอบว่าข้อมูล id มีอยู่ในตารางจริงไหม =====
        $exists = DB::table($table)->where('id', $id)->first();

        if (!$exists) {
            return $this->returnErrorData("ไม่พบข้อมูล id นี้ในตาราง {$table}", 404);
        }

        // ===== ดึงประวัติจาก status_update_logs =====
        $logs = DB::table('update_status_logs')
            ->where('table_name', $table)
            ->where('record_id', $id)
            ->orderBy('id', 'desc')
            ->get();

        return $this->returnSuccess('เรียกดูประวัติสำเร็จ', $logs);
    }



}
