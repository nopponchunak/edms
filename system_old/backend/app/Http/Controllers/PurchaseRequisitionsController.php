<?php
namespace App\Http\Controllers;

use App\Exceptions\PdfMergeUserException;
use App\Models\Employee;
use App\Models\PurchaseRequisitions;
use App\Models\PurchaseRequisitionItems;
use App\Models\SignatureSetting;
use App\Services\FrontendPrintPdfService;
use App\Services\PurchaseCombinedPdfService;
use App\Services\PurchaseDocumentNumberService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Mpdf\Config\ConfigVariables;
use Mpdf\Config\FontVariables;
use Mpdf\Mpdf;
use Mpdf\Output\Destination;

class PurchaseRequisitionsController extends Controller
{
    private const STATUS_DRAFT = 'draft';
    private const STATUS_SUBMITTED = 'submitted';
    private const STATUS_APPROVED = 'approved';
    private const STATUS_REJECTED = 'rejected';
    private const DEFAULT_PAYMENT_TERM = 'Accept invoices only at the end of each month. Payment will be made at the end of the following month after the invoice is received.';
    private const PR_PRINT_PAGE_WIDTH_MM = 215.9;
    private const PR_PRINT_PAGE_HEIGHT_MM = 279.4;
    private const PR_PRINT_FOOTER_TEXT = 'MATL_REQ/EMS DOCUMENTATION/FORM/MTM/MTPC/02/RELEASED/CREATE/DEPARTMENT/PURPOSE/001/DATE/2020';
    private const PR_NUMBER_PREFIX = 'PR';
    private const PR_EMPLOYEE_INFO_FIELDS = [
        'requested_by',
        'recommended_by',
        'verified_by_is',
        'verified_by',
        'approved_by',
        'approved_by_2',
        'acknowledged_by',
        'action_by_admin',
        'create_by',
        'update_by',
    ];

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

    private function attachmentsToJson($attachments)
    {
        $normalized = $this->normalizeAttachments($attachments);
        return $this->encodeAttachments($normalized);
    }

    private function encodeAttachments($normalized)
    {
        if (empty($normalized)) {
            return null;
        }

        return json_encode($normalized, JSON_UNESCAPED_UNICODE);
    }

    private function validatePdfOnlyAttachments(array $attachments): ?JsonResponse
    {
        $invalidAttachment = $this->firstNonPdfAttachment($attachments);
        if ($invalidAttachment !== null) {
            return $this->returnErrorData('Purchase Requisition attachments must be PDF files only: ' . $invalidAttachment, 422);
        }

        return null;
    }

    private function validateSecondApproverForTotal(Request $request, $existingGrandTotal = null)
    {
        $grandTotal = $request->has('grand_total')
            ? (float) $request->grand_total
            : (float) ($existingGrandTotal ?? 0);

        if ($grandTotal <= 50000) {
            return null;
        }

        $approvedBy = trim((string) $request->approved_by);
        $approvedBy2 = trim((string) $request->approved_by_2);

        if ($approvedBy2 === '') {
            return $this->returnErrorData('กรุณาระบุ approved_by_2 เมื่อยอดรวมเกิน 50,000', 404);
        }

        if ($approvedBy !== '' && $approvedBy === $approvedBy2) {
            return $this->returnErrorData('approved_by_2 ต้องไม่ซ้ำกับ approved_by', 404);
        }

        return null;
    }

    private function normalizeBooleanFlag($value)
    {
        if ($value === null || $value === '') {
            return false;
        }

        return in_array($value, [true, 1, '1', 'true', 'yes', 'on'], true);
    }

    private function normalizeDocumentStatus($value): string
    {
        $status = strtolower(trim((string) $value));

        if ($status === self::STATUS_DRAFT) {
            return self::STATUS_DRAFT;
        }

        return self::STATUS_SUBMITTED;
    }

    private function resolvePurchaseRequisitionUpdateStatus(Request $request, PurchaseRequisitions $pr, bool $wasDraft): string
    {
        if ($wasDraft) {
            return $this->normalizeDocumentStatus($request->input('status', $pr->status ?? self::STATUS_DRAFT));
        }

        if (!$request->has('status')) {
            return (string) ($pr->status ?? self::STATUS_SUBMITTED);
        }

        $requestedStatus = $this->normalizeDocumentStatus($request->input('status'));
        if ($requestedStatus === self::STATUS_DRAFT) {
            return (string) ($pr->status ?? self::STATUS_SUBMITTED);
        }

        return self::STATUS_SUBMITTED;
    }

    private function shouldResetSubmittedPurchaseRequisitionWorkflow(Request $request, bool $wasDraft, bool $isDraft): bool
    {
        if ($isDraft) {
            return false;
        }

        if ($wasDraft) {
            return true;
        }

        return $request->has('status')
            && $this->normalizeDocumentStatus($request->input('status')) === self::STATUS_SUBMITTED;
    }

    private function purchaseRequisitionWorkflowAssigneesChanged(Request $request, PurchaseRequisitions $pr, array $snapshot): bool
    {
        $columns = [
            'requested_by',
            'verified_by_is',
            'verified_by',
            'approved_by',
            'approved_by_2',
            'acknowledged_by',
            'action_by_admin',
        ];

        foreach ($columns as $column) {
            if (!$request->has($column)) {
                continue;
            }

            $currentValue = $this->normalizeWorkflowAssigneeRef($pr->{$column} ?? null);
            $previousValue = $this->normalizeWorkflowAssigneeRef($snapshot[$column] ?? null);

            if ($currentValue !== $previousValue) {
                return true;
            }
        }

        return false;
    }

    private function normalizeWorkflowAssigneeRef($value): string
    {
        return strtolower(trim((string) ($value ?? '')));
    }

    private function isDraftStatus($status): bool
    {
        return $this->normalizeDocumentStatus($status) === self::STATUS_DRAFT;
    }

    private function requiredFieldMissing($value): bool
    {
        return $value === null || trim((string) $value) === '';
    }

    private function validatePurchaseRequisitionRequest(Request $request, bool $isDraft): ?JsonResponse
    {
        if ($isDraft) {
            return null;
        }

        if ($this->requiredFieldMissing($request->to)) {
            return $this->returnErrorData('กรุณาระบุ to', 404);
        }
        if ($this->requiredFieldMissing($request->subject)) {
            return $this->returnErrorData('กรุณาระบุ subject', 404);
        }
        if (mb_strlen(trim((string) $request->subject)) < 6) {
            return $this->returnErrorData('Subject must be more than 5 characters', 422);
        }
        if ($this->requiredFieldMissing($request->date)) {
            return $this->returnErrorData('กรุณาระบุ date', 404);
        }

        $items = $request->items ?? [];
        if (!is_array($items) || count($items) === 0) {
            return $this->returnErrorData('กรุณาระบุ items อย่างน้อย 1 รายการ', 404);
        }

        return null;
    }

    private function draftString($value): string
    {
        return trim((string) ($value ?? ''));
    }

    private function nullableDateTime($value)
    {
        if ($value === null || $value === '') {
            return null;
        }

        return $this->normalizeDateTimeInput($value);
    }

    private function purchaseDocumentNumberService(): PurchaseDocumentNumberService
    {
        return app(PurchaseDocumentNumberService::class);
    }

    private function purchaseRequisitionNumberYear(Request $request, ?PurchaseRequisitions $pr = null): int
    {
        $date = $request->input('date');

        if ($date === null || $date === '') {
            $date = $pr->date ?? $pr->created_at ?? null;
        }

        return $this->purchaseDocumentNumberService()->yearFromDate($date);
    }

    private function getNextPurchaseRequisitionNumber(bool $lock = false, ?int $year = null): string
    {
        $year = $year ?? $this->purchaseDocumentNumberService()->yearFromDate(null);

        return $this->purchaseDocumentNumberService()->next(
            PurchaseRequisitions::class,
            'pr_no',
            self::PR_NUMBER_PREFIX,
            $year,
            $lock
        );
    }

    private function resolvePurchaseRequisitionNumber(Request $request, ?PurchaseRequisitions $pr = null): string
    {
        $service = $this->purchaseDocumentNumberService();
        $year = $this->purchaseRequisitionNumberYear($request, $pr);
        $requestPrNo = trim((string) $request->input('pr_no', ''));

        if ($requestPrNo !== '' && $service->isFormattedNumber($requestPrNo, self::PR_NUMBER_PREFIX, $year)) {
            $requestPrNo = strtoupper($requestPrNo);
            $duplicateQuery = PurchaseRequisitions::withTrashed()->where('pr_no', $requestPrNo);
            if ($pr && $pr->id) {
                $duplicateQuery->where('id', '!=', $pr->id);
            }

            if (!$duplicateQuery->lockForUpdate()->exists()) {
                return $requestPrNo;
            }
        }

        $existingPrNo = trim((string) ($pr->pr_no ?? ''));
        if ($existingPrNo !== '' && $service->isFormattedNumber($existingPrNo, self::PR_NUMBER_PREFIX)) {
            return strtoupper($existingPrNo);
        }

        return $this->getNextPurchaseRequisitionNumber(true, $year);
    }

    private function requestDateOrToday($value): string
    {
        $date = $this->nullableDateTime($value);

        if ($date === null || $date === '') {
            return now()->toDateString();
        }

        return $date;
    }

    private function applyDraftWorkflowDefaults(PurchaseRequisitions $pr): void
    {
        $pr->requested_by_status = null;
        $pr->requested_date = null;
        $pr->verified_by_is_status = null;
        $pr->verified_is_date = null;
        $pr->verified_by_status = null;
        $pr->verified_date = null;
        $pr->approved_by_status = null;
        $pr->approved_date = null;
        $pr->approved_by_2_status = null;
        $pr->approved_by_2_date = null;
        $pr->acknowledged_by_status = null;
        $pr->acknowledged_date = null;
        $pr->action_by_admin_status = null;
        $pr->action_by_admin_date = null;
    }

    private function shouldSkipPurchaseRequisitionItem(array $row, bool $isDraft): bool
    {
        $item = trim((string) ($row['item'] ?? ''));
        $description = trim((string) ($row['description'] ?? ''));
        $unitPrice = isset($row['unit_price']) && is_numeric($row['unit_price']) ? (float) $row['unit_price'] : 0.0;
        $amount = isset($row['amount']) && is_numeric($row['amount']) ? (float) $row['amount'] : 0.0;

        if ($isDraft) {
            return $item === '' &&
                $description === '' &&
                $unitPrice === 0.0 &&
                $amount === 0.0;
        }

        return $item === '' && $description === '';
    }

    private function hasWorkflowAssignee($value): bool
    {
        return $value !== null && trim((string) $value) !== '';
    }

    private function isPositiveNumber($value): bool
    {
        return is_numeric($value) && (float) $value > 0;
    }

    private function isNonNegativeNumber($value): bool
    {
        return is_numeric($value) && (float) $value >= 0;
    }

