<?php

namespace App\Http\Controllers;

use App\Exceptions\PdfMergeUserException;
use App\Models\AllowanceAfter10pm;
use App\Models\AllowanceAfter10pmItem;
use App\Models\Employee;
use App\Models\ProjectDetail;
use App\Models\SignatureSetting;
use App\Services\FrontendPrintPdfService;
use App\Services\PurchaseCombinedPdfService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class AllowanceAfter10pmController extends Controller
{
    private const DISCIPLINE_MAX_LENGTH = 255;

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

    public function index()
    {
        return $this->getList();
    }

    public function create()
    {
        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', [
            'voucher_no' => $this->generateVoucherNo()
        ]);
    }

    public function edit($id)
    {
        return $this->show($id);
    }

    public function getList()
    {
        $items = AllowanceAfter10pm::with('items')
            ->orderBy('id', 'desc')
            ->get()
            ->toArray();

        if (!empty($items)) {
            for ($i = 0; $i < count($items); $i++) {
                $items[$i]['No'] = $i + 1;
            }
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $items);
    }

    public function getPage(Request $request)
    {
        $length = (int) ($request->length ?? 10);
        if ($length <= 0 || $length > 100) {
            $length = 10;
        }
        $start = max(0, (int) ($request->start ?? 0));
        $page = (int) floor($start / $length) + 1;
        $order = $request->order ?? [];
        $searchValue = trim((string) $request->input('search.value', ''));
        $tab = strtolower(trim((string) $request->input('tab', 'all')));
        $statusFilter = strtolower(trim((string) $request->input('status', '')));
        $disciplineFilter = trim((string) $request->input('discipline', ''));
        $actorCode = $this->listActorCode($request);

        if (!in_array($tab, ['all', 'my', 'pending', 'action'], true)) {
            return response()->json([
                'code' => '422',
                'status' => false,
                'message' => 'tab must be all, my, pending, or action.',
            ], 422);
        }

        if ($statusFilter !== '' && !in_array($statusFilter, ['draft', 'pending', 'reject', 'approve'], true)) {
            return response()->json([
                'code' => '422',
                'status' => false,
                'message' => 'Invalid workflow status filter.',
            ], 422);
        }

        $col = [
            'id',
            'voucher_no',
            'claimant_name',
            'discipline',
            'request_date',
            'total_baht',
            'attachments',
            'status',
            'tl_by',
            'tl_by_status',
            'tl_by_date',
            'di_by',
            'di_by_status',
            'di_by_date',
            'account_by',
            'account_by_status',
            'account_by_date',
            'notified_user',
            'notified_user_status',
            'notified_user_date',
            'create_by',
            'update_by',
            'created_at',
            'updated_at',
        ];

        if (Schema::hasColumn('allowance_after_10pm', 'draft_payload')) {
            $col[] = 'draft_payload';
        }

        $orderby = [
            'create_by',
            'total_baht',
            'di_by_date',
            'di_by',
            'status',
        ];

        $query = AllowanceAfter10pm::with('items')->select($col);

        $approvedBy = trim((string) $request->input('approved_by', ''));
        $approvedFrom = trim((string) $request->input('approved_date_from', ''));
        $approvedTo = trim((string) $request->input('approved_date_to', ''));
        foreach ([$approvedFrom, $approvedTo] as $date) {
            if ($date !== '' && (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)
                || !checkdate((int) substr($date, 5, 2), (int) substr($date, 8, 2), (int) substr($date, 0, 4)))) {
                return response()->json(['code' => '422', 'status' => false, 'message' => 'Approved date must use YYYY-MM-DD.'], 422);
            }
        }
        if ($approvedFrom !== '' && $approvedTo !== '' && $approvedFrom > $approvedTo) {
            return response()->json(['code' => '422', 'status' => false, 'message' => 'Approved date from must not exceed approved date to.'], 422);
        }
        if ($approvedBy !== '') {
            $query->where('di_by', $approvedBy);
        }
        if ($approvedFrom !== '') {
            $query->whereDate('di_by_date', '>=', $approvedFrom);
        }
        if ($approvedTo !== '') {
            $query->whereDate('di_by_date', '<=', $approvedTo);
        }

        $approvedMonth = trim((string) $request->input('approved_month', ''));
        if ($approvedMonth !== '') {
            if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $approvedMonth)) {
                return response()->json([
                    'code' => '422',
                    'status' => false,
                    'message' => 'approved_month must use YYYY-MM format.',
                ], 422);
            }

            [$approvedYear, $approvedMonthNumber] = array_map('intval', explode('-', $approvedMonth));
            $query->whereYear('di_by_date', $approvedYear)
                ->whereMonth('di_by_date', $approvedMonthNumber);
        }

        $actionCountQuery = clone $query;
        $actionRequestCount = 0;
        if ($actorCode !== null) {
            $this->applyAllowanceActionScope($actionCountQuery, $actorCode);
            $actionRequestCount = $actionCountQuery->count();
        }

        if ($searchValue !== '') {
            $searchColumns = [
                'voucher_no', 'claimant_name', 'discipline', 'create_by',
                'update_by', 'tl_by', 'di_by', 'account_by', 'notified_user',
            ];
            $query->where(function ($q) use ($searchValue, $searchColumns) {
                foreach ($searchColumns as $column) {
                    $q->orWhere($column, 'like', '%' . $searchValue . '%');
                }
                $this->orWhereAllowanceEmployeeNameMatches($q, $searchValue, [
                    'claimant_name', 'create_by', 'tl_by', 'di_by', 'account_by', 'notified_user',
                ]);
            });
        }

        if ($disciplineFilter !== '') {
            $query->where('discipline', $disciplineFilter);
        }

        if ($statusFilter !== '') {
            $this->applyAllowanceWorkflowStatusScope($query, $statusFilter);
        }

        if ($tab === 'my') {
            $this->applyAllowanceMyScope($query, $actorCode);
        } elseif ($tab === 'pending') {
            $query->where(function ($pendingQuery) use ($actorCode) {
                $pendingQuery->where(function ($ownedPending) use ($actorCode) {
                    $this->applyAllowanceMyScope($ownedPending, $actorCode);
                    $this->applyAllowancePendingScope($ownedPending);
                })->orWhere(function ($actionQuery) use ($actorCode) {
                    $this->applyAllowanceActionScope($actionQuery, $actorCode);
                });
            });
        } elseif ($tab === 'action') {
            $this->applyAllowanceActionScope($query, $actorCode);
        }

        $orderColumn = $order[0]['column'] ?? null;
        $orderDir = strtolower((string) ($order[0]['dir'] ?? 'desc')) === 'asc' ? 'asc' : 'desc';
        if ($tab === 'action' && $orderColumn !== null) {
            $actionColumn = (int) $orderColumn;
            if ($actionColumn === 0) {
                $this->applyAllowanceEmployeeOrder($query, 'claimant_name', $orderDir);
            } elseif ($actionColumn === 1) {
                $query->orderBy('discipline', $orderDir);
            } elseif ($actionColumn === 2) {
                $query->orderBy('total_baht', $orderDir);
            } elseif ($actionColumn === 3 && $actorCode !== null) {
                $query->orderByRaw($this->allowanceActionStepSortExpression() . ' ' . $orderDir, [$actorCode, $actorCode]);
            } elseif ($actionColumn === 4 && $actorCode !== null) {
                $query->orderByRaw($this->allowanceActionStatusSortExpression() . ' ' . $orderDir, [$actorCode, $actorCode]);
            }
        } elseif ($orderColumn !== null && (int) $orderColumn === 4) {
            $query->orderByRaw($this->allowanceWorkflowSortExpression() . ' ' . $orderDir);
        } elseif ($orderColumn !== null && in_array((int) $orderColumn, [0, 3], true)) {
            $this->applyAllowanceEmployeeOrder($query, $orderby[$orderColumn], $orderDir);
        } elseif ($orderColumn !== null && ($orderby[$orderColumn] ?? false)) {
            $query->orderBy($orderby[$orderColumn], $orderDir);
        }
        $query->orderBy('id', 'desc');

        $data = $query->paginate($length, ['*'], 'page', $page);

        if ($data->isNotEmpty()) {
            $No = (($page - 1) * $length);
            for ($i = 0; $i < count($data); $i++) {
                $No = $No + 1;
                $data[$i]->No = $No;
                if ($tab === 'action' && $actorCode !== null) {
                    $data[$i]->action_type = $this->allowanceActionTypeFor($data[$i], $actorCode);
                    $data[$i]->current_status = $data[$i]->action_type === 'tl_by_status'
                        ? $data[$i]->tl_by_status
                        : $data[$i]->di_by_status;
                }
            }
        }

        $payload = $data->toArray();
        $payload['action_request_count'] = $actionRequestCount;
        $payload['discipline_options'] = AllowanceAfter10pm::query()
            ->whereNotNull('discipline')
            ->where('discipline', '<>', '')
            ->distinct()
            ->orderBy('discipline')
            ->pluck('discipline')
            ->values()
            ->all();

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $payload);
    }

    private function allowanceWorkflowSortExpression(): string
    {
        return "CASE
            WHEN LOWER(COALESCE(status, '')) = 'draft' THEN 'Draft'
            WHEN LOWER(COALESCE(tl_by_status, '')) IN ('reject', 'rejected')
              OR LOWER(COALESCE(di_by_status, '')) IN ('reject', 'rejected') THEN 'Rejected'
            WHEN LOWER(COALESCE(tl_by_status, '')) IN ('approve', 'approved')
              AND LOWER(COALESCE(di_by_status, '')) IN ('approve', 'approved') THEN 'Completed'
            ELSE 'Pending'
        END";
    }

    private function allowanceActionStepSortExpression(): string
    {
        return "CASE
            WHEN tl_by = ? AND LOWER(TRIM(COALESCE(tl_by_status, ''))) IN ('', 'pending') THEN 'Verified By'
            WHEN di_by = ? AND LOWER(TRIM(COALESCE(di_by_status, ''))) IN ('', 'pending') THEN 'Approved By'
            ELSE ''
        END";
    }

    private function allowanceActionStatusSortExpression(): string
    {
        return "CASE
            WHEN tl_by = ? AND LOWER(TRIM(COALESCE(tl_by_status, ''))) IN ('', 'pending') THEN 'Pending'
            WHEN di_by = ? AND LOWER(TRIM(COALESCE(di_by_status, ''))) IN ('', 'pending') THEN 'Pending'
            ELSE ''
        END";
    }

    private function orWhereAllowanceEmployeeNameMatches($query, string $searchValue, array $referenceColumns): void
    {
        if (!Schema::hasTable('employees')) {
            return;
        }

        $tokens = array_values(array_filter(preg_split('/\s+/', trim($searchValue)) ?: []));
        if ($tokens === []) {
            return;
        }

        $query->orWhereExists(function ($employeeQuery) use ($tokens, $referenceColumns) {
            $employeeQuery->selectRaw('1')
                ->from('employees')
                ->where(function ($referenceQuery) use ($referenceColumns) {
                    foreach ($referenceColumns as $column) {
                        $referenceQuery->orWhereColumn('employees.code', 'allowance_after_10pm.' . $column)
                            ->orWhereColumn('employees.id', 'allowance_after_10pm.' . $column);
                    }
                });

            foreach ($tokens as $token) {
                $employeeQuery->where(function ($nameQuery) use ($token) {
                    $like = '%' . $token . '%';
                    $nameQuery->where('employees.initial', 'like', $like)
                        ->orWhere('employees.firstname', 'like', $like)
                        ->orWhere('employees.lastname', 'like', $like)
                        ->orWhere('employees.code', 'like', $like);
                });
            }
        });
    }

    private function applyAllowanceEmployeeOrder($query, string $column, string $direction): void
    {
        if (!Schema::hasTable('employees')) {
            $query->orderBy($column, $direction);
            return;
        }

        foreach (['initial', 'firstname', 'lastname'] as $employeeColumn) {
            $query->orderBy(
                Employee::query()
                    ->select($employeeColumn)
                    ->where(function ($employeeQuery) use ($column) {
                        $employeeQuery->whereColumn('employees.code', 'allowance_after_10pm.' . $column)
                            ->orWhereColumn('employees.id', 'allowance_after_10pm.' . $column);
                    })
                    ->limit(1),
                $direction
            );
        }

        $query->orderBy($column, $direction);
    }

    private function listActorCode(Request $request): ?string
    {
        $loginBy = $request->input('login_by');
        $value = is_object($loginBy)
            ? ($loginBy->employee_code ?? $loginBy->code ?? null)
            : (is_array($loginBy) ? ($loginBy['employee_code'] ?? $loginBy['code'] ?? null) : null);
        $code = trim((string) ($value ?? ''));

        return $code !== '' ? $code : null;
    }

    private function applyAllowanceMyScope($query, ?string $actorCode): void
    {
        if ($actorCode === null) {
            $query->whereRaw('1 = 0');
            return;
        }

        $query->where(function ($userQuery) use ($actorCode) {
            foreach (['claimant_name', 'tl_by', 'di_by', 'account_by', 'notified_user', 'create_by', 'update_by'] as $column) {
                $userQuery->orWhere($column, $actorCode);
            }
        });
    }

    private function applyAllowanceActionScope($query, ?string $actorCode): void
    {
        if ($actorCode === null) {
            $query->whereRaw('1 = 0');
            return;
        }

        $pending = "LOWER(TRIM(COALESCE(%s, ''))) IN ('', 'pending')";
        $approved = "LOWER(TRIM(COALESCE(%s, ''))) IN ('approve', 'approved')";
        $query->where(function ($actionQuery) use ($actorCode, $pending, $approved) {
            $actionQuery->where(function ($tlQuery) use ($actorCode, $pending) {
                $tlQuery->where('tl_by', $actorCode)
                    ->whereRaw(sprintf($pending, 'tl_by_status'));
            })->orWhere(function ($diQuery) use ($actorCode, $pending, $approved) {
                $diQuery->where('di_by', $actorCode)
                    ->whereRaw(sprintf($approved, 'tl_by_status'))
                    ->whereRaw(sprintf($pending, 'di_by_status'));
            });
        });
    }

    private function applyAllowancePendingScope($query): void
    {
        $rejected = "LOWER(TRIM(COALESCE(%s, ''))) IN ('reject', 'rejected')";
        $approved = "LOWER(TRIM(COALESCE(%s, ''))) IN ('approve', 'approved')";
        $query->whereRaw('NOT (' . sprintf($rejected, 'tl_by_status') . ')')
            ->whereRaw('NOT (' . sprintf($rejected, 'di_by_status') . ')')
            ->whereRaw('NOT (' . sprintf($approved, 'tl_by_status') . ' AND ' . sprintf($approved, 'di_by_status') . ')');
    }

    private function applyAllowanceWorkflowStatusScope($query, string $status): void
    {
        $statusCase = "CASE
            WHEN LOWER(TRIM(COALESCE(status, ''))) = 'draft' THEN 'draft'
            WHEN LOWER(TRIM(COALESCE(tl_by_status, ''))) IN ('reject', 'rejected')
                OR LOWER(TRIM(COALESCE(di_by_status, ''))) IN ('reject', 'rejected') THEN 'reject'
            WHEN LOWER(TRIM(COALESCE(tl_by_status, ''))) IN ('approve', 'approved')
                AND LOWER(TRIM(COALESCE(di_by_status, ''))) IN ('approve', 'approved') THEN 'approve'
            ELSE 'pending'
        END";
        $query->whereRaw("($statusCase) = ?", [$status]);
    }

    private function allowanceActionTypeFor($item, string $actorCode): ?string
    {
        $tlStatus = strtolower(trim((string) ($item->tl_by_status ?? '')));
        $diStatus = strtolower(trim((string) ($item->di_by_status ?? '')));
        if ($item->tl_by === $actorCode && in_array($tlStatus, ['', 'pending'], true)) {
            return 'tl_by_status';
        }
        if ($item->di_by === $actorCode
            && in_array($tlStatus, ['approve', 'approved'], true)
            && in_array($diStatus, ['', 'pending'], true)) {
            return 'di_by_status';
        }

        return null;
    }

    public function show($id)
    {
        $item = AllowanceAfter10pm::with('items')->find($id);
        if (!$item) {
            return $this->returnErrorData('ไม่พบรายการที่ระบุ', 404);
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $item);
    }

    public function printPdf($id, FrontendPrintPdfService $frontendPrintPdfService)
    {
        $allowance = AllowanceAfter10pm::with('items')->find($id);

        if (!$allowance) {
            return $this->returnErrorData('ไม่พบรายการที่ระบุ', 404);
        }

        try {
            $content = $frontendPrintPdfService->renderAllowanceAfter10pmPdf(
                $allowance->id,
                $this->frontendPrintPayloadQuery($this->allowancePrintPayload($allowance))
            );

            return response($content, 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => 'inline; filename="allowance-after-10pm-' . $allowance->id . '.pdf"',
                'Cache-Control' => 'private, max-age=0, must-revalidate',
                'Pragma' => 'public',
            ]);
        } catch (\Throwable $e) {
            Log::error('Allowance after 10pm PDF generation failed', [
                'id' => $id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return $this->returnErrorData('เกิดข้อผิดพลาดในการสร้างไฟล์ PDF: ' . $e->getMessage(), 500);
        }
    }

    public function previewCombinedPdf(
        $id,
        PurchaseCombinedPdfService $combinedPdfService,
        FrontendPrintPdfService $frontendPrintPdfService
    ) {
        return $this->combinedPdfResponse($id, $combinedPdfService, $frontendPrintPdfService, 'inline');
    }

    public function downloadCombinedPdf(
        $id,
        PurchaseCombinedPdfService $combinedPdfService,
        FrontendPrintPdfService $frontendPrintPdfService
    ) {
        return $this->combinedPdfResponse($id, $combinedPdfService, $frontendPrintPdfService, 'attachment');
    }

    private function combinedPdfResponse(
        $id,
        PurchaseCombinedPdfService $combinedPdfService,
        FrontendPrintPdfService $frontendPrintPdfService,
        string $disposition
    ) {
        $allowance = AllowanceAfter10pm::with('items')->find($id);

        if (!$allowance) {
            return $this->returnErrorData('ไม่พบรายการที่ระบุ', 404);
        }

        try {
            $sources = [[
                'name' => 'allowance-after-10pm-' . ($allowance->voucher_no ?: $allowance->id),
                'content' => $frontendPrintPdfService->renderAllowanceAfter10pmPdf(
                    $allowance->id,
                    $this->frontendPrintPayloadQuery($this->allowancePrintPayload($allowance))
                ),
            ]];

            foreach ($combinedPdfService->attachmentPdfPaths($allowance->attachments, true) as $attachmentPath) {
                $sources[] = ['path' => $attachmentPath];
            }

            $content = $combinedPdfService->mergePdfSources($sources);

            return response($content, 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => $disposition . '; filename="' . $this->combinedPdfFileName($allowance) . '"',
                'Cache-Control' => 'private, max-age=0, must-revalidate',
                'Pragma' => 'public',
            ]);
        } catch (PdfMergeUserException $e) {
            Log::warning('Allowance after 10pm combined PDF contains an unsupported attachment', [
                'id' => $id,
                'error' => $e->getMessage(),
            ]);

            try {
                $content = $frontendPrintPdfService->renderAllowanceAfter10pmPdf(
                    $allowance->id,
                    $this->frontendPrintPayloadQuery($this->allowancePrintPayload($allowance))
                );

                return response($content, 200, [
                    'Content-Type' => 'application/pdf',
                    'Content-Disposition' => $disposition . '; filename="' . $this->combinedPdfFileName($allowance) . '"',
                    'Cache-Control' => 'private, max-age=0, must-revalidate',
                    'Pragma' => 'public',
                    'X-Combined-Pdf-Fallback' => 'system-document-only',
                ]);
            } catch (\Throwable $fallbackException) {
                Log::error('Allowance after 10pm system PDF fallback failed', [
                    'id' => $id,
                    'merge_error' => $e->getMessage(),
                    'error' => $fallbackException->getMessage(),
                    'trace' => $fallbackException->getTraceAsString(),
                ]);

                return $this->returnErrorData('เกิดข้อผิดพลาดในการสร้างไฟล์ PDF: ' . $fallbackException->getMessage(), 500);
            }
        } catch (\Throwable $e) {
            Log::error('Allowance after 10pm combined PDF generation failed', [
                'id' => $id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return $this->returnErrorData('เกิดข้อผิดพลาดในการรวมไฟล์ PDF: ' . $e->getMessage(), 500);
        }
    }

    private function combinedPdfFileName(AllowanceAfter10pm $allowance): string
    {
        $baseName = $allowance->voucher_no ?: 'allowance-after-10pm-' . $allowance->id;
        $fileName = preg_replace('/[^A-Za-z0-9_.-]+/', '-', $baseName . '-combined');

        return trim((string) $fileName, '-_.') . '.pdf';
    }

    private function frontendPrintPayloadQuery(array $payload): array
    {
        $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $encoded = rtrim(strtr(base64_encode((string) $json), '+/', '-_'), '=');

        return ['_fragment' => 'printPayload=' . rawurlencode($encoded)];
    }

    private function allowancePrintPayload(AllowanceAfter10pm $allowance): array
    {
        if (!$allowance->relationLoaded('items')) {
            $allowance->load('items');
        }

        $refs = [
            $allowance->claimant_name,
            $allowance->tl_by,
            $allowance->di_by,
            $allowance->notified_user,
            $allowance->create_by,
            $allowance->update_by,
        ];

        return array_merge([
            'document' => $allowance->toArray(),
        ], $this->printLookupPayload($refs));
    }

    private function printLookupPayload(array $refs): array
    {
        $refs = array_values(array_unique(array_filter(array_map(static function ($ref) {
            return trim((string) ($ref ?? ''));
        }, $refs), static fn ($ref) => $ref !== '')));

        $numericRefs = array_values(array_filter($refs, static fn ($ref) => is_numeric($ref)));
        $employees = empty($refs)
            ? collect()
            : Employee::query()
                ->where(function ($query) use ($refs, $numericRefs) {
                    $query->whereIn('code', $refs)
                        ->orWhereIn('initial', $refs);

                    if (!empty($numericRefs)) {
                        $query->orWhereIn('id', $numericRefs);
                    }
                })
                ->get();

        $employeeLookup = [];
        $employeeLookupWithTitle = [];
        $signatureLookupCodes = $refs;
        foreach ($employees as $employee) {
            $fullName = trim(implode(' ', array_filter([$employee->firstname ?? '', $employee->lastname ?? ''])));
            $initial = trim((string) ($employee->initial ?? ''));
            $displayName = trim(implode(', ', array_filter([$initial, $fullName ?: $employee->code])));
            $role = trim((string) ($employee->title_name ?? ''));
            $displayNameWithTitle = $role !== '' ? $displayName . '|' . $role : $displayName;
            $signatureLookupCodes[] = (string) $employee->code;

            foreach ([$employee->code, $employee->id, $employee->initial] as $key) {
                $key = trim((string) ($key ?? ''));
                if ($key === '') {
                    continue;
                }

                $employeeLookup[$key] = $displayName;
                $employeeLookupWithTitle[$key] = $displayNameWithTitle;
            }
        }

        foreach ($refs as $ref) {
            $employeeLookup[$ref] = $employeeLookup[$ref] ?? $ref;
            $employeeLookupWithTitle[$ref] = $employeeLookupWithTitle[$ref] ?? $ref;
        }

        $signatureLookupCodes = array_values(array_unique(array_filter($signatureLookupCodes, static fn ($code) => trim((string) $code) !== '')));
        $signatureSettings = empty($signatureLookupCodes)
            ? []
            : SignatureSetting::with('employee')
                ->where('is_active', 1)
                ->whereIn('employee_code', $signatureLookupCodes)
                ->get()
                ->toArray();

        return [
            'employeeLookup' => $employeeLookup,
            'employeeLookupWithTitle' => $employeeLookupWithTitle,
            'activeSignatureSettings' => $signatureSettings,
        ];
    }

    public function getDraft(Request $request)
    {
        if (!$this->hasRequestActor($request)) {
            return $this->unauthorizedDraftResponse();
        }

        $actor = $this->getActorCode($request);
        $draft = AllowanceAfter10pm::with('items')
            ->where('status', 'draft')
            ->where('create_by', $actor)
            ->orderBy('updated_at', 'desc')
            ->first();

        return $this->returnSuccess('เรียกดู Draft สำเร็จ', $draft);
    }

    public function attachmentDataUrl(Request $request)
    {
        $path = trim((string) $request->query('path', ''));
        if ($path === '') {
            return $this->returnErrorData('กรุณาระบุไฟล์แนบ', 404);
        }

        $parsedPath = parse_url($path, PHP_URL_PATH);
        if (is_string($parsedPath) && $parsedPath !== '') {
            $path = $parsedPath;
        }

        $path = rawurldecode($path);
        $path = ltrim(str_replace('\\', '/', $path), '/');
        if (strpos($path, '..') !== false) {
            return $this->returnErrorData('Invalid attachment path', 400);
        }

        $publicRoot = realpath(public_path());
        $realPath = realpath(public_path($path));

        if (!$publicRoot || !$realPath || strpos($realPath, $publicRoot) !== 0 || !File::exists($realPath)) {
            return $this->returnErrorData('ไม่พบไฟล์แนบ', 404);
        }

        $mimeType = File::mimeType($realPath) ?: 'application/octet-stream';
        $contents = File::get($realPath);

        return $this->returnSuccess('เรียกดูไฟล์แนบสำเร็จ', [
            'file_name' => basename($realPath),
            'mime_type' => $mimeType,
            'data_url' => 'data:' . $mimeType . ';base64,' . base64_encode($contents),
        ]);
    }

    public function store(Request $request)
    {
        $isDraft = $this->isDraftRequest($request);

        if ($isDraft && !$this->hasRequestActor($request)) {
            return $this->unauthorizedDraftResponse();
        }

        if (!$isDraft) {
            $validation = $this->validateAllowanceRequest($request);
            if ($validation) {
                return $validation;
            }
        }

        DB::beginTransaction();

        try {
            $actor = $this->getActorCode($request);
            $allowance = new AllowanceAfter10pm();
            $this->fillAllowance($allowance, $request, $actor, true);
            $this->setDraftPayload($allowance, $request, $isDraft);
            $allowance->save();

            $this->logDocumentCreateAudit($request, $allowance);

            if ($isDraft) {
                $allowance->total_baht = (float) ($request->total_baht ?? 0);
                $allowance->status = 'draft';
                $allowance->save();

                DB::commit();

                return $this->returnSuccess('บันทึก Draft สำเร็จ', $allowance->load('items'));
            }

            $total = $this->replaceItems($allowance, $request->items ?? [], $actor);
            $allowance->total_baht = $total;
            $this->finalizeNotificationIfReady($allowance);
            $allowance->status = $this->resolveOverallStatus($allowance);
            $allowance->save();

            DB::commit();

            return $this->returnSuccess('บันทึกข้อมูลสำเร็จ', $allowance->load('items'));
        } catch (\Throwable $e) {
            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด ' . $e->getMessage(), 500);
        }
    }

    public function update(Request $request, $id)
    {
        $isDraft = $this->isDraftRequest($request);

        if ($isDraft && !$this->hasRequestActor($request)) {
            return $this->unauthorizedDraftResponse();
        }

        if (!$isDraft) {
            $validation = $this->validateAllowanceRequest($request, $id);
            if ($validation) {
                return $validation;
            }
        }

        DB::beginTransaction();

        try {
            $allowance = AllowanceAfter10pm::with('items')->find($id);
            if (!$allowance) {
                return $this->returnErrorData('ไม่พบข้อมูลที่ต้องการแก้ไข', 404);
            }

            $actor = $this->getActorCode($request);
            $this->fillAllowance($allowance, $request, $actor, false);
            $this->setDraftPayload($allowance, $request, $isDraft);
            $allowance->save();

            if ($isDraft) {
                $allowance->total_baht = (float) ($request->total_baht ?? 0);
                $allowance->status = 'draft';
                $allowance->save();

                DB::commit();

                return $this->returnUpdateReturnData('อัปเดต Draft สำเร็จ', $allowance->load('items'));
            }

            $total = $this->replaceItems($allowance, $request->items ?? [], $actor);
            $allowance->total_baht = $total;
            $this->finalizeNotificationIfReady($allowance);
            $allowance->status = $this->resolveOverallStatus($allowance);
            $allowance->save();

            DB::commit();

            return $this->returnUpdateReturnData('อัปเดตข้อมูลสำเร็จ', $allowance->load('items'));
        } catch (\Throwable $e) {
            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด ' . $e->getMessage(), 500);
        }
    }

    public function destroy($id, Request $request)
    {
        DB::beginTransaction();

        try {
            $allowance = AllowanceAfter10pm::find($id);
            if (!$allowance) {
                return $this->returnErrorData('ไม่พบข้อมูลในระบบ', 404);
            }

            AllowanceAfter10pmItem::where('allowance_after_10pm_id', $allowance->id)->delete();
            $allowance->delete();

            $actor = $this->getActorCode($request);
            $this->Log($actor, 'ผู้ใช้งาน ' . $actor . ' ได้ทำการลบ Allowance After 10.00 PM #' . $allowance->id, 'ลบ Allowance After 10.00 PM');

            DB::commit();

            return $this->returnSuccess('ลบข้อมูลสำเร็จ', []);
        } catch (\Throwable $e) {
            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง ' . $e->getMessage(), 500);
        }
    }

    private function validateAllowanceRequest(Request $request, $id = null)
    {
        $discipline = $this->normalizeDisciplineInput($request->discipline);

        if (empty($request->claimant_name)) {
            return $this->returnErrorData('กรุณาระบุ Name (claimant_name)', 404);
        }
        if ($discipline === '') {
            return $this->returnErrorData('กรุณาระบุ Discipline (discipline)', 404);
        }
        if ($this->textLength($discipline) > self::DISCIPLINE_MAX_LENGTH) {
            return $this->returnErrorData('Discipline ต้องไม่เกิน 255 ตัวอักษร', 404);
        }
        if (empty($request->request_date)) {
            return $this->returnErrorData('กรุณาระบุ Date (request_date)', 404);
        }
        if (empty($request->tl_by)) {
            return $this->returnErrorData('กรุณาระบุ Verified by (tl_by)', 404);
        }
        if (empty($request->di_by)) {
            return $this->returnErrorData('กรุณาระบุ Approved by (di_by)', 404);
        }

        $items = $request->items ?? [];
        if (!is_array($items) || count($items) === 0) {
            return $this->returnErrorData('กรุณาระบุ items อย่างน้อย 1 รายการ', 404);
        }

        foreach ($items as $index => $row) {
            if (is_object($row)) {
                $row = (array) $row;
            }

            $rowNo = $index + 1;
            if (empty($row['work_date'])) {
                return $this->returnErrorData("กรุณาระบุวันที่ในรายการที่ {$rowNo}", 404);
            }
            if (empty($row['project_detail_id']) && empty($row['project_name'])) {
                return $this->returnErrorData("กรุณาระบุ Project ในรายการที่ {$rowNo}", 404);
            }
            if (!empty($row['project_detail_id'])) {
                if (!ProjectDetail::where('id', $row['project_detail_id'])->exists()) {
                    return $this->returnErrorData("ไม่พบ Project ในรายการที่ {$rowNo}", 404);
                }
            }
            if (empty($row['description'])) {
                return $this->returnErrorData("กรุณาระบุ Description of Work ในรายการที่ {$rowNo}", 404);
            }
            if (empty($row['time_from'])) {
                return $this->returnErrorData("กรุณาระบุเวลา From ในรายการที่ {$rowNo}", 404);
            }
            if (empty($row['time_to'])) {
                return $this->returnErrorData("กรุณาระบุเวลา To ในรายการที่ {$rowNo}", 404);
            }
            if (!isset($row['baht']) || !is_numeric($row['baht']) || (float) $row['baht'] <= 0) {
                return $this->returnErrorData("กรุณาระบุ Baht มากกว่า 0 ในรายการที่ {$rowNo}", 404);
            }
        }

        return null;
    }

    private function normalizeDisciplineInput($value): string
    {
        $discipline = trim((string) ($value ?? ''));
        return $discipline === 'Site' ? 'Other' : $discipline;
    }

    private function textLength(string $value): int
    {
        return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
    }

    private function isDraftRequest(Request $request): bool
    {
        return strtolower(trim((string) $request->input('status', ''))) === 'draft';
    }

    private function setDraftPayload(AllowanceAfter10pm $allowance, Request $request, bool $isDraft): void
    {
        if (!Schema::hasColumn('allowance_after_10pm', 'draft_payload')) {
            return;
        }

        $allowance->draft_payload = $isDraft ? $request->except(['login_by', 'login_id']) : null;
    }

    private function hasRequestActor(Request $request): bool
    {
        if (!empty($request->login_id) || !empty($request->login_by)) {
            return true;
        }

        return $this->getActorCodeFromToken($request) !== null;
    }

    private function unauthorizedDraftResponse()
    {
        return response()->json([
            'code' => '401',
            'status' => false,
            'message' => 'กรุณาเข้าสู่ระบบก่อนใช้งาน Draft',
            'data' => [],
        ], 401);
    }

    private function fillAllowance(AllowanceAfter10pm $allowance, Request $request, string $actor, bool $isCreate): void
    {
        $allowance->voucher_no = $request->voucher_no ?: ($allowance->voucher_no ?: $this->generateVoucherNo());
        $allowance->claimant_name = $request->claimant_name ?: ($allowance->claimant_name ?: $actor);
        $allowance->discipline = $this->normalizeDisciplineInput($request->discipline) ?: ($allowance->discipline ?: '');
        $allowance->request_date = $request->request_date ?: ($allowance->request_date ?: now()->toDateString());
        $allowance->attachments = $this->normalizeAttachments($request->input('attachments', $allowance->attachments ?? []));

        $allowance->tl_by = $request->tl_by ?: ($allowance->tl_by ?? null);
        $allowance->tl_by_status = $request->tl_by_status ?? ($allowance->tl_by_status ?? 'pending');
        $allowance->tl_by_date = $this->normalizeDateTimeInput($request->tl_by_date ?? $allowance->tl_by_date);

        $allowance->di_by = $request->di_by ?: ($allowance->di_by ?? null);
        $allowance->di_by_status = $request->di_by_status ?? ($allowance->di_by_status ?? 'pending');
        $allowance->di_by_date = $this->normalizeDateTimeInput($request->di_by_date ?? $allowance->di_by_date);

        $allowance->account_by = null;
        $allowance->account_by_status = null;
        $allowance->account_by_date = null;

        $allowance->notified_user = $request->notified_user ?: ($allowance->notified_user ?: ($allowance->create_by ?: $actor));
        $allowance->notified_user_status = $request->notified_user_status ?? ($allowance->notified_user_status ?? 'pending');
        $allowance->notified_user_date = $this->normalizeDateTimeInput($request->notified_user_date ?? $allowance->notified_user_date);

        $allowance->status = $request->status ?? ($allowance->status ?? 'submitted');

        if ($isCreate) {
            $allowance->create_by = $actor;
        } else {
            $allowance->update_by = $actor;
        }
    }

    private function replaceItems(AllowanceAfter10pm $allowance, array $items, string $actor): float
    {
        AllowanceAfter10pmItem::where('allowance_after_10pm_id', $allowance->id)->delete();

        $total = 0.0;
        foreach ($items as $index => $row) {
            if (is_object($row)) {
                $row = (array) $row;
            }

            $projectDetailId = $row['project_detail_id'] ?? null;
            $project = $projectDetailId ? ProjectDetail::find($projectDetailId) : null;
            $amount = (float) $row['baht'];
            $total += $amount;

            $item = new AllowanceAfter10pmItem();
            $item->allowance_after_10pm_id = $allowance->id;
            $item->seq = $row['seq'] ?? ($index + 1);
            $item->work_date = $row['work_date'];
            $item->project_detail_id = $projectDetailId;
            $item->project_code = $project->code ?? ($row['project_code'] ?? null);
            $item->project_name = $project->name ?? ($row['project_name'] ?? null);
            $item->description = $row['description'];
            $item->time_from = $row['time_from'];
            $item->time_to = $row['time_to'];
            $item->baht = $amount;
            $item->create_by = $actor;
            $item->save();
        }

        return $total;
    }

    private function finalizeNotificationIfReady(AllowanceAfter10pm $allowance): void
    {
        $tl = $this->normalizeWorkflowStatus($allowance->tl_by_status);
        $di = $this->normalizeWorkflowStatus($allowance->di_by_status);
        if ($tl === 'approve' && $di === 'approve') {
            $allowance->notified_user = $allowance->notified_user ?: $allowance->create_by;
            if ($this->normalizeWorkflowStatus($allowance->notified_user_status) !== 'notified') {
                $allowance->notified_user_status = 'notified';
            }
            if (!$allowance->notified_user_date) {
                $allowance->notified_user_date = now();
            }
        }
    }

    private function resolveOverallStatus(AllowanceAfter10pm $allowance): string
    {
        $tl = $this->normalizeWorkflowStatus($allowance->tl_by_status);
        $di = $this->normalizeWorkflowStatus($allowance->di_by_status);
        if ($tl === 'reject' || $di === 'reject') {
            return 'rejected';
        }
        if ($tl === 'approve' && $di === 'approve') {
            return 'notified';
        }
        if ($tl === 'approve') {
            return 'tl_approved';
        }

        return 'submitted';
    }

    private function normalizeWorkflowStatus($status): string
    {
        $value = strtolower(trim((string) ($status ?? 'pending')));
        if ($value === 'approved') {
            return 'approve';
        }
        if ($value === 'rejected') {
            return 'reject';
        }
        if ($value === '') {
            return 'pending';
        }

        return $value;
    }

    private function getActorCode(Request $request): string
    {
        $loginBy = $request->login_by ?? null;
        if (is_object($loginBy)) {
            return $loginBy->employee_code ?? $loginBy->id ?? $loginBy->user_id ?? 'admin';
        }
        if (is_array($loginBy)) {
            return $loginBy['employee_code'] ?? $loginBy['id'] ?? $loginBy['user_id'] ?? 'admin';
        }

        $tokenActor = $this->getActorCodeFromToken($request);
        if ($tokenActor !== null) {
            return $tokenActor;
        }

        $actorId = $this->resolveActorId($request);
        return $actorId !== 'system' ? $actorId : 'admin';
    }

    private function getActorCodeFromToken(Request $request): ?string
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

            $payload = \Firebase\JWT\JWT::decode($token, 'key', ['HS256']);
            $loginBy = $payload->lun ?? null;

            if (is_object($loginBy)) {
                $candidate = $loginBy->employee_code ?? $loginBy->id ?? $loginBy->user_id ?? $loginBy->username ?? null;
                return $candidate !== null && $candidate !== '' ? (string) $candidate : null;
            }
            if (is_array($loginBy)) {
                $candidate = $loginBy['employee_code'] ?? $loginBy['id'] ?? $loginBy['user_id'] ?? $loginBy['username'] ?? null;
                return $candidate !== null && $candidate !== '' ? (string) $candidate : null;
            }
            if (isset($payload->aud) && $payload->aud !== null && $payload->aud !== '') {
                return (string) $payload->aud;
            }
        } catch (\Throwable $e) {
            return null;
        }

        return null;
    }

    private function generateVoucherNo(): string
    {
        $prefix = 'AL-' . now()->format('Ymd') . '-';
        $sequence = AllowanceAfter10pm::withTrashed()
            ->where('voucher_no', 'like', $prefix . '%')
            ->count() + 1;

        do {
            $voucherNo = $prefix . str_pad((string) $sequence, 4, '0', STR_PAD_LEFT);
            $sequence++;
        } while (AllowanceAfter10pm::withTrashed()->where('voucher_no', $voucherNo)->exists());

        return $voucherNo;
    }
}
