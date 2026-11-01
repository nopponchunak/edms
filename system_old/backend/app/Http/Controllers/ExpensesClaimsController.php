<?php

namespace App\Http\Controllers;

use App\Exceptions\PdfMergeUserException;
use App\Models\Employee;
use App\Models\ExpensesClaimItems;
use App\Models\ExpensesClaims;
use App\Models\ProjectDetail;
use App\Models\SignatureSetting;
use App\Services\FrontendPrintPdfService;
use App\Services\PurchaseCombinedPdfService;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class ExpensesClaimsController extends Controller
{
    private const VOUCHER_ALLOCATION_MAX_ATTEMPTS = 10;

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
        $items = ExpensesClaims::with('items')
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
        $actorCode = $this->listActorCode($request);

        if (!in_array($tab, ['all', 'my', 'pending', 'action'], true)) {
            return response()->json([
                'code' => '422',
                'status' => false,
                'message' => 'tab must be all, my, pending, or action.',
            ], 422);
        }

        if ($statusFilter !== '' && !in_array($statusFilter, ['draft', 'pending', 'verified', 'reject', 'approve'], true)) {
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
            'recive_by',
            'claim_date',
            'total_baht',
            'status',
            'verified_by',
            'verified_by_status',
            'verified_by_date',
            'approved_by',
            'approved_by_status',
            'approved_by_date',
            'create_by',
            'update_by',
            'created_at',
            'updated_at',
        ];

        foreach (['account_by', 'account_by_status', 'account_by_date', 'draft_payload'] as $column) {
            if (Schema::hasColumn('expenses_claims', $column)) {
                $col[] = $column;
            }
        }

        $orderby = [
            'create_by',
            'total_baht',
            'approved_by_date',
            'approved_by',
            'status',
        ];

        $query = ExpensesClaims::with('items')->select($col);

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
            $query->where('approved_by', $approvedBy);
        }
        if ($approvedFrom !== '') {
            $query->whereDate('approved_by_date', '>=', $approvedFrom);
        }
        if ($approvedTo !== '') {
            $query->whereDate('approved_by_date', '<=', $approvedTo);
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
            $query->whereYear('approved_by_date', $approvedYear)
                ->whereMonth('approved_by_date', $approvedMonthNumber);
        }

        $actionCountQuery = clone $query;
        $actionRequestCount = 0;
        if ($actorCode !== null) {
            $this->applyExpensesActionScope($actionCountQuery, $actorCode);
            $actionRequestCount = $actionCountQuery->count();
        }

        if ($searchValue !== '') {
            $searchColumns = [
                'voucher_no', 'claimant_name', 'recive_by', 'create_by',
                'update_by', 'verified_by', 'approved_by',
            ];
            $query->where(function ($q) use ($searchValue, $searchColumns) {
                foreach ($searchColumns as $column) {
                    $q->orWhere($column, 'like', '%' . $searchValue . '%');
                }
                $this->orWhereExpensesEmployeeNameMatches($q, $searchValue, [
                    'claimant_name', 'recive_by', 'create_by', 'verified_by', 'approved_by',
                ]);
            });
        }

        if ($statusFilter !== '') {
            $this->applyExpensesWorkflowStatusScope($query, $statusFilter);
        }

        if ($tab === 'my') {
            $this->applyExpensesMyScope($query, $actorCode);
        } elseif ($tab === 'pending') {
            $query->where(function ($pendingQuery) use ($actorCode) {
                $pendingQuery->where(function ($ownedPending) use ($actorCode) {
                    $this->applyExpensesMyScope($ownedPending, $actorCode);
                    $this->applyExpensesPendingScope($ownedPending);
                })->orWhere(function ($actionQuery) use ($actorCode) {
                    $this->applyExpensesActionScope($actionQuery, $actorCode);
                });
            });
        } elseif ($tab === 'action') {
            $this->applyExpensesActionScope($query, $actorCode);
        }

        $orderColumn = $order[0]['column'] ?? null;
        $orderDir = strtolower((string) ($order[0]['dir'] ?? 'desc')) === 'asc' ? 'asc' : 'desc';
        if ($tab === 'action' && $orderColumn !== null) {
            $actionColumn = (int) $orderColumn;
            if ($actionColumn === 0) {
                $this->applyExpensesEmployeeOrder($query, 'recive_by', $orderDir);
            } elseif ($actionColumn === 1) {
                $query->orderBy('total_baht', $orderDir);
            } elseif ($actionColumn === 2 && $actorCode !== null) {
                $query->orderByRaw($this->expensesActionStepSortExpression() . ' ' . $orderDir, [$actorCode, $actorCode]);
            } elseif ($actionColumn === 3 && $actorCode !== null) {
                $query->orderByRaw($this->expensesActionStatusSortExpression() . ' ' . $orderDir, [$actorCode, $actorCode]);
            }
        } elseif ($orderColumn !== null && (int) $orderColumn === 4) {
            $query->orderByRaw($this->expensesWorkflowSortExpression() . ' ' . $orderDir);
        } elseif ($orderColumn !== null && in_array((int) $orderColumn, [0, 3], true)) {
            $this->applyExpensesEmployeeOrder($query, $orderby[$orderColumn], $orderDir);
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
                    $data[$i]->action_type = $this->expensesActionTypeFor($data[$i], $actorCode);
                    $data[$i]->current_status = $data[$i]->action_type === 'verified_by_status'
                        ? $data[$i]->verified_by_status
                        : $data[$i]->approved_by_status;
                }
            }
        }

        $payload = $data->toArray();
        $payload['action_request_count'] = $actionRequestCount;

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $payload);
    }

    private function expensesWorkflowSortExpression(): string
    {
        return "CASE
            WHEN LOWER(COALESCE(status, '')) = 'draft' THEN 'Draft'
            WHEN LOWER(COALESCE(status, '')) IN ('reject', 'rejected')
              OR LOWER(COALESCE(verified_by_status, '')) IN ('reject', 'rejected')
              OR LOWER(COALESCE(approved_by_status, '')) IN ('reject', 'rejected') THEN 'Rejected'
            WHEN LOWER(COALESCE(status, '')) IN ('approve', 'approved')
              OR (LOWER(COALESCE(verified_by_status, '')) IN ('approve', 'approved')
                  AND LOWER(COALESCE(approved_by_status, '')) IN ('approve', 'approved')) THEN 'Approved'
            WHEN LOWER(COALESCE(status, '')) = 'verified'
              OR LOWER(COALESCE(verified_by_status, '')) IN ('approve', 'approved') THEN 'Verified'
            ELSE 'Pending'
        END";
    }

    private function expensesActionStepSortExpression(): string
    {
        return "CASE
            WHEN verified_by = ? AND LOWER(TRIM(COALESCE(verified_by_status, ''))) IN ('', 'pending') THEN 'Verified By'
            WHEN approved_by = ? AND LOWER(TRIM(COALESCE(approved_by_status, ''))) IN ('', 'pending') THEN 'Approved By'
            ELSE ''
        END";
    }

    private function expensesActionStatusSortExpression(): string
    {
        return "CASE
            WHEN verified_by = ? AND LOWER(TRIM(COALESCE(verified_by_status, ''))) IN ('', 'pending') THEN 'Pending'
            WHEN approved_by = ? AND LOWER(TRIM(COALESCE(approved_by_status, ''))) IN ('', 'pending') THEN 'Pending'
            ELSE ''
        END";
    }

    private function orWhereExpensesEmployeeNameMatches($query, string $searchValue, array $referenceColumns): void
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
                        $referenceQuery->orWhereColumn('employees.code', 'expenses_claims.' . $column)
                            ->orWhereColumn('employees.id', 'expenses_claims.' . $column);
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

    private function applyExpensesEmployeeOrder($query, string $column, string $direction): void
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
                        $employeeQuery->whereColumn('employees.code', 'expenses_claims.' . $column)
                            ->orWhereColumn('employees.id', 'expenses_claims.' . $column);
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

    private function applyExpensesMyScope($query, ?string $actorCode): void
    {
        if ($actorCode === null) {
            $query->whereRaw('1 = 0');
            return;
        }

        $query->where(function ($userQuery) use ($actorCode) {
            foreach (['claimant_name', 'recive_by', 'verified_by', 'approved_by', 'create_by', 'update_by'] as $column) {
                $userQuery->orWhere($column, $actorCode);
            }
        });
    }

    private function applyExpensesActionScope($query, ?string $actorCode): void
    {
        if ($actorCode === null) {
            $query->whereRaw('1 = 0');
            return;
        }

        $pending = "LOWER(TRIM(COALESCE(%s, ''))) IN ('', 'pending')";
        $approved = "LOWER(TRIM(COALESCE(%s, ''))) IN ('approve', 'approved')";
        $query->where(function ($actionQuery) use ($actorCode, $pending, $approved) {
            $actionQuery->where(function ($verifiedQuery) use ($actorCode, $pending) {
                $verifiedQuery->where('verified_by', $actorCode)
                    ->whereRaw(sprintf($pending, 'verified_by_status'));
            })->orWhere(function ($approvedQuery) use ($actorCode, $pending, $approved) {
                $approvedQuery->where('approved_by', $actorCode)
                    ->whereRaw(sprintf($approved, 'verified_by_status'))
                    ->whereRaw(sprintf($pending, 'approved_by_status'));
            });
        });
    }

    private function applyExpensesPendingScope($query): void
    {
        $rejected = "LOWER(TRIM(COALESCE(%s, ''))) IN ('reject', 'rejected')";
        $approved = "LOWER(TRIM(COALESCE(%s, ''))) IN ('approve', 'approved')";
        $query->whereRaw('NOT (' . sprintf($rejected, 'verified_by_status') . ')')
            ->whereRaw('NOT (' . sprintf($rejected, 'approved_by_status') . ')')
            ->whereRaw('NOT (' . sprintf($approved, 'verified_by_status') . ' AND ' . sprintf($approved, 'approved_by_status') . ')');
    }

    private function applyExpensesWorkflowStatusScope($query, string $status): void
    {
        $statusCase = "CASE
            WHEN LOWER(TRIM(COALESCE(status, ''))) = 'draft' THEN 'draft'
            WHEN LOWER(TRIM(COALESCE(status, ''))) IN ('reject', 'rejected')
                OR LOWER(TRIM(COALESCE(verified_by_status, ''))) IN ('reject', 'rejected')
                OR LOWER(TRIM(COALESCE(approved_by_status, ''))) IN ('reject', 'rejected') THEN 'reject'
            WHEN LOWER(TRIM(COALESCE(status, ''))) IN ('approve', 'approved')
                OR (LOWER(TRIM(COALESCE(verified_by_status, ''))) IN ('approve', 'approved')
                    AND LOWER(TRIM(COALESCE(approved_by_status, ''))) IN ('approve', 'approved')) THEN 'approve'
            WHEN LOWER(TRIM(COALESCE(status, ''))) = 'verified'
                OR LOWER(TRIM(COALESCE(verified_by_status, ''))) IN ('approve', 'approved') THEN 'verified'
            ELSE 'pending'
        END";
        $query->whereRaw("($statusCase) = ?", [$status]);
    }

    private function expensesActionTypeFor($item, string $actorCode): ?string
    {
        $verifiedStatus = strtolower(trim((string) ($item->verified_by_status ?? '')));
        $approvedStatus = strtolower(trim((string) ($item->approved_by_status ?? '')));
        if ($item->verified_by === $actorCode && in_array($verifiedStatus, ['', 'pending'], true)) {
            return 'verified_by_status';
        }
        if ($item->approved_by === $actorCode
            && in_array($verifiedStatus, ['approve', 'approved'], true)
            && in_array($approvedStatus, ['', 'pending'], true)) {
            return 'approved_by_status';
        }

        return null;
    }

    public function show($id)
    {
        $item = ExpensesClaims::with('items')->find($id);
        if (!$item) {
            return $this->returnErrorData('ไม่พบรายการที่ระบุ', 404);
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $item);
    }

    public function printPdf($id, FrontendPrintPdfService $frontendPrintPdfService)
    {
        $claim = ExpensesClaims::with('items')->find($id);

        if (!$claim) {
            return $this->returnErrorData('ไม่พบรายการที่ระบุ', 404);
        }

        try {
            $content = $frontendPrintPdfService->renderExpensesClaimPdf(
                $claim->id,
                $this->frontendPrintPayloadQuery($this->claimPrintPayload($claim))
            );

            return response($content, 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => 'inline; filename="expenses-claim-' . $claim->id . '.pdf"',
                'Cache-Control' => 'private, max-age=0, must-revalidate',
                'Pragma' => 'public',
            ]);
        } catch (\Throwable $e) {
            Log::error('Expenses claim PDF generation failed', [
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
        $claim = ExpensesClaims::with('items')->find($id);

        if (!$claim) {
            return $this->returnErrorData('ไม่พบรายการที่ระบุ', 404);
        }

        try {
            $sources = [[
                'name' => 'expenses-claim-' . ($claim->voucher_no ?: $claim->id),
                'content' => $frontendPrintPdfService->renderExpensesClaimPdf(
                    $claim->id,
                    $this->frontendPrintPayloadQuery($this->claimPrintPayload($claim))
                ),
            ]];

            foreach ($combinedPdfService->attachmentPdfPaths($claim->attachments, true) as $attachmentPath) {
                $sources[] = ['path' => $attachmentPath];
            }

            $content = $combinedPdfService->mergePdfSources($sources);

            return response($content, 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => $disposition . '; filename="' . $this->combinedPdfFileName($claim) . '"',
                'Cache-Control' => 'private, max-age=0, must-revalidate',
                'Pragma' => 'public',
            ]);
        } catch (PdfMergeUserException $e) {
            Log::warning('Expenses claim combined PDF contains an unsupported attachment', [
                'id' => $id,
                'error' => $e->getMessage(),
            ]);

            try {
                $content = $frontendPrintPdfService->renderExpensesClaimPdf(
                    $claim->id,
                    $this->frontendPrintPayloadQuery($this->claimPrintPayload($claim))
                );

                return response($content, 200, [
                    'Content-Type' => 'application/pdf',
                    'Content-Disposition' => $disposition . '; filename="' . $this->combinedPdfFileName($claim) . '"',
                    'Cache-Control' => 'private, max-age=0, must-revalidate',
                    'Pragma' => 'public',
                    'X-Combined-Pdf-Fallback' => 'system-document-only',
                ]);
            } catch (\Throwable $fallbackException) {
                Log::error('Expenses claim system PDF fallback failed', [
                    'id' => $id,
                    'merge_error' => $e->getMessage(),
                    'error' => $fallbackException->getMessage(),
                    'trace' => $fallbackException->getTraceAsString(),
                ]);

                return $this->returnErrorData('เกิดข้อผิดพลาดในการสร้างไฟล์ PDF: ' . $fallbackException->getMessage(), 500);
            }
        } catch (\Throwable $e) {
            Log::error('Expenses claim combined PDF generation failed', [
                'id' => $id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return $this->returnErrorData('เกิดข้อผิดพลาดในการรวมไฟล์ PDF: ' . $e->getMessage(), 500);
        }
    }

    private function combinedPdfFileName(ExpensesClaims $claim): string
    {
        $baseName = $claim->voucher_no ?: 'expenses-claim-' . $claim->id;
        $fileName = preg_replace('/[^A-Za-z0-9_.-]+/', '-', $baseName . '-combined');

        return trim((string) $fileName, '-_.') . '.pdf';
    }

    private function frontendPrintPayloadQuery(array $payload): array
    {
        $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $encoded = rtrim(strtr(base64_encode((string) $json), '+/', '-_'), '=');

        return ['_fragment' => 'printPayload=' . rawurlencode($encoded)];
    }

    private function claimPrintPayload(ExpensesClaims $claim): array
    {
        if (!$claim->relationLoaded('items')) {
            $claim->load('items');
        }

        $refs = [
            $claim->claimant_name,
            $claim->recive_by,
            $claim->verified_by,
            $claim->approved_by,
            $claim->create_by,
            $claim->update_by,
        ];

        return array_merge([
            'document' => $claim->toArray(),
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
        $draft = ExpensesClaims::with('items')
            ->where('status', 'draft')
            ->where('create_by', $actor)
            ->orderBy('updated_at', 'desc')
            ->first();

        return $this->returnSuccess('เรียกดู Draft สำเร็จ', $draft);
    }

    public function store(Request $request)
    {
        $this->normalizeClaimRequest($request);
        $isDraft = $this->isDraftRequest($request);

        if ($isDraft && !$this->hasRequestActor($request)) {
            return $this->unauthorizedDraftResponse();
        }

        if (!$isDraft) {
            $validation = $this->validateClaimRequest($request);
            if ($validation) {
                return $validation;
            }
        }

        $actor = $this->getActorCode($request);

        for ($attempt = 1; $attempt <= self::VOUCHER_ALLOCATION_MAX_ATTEMPTS; $attempt++) {
            DB::beginTransaction();

            try {
                // The value returned by GET /create is only a preview. Allocate
                // again at persistence time so the first committed request owns
                // the number and later requests receive the next available one.
                $request->merge(['voucher_no' => $this->generateVoucherNo()]);

                $claim = new ExpensesClaims();
                $this->fillClaim($claim, $request, $actor, true);
                $this->setDraftPayload($claim, $request, $isDraft);
                $claim->save();

                $this->logDocumentCreateAudit($request, $claim);

                if ($isDraft) {
                    $claim->total_baht = (float) ($request->total_baht ?? 0);
                    $claim->status = 'draft';
                    $claim->save();

                    DB::commit();

                    return $this->returnSuccess('บันทึก Draft สำเร็จ', $claim->load('items'));
                }

                $total = $this->replaceItems($claim, $request->items ?? [], $actor);
                $claim->total_baht = $total;
                $claim->status = $this->resolveOverallStatus($claim);
                $claim->save();

                DB::commit();

                return $this->returnSuccess('บันทึกข้อมูลสำเร็จ', $claim->load('items'));
            } catch (QueryException $e) {
                DB::rollBack();
                if ($this->isDuplicateVoucherException($e)) {
                    if ($attempt < self::VOUCHER_ALLOCATION_MAX_ATTEMPTS) {
                        continue;
                    }

                    return $this->duplicateVoucherResponse();
                }
                return $this->returnErrorData('เกิดข้อผิดพลาด ' . $e->getMessage(), 500);
            } catch (\Throwable $e) {
                DB::rollBack();
                return $this->returnErrorData('เกิดข้อผิดพลาด ' . $e->getMessage(), 500);
            }
        }

        return $this->duplicateVoucherResponse();
    }

    public function update(Request $request, $id)
    {
        $this->normalizeClaimRequest($request);
        $isDraft = $this->isDraftRequest($request);

        if ($isDraft && !$this->hasRequestActor($request)) {
            return $this->unauthorizedDraftResponse();
        }

        DB::beginTransaction();

        try {
            $claim = ExpensesClaims::with('items')->find($id);
            if (!$claim) {
                DB::rollBack();
                return $this->returnErrorData('ไม่พบข้อมูลที่ต้องการแก้ไข', 404);
            }

            $existingIsDraft = strtolower(trim((string) $claim->status)) === 'draft';
            if (($isDraft || $existingIsDraft) && !$this->hasRequestActor($request)) {
                DB::rollBack();
                return $this->unauthorizedDraftResponse();
            }

            $actor = $this->getActorCode($request);
            if (($isDraft || $existingIsDraft) && (string) $claim->create_by !== $actor) {
                DB::rollBack();
                return response()->json([
                    'code' => '403',
                    'status' => false,
                    'message' => 'You can only update your own draft.',
                ], 403);
            }
            // A saved draft already owns its voucher. A stale form may still
            // submit the number it previewed before another user saved first.
            // Keep the persisted number on both draft saves and submission.
            if ($existingIsDraft && $claim->voucher_no) {
                $request->merge(['voucher_no' => $claim->voucher_no]);
            }

            if (!$isDraft) {
                $validation = $this->validateClaimRequest($request, $id);
                if ($validation) {
                    DB::rollBack();
                    return $validation;
                }

                if ($this->voucherNoExists($request->voucher_no, $id)) {
                    DB::rollBack();
                    return $this->duplicateVoucherResponse();
                }
            }

            $this->fillClaim($claim, $request, $actor, false);
            $this->setDraftPayload($claim, $request, $isDraft);
            $claim->save();

            if ($isDraft) {
                $claim->total_baht = (float) ($request->total_baht ?? 0);
                $claim->status = 'draft';
                $claim->save();

                DB::commit();

                return $this->returnUpdateReturnData('อัปเดต Draft สำเร็จ', $claim->load('items'));
            }

            $total = $this->replaceItems($claim, $request->items ?? [], $actor);
            $claim->total_baht = $total;
            $claim->status = $this->resolveOverallStatus($claim);
            $claim->save();

            DB::commit();

            return $this->returnUpdateReturnData('อัปเดตข้อมูลสำเร็จ', $claim->load('items'));
        } catch (QueryException $e) {
            DB::rollBack();
            if ($this->isDuplicateVoucherException($e)) {
                return $this->duplicateVoucherResponse();
            }
            return $this->returnErrorData('เกิดข้อผิดพลาด ' . $e->getMessage(), 500);
        } catch (\Throwable $e) {
            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด ' . $e->getMessage(), 500);
        }
    }

    public function destroy($id, Request $request)
    {
        DB::beginTransaction();

        try {
            $claim = ExpensesClaims::find($id);
            if (!$claim) {
                return $this->returnErrorData('ไม่พบข้อมูลในระบบ', 404);
            }

            ExpensesClaimItems::where('expenses_claim_id', $claim->id)->delete();
            $claim->delete();

            $actor = $this->getActorCode($request);
            $this->Log($actor, 'ผู้ใช้งาน ' . $actor . ' ได้ทำการลบ Expenses Claim #' . $claim->id, 'ลบ Expenses Claim');

            DB::commit();

            return $this->returnSuccess('ลบข้อมูลสำเร็จ', []);
        } catch (\Throwable $e) {
            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง ' . $e->getMessage(), 500);
        }
    }

    private function validateClaimRequest(Request $request, $id = null)
    {
        if (empty($request->claimant_name)) {
            return $this->returnErrorData('กรุณาระบุ Name (claimant_name)', 404);
        }
        if (empty($request->claim_date)) {
            return $this->returnErrorData('กรุณาระบุ Date (claim_date)', 404);
        }
        if (empty($request->verified_by)) {
            return $this->returnErrorData('กรุณาระบุ Verified by (verified_by)', 404);
        }
        if (empty($request->approved_by)) {
            return $this->returnErrorData('กรุณาระบุ Approved by (approved_by)', 404);
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
            if (empty($row['item_date'])) {
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
            if (empty($row['details'])) {
                return $this->returnErrorData("กรุณาระบุ Details ในรายการที่ {$rowNo}", 404);
            }
            if (!isset($row['baht']) || !is_numeric($row['baht']) || (float) $row['baht'] <= 0) {
                return $this->returnErrorData("กรุณาระบุ Baht มากกว่า 0 ในรายการที่ {$rowNo}", 404);
            }
        }

        return null;
    }

    private function normalizeClaimRequest(Request $request): void
    {
        if ($request->has('voucher_no')) {
            $request->merge([
                'voucher_no' => trim((string) $request->voucher_no),
            ]);
        }
    }

    private function isDraftRequest(Request $request): bool
    {
        return strtolower(trim((string) $request->input('status', ''))) === 'draft';
    }

    private function setDraftPayload(ExpensesClaims $claim, Request $request, bool $isDraft): void
    {
        if (!Schema::hasColumn('expenses_claims', 'draft_payload')) {
            return;
        }

        $claim->draft_payload = $isDraft ? $request->except(['login_by', 'login_id']) : null;
    }

    private function hasRequestActor(Request $request): bool
    {
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

    private function voucherNoExists($voucherNo, $exceptId = null): bool
    {
        $voucherNo = trim((string) $voucherNo);
        if ($voucherNo === '') {
            return false;
        }

        $query = ExpensesClaims::withTrashed()
            ->where('voucher_no', $voucherNo);

        if ($exceptId !== null) {
            $query->where('id', '<>', $exceptId);
        }

        return $query->exists();
    }

    private function duplicateVoucherResponse()
    {
        return response()->json([
            'code' => '409',
            'status' => false,
            'message' => 'Voucher # นี้ถูกใช้งานแล้ว กรุณาใช้เลข Voucher ใหม่',
            'data' => [],
        ], 409);
    }

    private function isDuplicateVoucherException(QueryException $e): bool
    {
        $sqlState = (string) ($e->errorInfo[0] ?? $e->getCode());
        $driverCode = (int) ($e->errorInfo[1] ?? 0);
        $message = strtolower((string) $e->getMessage());

        $isUniqueViolation = in_array($sqlState, ['23000', '23505'], true)
            || in_array($driverCode, [19, 1062], true);
        $isVoucherConstraint = str_contains($message, 'expenses_claims_voucher_no_unique')
            || str_contains($message, 'expenses_claims.voucher_no');

        return $isUniqueViolation && $isVoucherConstraint;
    }

    private function generateVoucherNo(): string
    {
        $prefix = 'EC-' . now()->format('Ymd') . '-';
        $highestSequence = ExpensesClaims::withTrashed()
            ->where('voucher_no', 'like', $prefix . '%')
            ->pluck('voucher_no')
            ->reduce(function (int $highest, string $voucherNo) use ($prefix): int {
                $suffix = substr($voucherNo, strlen($prefix));

                return ctype_digit($suffix) ? max($highest, (int) $suffix) : $highest;
            }, 0);
        $sequence = $highestSequence + 1;

        do {
            $voucherNo = $prefix . str_pad((string) $sequence, 4, '0', STR_PAD_LEFT);
            $sequence++;
        } while (ExpensesClaims::withTrashed()->where('voucher_no', $voucherNo)->exists());

        return $voucherNo;
    }

    private function fillClaim(ExpensesClaims $claim, Request $request, string $actor, bool $isCreate): void
    {
        $claim->voucher_no = $request->voucher_no ?: ($claim->voucher_no ?: $this->generateVoucherNo());
        $claim->claimant_name = $request->claimant_name ?: ($claim->claimant_name ?: $actor);
        $claim->recive_by = $request->recive_by ?: ($claim->recive_by ?: ($claim->create_by ?: $actor));
        $claim->claim_date = $request->claim_date ?: ($claim->claim_date ?: now()->toDateString());
        $claim->attachments = $this->normalizeAttachments($request->input('attachments', $claim->attachments ?? []));

        $claim->verified_by = $request->verified_by ?: ($claim->verified_by ?? null);
        $claim->verified_by_status = $request->verified_by_status ?? ($claim->verified_by_status ?? 'pending');
        $claim->verified_by_date = $this->normalizeDateTimeInput($request->verified_by_date ?? $claim->verified_by_date);

        $claim->approved_by = $request->approved_by ?: ($claim->approved_by ?? null);
        $claim->approved_by_status = $request->approved_by_status ?? ($claim->approved_by_status ?? 'pending');
        $claim->approved_by_date = $this->normalizeDateTimeInput($request->approved_by_date ?? $claim->approved_by_date);

        if (Schema::hasColumn('expenses_claims', 'account_by')) {
            $claim->account_by = null;
        }
        if (Schema::hasColumn('expenses_claims', 'account_by_status')) {
            $claim->account_by_status = null;
        }
        if (Schema::hasColumn('expenses_claims', 'account_by_date')) {
            $claim->account_by_date = null;
        }

        $claim->status = $request->status ?? ($claim->status ?? 'submitted');

        if ($isCreate) {
            $claim->create_by = $actor;
        } else {
            $claim->update_by = $actor;
        }
    }

    private function replaceItems(ExpensesClaims $claim, array $items, string $actor): float
    {
        ExpensesClaimItems::where('expenses_claim_id', $claim->id)->delete();

        $total = 0.0;
        foreach ($items as $index => $row) {
            if (is_object($row)) {
                $row = (array) $row;
            }

            $projectDetailId = $row['project_detail_id'] ?? null;
            $project = $projectDetailId ? ProjectDetail::find($projectDetailId) : null;
            $amount = (float) $row['baht'];
            $total += $amount;

            $item = new ExpensesClaimItems();
            $item->expenses_claim_id = $claim->id;
            $item->seq = $row['seq'] ?? ($index + 1);
            $item->item_date = $row['item_date'];
            $item->project_detail_id = $projectDetailId;
            $item->project_code = $project->code ?? ($row['project_code'] ?? null);
            $item->project_name = $project->name ?? ($row['project_name'] ?? null);
            $item->details = $row['details'];
            $item->baht = $amount;
            $item->create_by = $actor;
            $item->save();
        }

        return $total;
    }

    private function resolveOverallStatus(ExpensesClaims $claim): string
    {
        $verified = $this->normalizeWorkflowStatus($claim->verified_by_status);
        $approved = $this->normalizeWorkflowStatus($claim->approved_by_status);
        if ($verified === 'reject' || $approved === 'reject') {
            return 'rejected';
        }
        if ($verified === 'approve' && $approved === 'approve') {
            return 'approved';
        }
        if ($verified === 'approve') {
            return 'verified';
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
        $tokenActor = $this->getActorCodeFromToken($request);
        if ($tokenActor !== null) {
            return $tokenActor;
        }

        $loginBy = $request->login_by ?? null;
        if (is_object($loginBy)) {
            return $loginBy->employee_code ?? $loginBy->id ?? $loginBy->user_id ?? 'admin';
        }
        if (is_array($loginBy)) {
            return $loginBy['employee_code'] ?? $loginBy['id'] ?? $loginBy['user_id'] ?? 'admin';
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
}