    private function validateStoredPurchaseRequisitionForSubmit(PurchaseRequisitions $pr): ?JsonResponse
    {
        if ($this->requiredFieldMissing($pr->to)) {
            return $this->returnErrorData('กรุณาระบุ to', 404);
        }
        if ($this->requiredFieldMissing($pr->subject)) {
            return $this->returnErrorData('กรุณาระบุ subject', 404);
        }
        if (mb_strlen(trim((string) $pr->subject)) < 6) {
            return $this->returnErrorData('Subject must be more than 5 characters', 422);
        }
        if ($this->requiredFieldMissing($pr->date)) {
            return $this->returnErrorData('กรุณาระบุ date', 404);
        }
        if ($this->requiredFieldMissing($pr->currency_code)) {
            return $this->returnErrorData('กรุณาระบุ currency_code', 404);
        }
        if ($this->requiredFieldMissing($pr->reasons_for_purchase)) {
            return $this->returnErrorData('กรุณาระบุ reasons_for_purchase', 404);
        }
        if (strlen(trim((string) $pr->reasons_for_purchase)) < 10) {
            return $this->returnErrorData('reasons_for_purchase ต้องมีอย่างน้อย 10 ตัวอักษร', 404);
        }
        if (!$this->hasWorkflowAssignee($pr->requested_by)) {
            return $this->returnErrorData('กรุณาระบุ requested_by', 404);
        }
        if (!$this->hasWorkflowAssignee($pr->verified_by)) {
            return $this->returnErrorData('กรุณาระบุ verified_by', 404);
        }
        if (!$this->hasWorkflowAssignee($pr->approved_by)) {
            return $this->returnErrorData('กรุณาระบุ approved_by', 404);
        }
        if (!$this->hasWorkflowAssignee($pr->acknowledged_by)) {
            return $this->returnErrorData('กรุณาระบุ acknowledged_by', 404);
        }
        if (!$this->hasWorkflowAssignee($pr->action_by_admin)) {
            return $this->returnErrorData('กรุณาระบุ action_by_admin', 404);
        }

        $grandTotal = (float) ($pr->grand_total ?? 0);
        if ($grandTotal > 50000) {
            if (!$this->hasWorkflowAssignee($pr->approved_by_2)) {
                return $this->returnErrorData('กรุณาระบุ approved_by_2 เมื่อยอดรวมเกิน 50,000', 404);
            }
            if ($this->hasWorkflowAssignee($pr->approved_by) && trim((string) $pr->approved_by) === trim((string) $pr->approved_by_2)) {
                return $this->returnErrorData('approved_by_2 ต้องไม่ซ้ำกับ approved_by', 404);
            }
        }

        if ($pr->items->count() === 0) {
            return $this->returnErrorData('กรุณาระบุ items อย่างน้อย 1 รายการ', 404);
        }

        foreach ($pr->items as $index => $item) {
            $rowNo = $index + 1;
            if ($this->requiredFieldMissing($item->description)) {
                return $this->returnErrorData("กรุณาระบุ description ในรายการที่ {$rowNo}", 404);
            }
            if (!$this->isPositiveNumber($item->quantity)) {
                return $this->returnErrorData("กรุณาระบุ quantity ในรายการที่ {$rowNo}", 404);
            }
            if (!$this->isNonNegativeNumber($item->unit_price)) {
                return $this->returnErrorData("กรุณาระบุ unit_price ในรายการที่ {$rowNo}", 404);
            }
        }

        return null;
    }

    public function printPdf($id, Request $request, FrontendPrintPdfService $frontendPrintPdfService)
    {
        $pr = PurchaseRequisitions::with('items')->find($id);

        if (!$pr) {
            return $this->returnErrorData('ไม่พบข้อมูลที่ระบุ', 404);
        }

        try {
            $printNumber = $pr->pr_no ?: (string) $pr->id;
            $content = $frontendPrintPdfService->renderPurchaseRequisitionPdf(
                $pr->id,
                $this->frontendPrintQueryOptions($request)
            );

            return response($content, 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => 'inline; filename="purchase-requisition-' . $printNumber . '.pdf"',
                'Cache-Control' => 'private, max-age=0, must-revalidate',
                'Pragma' => 'public',
            ]);
        } catch (\Throwable $e) {
            Log::error('Purchase requisition PDF generation failed', [
                'id' => $id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return $this->returnErrorData('เกิดข้อผิดพลาดในการสร้างไฟล์ PDF: ' . $e->getMessage(), 500);
        }
    }

    public function previewCombinedPdf(
        $id,
        Request $request,
        PurchaseCombinedPdfService $combinedPdfService,
        FrontendPrintPdfService $frontendPrintPdfService
    ) {
        return $this->combinedPdfResponse($id, $request, $combinedPdfService, $frontendPrintPdfService, 'inline');
    }

    public function downloadCombinedPdf(
        $id,
        Request $request,
        PurchaseCombinedPdfService $combinedPdfService,
        FrontendPrintPdfService $frontendPrintPdfService
    ) {
        return $this->combinedPdfResponse($id, $request, $combinedPdfService, $frontendPrintPdfService, 'attachment');
    }

    private function combinedPdfResponse(
        $id,
        Request $request,
        PurchaseCombinedPdfService $combinedPdfService,
        FrontendPrintPdfService $frontendPrintPdfService,
        string $disposition
    ) {
        $pr = PurchaseRequisitions::with('items')->find($id);

        if (!$pr) {
            return $this->returnErrorData('ไม่พบข้อมูลที่ระบุ', 404);
        }

        try {
            $content = $this->renderCombinedPurchaseRequisitionPdfContent(
                $pr,
                $request,
                $combinedPdfService,
                $frontendPrintPdfService
            );
            $fileName = $this->purchaseRequisitionCombinedPdfFileName($pr);

            return response($content, 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => $disposition . '; filename="' . $fileName . '"',
                'Cache-Control' => 'private, max-age=0, must-revalidate',
                'Pragma' => 'public',
            ]);
        } catch (PdfMergeUserException $e) {
            Log::warning('Purchase requisition combined PDF contains an unsupported attachment', [
                'id' => $id,
                'error' => $e->getMessage(),
            ]);

            try {
                $content = $frontendPrintPdfService->renderPurchaseRequisitionPdf(
                    $pr->id,
                    $this->frontendPrintQueryOptions($request)
                );
                $fileName = $this->purchaseRequisitionCombinedPdfFileName($pr);

                return response($content, 200, [
                    'Content-Type' => 'application/pdf',
                    'Content-Disposition' => $disposition . '; filename="' . $fileName . '"',
                    'Cache-Control' => 'private, max-age=0, must-revalidate',
                    'Pragma' => 'public',
                    'X-Combined-Pdf-Fallback' => 'system-document-only',
                ]);
            } catch (\Throwable $fallbackException) {
                Log::error('Purchase requisition system PDF fallback failed', [
                    'id' => $id,
                    'merge_error' => $e->getMessage(),
                    'error' => $fallbackException->getMessage(),
                    'trace' => $fallbackException->getTraceAsString(),
                ]);

                return $this->returnErrorData('เกิดข้อผิดพลาดในการสร้างไฟล์ PDF: ' . $fallbackException->getMessage(), 500);
            }
        } catch (\Throwable $e) {
            Log::error('Purchase requisition combined PDF generation failed', [
                'id' => $id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return $this->returnErrorData('เกิดข้อผิดพลาดในการรวมไฟล์ PDF: ' . $e->getMessage(), 500);
        }
    }

    private function renderCombinedPurchaseRequisitionPdfContent(
        PurchaseRequisitions $pr,
        Request $request,
        PurchaseCombinedPdfService $combinedPdfService,
        FrontendPrintPdfService $frontendPrintPdfService
    ): string {
        $sources = [[
            'name' => 'purchase-requisition-' . ($pr->pr_no ?: $pr->id),
            'content' => $frontendPrintPdfService->renderPurchaseRequisitionPdf(
                $pr->id,
                $this->frontendPrintQueryOptions($request)
            ),
        ]];

        foreach ($combinedPdfService->attachmentPdfPaths($pr->attachments) as $attachmentPath) {
            $sources[] = ['path' => $attachmentPath];
        }

        return $combinedPdfService->mergePdfSources($sources);
    }

    private function purchaseRequisitionCombinedPdfFileName(PurchaseRequisitions $pr): string
    {
        $baseName = preg_replace('/[^a-zA-Z0-9_.-]+/', '_', $pr->pr_no ?: ('PR-' . $pr->id));
        $baseName = trim((string) $baseName, '._-');

        return ($baseName !== '' ? $baseName : 'purchase-requisition-' . $pr->id) . '_combined.pdf';
    }

    private function frontendPrintQueryOptions(Request $request): array
    {
        return $this->isSignaturePreviewRequest($request)
            ? ['signaturePreview' => '1']
            : [];
    }

    public function renderPurchaseRequisitionPdfContent(PurchaseRequisitions $pr, bool $signaturePreview = false): string
    {
        if (!$pr->relationLoaded('items')) {
            $pr->load('items');
        }

        $tempDir = storage_path('app/mpdf');
        if (!is_dir($tempDir)) {
            mkdir($tempDir, 0775, true);
        }

        $html = view('pdf.purchase-requisition', $this->purchaseRequisitionPrintData(
            $pr,
            $signaturePreview
        ))->render();

        $mpdfConfig = [
            'mode' => 'utf-8',
            'format' => [self::PR_PRINT_PAGE_WIDTH_MM, self::PR_PRINT_PAGE_HEIGHT_MM],
            'margin_left' => 22,
            'margin_right' => 20,
            'margin_top' => 8,
            'margin_bottom' => 12,
            'tempDir' => $tempDir,
        ];

        if ($signatureFontPath = $this->purchaseRequisitionSignatureFontPath()) {
            $fontDirs = (new ConfigVariables())->getDefaults()['fontDir'];
            $fontData = (new FontVariables())->getDefaults()['fontdata'];

            $mpdfConfig['fontDir'] = array_merge($fontDirs, [dirname($signatureFontPath)]);
            $mpdfConfig['fontdata'] = $fontData + [
                'testimonia' => [
                    'R' => basename($signatureFontPath),
                ],
            ];
        }

        $mpdf = new Mpdf($mpdfConfig);
        $mpdf->SetTitle('Purchase Requisition ' . ($pr->pr_no ?: ('#' . $pr->id)));
        $mpdf->SetDisplayMode('fullpage');
        $mpdf->SetHTMLFooter($this->purchaseRequisitionFooterHtml());
        $mpdf->WriteHTML($html);

        return $mpdf->Output('', Destination::STRING_RETURN);
    }

    private function purchaseRequisitionPrintData(PurchaseRequisitions $pr, bool $signaturePreview = false): array
    {
        $currency = $this->normalizeCurrencyCodeInput($pr->currency_code ?? 'THB');
        $items = $pr->items ?? collect();
        $needAsset = $this->normalizeNeedAssetCodeValue($pr->need_asset_code_registration);
        $activeSignatureSettings = $this->activeSignatureSettingsByCodes([
            $pr->requested_by,
            $pr->verified_by_is,
            $pr->verified_by,
            $pr->approved_by,
            $pr->approved_by_2,
            $pr->acknowledged_by,
            $pr->action_by_admin,
        ]);
        $previewDate = $this->signaturePreviewDate($pr);

        return [
            'pr' => $pr,
            'logoPath' => $this->purchaseRequisitionLogoPath(),
            'currency' => $currency,
            'currencyLabel' => $this->printCurrencyLabel($currency),
            'header' => [
                'prNo' => (string) ($pr->pr_no ?? ''),
                'to' => (string) ($pr->to ?? ''),
                'date' => $this->formatPrintDate($pr->date),
                'requestedBy' => $this->employeeDisplayName($pr->requested_by),
                'recommendedBy' => $this->employeeDisplayName($pr->recommended_by),
                'deadline' => $this->formatPrintDate($pr->deadline),
                'receivedFrom' => (string) ($pr->received_from ?? ''),
                'reasonsForPurchase' => (string) ($pr->reasons_for_purchase ?? ''),
            ],
            'items' => $items->map(function ($item) use ($currency) {
                return [
                    'item' => (string) ($item->item ?? ''),
                    'description' => (string) ($item->description ?? ''),
                    'quantity' => $this->formatPrintQuantity($item->quantity ?? null),
                    'unitPrice' => $this->formatPrintAmount($item->unit_price ?? null, $currency),
                    'amount' => $this->formatPrintAmount($item->amount ?? null, $currency),
                ];
            })->values()->all(),
            'totals' => [
                'discount' => $this->formatPrintAmount($pr->discount ?? 0, $currency),
                'discountValue' => is_numeric($pr->discount ?? null) ? (float) $pr->discount : 0.0,
                'subTotal' => $this->formatPrintAmount($pr->sub_total ?? 0, $currency),
                'vat' => $this->formatPrintAmount($pr->vat_value ?? 0, $currency),
                'grandTotal' => $this->formatPrintAmount($pr->grand_total ?? 0, $currency),
            ],
            'terms' => [
                'paymentTerm' => trim((string) ($pr->payment_term ?? '')) !== ''
                    ? (string) $pr->payment_term
                    : self::DEFAULT_PAYMENT_TERM,
                'otherConditions' => (string) ($pr->other_conditions ?? ''),
                'quotationAttached' => $this->normalizeBooleanFlag($pr->quotation_attached ?? false),
            ],
            'approval' => [
                'requestedBy' => $this->purchaseRequisitionSignatureValue($pr->requested_by, $pr->requested_by_status, $pr->requested_date, $activeSignatureSettings, $signaturePreview, true, $previewDate),
                'requestedDate' => $this->purchaseRequisitionSignatureDate($pr->requested_by, $pr->requested_by_status, $pr->requested_date, $signaturePreview, false, $previewDate),
                'verifiedByIS' => $this->purchaseRequisitionSignatureValue($pr->verified_by_is, $pr->verified_by_is_status, $pr->verified_is_date, $activeSignatureSettings, $signaturePreview, false, $previewDate),
                'verifiedByISDate' => $this->purchaseRequisitionSignatureDate($pr->verified_by_is, $pr->verified_by_is_status, $pr->verified_is_date, $signaturePreview, false, $previewDate),
                'verifiedBy' => $this->purchaseRequisitionSignatureValue($pr->verified_by, $pr->verified_by_status, $pr->verified_date, $activeSignatureSettings, $signaturePreview, false, $previewDate),
                'verifiedByDate' => $this->purchaseRequisitionSignatureDate($pr->verified_by, $pr->verified_by_status, $pr->verified_date, $signaturePreview, false, $previewDate),
                'approvedBy' => $this->purchaseRequisitionSignatureValue($pr->approved_by, $pr->approved_by_status, $pr->approved_date, $activeSignatureSettings, $signaturePreview, false, $previewDate),
                'approvedByDate' => $this->purchaseRequisitionSignatureDate($pr->approved_by, $pr->approved_by_status, $pr->approved_date, $signaturePreview, false, $previewDate),
                'approvedBy2' => $this->purchaseRequisitionSignatureValue($pr->approved_by_2, $pr->approved_by_2_status, $pr->approved_by_2_date, $activeSignatureSettings, $signaturePreview, false, $previewDate),
                'approvedBy2Date' => $this->purchaseRequisitionSignatureDate($pr->approved_by_2, $pr->approved_by_2_status, $pr->approved_by_2_date, $signaturePreview, false, $previewDate),
                'showApprovedBy2' => $this->hasWorkflowAssignee($pr->approved_by_2),
                'acknowledgedBy' => $this->purchaseRequisitionSignatureValue($pr->acknowledged_by, $pr->acknowledged_by_status, $pr->acknowledged_date, $activeSignatureSettings, $signaturePreview, false, $previewDate),
                'acknowledgedDate' => $this->purchaseRequisitionSignatureDate($pr->acknowledged_by, $pr->acknowledged_by_status, $pr->acknowledged_date, $signaturePreview, false, $previewDate),
                'needAssetCodeRegistration' => $needAsset,
                'actionByAdmin' => $this->purchaseRequisitionSignatureValue($pr->action_by_admin, $pr->action_by_admin_status, $pr->action_by_admin_date, $activeSignatureSettings, $signaturePreview, false, $previewDate),
                'actionByAdminDate' => $this->purchaseRequisitionSignatureDate($pr->action_by_admin, $pr->action_by_admin_status, $pr->action_by_admin_date, $signaturePreview, false, $previewDate),
            ],
        ];
    }

    private function purchaseRequisitionFooterHtml(): string
    {
        return '<table width="100%" style="border-collapse:collapse;font-family:dejavusans,Arial,sans-serif;font-size:5.6pt;color:#555;">'
            . '<tr>'
            . '<td>' . htmlspecialchars(self::PR_PRINT_FOOTER_TEXT, ENT_QUOTES, 'UTF-8') . '</td>'
            . '<td style="text-align:right;white-space:nowrap;font-size:6.5pt;">Page {PAGENO} of {nbpg}</td>'
            . '</tr>'
            . '</table>';
    }

    private function isSignaturePreviewRequest(Request $request): bool
    {
        foreach (['signature_preview', 'signaturePreview', 'demo_signatures'] as $key) {
            if ($request->has($key) && $this->normalizeBooleanFlag($request->input($key))) {
                return true;
            }
        }

        return false;
    }

    private function purchaseRequisitionLogoPath(): ?string
    {
        $paths = [
            public_path('images/logo/logo-meinharde.png'),
            'H:\\Angular\\e-form\\public\\images\\logo\\logo-meinharde.png',
        ];

        foreach ($paths as $path) {
            if (is_string($path) && file_exists($path)) {
                return $path;
            }
        }

        return null;
    }

    private function purchaseRequisitionSignatureFontPath(): ?string
    {
        $paths = [
            public_path('fonts/testimonia/Testimonia-3zp8X.ttf'),
            'H:\\Angular\\e-form\\public\\fonts\\testimonia\\Testimonia-3zp8X.ttf',
        ];

        foreach ($paths as $path) {
            if (is_string($path) && file_exists($path)) {
                return $path;
            }
        }

        return null;
    }

    private function activeSignatureSettingsByCodes(array $codes): array
    {
        $normalizedCodes = array_values(array_unique(array_filter(array_map(function ($code) {
            return trim((string) ($code ?? ''));
        }, $codes), function ($code) {
            return $code !== '';
        })));

        if (empty($normalizedCodes)) {
            return [];
        }

        $settings = SignatureSetting::with('employee')
            ->where('is_active', 1)
            ->whereIn('employee_code', $normalizedCodes)
            ->get();

        $lookup = [];
        foreach ($settings as $setting) {
            $lookup[strtolower(trim((string) $setting->employee_code))] = $setting;
        }

        return $lookup;
    }

    private function purchaseRequisitionSignatureValue(
        $employeeCode,
        $status,
        $date,
        array $activeSignatureSettings,
        bool $signaturePreview,
        bool $showNameWhenPending,
        string $previewDate
    ): string {
        $code = trim((string) ($employeeCode ?? ''));
        if ($code === '') {
            return '';
        }

        $isSigned = $this->isApprovedStatus($status) || $signaturePreview;
        if (!$isSigned && !$showNameWhenPending) {
            return '';
        }

        $name = $this->employeeDisplayName($code);
        if (!$isSigned) {
            return htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
        }

        $setting = $activeSignatureSettings[strtolower($code)] ?? null;
        if (!$setting) {
            return htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
        }

        $effectiveDate = $this->effectiveSignatureDate($code, $status, $date, $signaturePreview, $previewDate);
        $signatureId = $this->formatPurchaseRequisitionSignatureId($setting->employee_code ?: $code, $effectiveDate);
        $signatureName = $this->signatureSettingEmployeeName($setting) ?: $name;

        return sprintf(
            '<div class="signature-print-block"><div class="signature-name">%s</div>%s</div>',
            htmlspecialchars($signatureName, ENT_QUOTES, 'UTF-8'),
            $signatureId !== ''
                ? '<div class="signature-id">' . htmlspecialchars($signatureId, ENT_QUOTES, 'UTF-8') . '</div>'
                : ''
        );
    }

    private function purchaseRequisitionSignatureDate(
        $employeeCode,
        $status,
        $date,
        bool $signaturePreview,
        bool $showDateWhenPending,
        string $previewDate
    ): string {
        $code = trim((string) ($employeeCode ?? ''));
        if ($code === '') {
            return '';
        }

        if (!$this->isApprovedStatus($status) && !$signaturePreview && !$showDateWhenPending) {
            return '';
        }

        return $this->formatPrintDate($this->effectiveSignatureDate($code, $status, $date, $signaturePreview, $previewDate));
    }

    private function effectiveSignatureDate($employeeCode, $status, $date, bool $signaturePreview, string $previewDate): string
    {
        if ($date !== null && trim((string) $date) !== '') {
            return (string) $date;
        }

        if (($this->isApprovedStatus($status) || $signaturePreview) && trim((string) $employeeCode) !== '') {
            return $previewDate;
        }

        return '';
    }

    private function signaturePreviewDate(PurchaseRequisitions $pr): string
    {
        foreach ([$pr->requested_date, $pr->date, $pr->created_at] as $value) {
            if ($value !== null && trim((string) $value) !== '') {
                return (string) $value;
            }
        }

        return now()->toDateString();
    }

    private function signatureSettingEmployeeName(SignatureSetting $setting): string
    {
        $employee = $setting->employee;
        $firstName = trim((string) ($employee->firstname ?? ''));
        $lastName = trim((string) ($employee->lastname ?? ''));
        $name = trim($firstName . ' ' . $lastName);

        return $name !== '' ? $name : trim((string) $setting->employee_code);
    }

    private function formatPurchaseRequisitionSignatureId($employeeCode, $date): string
    {
        $code = $this->formatSignatureEmployeeCode($employeeCode);
        $dateText = $this->formatSignatureDate($date);

        if ($code === '' || $dateText === '') {
            return '';
        }

        return 'SIGN_ID:' . $code . '-' . $dateText;
    }

    private function formatSignatureEmployeeCode($employeeCode): string
    {
        $normalized = strtoupper(preg_replace('/\s+/', '', trim((string) ($employeeCode ?? ''))));
        if ($normalized === '') {
            return '';
        }

        if (preg_match('/^([A-Z]+)-?(\d+)$/', $normalized, $matches)) {
            return $matches[1] . '-' . $matches[2];
        }

        return $normalized;
    }

    private function formatSignatureDate($value): string
    {
        if ($value === null || trim((string) $value) === '') {
            return '';
        }

        $timestamp = strtotime((string) $value);
        if ($timestamp === false) {
            return '';
        }

        return date('dmy', $timestamp);
    }

    private function employeeDisplayName($employeeCode): string
    {
        $code = trim((string) ($employeeCode ?? ''));
        if ($code === '') {
            return '';
        }

        $employee = Employee::where('code', $code)->first();
        if (!$employee) {
            return $code;
        }

        $name = trim(trim((string) ($employee->firstname ?? '')) . ' ' . trim((string) ($employee->lastname ?? '')));
        return $name !== '' ? $name : $code;
    }

    private function withPurchaseRequisitionEmployeeInfo($items)
    {
        $employeeInfoByCode = $this->purchaseRequisitionEmployeeInfoByCodes(
            $this->collectPurchaseRequisitionEmployeeCodes($items)
        );

        if ($items instanceof \Illuminate\Support\Collection) {
            $items->each(function ($item) use ($employeeInfoByCode) {
                $this->appendPurchaseRequisitionEmployeeInfo($item, $employeeInfoByCode);
            });

            return $items;
        }

        if (is_array($items)) {
            if ($this->isListArray($items)) {
                foreach ($items as &$item) {
                    $this->appendPurchaseRequisitionEmployeeInfo($item, $employeeInfoByCode);
                }
                unset($item);

                return $items;
            }

            $this->appendPurchaseRequisitionEmployeeInfo($items, $employeeInfoByCode);
            return $items;
        }

        if (is_object($items)) {
            $this->appendPurchaseRequisitionEmployeeInfo($items, $employeeInfoByCode);
        }

        return $items;
    }

    private function collectPurchaseRequisitionEmployeeCodes($items): array
    {
        $codes = [];
        $collect = function ($item) use (&$codes) {
            foreach (self::PR_EMPLOYEE_INFO_FIELDS as $field) {
                $code = trim((string) ($this->purchaseRequisitionItemValue($item, $field) ?? ''));
                if ($code !== '') {
                    $codes[strtolower($code)] = $code;
                }
            }
        };

        if ($items instanceof \Illuminate\Support\Collection) {
            $items->each($collect);
        } elseif (is_array($items) && $this->isListArray($items)) {
            foreach ($items as $item) {
                $collect($item);
            }
        } else {
            $collect($items);
        }

        return array_values($codes);
    }

    private function purchaseRequisitionEmployeeInfoByCodes(array $codes): array
    {
        $normalizedCodes = array_values(array_unique(array_filter(array_map(function ($code) {
            return trim((string) ($code ?? ''));
        }, $codes), function ($code) {
            return $code !== '';
        })));

        if (empty($normalizedCodes)) {
            return [];
        }

        $numericCodes = array_values(array_filter($normalizedCodes, function ($code) {
            return ctype_digit((string) $code);
        }));

        $employees = Employee::where(function ($query) use ($normalizedCodes, $numericCodes) {
                $query->whereIn('code', $normalizedCodes);
                if (!empty($numericCodes)) {
                    $query->orWhereIn('id', $numericCodes);
                }
            })
            ->get(['id', 'code', 'initial', 'firstname', 'lastname']);

        $lookup = [];
        foreach ($employees as $employee) {
            $info = $this->formatPurchaseRequisitionEmployeeInfo(
                $employee->code,
                $employee->initial ?? null,
                $employee->firstname ?? null,
                $employee->lastname ?? null
            );

            $lookup[strtolower(trim((string) $employee->code))] = $info;
            $lookup[strtolower(trim((string) $employee->id))] = $info;
        }

        return $lookup;
    }

    private function appendPurchaseRequisitionEmployeeInfo(&$item, array $employeeInfoByCode): void
    {
        foreach (self::PR_EMPLOYEE_INFO_FIELDS as $field) {
            $code = trim((string) ($this->purchaseRequisitionItemValue($item, $field) ?? ''));
            $info = $code !== ''
                ? ($employeeInfoByCode[strtolower($code)] ?? $this->formatPurchaseRequisitionEmployeeInfo($code))
                : null;

            $this->setPurchaseRequisitionItemValue($item, $field . '_initial', $info['initial'] ?? null);
            $this->setPurchaseRequisitionItemValue($item, $field . '_name', $info['name'] ?? null);
            $this->setPurchaseRequisitionItemValue($item, $field . '_label', $info['label'] ?? null);
            $this->setPurchaseRequisitionItemValue($item, $field . '_employee', $info);
        }
    }

    private function formatPurchaseRequisitionEmployeeInfo($code, $initial = null, $firstName = null, $lastName = null): array
    {
        $normalizedCode = trim((string) ($code ?? ''));
        $normalizedInitial = trim((string) ($initial ?? ''));
        $name = trim(trim((string) ($firstName ?? '')) . ' ' . trim((string) ($lastName ?? '')));

        if ($name === '') {
            $name = $normalizedCode;
        }

        $label = trim(implode(', ', array_filter([
            $normalizedInitial !== '' ? rtrim($normalizedInitial, '.') : null,
            $name !== '' ? $name : null,
        ], function ($value) {
            return $value !== null && trim((string) $value) !== '';
        })));

        if ($label === '') {
            $label = $normalizedCode;
        }

        return [
            'code' => $normalizedCode,
            'initial' => $normalizedInitial !== '' ? $normalizedInitial : null,
            'name' => $name,
            'label' => $label,
        ];
    }

    private function purchaseRequisitionItemValue($item, string $field)
    {
        if (is_array($item)) {
            return $item[$field] ?? null;
        }

        if (is_object($item)) {
            return $item->{$field} ?? null;
        }

        return null;
    }

    private function setPurchaseRequisitionItemValue(&$item, string $field, $value): void
    {
        if (is_array($item)) {
            $item[$field] = $value;
            return;
        }

        if ($item instanceof \Illuminate\Database\Eloquent\Model) {
            $item->setAttribute($field, $value);
            return;
        }

        if (is_object($item)) {
            $item->{$field} = $value;
        }
    }

    private function isListArray(array $items): bool
    {
        if ($items === []) {
            return true;
        }

        return array_keys($items) === range(0, count($items) - 1);
    }

    private function formatPrintDate($value): string
    {
        if ($value === null || trim((string) $value) === '') {
            return '';
        }

        $timestamp = strtotime((string) $value);
        if ($timestamp === false) {
            return (string) $value;
        }

        return date('d/m/Y', $timestamp);
    }

    private function formatPrintQuantity($value): string
    {
        $number = is_numeric($value) ? (float) $value : null;
        if ($number === null) {
            return '';
        }

        return rtrim(rtrim(number_format($number, 2, '.', ','), '0'), '.');
    }

    private function formatPrintAmount($value, string $currency): string
    {
        if (!is_numeric($value)) {
            return '';
        }

        $digits = $this->currencyFractionDigits($currency);
        return number_format((float) $value, $digits, '.', ',');
    }

    private function currencyFractionDigits(string $currency): int
    {
        return in_array(strtoupper($currency), ['JPY', 'KRW', 'VND'], true) ? 0 : 2;
    }

    private function printCurrencyLabel(string $currency): string
    {
        $currency = strtoupper($currency);
        return $currency === 'THB' ? 'Baht' : $currency;
    }

    private function isApprovedStatus($status): bool
    {
        $normalized = strtolower(trim((string) ($status ?? '')));
        return in_array($normalized, ['approved', 'approve'], true);
    }

    private function normalizeNeedAssetCodeValue($value): string
    {
        $normalized = strtolower(trim((string) ($value ?? '')));
        if (in_array($normalized, ['1', 'true', 'yes', 'y'], true)) {
            return 'yes';
        }
        if (in_array($normalized, ['0', 'false', 'no', 'n'], true)) {
            return 'no';
        }

        return '';
    }

    private function applySubmittedWorkflowDefaults(PurchaseRequisitions $pr): void
    {
        $pr->requested_by_status = $this->hasWorkflowAssignee($pr->requested_by) ? self::STATUS_APPROVED : null;
        $pr->requested_date = $this->hasWorkflowAssignee($pr->requested_by) ? now()->format('Y-m-d H:i:s') : null;
        $pr->verified_by_is_status = $this->hasWorkflowAssignee($pr->verified_by_is) ? 'pending' : null;
        $pr->verified_is_date = null;
        $pr->verified_by_status = null;
        $pr->verified_date = null;
        $pr->approved_by_status = null;
        $pr->approved_date = null;
        $pr->approved_by_2_status = null;
        $pr->approved_by_2_date = null;
        $pr->acknowledged_by_status = null;
        $pr->acknowledged_date = null;
        $pr->action_by_admin_status = null;
        $pr->action_by_admin_date = null;

        if (!$this->hasWorkflowAssignee($pr->verified_by_is) && $this->hasWorkflowAssignee($pr->verified_by)) {
            $pr->verified_by_status = 'pending';
        }
    }

    private function workflowApprovedValues(): array
    {
        return ['approve', 'approved', 'APPROVE', 'APPROVED', 'Approve', 'Approved'];
    }

    private function workflowRejectedValues(): array
    {
        return ['reject', 'rejected', 'REJECT', 'REJECTED', 'Reject', 'Rejected'];
    }

    private function workflowPendingValues(): array
    {
        return ['pending', 'PENDING', 'Pending'];
    }

    private function workflowError(string $message, int $code): JsonResponse
    {
        return response()->json([
            'code' => (string) $code,
            'status' => false,
            'message' => $message,
            'data' => [],
        ], $code);
    }

    private function normalizeWorkflowStatusValue($value): ?string
    {
        if ($value === null) {
            return null;
        }

        $status = strtolower(trim((string) $value));
        return $status === '' ? null : $status;
    }

    private function isWorkflowApproved($value): bool
    {
        return in_array($this->normalizeWorkflowStatusValue($value), ['approve', 'approved'], true);
    }

    private function isWorkflowRejected($value): bool
    {
        return in_array($this->normalizeWorkflowStatusValue($value), ['reject', 'rejected'], true);
    }

    private function normalizeActionDecision($value): ?string
    {
        $decision = strtolower(trim((string) $value));

        if (in_array($decision, ['approve', 'approved'], true)) {
            return self::STATUS_APPROVED;
        }

        if (in_array($decision, ['reject', 'rejected'], true)) {
            return self::STATUS_REJECTED;
        }

        return null;
    }

    private function actorCodeFromRequest(Request $request): string
    {
        foreach (['employee_code', 'employeeCode', 'user_code', 'code'] as $key) {
            $value = $request->input($key);
            if ($value !== null && trim((string) $value) !== '') {
                return trim((string) $value);
            }
        }

        $extract = function ($source): ?string {
            if (is_object($source)) {
                foreach (['employee_code', 'employeeCode', 'code', 'id', 'user_id', 'username'] as $key) {
                    if (isset($source->{$key}) && trim((string) $source->{$key}) !== '') {
                        return trim((string) $source->{$key});
                    }
                }
            }

            if (is_array($source)) {
                foreach (['employee_code', 'employeeCode', 'code', 'id', 'user_id', 'username'] as $key) {
                    if (isset($source[$key]) && trim((string) $source[$key]) !== '') {
                        return trim((string) $source[$key]);
                    }
                }
            }

            return null;
        };

        $loginByCode = $extract($request->login_by ?? null);
        if ($loginByCode !== null) {
            return $loginByCode;
        }

        $payload = $this->jwtPayloadFromRequest($request);
        $tokenLoginByCode = $payload && isset($payload->lun) ? $extract($payload->lun) : null;
        if ($tokenLoginByCode !== null) {
            return $tokenLoginByCode;
        }

        return $this->resolveActorId($request);
    }

    private function codesMatch($left, $right): bool
    {
        return strtolower(trim((string) $left)) === strtolower(trim((string) $right));
    }

    private function purchaseRequisitionWorkflowSteps(): array
    {
        return [
            ['by' => 'verified_by_is', 'status' => 'verified_by_is_status'],
            ['by' => 'verified_by', 'status' => 'verified_by_status'],
            ['by' => 'approved_by', 'status' => 'approved_by_status'],
            ['by' => 'approved_by_2', 'status' => 'approved_by_2_status'],
            ['by' => 'acknowledged_by', 'status' => 'acknowledged_by_status'],
        ];
    }

    private function purchaseRequisitionActionSteps(): array
    {
        return [
            ['type' => 'verified_by_is_status', 'by' => 'verified_by_is', 'status' => 'verified_by_is_status', 'date' => 'verified_is_date'],
            ['type' => 'verified_by_status', 'by' => 'verified_by', 'status' => 'verified_by_status', 'date' => 'verified_date'],
            ['type' => 'approved_by_status', 'by' => 'approved_by', 'status' => 'approved_by_status', 'date' => 'approved_date'],
            ['type' => 'approved_by_2_status', 'by' => 'approved_by_2', 'status' => 'approved_by_2_status', 'date' => 'approved_by_2_date'],
            ['type' => 'acknowledged_by_status', 'by' => 'acknowledged_by', 'status' => 'acknowledged_by_status', 'date' => 'acknowledged_date'],
            ['type' => 'action_by_admin', 'by' => 'action_by_admin', 'status' => 'action_by_admin_status', 'date' => 'action_by_admin_date'],
        ];
    }

    private function currentPurchaseRequisitionActionStep(PurchaseRequisitions $pr): ?array
    {
        foreach ($this->purchaseRequisitionActionSteps() as $step) {
            if (!$this->hasWorkflowAssignee($pr->{$step['by']} ?? null)) {
                continue;
            }

            if (!$this->isWorkflowApproved($pr->{$step['status']} ?? null)) {
                return $step;
            }
        }

        return null;
    }

    private function nextPurchaseRequisitionActionStep(PurchaseRequisitions $pr, string $currentType): ?array
    {
        $foundCurrent = false;

        foreach ($this->purchaseRequisitionActionSteps() as $step) {
            if (!$foundCurrent) {
                $foundCurrent = $step['type'] === $currentType;
                continue;
            }

            if ($this->hasWorkflowAssignee($pr->{$step['by']} ?? null)) {
                return $step;
            }
        }

        return null;
    }

    private function purchaseRequisitionWorkflowSnapshot(PurchaseRequisitions $pr): array
    {
        $columns = [
            'status',
            'requested_by',
            'requested_by_status',
            'requested_date',
            'verified_by_is',
            'verified_by_is_status',
            'verified_is_date',
            'verified_by',
            'verified_by_status',
            'verified_date',
            'approved_by',
            'approved_by_status',
            'approved_date',
            'approved_by_2',
            'approved_by_2_status',
            'approved_by_2_date',
            'acknowledged_by',
            'acknowledged_by_status',
            'acknowledged_date',
            'action_by_admin',
            'action_by_admin_status',
            'action_by_admin_date',
        ];

        $snapshot = [];
        foreach ($columns as $column) {
            $snapshot[$column] = $pr->{$column} ?? null;
        }

        return $snapshot;
    }

    private function restorePurchaseRequisitionWorkflow(PurchaseRequisitions $pr, array $snapshot): void
    {
        foreach ($snapshot as $column => $value) {
            $pr->{$column} = $value;
        }
    }

    private function applyApprovedPurchaseRequisitionFilter($query): void
    {
        $approved = $this->workflowApprovedValues();

        $query->where(function ($q) {
            $q->whereNull('status')
                ->orWhere('status', '!=', self::STATUS_DRAFT);
        });

        foreach ($this->purchaseRequisitionWorkflowSteps() as $step) {
            $query->where(function ($q) use ($step, $approved) {
                $q->whereNull($step['by'])
                    ->orWhere($step['by'], '')
                    ->orWhereIn($step['status'], $approved);
            });
        }

        $query->where(function ($q) {
            $q->whereNull('action_by_admin')
                ->orWhere('action_by_admin', '')
                ->orWhereNotNull('action_by_admin_date');
        });

        $query->where(function ($q) {
            foreach ($this->purchaseRequisitionWorkflowSteps() as $step) {
                $q->orWhere(function ($sub) use ($step) {
                    $sub->whereNotNull($step['by'])
                        ->where($step['by'], '!=', '');
                });
            }

            $q->orWhere(function ($sub) {
                $sub->whereNotNull('action_by_admin')
                    ->where('action_by_admin', '!=', '');
            });
        });
    }

    private function applyRejectedPurchaseRequisitionFilter($query): void
    {
        $rejected = $this->workflowRejectedValues();

        $query->where(function ($q) {
            $q->whereNull('status')
                ->orWhere('status', '!=', self::STATUS_DRAFT);
        });

        $query->where(function ($q) use ($rejected) {
            foreach ($this->purchaseRequisitionWorkflowSteps() as $step) {
                $q->orWhereIn($step['status'], $rejected);
            }
        });
    }

    private function applyPendingPurchaseRequisitionFilter($query, string $actorCode = ''): void
    {
        $rejected = $this->workflowRejectedValues();
        $approved = $this->workflowApprovedValues();
        $pending = $this->workflowPendingValues();

        $query->where(function ($q) {
            $q->whereNull('status')
                ->orWhere('status', '!=', self::STATUS_DRAFT);
        });

        $query->where(function ($q) use ($rejected) {
            foreach ($this->purchaseRequisitionWorkflowSteps() as $step) {
                $q->where(function ($sub) use ($step, $rejected) {
                    $sub->whereNull($step['status'])
                        ->orWhereNotIn($step['status'], $rejected);
                });
            }
        });

        $query->where(function ($q) use ($approved, $pending) {
            foreach ($this->purchaseRequisitionWorkflowSteps() as $step) {
                $q->orWhere(function ($sub) use ($step, $approved, $pending) {
                    $sub->whereNotNull($step['by'])
                        ->where($step['by'], '!=', '')
                        ->where(function ($statusQuery) use ($step, $approved, $pending) {
                            $statusQuery->whereNull($step['status'])
                                ->orWhere($step['status'], '')
                                ->orWhereIn($step['status'], $pending)
                                ->orWhereNotIn($step['status'], $approved);
                        });
                });
            }

            $q->orWhere(function ($sub) {
                $sub->whereNotNull('action_by_admin')
                    ->where('action_by_admin', '!=', '')
                    ->whereNull('action_by_admin_date');
            });
        });

        if ($actorCode === '') {
            return;
        }

        $query->where(function ($q) use ($actorCode, $approved, $pending) {
            $q->where('create_by', $actorCode);

            foreach ($this->purchaseRequisitionWorkflowSteps() as $step) {
                $q->orWhere(function ($sub) use ($step, $actorCode, $approved, $pending) {
                    $sub->where($step['by'], $actorCode)
                        ->where(function ($statusQuery) use ($step, $approved, $pending) {
                            $statusQuery->whereNull($step['status'])
                                ->orWhere($step['status'], '')
                                ->orWhereIn($step['status'], $pending)
                                ->orWhereNotIn($step['status'], $approved);
                        });
                });
            }

            $q->orWhere(function ($sub) use ($actorCode) {
                $sub->where('action_by_admin', $actorCode)
                    ->whereNull('action_by_admin_date');
            });
        });
    }

    private function applyPurchaseRequisitionActorActionFilter($query, string $actorCode): void
    {
        if ($actorCode === '') {
            $query->whereRaw('1 = 0');
            return;
        }

        $approved = $this->workflowApprovedValues();
        $rejected = $this->workflowRejectedValues();
        $pending = $this->workflowPendingValues();
        $steps = $this->purchaseRequisitionActionSteps();

        $query->where(function ($statusQuery) {
            $statusQuery->whereNull('status')
                ->orWhere('status', '!=', self::STATUS_DRAFT);
        });

        foreach ($steps as $step) {
            $query->where(function ($statusQuery) use ($step, $rejected) {
                $statusQuery->whereNull($step['status'])
                    ->orWhereNotIn($step['status'], $rejected);
            });
        }

        $query->where(function ($actionQuery) use ($actorCode, $approved, $pending, $steps) {
            foreach ($steps as $index => $step) {
                $actionQuery->orWhere(function ($stepQuery) use ($actorCode, $approved, $pending, $steps, $index, $step) {
                    $stepQuery->where($step['by'], $actorCode)
                        ->where(function ($statusQuery) use ($step, $pending) {
                            $statusQuery->whereNull($step['status'])
                                ->orWhere($step['status'], '')
                                ->orWhereIn($step['status'], $pending);
                        });

                    if ($step['type'] === 'action_by_admin') {
                        $stepQuery->whereNull($step['date'])
                            ->whereIn('acknowledged_by_status', $approved);
                    }

                    foreach (array_slice($steps, 0, $index) as $previousStep) {
                        $stepQuery->where(function ($previousQuery) use ($previousStep, $approved) {
                            $previousQuery->whereIn($previousStep['status'], $approved)
                                ->orWhere(function ($unusedStepQuery) use ($previousStep) {
                                    $unusedStepQuery->where(function ($assigneeQuery) use ($previousStep) {
                                        $assigneeQuery->whereNull($previousStep['by'])
                                            ->orWhere($previousStep['by'], '');
                                    })->where(function ($statusQuery) use ($previousStep) {
                                        $statusQuery->whereNull($previousStep['status'])
                                            ->orWhere($previousStep['status'], '');
                                    });
                                });
                        });
                    }
                });
            }
        });
    }

    private function applyPurchaseRequisitionRequestFilters($query, Request $request, array $columns): void
    {
        $search = $request->input('search.value');
        if (!empty($search)) {
            $keyword = '%' . $search . '%';
            $query->where(function ($q) use ($keyword, $columns, $search) {
                foreach ($columns as $column) {
                    $q->orWhere($column, 'like', $keyword);
                }
                $this->orWherePurchaseRequisitionEmployeeNameMatches($q, (string) $search, [
                    'requested_by', 'create_by', 'verified_by_is', 'verified_by',
                    'approved_by', 'approved_by_2', 'acknowledged_by', 'action_by_admin',
                ]);
            });
        }

        $filters = $request->input('filters', []);
        $status = '';
        $tab = '';
        if (is_array($filters)) {
            $status = strtolower(trim((string) ($filters['status'] ?? $filters['workflowStatus'] ?? '')));
            $tab = strtolower(trim((string) ($filters['tab'] ?? '')));
        }

        if ($tab === 'my') {
            $actorCode = $this->actorCodeFromRequest($request);
            if ($actorCode === '') {
                $query->whereRaw('1 = 0');
            } else {
                $query->where(function ($ownerQuery) use ($actorCode) {
                    $ownerQuery->where('create_by', $actorCode)
                        // Historical PR rows were stamped create_by=admin,
                        // while requested_by retained the employee code.
                        ->orWhere('requested_by', $actorCode);
                });
            }
        } elseif ($tab === 'pending') {
            $actorCode = $this->actorCodeFromRequest($request);
            if ($actorCode === '') {
                $query->whereRaw('1 = 0');
            } else {
                $this->applyPendingPurchaseRequisitionFilter($query, $actorCode);
            }
        } elseif ($tab === 'action') {
            $this->applyPurchaseRequisitionActorActionFilter(
                $query,
                $this->actorCodeFromRequest($request)
            );
        }

        if ($status === '') {
            $status = strtolower(trim((string) ($request->approved_by_status ?? '')));
        }

        if ($status === 'approved') {
            $status = 'approve';
        } elseif ($status === 'rejected') {
            $status = 'reject';
        }

        if ($status === self::STATUS_DRAFT) {
            $query->where('status', self::STATUS_DRAFT);
        } elseif ($status === 'approve') {
            $this->applyApprovedPurchaseRequisitionFilter($query);
        } elseif ($status === 'reject') {
            $this->applyRejectedPurchaseRequisitionFilter($query);
        } elseif ($status === 'pending' && $tab !== 'pending') {
            $this->applyPendingPurchaseRequisitionFilter($query);
        }
    }

    private function purchaseRequisitionWorkflowSortExpression(): string
    {
        return "CASE
            WHEN LOWER(COALESCE(status, '')) = 'draft' THEN 'Draft'
            WHEN LOWER(COALESCE(verified_by_is_status, '')) IN ('reject', 'rejected')
              OR LOWER(COALESCE(verified_by_status, '')) IN ('reject', 'rejected')
              OR LOWER(COALESCE(approved_by_status, '')) IN ('reject', 'rejected')
              OR LOWER(COALESCE(approved_by_2_status, '')) IN ('reject', 'rejected')
              OR LOWER(COALESCE(acknowledged_by_status, '')) IN ('reject', 'rejected') THEN 'Rejected'
            WHEN (COALESCE(verified_by_is, '') <> '' OR COALESCE(verified_by, '') <> '' OR COALESCE(approved_by, '') <> '' OR COALESCE(approved_by_2, '') <> '' OR COALESCE(acknowledged_by, '') <> '' OR COALESCE(action_by_admin, '') <> '')
              AND (COALESCE(verified_by_is, '') = '' OR LOWER(COALESCE(verified_by_is_status, '')) IN ('approve', 'approved'))
              AND (COALESCE(verified_by, '') = '' OR LOWER(COALESCE(verified_by_status, '')) IN ('approve', 'approved'))
              AND (COALESCE(approved_by, '') = '' OR LOWER(COALESCE(approved_by_status, '')) IN ('approve', 'approved'))
              AND (COALESCE(approved_by_2, '') = '' OR LOWER(COALESCE(approved_by_2_status, '')) IN ('approve', 'approved'))
              AND (COALESCE(acknowledged_by, '') = '' OR LOWER(COALESCE(acknowledged_by_status, '')) IN ('approve', 'approved'))
              AND (COALESCE(action_by_admin, '') = '' OR action_by_admin_date IS NOT NULL) THEN 'Approved'
            ELSE 'Pending'
        END";
    }

    private function applyPurchaseRequisitionEmployeeOrder($query, string $column, string $direction): void
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
                        $employeeQuery->whereColumn('employees.code', 'purchase_requisitions.' . $column)
                            ->orWhereColumn('employees.id', 'purchase_requisitions.' . $column);
                    })
                    ->limit(1),
                $direction
            );
        }

        $query->orderBy($column, $direction);
    }

    private function purchaseRequisitionActionStepSortExpression(string $actorCode): array
    {
        $labels = [
            'verified_by_is_status' => 'Verified By IS',
            'verified_by_status' => 'Verified By',
            'approved_by_status' => 'Approved By',
            'approved_by_2_status' => 'Approved By 2',
            'acknowledged_by_status' => 'Acknowledged By',
            'action_by_admin' => 'Action By',
        ];
        $cases = [];
        $bindings = [];
        foreach ($this->purchaseRequisitionActionSteps() as $step) {
            $cases[] = "WHEN {$step['by']} = ? AND LOWER(TRIM(COALESCE({$step['status']}, ''))) IN ('', 'pending') THEN '" . $labels[$step['type']] . "'";
            $bindings[] = $actorCode;
        }

        return ['CASE ' . implode(' ', $cases) . " ELSE '' END", $bindings];
    }

    private function purchaseRequisitionActionStatusSortExpression(string $actorCode): array
    {
        $cases = [];
        $bindings = [];
        foreach ($this->purchaseRequisitionActionSteps() as $step) {
            $cases[] = "WHEN {$step['by']} = ? AND LOWER(TRIM(COALESCE({$step['status']}, ''))) IN ('', 'pending') THEN 'Pending'";
            $bindings[] = $actorCode;
        }

        return ['CASE ' . implode(' ', $cases) . " ELSE '' END", $bindings];
    }

    private function orWherePurchaseRequisitionEmployeeNameMatches($query, string $searchValue, array $referenceColumns): void
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
                        $referenceQuery->orWhereColumn('employees.code', 'purchase_requisitions.' . $column)
                            ->orWhereColumn('employees.id', 'purchase_requisitions.' . $column);
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

    // ================= getList =================
    public function getList()
    {
        $Item = PurchaseRequisitions::with('items')
            ->orderBy('pr_no', 'desc')
            ->orderBy('id', 'desc')
            ->get()
            ->toArray();

        foreach ($Item as $i => $v) {
            $Item[$i]['No'] = $i + 1;
        }

        $Item = $this->withPurchaseRequisitionEmployeeInfo($Item);

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $Item);
    }

    // ================= getPage (DataTable) =================
    public function getPage(Request $request)
    {
        $columns = $request->columns;
        $length  = (int) ($request->length ?? 10);
        if ($length <= 0) {
            $length = 10;
        } elseif ($length > 100) {
            $length = 100;
        }
        $order   = $request->order;
        $search  = $request->search;
        $start   = max(0, (int) ($request->start ?? 0));
        $page    = (int) floor($start / $length) + 1;

        $col = [
            'id',
            'status',
            'pr_no',
            'to',
            'subject',
            'date',
            'deadline',
            'attachments',
            'recommended_by',
            'vat',
            'currency_code',
            'received_from',
            'reasons_for_purchase',
            'other_conditions',
            'payment_term',
            'quotation_attached',
            'requested_by',
            'requested_by_status',
            'requested_date',
            'verified_by_is',
            'approved_by',
            'approved_by_status',
            'approved_date',
            'verified_is_date',
            'verified_by_is_status',
            'verified_by',
            'verified_by_status',
            'verified_date',
            'approved_by_2',
            'approved_by_2_status',
            'approved_by_2_date',
            'acknowledged_by',
            'acknowledged_by_status',
            'acknowledged_date',
            'need_asset_code_registration',
            'action_by_admin',
            'action_by_admin_status',
            'action_by_admin_date',
            'create_by',
            'update_by',
            'created_at',
            'updated_at',
            'deleted_at',
            'sub_total',
            'vat_value',
            'discount',
            'grand_total'
        ];

        $orderby = [
            'pr_no',
            'status',
            'subject',
            'created_at',
            'to',
            'requested_by',
            'grand_total',
            'approved_by_2',
        ];

        $D = PurchaseRequisitions::select($col);

        $this->applyPurchaseRequisitionRequestFilters($D, $request, $col);

        $filters = $request->input('filters', []);
        $tab = is_array($filters) ? strtolower(trim((string) ($filters['tab'] ?? ''))) : '';
        $actorCode = $this->actorCodeFromRequest($request);

        $ordered = false;
        if (!empty($order)) {
            $idx = $order[0]['column'];
            $dir = strtolower((string) ($order[0]['dir'] ?? 'desc')) === 'asc' ? 'asc' : 'desc';
            if ($tab === 'action') {
                $actionIndex = (int) $idx;
                if ($actionIndex === 0) {
                    $D->orderBy('pr_no', $dir);
                    $ordered = true;
                } elseif ($actionIndex === 1) {
                    $D->orderBy('subject', $dir);
                    $ordered = true;
                } elseif ($actionIndex === 2) {
                    $this->applyPurchaseRequisitionEmployeeOrder($D, 'requested_by', $dir);
                    $ordered = true;
                } elseif ($actionIndex === 3) {
                    $D->orderBy('to', $dir);
                    $ordered = true;
                } elseif ($actionIndex === 4) {
                    $D->orderByRaw('COALESCE(created_at, date) ' . $dir);
                    $ordered = true;
                } elseif ($actionIndex === 5) {
                    $D->orderBy('grand_total', $dir);
                    $ordered = true;
                } elseif ($actionIndex === 6 && $actorCode !== '') {
                    [$expression, $bindings] = $this->purchaseRequisitionActionStepSortExpression($actorCode);
                    $D->orderByRaw($expression . ' ' . $dir, $bindings);
                    $ordered = true;
                } elseif ($actionIndex === 7 && $actorCode !== '') {
                    [$expression, $bindings] = $this->purchaseRequisitionActionStatusSortExpression($actorCode);
                    $D->orderByRaw($expression . ' ' . $dir, $bindings);
                    $ordered = true;
                }
            } elseif ((int) $idx === 1) {
                $D->orderByRaw($this->purchaseRequisitionWorkflowSortExpression() . ' ' . $dir)
                    ->orderBy('id', 'desc');
                $ordered = true;
            } elseif (in_array((int) $idx, [5, 7], true)) {
                $this->applyPurchaseRequisitionEmployeeOrder($D, $orderby[$idx], $dir);
                $D->orderBy('id', 'desc');
                $ordered = true;
            } elseif (isset($orderby[$idx]) && $orderby[$idx] !== '') {
                $D->orderBy($orderby[$idx], $dir)
                    ->orderBy('id', 'desc');
                $ordered = true;
            }
        }

        if (!$ordered) {
            $D->orderBy('pr_no', 'desc')
                ->orderBy('id', 'desc');
        } elseif ($tab === 'action') {
            $D->orderBy('id', 'desc');
        }

        $data = $D->paginate($length, ['*'], 'page', $page);

        if ($data->isNotEmpty()) {
            $no = (($page - 1) * $length);
            foreach ($data as $row) {
                $row->No = ++$no;
            }
        }

        $data->setCollection(
            $this->withPurchaseRequisitionEmployeeInfo($data->getCollection())
        );

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $data);
    }

    // ================= show =================
    public function show($id)
    {
        $Item = PurchaseRequisitions::with('items')->find($id);

        if (!$Item) {
            return $this->returnErrorData('ไม่พบข้อมูลที่ระบุ', 404);
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $this->withPurchaseRequisitionEmployeeInfo($Item));
    }

    // ================= store =================
    public function store(Request $request)
    {
        $actorCode = $this->actorCodeFromRequest($request);
        $status = $this->normalizeDocumentStatus($request->input('status', self::STATUS_SUBMITTED));
        $isDraft = $this->isDraftStatus($status);

        if ($validationError = $this->validatePurchaseRequisitionRequest($request, $isDraft)) {
            return $validationError;
        }

        if (!$isDraft && ($error = $this->validateSecondApproverForTotal($request))) {
            return $error;
        }

        $normalizedAttachments = $this->normalizeAttachments($request->input('attachments'));
        if ($attachmentError = $this->validatePdfOnlyAttachments($normalizedAttachments)) {
            return $attachmentError;
        }

        DB::beginTransaction();

        try {
            $pr = new PurchaseRequisitions();
            $pr->status                  = $status;
            $pr->to                      = $isDraft ? $this->draftString($request->to ?? null) : $request->to;
            $pr->subject                 = $request->subject;
            $pr->date                    = $this->requestDateOrToday($request->date ?? null);
            $pr->pr_no                   = $this->resolvePurchaseRequisitionNumber($request, $pr);
            $pr->deadline                = $request->deadline;
            $pr->recommended_by          = $request->recommended_by;
            $pr->received_from           = $request->received_from;
            $pr->reasons_for_purchase    = $request->reasons_for_purchase;
            $pr->other_conditions        = $request->other_conditions;
            $pr->payment_term            = $request->has('payment_term') ? $request->payment_term : self::DEFAULT_PAYMENT_TERM;
            $pr->quotation_attached      = $request->quotation_attached;

            $pr->attachments = $this->encodeAttachments($normalizedAttachments);

            $pr->requested_by            = $request->requested_by;
            $pr->requested_by_status     = $request->requested_by_status;
            $pr->requested_date          = $this->normalizeDateTimeInput($request->requested_date);

            $pr->verified_by_is          = $request->verified_by_is;
            $pr->verified_by_is_status   = $request->verified_by_is_status;
            $pr->verified_is_date        = $this->normalizeDateTimeInput($request->verified_is_date);

            $pr->verified_by             = $request->verified_by;
            $pr->verified_by_status      = $request->verified_by_status;
            $pr->verified_date           = $this->normalizeDateTimeInput($request->verified_date);

            $pr->approved_by             = $request->approved_by;
            $pr->approved_by_status      = $request->approved_by_status;
            $pr->approved_date           = $this->normalizeDateTimeInput($request->approved_date);

            if ((float) $request->grand_total > 50000) {
                $pr->approved_by_2        = $request->approved_by_2;
                $pr->approved_by_2_status = $request->approved_by_2_status ?? 'pending';
                $pr->approved_by_2_date   = $this->normalizeDateTimeInput($request->approved_by_2_date);
            }

            $pr->acknowledged_by         = $request->acknowledged_by;
            $pr->acknowledged_by_status  = $request->acknowledged_by_status;
            $pr->acknowledged_date       = $this->normalizeDateTimeInput($request->acknowledged_date);

            $pr->need_asset_code_registration = $request->need_asset_code_registration;
            $pr->action_by_admin              = $request->action_by_admin;
            $pr->action_by_admin_status       = $request->action_by_admin_status;
            $pr->action_by_admin_date         = $this->normalizeDateTimeInput($request->action_by_admin_date);

            if ($isDraft) {
                $this->applyDraftWorkflowDefaults($pr);
            }

            $pr->vat = $request->boolean('vat');
            $pr->currency_code = $this->normalizeCurrencyCodeInput($request->input('currency_code'));

            $pr->sub_total   = $request->sub_total;
            $pr->vat_value   = $request->vat_value;
            $pr->discount    = $request->discount ?? 0;
            $pr->grand_total = $request->grand_total;

            // Keep ownership aligned with the actor resolution used by the
            // My Requests filter. Some production routes resolve the actor
            // directly from the JWT and do not inject login_by.
            $pr->create_by = $actorCode !== '' ? $actorCode : 'admin';
            $pr->save();
            $pr->attachments = $normalizedAttachments;

            // ------- items -------
            foreach (($request->items ?? []) as $row) {
                if (is_object($row)) $row = (array)$row;

                if (!is_array($row) || $this->shouldSkipPurchaseRequisitionItem($row, $isDraft)) {
                    continue;
                }

                $item = new PurchaseRequisitionItems();
                $item->purchase_requisition_id = $pr->id;
                $item->item        = trim((string) ($row['item'] ?? ''));
                $item->description = $row['description'] ?? null;
                $item->quantity    = $row['quantity'] ?? 0;
                $item->unit_price  = $row['unit_price'] ?? 0;
                $item->amount      = $row['amount'] ?? (
                    ($row['quantity'] ?? 0) * ($row['unit_price'] ?? 0)
                );
                $item->need_asset_code_registration = $this->normalizeBooleanFlag($row['need_asset_code_registration'] ?? false);
                $item->create_by   = $actorCode !== '' ? $actorCode : 'admin';
                $item->save();
            }

            $this->logDocumentCreateAudit($request, $pr);

            DB::commit();
            return $this->returnSuccess(
                'บันทึกข้อมูลสำเร็จ',
                $this->withPurchaseRequisitionEmployeeInfo($pr->load('items'))
            );

        } catch (\Throwable $e) {
            Log::error('PurchaseRequisitions store failed', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด ' . $e->getMessage(), 500);
        }
    }

    // ================= update =================
    public function update(Request $request, $id)
    {
        $loginBy = $request->login_by;

        DB::beginTransaction();

        try {
            $pr = PurchaseRequisitions::with('items')->lockForUpdate()->find($id);
            if (!$pr) {
                return $this->returnErrorData('ไม่พบข้อมูล', 404);
            }

            $oldActionValues = $this->purchaseRequisitionActionValues($pr);
            $workflowSnapshot = $this->purchaseRequisitionWorkflowSnapshot($pr);
            $wasDraft = $this->isDraftStatus($pr->status);
            $status = $this->resolvePurchaseRequisitionUpdateStatus($request, $pr, $wasDraft);
            $isDraft = $this->isDraftStatus($status);

            if ($validationError = $this->validatePurchaseRequisitionRequest($request, $isDraft)) {
                DB::rollBack();
                return $validationError;
            }

            if (!$isDraft && ($error = $this->validateSecondApproverForTotal($request, $pr->grand_total))) {
                DB::rollBack();
                return $error;
            }

            // header เหมือน store (เช็ค required ตามที่ต้องการเองได้)
            $pr->status                  = $status;
            $pr->to                      = $isDraft ? $this->draftString($request->to ?? null) : ($request->to ?? $pr->to);
            $pr->subject                 = $request->has('subject') ? $request->subject : $pr->subject;
            $pr->date                    = $isDraft ? $this->requestDateOrToday($request->date ?? null) : ($request->date ?? $pr->date);
            $pr->pr_no                   = $this->resolvePurchaseRequisitionNumber($request, $pr);
            $pr->deadline                = $request->deadline;
            $pr->recommended_by          = $request->recommended_by;
            $pr->received_from           = $request->received_from;
            $pr->reasons_for_purchase    = $request->reasons_for_purchase;
            $pr->other_conditions        = $request->other_conditions;
            if ($request->has('payment_term')) {
                $pr->payment_term = $request->payment_term;
            } elseif ($pr->payment_term === null) {
                $pr->payment_term = self::DEFAULT_PAYMENT_TERM;
            }
            $pr->quotation_attached      = $request->quotation_attached;

            if ($request->has('attachments')) {
                $attachments = $request->input('attachments');
                $normalizedAttachments = $this->normalizeAttachments($attachments);
                if ($attachmentError = $this->validatePdfOnlyAttachments($normalizedAttachments)) {
                    DB::rollBack();
                    return $attachmentError;
                }
                $pr->attachments = $this->encodeAttachments($normalizedAttachments);
            }

            if ($request->has('vat')) {
                $pr->vat = $request->boolean('vat');
            }

            if ($request->has('currency_code')) {
                $pr->currency_code = $this->normalizeCurrencyCodeInput($request->currency_code, $pr->currency_code ?? 'THB');
            }

            if ($request->has('sub_total'))   $pr->sub_total   = $request->sub_total;
            if ($request->has('vat_value'))   $pr->vat_value   = $request->vat_value;
            if ($request->has('discount'))    $pr->discount    = $request->discount ?? 0;
            if ($request->has('grand_total')) $pr->grand_total = $request->grand_total;

            $pr->requested_by            = $request->requested_by;
            $pr->requested_by_status     = $request->requested_by_status;
            $pr->requested_date          = $this->normalizeDateTimeInput($request->requested_date);

            $pr->verified_by_is          = $request->verified_by_is;
            $pr->verified_by_is_status   = $request->verified_by_is_status;
            $pr->verified_is_date        = $this->normalizeDateTimeInput($request->verified_is_date);

            $pr->verified_by             = $request->verified_by;
            $pr->verified_by_status      = $request->verified_by_status;
            $pr->verified_date           = $this->normalizeDateTimeInput($request->verified_date);

            $pr->approved_by             = $request->approved_by;
            $pr->approved_by_status      = $request->approved_by_status;
            $pr->approved_date           = $this->normalizeDateTimeInput($request->approved_date);

            $effectiveGrandTotal = $request->has('grand_total') ? (float) $request->grand_total : (float) $pr->grand_total;
            if ($effectiveGrandTotal > 50000) {
                $pr->approved_by_2        = $request->approved_by_2;
                $pr->approved_by_2_status = $request->approved_by_2_status ?? $pr->approved_by_2_status ?? 'pending';
                $pr->approved_by_2_date   = $this->normalizeDateTimeInput($request->approved_by_2_date ?? $pr->approved_by_2_date);
            } else {
                $pr->approved_by_2        = null;
                $pr->approved_by_2_status = null;
                $pr->approved_by_2_date   = null;
            }

            $pr->acknowledged_by         = $request->acknowledged_by;
            $pr->acknowledged_by_status  = $request->acknowledged_by_status;
            $pr->acknowledged_date       = $this->normalizeDateTimeInput($request->acknowledged_date);

            $pr->need_asset_code_registration = $request->need_asset_code_registration;
            $pr->action_by_admin              = $request->action_by_admin;
            $pr->action_by_admin_status       = $request->action_by_admin_status;
            $pr->action_by_admin_date         = $this->normalizeDateTimeInput($request->action_by_admin_date);

            $workflowAssigneesChanged = $this->purchaseRequisitionWorkflowAssigneesChanged($request, $pr, $workflowSnapshot);

            if ($isDraft) {
                $this->applyDraftWorkflowDefaults($pr);
            } elseif ($this->shouldResetSubmittedPurchaseRequisitionWorkflow($request, $wasDraft, $isDraft) || $workflowAssigneesChanged) {
                $pr->status = self::STATUS_SUBMITTED;
                $this->applySubmittedWorkflowDefaults($pr);
            } else {
                $this->restorePurchaseRequisitionWorkflow($pr, $workflowSnapshot);
            }

            $pr->update_by = $loginBy->employee_code ?? $loginBy->id ?? 'admin';
            $pr->save();

            $this->logPurchaseRequisitionActionChanges($request, $pr, $oldActionValues);

            if (isset($normalizedAttachments)) {
                $pr->attachments = $normalizedAttachments;
            }

            // ลบ items เดิม แล้วสร้างใหม่จาก payload (ง่ายสุด)
            if ($request->has('items')) {
                PurchaseRequisitionItems::where('purchase_requisition_id', $pr->id)->delete();

                $items = $request->items ?? [];
                foreach ($items as $row) {
                    if (is_object($row)) $row = (array)$row;
                    if (!is_array($row) || $this->shouldSkipPurchaseRequisitionItem($row, $isDraft)) {
                        continue;
                    }

                    $item = new PurchaseRequisitionItems();
                    $item->purchase_requisition_id = $pr->id;
                    $item->item        = trim((string) ($row['item'] ?? ''));
                    $item->description = $row['description'] ?? null;
                    $item->quantity    = $row['quantity'] ?? 0;
                    $item->unit_price  = $row['unit_price'] ?? 0;
                    $item->amount      = $row['amount'] ?? (
                        ($row['quantity'] ?? 0) * ($row['unit_price'] ?? 0)
                    );
                    $item->need_asset_code_registration = $this->normalizeBooleanFlag($row['need_asset_code_registration'] ?? false);
                    $item->create_by   = $loginBy->employee_code ?? $loginBy->id ?? 'admin';
                    $item->save();
                }
            }

            DB::commit();
            return $this->returnUpdate(
                'อัปเดตข้อมูลสำเร็จ',
                $this->withPurchaseRequisitionEmployeeInfo($pr->load('items'))
            );

        } catch (\Throwable $e) {
            Log::error('PurchaseRequisitions update failed', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด ' . $e->getMessage(), 500);
        }
    }

    private function purchaseRequisitionActionColumns(): array
    {
        return [
            'requested_by_status',
            'verified_by_is_status',
            'verified_by_status',
            'approved_by_status',
            'approved_by_2_status',
            'acknowledged_by_status',
            'action_by_admin_status',
        ];
    }

    private function purchaseRequisitionActionValues(PurchaseRequisitions $pr): array
    {
        $values = [];
        foreach ($this->purchaseRequisitionActionColumns() as $column) {
            $values[$column] = $pr->{$column} ?? null;
        }

        return $values;
    }

    private function logPurchaseRequisitionActionChanges(Request $request, PurchaseRequisitions $pr, array $oldValues): void
    {
        foreach ($this->purchaseRequisitionActionColumns() as $column) {
            $oldValue = $oldValues[$column] ?? null;
            $newValue = $pr->{$column} ?? null;

            if (strtolower(trim((string) $oldValue)) === strtolower(trim((string) $newValue))) {
                continue;
            }

            $this->logActionRequestAudit(
                $request,
                'purchase_requisitions',
                $pr->id,
                $column,
                $oldValue,
                $newValue,
                $request->input('comments') ?? $request->input('comment') ?? null
            );
        }
    }

    public function action($id, $type, Request $request)
    {
        $decision = $this->normalizeActionDecision($request->input('decision', $request->input('status')));
        if ($decision === null) {
            return $this->workflowError('กรุณาระบุ decision เป็น approved หรือ rejected', 422);
        }

        DB::beginTransaction();

        try {
            $pr = PurchaseRequisitions::with('items')->lockForUpdate()->find($id);
            if (!$pr) {
                DB::rollBack();
                return $this->returnErrorData('ไม่พบข้อมูลที่ต้องการดำเนินการ', 404);
            }

            if ($this->isDraftStatus($pr->status)) {
                DB::rollBack();
                return $this->workflowError('เอกสาร Draft ยังไม่สามารถส่งอนุมัติหรือดำเนินการได้', 409);
            }

            if ($this->normalizeWorkflowStatusValue($pr->status) === self::STATUS_APPROVED) {
                DB::rollBack();
                return $this->workflowError('เอกสารนี้อนุมัติครบแล้ว', 409);
            }

            if ($this->normalizeWorkflowStatusValue($pr->status) === self::STATUS_REJECTED) {
                DB::rollBack();
                return $this->workflowError('เอกสารนี้ถูก Reject แล้ว ต้องแก้ไขและส่งอนุมัติใหม่ก่อน', 409);
            }

            $currentStep = $this->currentPurchaseRequisitionActionStep($pr);
            if ($currentStep === null) {
                DB::rollBack();
                return $this->workflowError('ไม่พบ step ที่รอดำเนินการ', 409);
            }

            if ($currentStep['type'] !== $type) {
                DB::rollBack();
                return $this->workflowError('ยังไม่ถึงลำดับการดำเนินการนี้', 409);
            }

            $actorCode = $this->actorCodeFromRequest($request);
            $assigneeCode = $pr->{$currentStep['by']} ?? null;
            if (!$this->codesMatch($assigneeCode, $actorCode)) {
                DB::rollBack();
                return $this->workflowError('ผู้ใช้งานปัจจุบันไม่มีสิทธิ์ดำเนินการใน step นี้', 403);
            }

            $oldValue = $pr->{$currentStep['status']} ?? null;
            if ($this->isWorkflowApproved($oldValue) || $this->isWorkflowRejected($oldValue)) {
                DB::rollBack();
                return $this->workflowError('step นี้ถูกดำเนินการไปแล้ว', 409);
            }

            if ($currentStep['type'] === 'acknowledged_by_status') {
                if ($request->has('need_asset_code_registration')) {
                    $pr->need_asset_code_registration = $this->normalizeBooleanFlag($request->input('need_asset_code_registration'));
                }

                if ($request->has('item_asset_flags') && is_array($request->input('item_asset_flags'))) {
                    $flags = $request->input('item_asset_flags');
                    $items = $pr->items()->orderBy('id')->get();
                    foreach ($items as $index => $item) {
                        if (array_key_exists($index, $flags)) {
                            $item->need_asset_code_registration = $this->normalizeBooleanFlag($flags[$index]);
                            $item->save();
                        }
                    }
                }
            }

            $pr->{$currentStep['status']} = $decision;
            $pr->{$currentStep['date']} = now()->format('Y-m-d H:i:s');

            if ($decision === self::STATUS_REJECTED) {
                $pr->status = self::STATUS_REJECTED;
            } else {
                $nextStep = $this->nextPurchaseRequisitionActionStep($pr, $currentStep['type']);
                if ($nextStep === null) {
                    $pr->status = self::STATUS_APPROVED;
                } elseif (!$this->isWorkflowApproved($pr->{$nextStep['status']} ?? null)) {
                    $pr->{$nextStep['status']} = $pr->{$nextStep['status']} ?: 'pending';
                    $pr->{$nextStep['date']} = null;
                    $pr->status = self::STATUS_SUBMITTED;
                }
            }

            $pr->update_by = $actorCode;
            $pr->save();

            $this->logActionRequestAudit(
                $request,
                'purchase_requisitions',
                $pr->id,
                $currentStep['status'],
                $oldValue,
                $decision,
                $request->input('comments') ?? $request->input('comment') ?? null
            );

            DB::commit();
            return $this->returnUpdateReturnData(
                'อัปเดตสถานะสำเร็จ',
                $this->withPurchaseRequisitionEmployeeInfo($pr->load('items'))
            );

        } catch (\Throwable $e) {
            Log::error('PurchaseRequisitions action failed', [
                'id' => $id,
                'type' => $type,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด ' . $e->getMessage(), 500);
        }
    }

    public function submit($id, Request $request)
    {
        $loginBy = $request->login_by;

        DB::beginTransaction();

        try {
            $pr = PurchaseRequisitions::with('items')->lockForUpdate()->find($id);
            if (!$pr) {
                DB::rollBack();
                return $this->returnErrorData('ไม่พบข้อมูลที่ต้องการส่งอนุมัติ', 404);
            }

            if ($validationError = $this->validateStoredPurchaseRequisitionForSubmit($pr)) {
                DB::rollBack();
                return $validationError;
            }

            $pr->pr_no = $this->resolvePurchaseRequisitionNumber($request, $pr);
            $pr->status = self::STATUS_SUBMITTED;
            $pr->update_by = $loginBy->employee_code ?? $loginBy->id ?? 'admin';
            $this->applySubmittedWorkflowDefaults($pr);
            $pr->save();

            DB::commit();
            return $this->returnUpdateReturnData(
                'ส่งอนุมัติสำเร็จ',
                $this->withPurchaseRequisitionEmployeeInfo($pr->load('items'))
            );

        } catch (\Throwable $e) {
            Log::error('PurchaseRequisitions submit failed', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด ' . $e->getMessage(), 500);
        }
    }

    // ================= destroy =================
    public function destroy($id, Request $request)
    {
        $loginBy = $request->login_by;

        DB::beginTransaction();

        try {
            $Item = PurchaseRequisitions::find($id);

            if (!$Item) {
                return $this->returnErrorData('ไม่พบข้อมูล', 404);
            }

            $Item->delete();

            $this->Log(
                $loginBy->employee_code ?? $loginBy->id ?? 'admin',
                "ลบข้อมูล Purchase Requisition #{$id}",
                "ลบข้อมูล"
            );

            DB::commit();
            return $this->returnSuccess('ลบข้อมูลสำเร็จ', []);

        } catch (\Throwable $e) {
            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด ' . $e->getMessage(), 500);
        }
    }

    public function getNextNumber(Request $request): JsonResponse
    {
        $year = $this->purchaseDocumentNumberService()->yearFromDate(
            $request->input('year', $request->input('date'))
        );
        $nextNumber = $this->getNextPurchaseRequisitionNumber(false, $year);

        return response()->json([
            'success' => true,
            'data' => [
                'next_pr_no' => $nextNumber,
                'next_number' => $nextNumber,
                'year' => $year,
            ],
        ]);
    }
}
