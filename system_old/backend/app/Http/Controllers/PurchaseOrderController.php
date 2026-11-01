<?php

namespace App\Http\Controllers;

use App\Exceptions\PdfMergeUserException;
use App\Exports\PurchaseOrderExport;
use App\Models\Employee;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseRequisitions;
use App\Models\SignatureSetting;
use App\Services\FrontendPrintPdfService;
use App\Services\PurchaseCombinedPdfService;
use App\Services\PurchaseDocumentNumberService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use Maatwebsite\Excel\Facades\Excel;
use Mpdf\Config\ConfigVariables;
use Mpdf\Config\FontVariables;
use Mpdf\Mpdf;
use Mpdf\Output\Destination;


class PurchaseOrderController extends Controller
{
    private const STATUS_DRAFT = 'draft';
    private const STATUS_SUBMITTED = 'submitted';
    private const STATUS_APPROVED = 'approved';
    private const STATUS_REJECTED = 'rejected';
    private const DEFAULT_PAYMENT_TERM = 'Accept invoices only at the end of each month. Payment will be made at the end of the following month after the invoice is received.';
    private const PO_PRINT_PAGE_WIDTH_MM = 215.9;
    private const PO_PRINT_PAGE_HEIGHT_MM = 279.4;
    private const PO_PRINT_FOOTER_TEXT = 'M:/MTL_INDEX/IMS DOCUMENTATION/FORMS/27 - MTPC-03-PURCHASE ORDER.DOC.DOC/REV.B (01/01/2018)/CC/MR';
    private const PO_NUMBER_PREFIX = 'PO';

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
            return $this->returnErrorData('Purchase Order attachments must be PDF files only: ' . $invalidAttachment, 422);
        }

        return null;
    }

    private function normalizePurchaseRequisitionId($value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (!is_numeric($value)) {
            return null;
        }

        $id = (int) $value;
        return $id > 0 ? $id : null;
    }

    private function normalizeBooleanFlag($value)
    {
        if (is_bool($value)) {
            return $value;
        }

        if (is_numeric($value)) {
            return (int) $value === 1;
        }

        if (is_string($value)) {
            return in_array(strtolower(trim($value)), ['1', 'true', 'yes', 'y', 'on'], true);
        }

        return false;
    }

    private function nullableBooleanFlag($value)
    {
        if ($value === null || $value === '') {
            return null;
        }

        return $this->normalizeBooleanFlag($value);
    }

    private function normalizeDocumentStatus($value): string
    {
        $status = strtolower(trim((string) $value));

        if ($status === self::STATUS_DRAFT) {
            return self::STATUS_DRAFT;
        }

        return self::STATUS_SUBMITTED;
    }

    private function isDraftStatus($status): bool
    {
        return $this->normalizeDocumentStatus($status) === self::STATUS_DRAFT;
    }

    private function requiredFieldMissing($value): bool
    {
        return $value === null || trim((string) $value) === '';
    }

    private function validatePurchaseOrderRequest(Request $request, bool $isDraft): ?JsonResponse
    {
        if ($isDraft) {
            return null;
        }

        if ($this->requiredFieldMissing($request->to)) {
            return $this->returnErrorData('กรุณาระบุ to', 404);
        }
        if ($this->requiredFieldMissing($request->company)) {
            return $this->returnErrorData('กรุณาระบุ company', 404);
        }
        if ($this->requiredFieldMissing($request->from)) {
            return $this->returnErrorData('กรุณาระบุ from', 404);
        }
        if ($this->requiredFieldMissing($request->po_date)) {
            return $this->returnErrorData('กรุณาระบุ po_date', 404);
        }
        if ($this->requiredFieldMissing($request->requisition_date)) {
            return $this->returnErrorData('กรุณาระบุ requisition_date', 404);
        }
        if (empty($request->items) || !is_array($request->items)) {
            return $this->returnErrorData('กรุณาระบุ items อย่างน้อย 1 รายการ', 404);
        }

        return null;
    }

    private function defaultString($value, string $default = '-'): string
    {
        $value = trim((string) ($value ?? ''));
        return $value === '' ? $default : $value;
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

    private function purchaseOrderNumberYear(Request $request, ?PurchaseOrder $item = null): int
    {
        $date = $request->input('po_date');

        if ($date === null || $date === '') {
            $date = $item->po_date ?? $item->created_at ?? null;
        }

        return $this->purchaseDocumentNumberService()->yearFromDate($date);
    }

    private function getNextPurchaseOrderNumber(bool $lock = false, ?int $year = null): string
    {
        $year = $year ?? $this->purchaseDocumentNumberService()->yearFromDate(null);

        return $this->purchaseDocumentNumberService()->next(
            PurchaseOrder::class,
            'po_no',
            self::PO_NUMBER_PREFIX,
            $year,
            $lock
        );
    }

    private function resolvePurchaseOrderNumber(Request $request, ?PurchaseOrder $item = null): string
    {
        $service = $this->purchaseDocumentNumberService();
        $year = $this->purchaseOrderNumberYear($request, $item);
        $requestPoNo = trim((string) $request->input('po_no', ''));
        if ($requestPoNo !== '' && $service->isFormattedNumber($requestPoNo, self::PO_NUMBER_PREFIX, $year)) {
            $requestPoNo = strtoupper($requestPoNo);
            $duplicateQuery = PurchaseOrder::withTrashed()->where('po_no', $requestPoNo);
            if ($item && $item->id) {
                $duplicateQuery->where('id', '!=', $item->id);
            }

            if (!$duplicateQuery->lockForUpdate()->exists()) {
                return $requestPoNo;
            }
        }

        $existingPoNo = trim((string) ($item->po_no ?? ''));
        if ($existingPoNo !== '' && $service->isFormattedNumber($existingPoNo, self::PO_NUMBER_PREFIX)) {
            return strtoupper($existingPoNo);
        }

        return $this->getNextPurchaseOrderNumber(true, $year);
    }

    private function hasWorkflowAssignee($value): bool
    {
        return $value !== null && trim((string) $value) !== '';
    }

    private function applySubmittedWorkflowDefaults(PurchaseOrder $item): void
    {
        if ($this->hasWorkflowAssignee($item->purchase_request_by)) {
            $item->purchase_request_by_status = self::STATUS_APPROVED;
            $item->purchase_request_by_date = $item->purchase_request_by_date ?: ($item->po_date ?: now());
        }

        $verifiedPending = $this->hasWorkflowAssignee($item->verified_by);
        $approvedPending = !$verifiedPending && $this->hasWorkflowAssignee($item->approved_by);
        $circPending = !$verifiedPending && !$approvedPending && $this->hasWorkflowAssignee($item->circ);
        $signedPending = !$verifiedPending && !$approvedPending && !$circPending && $this->hasWorkflowAssignee($item->signed_by);
        $acknowledgedPending = !$verifiedPending && !$approvedPending && !$circPending && !$signedPending && $this->hasWorkflowAssignee($item->acknowledged_by);

        $item->verified_by_status = $verifiedPending ? 'pending' : null;
        $item->verified_by_date = null;
        $item->approved_by_status = $approvedPending ? 'pending' : null;
        $item->approved_by_date = null;
        $item->circ_status = $circPending ? 'pending' : null;
        $item->circ_date = null;
        $item->signed_by_status = $signedPending ? 'pending' : null;
        $item->signed_by_date = null;
        $item->acknowledged_by_status = $acknowledgedPending ? 'pending' : null;
        $item->acknowledged_by_date = null;
    }

    private function applyDraftWorkflowDefaults(PurchaseOrder $item): void
    {
        $item->purchase_request_by_status = null;
        $item->purchase_request_by_date = null;
        $item->verified_by_status = null;
        $item->verified_by_date = null;
        $item->approved_by_status = null;
        $item->approved_by_date = null;
        $item->circ_status = null;
        $item->circ_date = null;
        $item->signed_by_status = null;
        $item->signed_by_date = null;
        $item->acknowledged_by_status = null;
        $item->acknowledged_by_date = null;
    }

    private function shouldSkipPurchaseOrderItem(array $row, bool $isDraft): bool
    {
        $item = trim((string) ($row['item'] ?? ''));
        $description = trim((string) ($row['description'] ?? ''));
        $assetCode = trim((string) ($row['asset_code'] ?? ''));
        $unitPrice = isset($row['unit_price']) && is_numeric($row['unit_price']) ? (float) $row['unit_price'] : 0.0;
        $amount = isset($row['amount']) && is_numeric($row['amount']) ? (float) $row['amount'] : 0.0;

        if ($isDraft) {
            return $item === '' &&
                $description === '' &&
                $assetCode === '' &&
                $unitPrice === 0.0 &&
                $amount === 0.0;
        }

        return $item === '' && $description === '';
    }

    private function validateStoredPurchaseOrderForSubmit(PurchaseOrder $item): ?JsonResponse
    {
        if ($this->requiredFieldMissing($item->to)) {
            return $this->returnErrorData('กรุณาระบุ to', 404);
        }
        if ($this->requiredFieldMissing($item->company)) {
            return $this->returnErrorData('กรุณาระบุ company', 404);
        }
        if ($this->requiredFieldMissing($item->from)) {
            return $this->returnErrorData('กรุณาระบุ from', 404);
        }
        if ($this->requiredFieldMissing($item->po_date)) {
            return $this->returnErrorData('กรุณาระบุ po_date', 404);
        }
        if ($this->requiredFieldMissing($item->requisition_date)) {
            return $this->returnErrorData('กรุณาระบุ requisition_date', 404);
        }
        if (!$this->hasWorkflowAssignee($item->purchase_request_by)) {
            return $this->returnErrorData('กรุณาระบุ purchase_request_by', 404);
        }
        if (!$this->hasWorkflowAssignee($item->approved_by)) {
            return $this->returnErrorData('กรุณาระบุ approved_by', 404);
        }
        if (!$this->hasWorkflowAssignee($item->signed_by)) {
            return $this->returnErrorData('กรุณาระบุ signed_by', 404);
        }
        if (!$this->hasWorkflowAssignee($item->acknowledged_by)) {
            return $this->returnErrorData('กรุณาระบุ acknowledged_by', 404);
        }
        if ($item->items()->where(function ($query) {
            $query->whereNotNull('description')
                ->where('description', '!=', '');
        })->count() === 0) {
            return $this->returnErrorData('กรุณาระบุ items อย่างน้อย 1 รายการ', 404);
        }

        return null;
    }

    public function printPdf($id, Request $request, FrontendPrintPdfService $frontendPrintPdfService)
    {
        $item = PurchaseOrder::with('items')->find($id);

        if (!$item) {
            return $this->returnErrorData('ไม่พบข้อมูลที่ระบุ', 404);
        }

        try {
            $content = $frontendPrintPdfService->renderPurchaseOrderPdf(
                $item->id,
                $this->frontendPrintQueryOptions($request)
            );

            return response($content, 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => 'inline; filename="purchase-order-' . $item->id . '.pdf"',
                'Cache-Control' => 'private, max-age=0, must-revalidate',
                'Pragma' => 'public',
            ]);
        } catch (\Throwable $e) {
            Log::error('Purchase order PDF generation failed', [
                'id' => $id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return $this->returnErrorData('เกิดข้อผิดพลาดในการสร้างไฟล์ PDF: ' . $e->getMessage(), 500);
        }
    }

    private function frontendPrintQueryOptions(Request $request): array
    {
        return $this->isSignaturePreviewRequest($request)
            ? ['signaturePreview' => '1']
            : [];
    }

    public function previewCombinedPdf(
        $id,
        Request $request,
        PurchaseCombinedPdfService $combinedPdfService,
        FrontendPrintPdfService $frontendPrintPdfService
    )
    {
        return $this->combinedPdfResponse($id, $request, $combinedPdfService, $frontendPrintPdfService, 'inline');
    }

    public function downloadCombinedPdf(
        $id,
        Request $request,
        PurchaseCombinedPdfService $combinedPdfService,
        FrontendPrintPdfService $frontendPrintPdfService
    )
    {
        return $this->combinedPdfResponse($id, $request, $combinedPdfService, $frontendPrintPdfService, 'attachment');
    }

    private function combinedPdfResponse(
        $id,
        Request $request,
        PurchaseCombinedPdfService $combinedPdfService,
        FrontendPrintPdfService $frontendPrintPdfService,
        string $disposition
    )
    {
        $item = PurchaseOrder::with(['items', 'purchaseRequisition.items'])->find($id);

        if (!$item) {
            return $this->returnErrorData('ไม่พบข้อมูลที่ระบุ', 404);
        }

        try {
            $pr = $item->purchaseRequisition;
            $content = $this->renderCombinedPurchaseOrderPdfContent(
                $item,
                $request,
                $combinedPdfService,
                $frontendPrintPdfService
            );
            $fileName = $this->purchaseCombinedPdfFileName($item, $pr);

            return response($content, 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => $disposition . '; filename="' . $fileName . '"',
                'Cache-Control' => 'private, max-age=0, must-revalidate',
                'Pragma' => 'public',
            ]);
        } catch (PdfMergeUserException $e) {
            Log::warning('Purchase order combined PDF contains an unsupported attachment', [
                'id' => $id,
                'error' => $e->getMessage(),
            ]);

            try {
                $content = $frontendPrintPdfService->renderPurchaseOrderPdf(
                    $item->id,
                    $this->frontendPrintQueryOptions($request)
                );
                $fileName = $this->purchaseCombinedPdfFileName($item, $item->purchaseRequisition);

                return response($content, 200, [
                    'Content-Type' => 'application/pdf',
                    'Content-Disposition' => $disposition . '; filename="' . $fileName . '"',
                    'Cache-Control' => 'private, max-age=0, must-revalidate',
                    'Pragma' => 'public',
                    'X-Combined-Pdf-Fallback' => 'system-document-only',
                ]);
            } catch (\Throwable $fallbackException) {
                Log::error('Purchase order system PDF fallback failed', [
                    'id' => $id,
                    'merge_error' => $e->getMessage(),
                    'error' => $fallbackException->getMessage(),
                    'trace' => $fallbackException->getTraceAsString(),
                ]);

                return $this->returnErrorData('เกิดข้อผิดพลาดในการสร้างไฟล์ PDF: ' . $fallbackException->getMessage(), 500);
            }
        } catch (\Throwable $e) {
            Log::error('Purchase order combined PDF generation failed', [
                'id' => $id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return $this->returnErrorData('เกิดข้อผิดพลาดในการรวมไฟล์ PDF: ' . $e->getMessage(), 500);
        }
    }

    private function renderCombinedPurchaseOrderPdfContent(
        PurchaseOrder $item,
        Request $request,
        PurchaseCombinedPdfService $combinedPdfService,
        FrontendPrintPdfService $frontendPrintPdfService
    ): string {
        $sources = [[
            'name' => 'purchase-order-' . ($item->po_no ?: $item->id),
            'content' => $frontendPrintPdfService->renderPurchaseOrderPdf(
                $item->id,
                $this->frontendPrintQueryOptions($request)
            ),
        ]];

        foreach ($combinedPdfService->attachmentPdfPaths($item->attachments) as $attachmentPath) {
            $sources[] = ['path' => $attachmentPath];
        }

        $pr = $item->purchaseRequisition;
        if ($pr instanceof PurchaseRequisitions) {
            $sources[] = [
                'name' => 'purchase-requisition-' . ($pr->pr_no ?: $pr->id),
                'content' => $frontendPrintPdfService->renderPurchaseRequisitionPdf(
                    $pr->id,
                    $this->frontendPrintQueryOptions($request)
                ),
            ];

            foreach ($combinedPdfService->attachmentPdfPaths($pr->attachments) as $attachmentPath) {
                $sources[] = ['path' => $attachmentPath];
            }
        }

        return $combinedPdfService->mergePdfSources($sources);
    }

    private function purchaseCombinedPdfFileName(PurchaseOrder $item, ?PurchaseRequisitions $pr): string
    {
        $parts = array_filter([
            $item->po_no ?: 'PO-' . $item->id,
            $pr ? ($pr->pr_no ?: 'PR-' . $pr->id) : null,
            'combined',
        ]);

        $fileName = implode('_', $parts);
        $fileName = preg_replace('/[^A-Za-z0-9_.-]+/', '-', $fileName);

        return trim($fileName, '-_.') . '.pdf';
    }

    public function renderPurchaseOrderPdfContent(PurchaseOrder $item, bool $signaturePreview = false): string
    {
        if (!$item->relationLoaded('items')) {
            $item->load('items');
        }

        $tempDir = storage_path('app/mpdf');
        if (!is_dir($tempDir)) {
            mkdir($tempDir, 0775, true);
        }

        $html = view('pdf.purchase-order', $this->purchaseOrderPrintData(
            $item,
            $signaturePreview
        ))->render();

        $mpdfConfig = [
            'mode' => 'utf-8',
            'format' => [self::PO_PRINT_PAGE_WIDTH_MM, self::PO_PRINT_PAGE_HEIGHT_MM],
            'margin_left' => 16,
            'margin_right' => 16,
            'margin_top' => 7,
            'margin_bottom' => 9,
            'tempDir' => $tempDir,
        ];

        if ($signatureFontPath = $this->purchaseOrderSignatureFontPath()) {
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
        $mpdf->SetTitle('Purchase Order #' . $item->id);
        $mpdf->SetDisplayMode('fullpage');
        $mpdf->SetHTMLFooter($this->purchaseOrderFooterHtml());
        $mpdf->WriteHTML($html);

        return $mpdf->Output('', Destination::STRING_RETURN);
    }

    private function purchaseOrderPrintData(PurchaseOrder $item, bool $signaturePreview = false): array
    {
        $currency = $this->normalizeCurrencyCodeInput($item->currency_code ?? 'THB');
        $activeSignatureSettings = $this->activeSignatureSettingsByCodes([
            $item->purchase_request_by,
            $item->verified_by,
            $item->approved_by,
            $item->signed_by,
            $item->acknowledged_by,
        ]);
        $previewDate = $this->signaturePreviewDate($item);

        return [
            'po' => $item,
            'logoPath' => $this->purchaseOrderLogoPath(),
            'currency' => $currency,
            'currencyLabel' => $this->printCurrencyLabel($currency),
            'header' => [
                'to' => (string) ($item->to ?? ''),
                'company' => (string) ($item->company ?? ''),
                'fax' => (string) ($item->fax ?? ''),
                'from' => (string) ($item->from ?? ''),
                'cc' => (string) ($item->cc ?? ''),
                'poNo' => (string) ($item->po_no ?? ''),
                'poDate' => $this->formatPrintDate($item->po_date),
                'requisitionDate' => $this->formatPrintDate($item->requisition_date),
                'page' => (string) ($item->page ?: 1),
                'totalPage' => (string) ($item->total_page ?: 1),
                'circ' => (string) ($item->circ ?? ''),
            ],
            'items' => ($item->items ?? collect())->map(function ($row) use ($currency) {
                return [
                    'item' => (string) ($row->item ?? ''),
                    'description' => (string) ($row->description ?? ''),
                    'quantity' => $this->formatPrintQuantity($row->quantity ?? null),
                    'unitPrice' => $this->formatPrintAmount($row->unit_price ?? null, $currency),
                    'amount' => $this->formatPrintAmount($row->amount ?? null, $currency),
                ];
            })->values()->all(),
            'totals' => [
                'discount' => $this->formatPrintAmount($item->discount ?? 0, $currency),
                'discountValue' => is_numeric($item->discount ?? null) ? (float) $item->discount : 0.0,
                'subTotal' => $this->formatPrintAmount($item->sub_total ?? 0, $currency),
                'vat' => $this->formatPrintAmount($item->vat_value ?? 0, $currency),
                'grandTotal' => $this->formatPrintAmount($item->grand_total ?? 0, $currency),
            ],
            'general' => [
                'quotationNo' => (string) ($item->quotation_no ?? ''),
                'quotationDate' => $this->formatPrintDate($item->quotation_date),
                'deliveryDate' => $this->formatPrintDate($item->delivery_date),
                'paymentTerm' => trim((string) ($item->payment_term ?? '')) !== ''
                    ? (string) $item->payment_term
                    : self::DEFAULT_PAYMENT_TERM,
                'otherConditions' => (string) ($item->other_conditions ?? ''),
                'comments' => (string) (($item->comment_all ?? '') !== '' ? $item->comment_all : ($item->comments ?? '')),
            ],
            'approval' => [
                'purchaseRequestBy' => $this->purchaseOrderSignatureValue($item->purchase_request_by, $item->purchase_request_by_status, $item->purchase_request_by_date, $activeSignatureSettings, $signaturePreview, true, $previewDate),
                'purchaseRequestByDate' => $this->purchaseOrderSignatureDate($item->purchase_request_by, $item->purchase_request_by_status, $item->purchase_request_by_date, $signaturePreview, false, $previewDate),
                'verifiedBy' => $this->purchaseOrderSignatureValue($item->verified_by, $item->verified_by_status, $item->verified_by_date, $activeSignatureSettings, $signaturePreview, false, $previewDate),
                'verifiedByDate' => $this->purchaseOrderSignatureDate($item->verified_by, $item->verified_by_status, $item->verified_by_date, $signaturePreview, false, $previewDate),
                'approvedBy' => $this->purchaseOrderSignatureValue($item->approved_by, $item->approved_by_status, $item->approved_by_date, $activeSignatureSettings, $signaturePreview, false, $previewDate),
                'approvedByDate' => $this->purchaseOrderSignatureDate($item->approved_by, $item->approved_by_status, $item->approved_by_date, $signaturePreview, false, $previewDate),
                'signedBy' => $this->purchaseOrderSignatureValue($item->signed_by, $item->signed_by_status, $item->signed_by_date, $activeSignatureSettings, $signaturePreview, false, $previewDate),
                'signedByDate' => $this->purchaseOrderSignatureDate($item->signed_by, $item->signed_by_status, $item->signed_by_date, $signaturePreview, false, $previewDate),
                'acknowledgedBy' => $this->purchaseOrderSignatureValue($item->acknowledged_by, $item->acknowledged_by_status, $item->acknowledged_by_date, $activeSignatureSettings, $signaturePreview, false, $previewDate),
                'acknowledgedByDate' => $this->purchaseOrderSignatureDate($item->acknowledged_by, $item->acknowledged_by_status, $item->acknowledged_by_date, $signaturePreview, false, $previewDate),
            ],
            'checklist' => [
                'deliveryOnTime' => $this->nullableBooleanPrintValue($item->delivery_on_time),
                'meetQualityRequirement' => $this->nullableBooleanPrintValue($item->meet_quality_requirement),
                'meetEquipmentGuidelines' => $this->nullableBooleanPrintValue($item->meet_equipment_guidelines),
            ],
        ];
    }

    private function purchaseOrderFooterHtml(): string
    {
        return '<table width="100%" style="border-collapse:collapse;font-family:dejavusans,Arial,sans-serif;font-size:5.2pt;color:#111;">'
            . '<tr>'
            . '<td>' . htmlspecialchars(self::PO_PRINT_FOOTER_TEXT, ENT_QUOTES, 'UTF-8') . '</td>'
            . '<td style="text-align:right;white-space:nowrap;">Page {PAGENO} of&nbsp; {nbpg}</td>'
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

    private function purchaseOrderLogoPath(): ?string
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

    private function purchaseOrderSignatureFontPath(): ?string
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

    private function purchaseOrderSignatureValue(
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

        $isSigned = $this->isApprovedWorkflowStatus($status) || $signaturePreview;
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
        $signatureId = $this->formatPurchaseOrderSignatureId($setting->employee_code ?: $code, $effectiveDate);
        $signatureName = $this->signatureSettingEmployeeName($setting) ?: $name;

        return sprintf(
            '<div class="signature-print-block"><div class="signature-name">%s</div>%s</div>',
            htmlspecialchars($signatureName, ENT_QUOTES, 'UTF-8'),
            $signatureId !== ''
                ? '<div class="signature-id">' . htmlspecialchars($signatureId, ENT_QUOTES, 'UTF-8') . '</div>'
                : ''
        );
    }

    private function purchaseOrderSignatureDate(
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

        if (!$this->isApprovedWorkflowStatus($status) && !$signaturePreview && !$showDateWhenPending) {
            return '';
        }

        return $this->formatPrintDate($this->effectiveSignatureDate($code, $status, $date, $signaturePreview, $previewDate));
    }

    private function effectiveSignatureDate($employeeCode, $status, $date, bool $signaturePreview, string $previewDate): string
    {
        if ($date !== null && trim((string) $date) !== '') {
            return (string) $date;
        }

        if (($this->isApprovedWorkflowStatus($status) || $signaturePreview) && trim((string) $employeeCode) !== '') {
            return $previewDate;
        }

        return '';
    }

    private function signaturePreviewDate(PurchaseOrder $item): string
    {
        foreach ([$item->purchase_request_by_date, $item->po_date, $item->created_at] as $value) {
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

    private function formatPurchaseOrderSignatureId($employeeCode, $date): string
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

    private function purchaseOrderExportEmployeeLookup($items): array
    {
        $fields = [
            'purchase_request_by',
            'verified_by',
            'approved_by',
            'circ',
            'signed_by',
            'acknowledged_by',
            'create_by',
        ];
        $references = [];

        foreach ($items as $item) {
            foreach ($fields as $field) {
                $reference = trim((string) ($item->{$field} ?? ''));
                if ($reference !== '') {
                    $references[] = $reference;
                }
            }
        }

        $references = array_values(array_unique($references));
        if (empty($references)) {
            return [];
        }

        $numericReferences = array_values(array_filter($references, static function ($reference) {
            return ctype_digit((string) $reference);
        }));
        $employees = Employee::query()
            ->where(function ($query) use ($references, $numericReferences) {
                $query->whereIn('code', $references);
                if (!empty($numericReferences)) {
                    $query->orWhereIn('id', $numericReferences);
                }
            })
            ->get(['id', 'code', 'initial', 'firstname', 'lastname']);

        $lookup = [];
        foreach ($employees as $employee) {
            $fullName = trim(trim((string) ($employee->firstname ?? '')) . ' ' . trim((string) ($employee->lastname ?? '')));
            $initial = rtrim(trim((string) ($employee->initial ?? '')), '.');
            $displayName = trim(implode(', ', array_filter([$initial, $fullName])));
            if ($displayName === '') {
                continue;
            }

            foreach ([$employee->code, $employee->id] as $reference) {
                $normalizedReference = strtolower(trim((string) ($reference ?? '')));
                if ($normalizedReference !== '') {
                    $lookup[$normalizedReference] = $displayName;
                }
            }
        }

        return $lookup;
    }

    private function purchaseOrderExportEmployeeName($reference, array $lookup): string
    {
        $normalizedReference = strtolower(trim((string) ($reference ?? '')));
        if ($normalizedReference === '') {
            return '';
        }

        return $lookup[$normalizedReference] ?? 'Employee not found';
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

    private function nullableBooleanPrintValue($value): ?bool
    {
        if ($value === null || $value === '') {
            return null;
        }

        return $this->normalizeBooleanFlag($value);
    }

    private function purchaseOrderPageColumns(): array
    {
        return [
            'id',
            'purchase_requisition_id',
            'po_no',
            'status',
            'po_date',
            'requisition_date',
            'to',
            'company',
            'from',
            'cc',
            'subject',
            'quotation_no',
            'delivery_date',
            'payment_term',
            'sub_total',
            'vat_value',
            'discount',
            'grand_total',
            'currency_code',
            'attachments',
            'purchase_request_by',
            'purchase_request_by_date',
            'purchase_request_by_status',
            'verified_by',
            'verified_by_date',
            'verified_by_status',
            'approved_by',
            'approved_by_date',
            'approved_by_status',
            'circ',
            'circ_date',
            'circ_status',
            'signed_by',
            'signed_by_date',
            'signed_by_status',
            'acknowledged_by',
            'acknowledged_by_date',
            'acknowledged_by_status',
            'comment_all',
            'create_by',
            'update_by',
            'created_at',
            'updated_at',
        ];
    }

    private function normalizeWorkflowStatusValue($value): ?string
    {
        if ($value === null) {
            return null;
        }

        $status = strtolower(trim((string) $value));
        return $status === '' ? null : $status;
    }

    private function isApprovedWorkflowStatus($value): bool
    {
        return in_array($this->normalizeWorkflowStatusValue($value), ['approve', 'approved'], true);
    }

    private function isRejectedWorkflowStatus($value): bool
    {
        return in_array($this->normalizeWorkflowStatusValue($value), ['reject', 'rejected'], true);
    }

    private function isPendingWorkflowStatus($value): bool
    {
        $status = $this->normalizeWorkflowStatusValue($value);
        return $status === null || $status === 'pending';
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

    private function purchaseOrderWorkflowSteps(): array
    {
        return [
            ['by' => 'verified_by', 'status' => 'verified_by_status'],
            ['by' => 'approved_by', 'status' => 'approved_by_status'],
            ['by' => 'circ', 'status' => 'circ_status'],
            ['by' => 'signed_by', 'status' => 'signed_by_status'],
            ['by' => 'acknowledged_by', 'status' => 'acknowledged_by_status'],
        ];
    }

    private function purchaseOrderActionSteps(): array
    {
        return [
            ['type' => 'verified_by_status', 'by' => 'verified_by', 'status' => 'verified_by_status', 'date' => 'verified_by_date'],
            ['type' => 'approved_by_status', 'by' => 'approved_by', 'status' => 'approved_by_status', 'date' => 'approved_by_date'],
            ['type' => 'circ_status', 'by' => 'circ', 'status' => 'circ_status', 'date' => 'circ_date'],
            ['type' => 'signed_by_status', 'by' => 'signed_by', 'status' => 'signed_by_status', 'date' => 'signed_by_date'],
            ['type' => 'acknowledged_by_status', 'by' => 'acknowledged_by', 'status' => 'acknowledged_by_status', 'date' => 'acknowledged_by_date'],
        ];
    }

    private function currentPurchaseOrderActionStep(PurchaseOrder $item): ?array
    {
        foreach ($this->purchaseOrderActionSteps() as $step) {
            if (!$this->hasWorkflowAssignee($item->{$step['by']} ?? null)) {
                continue;
            }

            if (!$this->isApprovedWorkflowStatus($item->{$step['status']} ?? null)) {
                return $step;
            }
        }

        return null;
    }

    private function nextPurchaseOrderActionStep(PurchaseOrder $item, string $currentType): ?array
    {
        $foundCurrent = false;

        foreach ($this->purchaseOrderActionSteps() as $step) {
            if (!$foundCurrent) {
                $foundCurrent = $step['type'] === $currentType;
                continue;
            }

            if (
                $this->hasWorkflowAssignee($item->{$step['by']} ?? null)
                && !$this->isApprovedWorkflowStatus($item->{$step['status']} ?? null)
            ) {
                return $step;
            }
        }

        return null;
    }

    private function shouldAutoApprovePurchaseOrderAcknowledgement(PurchaseOrder $item, array $currentStep, string $decision): bool
    {
        if ($currentStep['type'] !== 'signed_by_status' || $decision !== self::STATUS_APPROVED) {
            return false;
        }

        if (!$this->hasWorkflowAssignee($item->acknowledged_by ?? null)) {
            return false;
        }

        if (!$this->codesMatch($item->signed_by ?? null, $item->acknowledged_by ?? null)) {
            return false;
        }

        $acknowledgedStatus = $item->acknowledged_by_status ?? null;
        return !$this->isApprovedWorkflowStatus($acknowledgedStatus)
            && !$this->isRejectedWorkflowStatus($acknowledgedStatus);
    }

    private function purchaseOrderWorkflowSnapshot(PurchaseOrder $item): array
    {
        $columns = [
            'status',
            'purchase_request_by',
            'purchase_request_by_status',
            'purchase_request_by_date',
            'verified_by',
            'verified_by_status',
            'verified_by_date',
            'approved_by',
            'approved_by_status',
            'approved_by_date',
            'circ',
            'circ_status',
            'circ_date',
            'signed_by',
            'signed_by_status',
            'signed_by_date',
            'acknowledged_by',
            'acknowledged_by_status',
            'acknowledged_by_date',
        ];

        $snapshot = [];
        foreach ($columns as $column) {
            $snapshot[$column] = $item->{$column} ?? null;
        }

        return $snapshot;
    }

    private function restorePurchaseOrderWorkflow(PurchaseOrder $item, array $snapshot): void
    {
        foreach ($snapshot as $column => $value) {
            $item->{$column} = $value;
        }
    }

    private function applyPurchaseOrderUpdateWorkflow(
        PurchaseOrder $item,
        array $snapshot,
        bool $wasDraft,
        bool $isDraft,
        bool $resetWorkflow
    ): void {
        if ($isDraft) {
            $this->applyDraftWorkflowDefaults($item);
            return;
        }

        if ($wasDraft || $resetWorkflow) {
            $this->applySubmittedWorkflowDefaults($item);
            return;
        }

        $this->restorePurchaseOrderWorkflow($item, $snapshot);
    }

    private function applyApprovedPurchaseOrderFilter($query): void
    {
        $approved = $this->workflowApprovedValues();

        $query->where(function ($q) {
            $q->whereNull('status')
                ->orWhere('status', '!=', self::STATUS_DRAFT);
        });

        foreach ($this->purchaseOrderWorkflowSteps() as $step) {
            $query->where(function ($q) use ($step, $approved) {
                $q->whereNull($step['by'])
                    ->orWhere($step['by'], '')
                    ->orWhereIn($step['status'], $approved);
            });
        }

        $query->where(function ($q) {
            $q->whereNotNull('approved_by')
                ->where('approved_by', '!=', '');
        });
    }

    private function applyRejectedPurchaseOrderFilter($query): void
    {
        $rejected = $this->workflowRejectedValues();
        $query->where(function ($q) {
            $q->whereNull('status')
                ->orWhere('status', '!=', self::STATUS_DRAFT);
        });
        $query->where(function ($q) use ($rejected) {
            foreach ($this->purchaseOrderWorkflowSteps() as $step) {
                $q->orWhereIn($step['status'], $rejected);
            }
        });
    }

    private function applyPendingPurchaseOrderFilter($query): void
    {
        $rejected = $this->workflowRejectedValues();
        $pending = $this->workflowPendingValues();

        $query->where(function ($q) {
            $q->whereNull('status')
                ->orWhere('status', '!=', self::STATUS_DRAFT);
        });

        $query->where(function ($q) use ($rejected) {
            foreach ($this->purchaseOrderWorkflowSteps() as $step) {
                $q->where(function ($sub) use ($step, $rejected) {
                    $sub->whereNull($step['status'])
                        ->orWhereNotIn($step['status'], $rejected);
                });
            }
        });

        $query->where(function ($q) use ($pending) {
            foreach ($this->purchaseOrderWorkflowSteps() as $step) {
                $q->orWhere(function ($sub) use ($step, $pending) {
                    $sub->whereNotNull($step['by'])
                        ->where($step['by'], '!=', '')
                        ->where(function ($statusQuery) use ($step, $pending) {
                            $statusQuery->whereNull($step['status'])
                                ->orWhere($step['status'], '')
                                ->orWhereIn($step['status'], $pending);
                        });
                });
            }
        });
    }

    private function applyPurchaseOrderRequestFilters($query, Request $request, array $columns): void
    {
        $search = $request->input('search.value');
        if (!empty($search)) {
            $keyword = '%' . $search . '%';
            $query->where(function ($q) use ($keyword, $columns) {
                foreach ($columns as $column) {
                    $q->orWhere($column, 'like', $keyword);
                }
            });
        }

        $filters = $request->input('filters', []);
        if (is_array($filters)) {
            $tab = strtolower(trim((string) ($filters['tab'] ?? '')));
            if ($tab === 'my') {
                $actorCode = $this->actorCodeFromRequest($request);
                if ($actorCode === '') {
                    $query->whereRaw('1 = 0');
                } else {
                    $query->where(function ($ownerQuery) use ($actorCode) {
                        $ownerQuery->where('create_by', $actorCode)
                            ->orWhere('purchase_request_by', $actorCode);
                    });
                }
            } elseif ($tab === 'pending') {
                $actorCode = $this->actorCodeFromRequest($request);
                if ($actorCode === '') {
                    $query->whereRaw('1 = 0');
                } else {
                    $this->applyPurchaseOrderActorPendingFilter($query, $actorCode);
                }
            } elseif ($tab === 'action') {
                $actorCode = $this->actorCodeFromRequest($request);
                if ($actorCode === '') {
                    $query->whereRaw('1 = 0');
                } else {
                    $this->applyPurchaseOrderActorPendingFilter($query, $actorCode);
                }
            }

            $company = trim((string) ($filters['company'] ?? ''));
            if ($company !== '') {
                $query->where('company', $company);
            }

            $status = strtolower(trim((string) ($filters['status'] ?? $filters['workflowStatus'] ?? '')));
            if ($status === 'approved') {
                $status = 'approve';
            } elseif ($status === 'rejected') {
                $status = 'reject';
            }

            if ($status === self::STATUS_DRAFT) {
                $query->where('status', self::STATUS_DRAFT);
            } elseif ($status === 'approve') {
                $this->applyApprovedPurchaseOrderFilter($query);
            } elseif ($status === 'reject') {
                $this->applyRejectedPurchaseOrderFilter($query);
            } elseif ($status === 'pending') {
                $this->applyPendingPurchaseOrderFilter($query);
            }
        }
    }

    private function applyPurchaseOrderActorPendingFilter($query, string $actorCode): void
    {
        $pending = $this->workflowPendingValues();
        $approved = $this->workflowApprovedValues();
        $rejected = $this->workflowRejectedValues();
        $steps = $this->purchaseOrderWorkflowSteps();

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

        $query->where(function ($actionQuery) use ($actorCode, $pending, $approved, $steps) {
            foreach ($steps as $index => $step) {
                $actionQuery->orWhere(function ($stepQuery) use ($actorCode, $pending, $approved, $steps, $index, $step) {
                    $stepQuery->where($step['by'], $actorCode)
                        ->where(function ($statusQuery) use ($step, $pending) {
                            $statusQuery->whereNull($step['status'])
                                ->orWhere($step['status'], '')
                                ->orWhereIn($step['status'], $pending);
                        });

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

    private function purchaseOrderActionStepSortExpression(string $actorCode): array
    {
        $labels = [
            'verified_by_status' => 'Verified By',
            'approved_by_status' => 'Approved By',
            'circ_status' => 'Circ',
            'signed_by_status' => 'Signed By',
            'acknowledged_by_status' => 'Acknowledged By',
        ];
        $cases = [];
        $bindings = [];
        foreach ($this->purchaseOrderActionSteps() as $step) {
            $cases[] = "WHEN {$step['by']} = ? AND LOWER(TRIM(COALESCE({$step['status']}, ''))) IN ('', 'pending') THEN '" . $labels[$step['type']] . "'";
            $bindings[] = $actorCode;
        }

        return ['CASE ' . implode(' ', $cases) . " ELSE '' END", $bindings];
    }

    private function purchaseOrderActionStatusSortExpression(string $actorCode): array
    {
        $cases = [];
        $bindings = [];
        foreach ($this->purchaseOrderActionSteps() as $step) {
            $cases[] = "WHEN {$step['by']} = ? AND LOWER(TRIM(COALESCE({$step['status']}, ''))) IN ('', 'pending') THEN 'Pending'";
            $bindings[] = $actorCode;
        }

        return ['CASE ' . implode(' ', $cases) . " ELSE '' END", $bindings];
    }

    private function purchaseOrderWorkflowSortExpression(): string
    {
        return "CASE
            WHEN LOWER(COALESCE(status, '')) = 'draft' THEN 'Draft'
            WHEN LOWER(COALESCE(verified_by_status, '')) IN ('reject', 'rejected')
              OR LOWER(COALESCE(approved_by_status, '')) IN ('reject', 'rejected')
              OR LOWER(COALESCE(circ_status, '')) IN ('reject', 'rejected')
              OR LOWER(COALESCE(signed_by_status, '')) IN ('reject', 'rejected')
              OR LOWER(COALESCE(acknowledged_by_status, '')) IN ('reject', 'rejected') THEN 'Rejected'
            WHEN (COALESCE(verified_by, '') <> '' OR COALESCE(approved_by, '') <> '' OR COALESCE(circ, '') <> '' OR COALESCE(signed_by, '') <> '' OR COALESCE(acknowledged_by, '') <> '')
              AND (COALESCE(verified_by, '') = '' OR LOWER(COALESCE(verified_by_status, '')) IN ('approve', 'approved'))
              AND (COALESCE(approved_by, '') = '' OR LOWER(COALESCE(approved_by_status, '')) IN ('approve', 'approved'))
              AND (COALESCE(circ, '') = '' OR LOWER(COALESCE(circ_status, '')) IN ('approve', 'approved'))
              AND (COALESCE(signed_by, '') = '' OR LOWER(COALESCE(signed_by_status, '')) IN ('approve', 'approved'))
              AND (COALESCE(acknowledged_by, '') = '' OR LOWER(COALESCE(acknowledged_by_status, '')) IN ('approve', 'approved')) THEN 'Approved'
            ELSE 'Pending'
        END";
    }

    private function getPurchaseOrderWorkflowStatus($item): string
    {
        if ($this->isDraftStatus($item->status ?? null)) {
            return 'Draft';
        }

        $assignedSteps = [];

        foreach ($this->purchaseOrderWorkflowSteps() as $step) {
            $assignee = $item->{$step['by']} ?? null;
            $status = $item->{$step['status']} ?? null;

            if ($this->isRejectedWorkflowStatus($status)) {
                return 'Rejected';
            }

            if ($assignee !== null && trim((string) $assignee) !== '') {
                $assignedSteps[] = $status;
            }
        }

        if (!empty($assignedSteps)) {
            foreach ($assignedSteps as $status) {
                if (!$this->isApprovedWorkflowStatus($status)) {
                    return 'Pending';
                }
            }

            return 'Approved';
        }

        return 'Pending';
    }

    private function formatExportDate($value): string
    {
        if (empty($value)) {
            return '';
        }

        $timestamp = strtotime((string) $value);
        return $timestamp ? date('Y-m-d', $timestamp) : (string) $value;
    }

    // =========== getList ===========
    public function getList()
    {
        $Item = PurchaseOrder::orderBy('po_no', 'desc')
            ->orderBy('id', 'desc')
            ->get()
            ->toArray();

        if (!empty($Item)) {
            for ($i = 0; $i < count($Item); $i++) {
                $Item[$i]['No'] = $i + 1;
            }
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $Item);
    }

    // =========== getPage (DataTables style) ===========
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

        $col = $this->purchaseOrderPageColumns();

        $orderby = [
            0 => 'po_no',
            2 => 'subject',
            3 => 'company',
            4 => 'to',
            5 => 'requisition_date',
            6 => 'quotation_no',
            7 => 'grand_total',
        ];

        $D = PurchaseOrder::select($col);

        $this->applyPurchaseOrderRequestFilters($D, $request, $col);

        $filters = $request->input('filters', []);
        $tab = is_array($filters) ? strtolower(trim((string) ($filters['tab'] ?? ''))) : '';
        $actorCode = $this->actorCodeFromRequest($request);

        // order by
        if ($tab === 'action' && !empty($order)) {
            $dir = strtolower((string) ($order[0]['dir'] ?? 'desc')) === 'asc' ? 'asc' : 'desc';
            $idx = (int) ($order[0]['column'] ?? -1);
            $ordered = true;
            if ($idx === 0) {
                $D->orderBy('po_no', $dir);
            } elseif ($idx === 1) {
                $D->orderBy('company', $dir);
            } elseif ($idx === 2) {
                $D->orderBy('to', $dir);
            } elseif ($idx === 3) {
                $D->orderBy('requisition_date', $dir);
            } elseif ($idx === 4) {
                $D->orderBy('grand_total', $dir);
            } elseif ($idx === 5 && $actorCode !== '') {
                [$expression, $bindings] = $this->purchaseOrderActionStepSortExpression($actorCode);
                $D->orderByRaw($expression . ' ' . $dir, $bindings);
            } elseif ($idx === 6 && $actorCode !== '') {
                [$expression, $bindings] = $this->purchaseOrderActionStatusSortExpression($actorCode);
                $D->orderByRaw($expression . ' ' . $dir, $bindings);
            } else {
                $ordered = false;
            }

            if ($ordered) {
                $D->orderBy('id', 'desc');
            } else {
                $D->orderBy('po_no', 'desc')->orderBy('id', 'desc');
            }
        } elseif (!empty($order) && (int) ($order[0]['column'] ?? -1) === 1) {
            $dir = strtolower((string) ($order[0]['dir'] ?? 'desc')) === 'asc' ? 'asc' : 'desc';
            $D->orderByRaw($this->purchaseOrderWorkflowSortExpression() . ' ' . $dir)
                ->orderBy('id', 'desc');
        } elseif (!empty($order) && ($orderby[$order[0]['column']] ?? false)) {
            $dir = strtolower((string) ($order[0]['dir'] ?? 'desc')) === 'asc' ? 'asc' : 'desc';
            $D->orderBy($orderby[$order[0]['column']], $dir)
                ->orderBy('id', 'desc');
        } else {
            $D->orderBy('po_no', 'desc')
                ->orderBy('id', 'desc');
        }

        $d = $D->paginate($length, ['*'], 'page', $page);

        if ($d->isNotEmpty()) {
            $No = (($page - 1) * $length);
            for ($i = 0; $i < count($d); $i++) {
                $No        = $No + 1;
                $d[$i]->No = $No;
            }
        }

        $payload = $d->toArray();
        $payload['company_options'] = PurchaseOrder::query()
            ->whereNotNull('company')
            ->where('company', '<>', '')
            ->distinct()
            ->orderBy('company')
            ->pluck('company')
            ->values()
            ->all();

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $payload);
    }

    // =========== show ===========
    public function show($id)
    {
        $Item = PurchaseOrder::with(['items', 'purchaseRequisition.items'])->find($id);

        if (!$Item) {
            return $this->returnErrorData('ไม่พบรายการที่ระบุ', 404);
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $Item);
    }

    // =========== store ===========
    public function store(Request $request)
    {
        $loginBy = $request->login_by;
        $status = $this->normalizeDocumentStatus($request->input('status', self::STATUS_SUBMITTED));
        $isDraft = $this->isDraftStatus($status);

        if ($validationError = $this->validatePurchaseOrderRequest($request, $isDraft)) {
            return $validationError;
        }

        $normalizedAttachments = $this->normalizeAttachments($request->input('attachments'));
        if ($attachmentError = $this->validatePdfOnlyAttachments($normalizedAttachments)) {
            return $attachmentError;
        }

        DB::beginTransaction();

        try {

            $Item = new PurchaseOrder();
            $Item->purchase_requisition_id = $this->normalizePurchaseRequisitionId($request->purchase_requisition_id ?? null);

            // Header
            $Item->to       = $isDraft ? $this->draftString($request->to ?? null) : $this->defaultString($request->to ?? null);
            $Item->company  = $isDraft ? $this->draftString($request->company ?? null) : $this->defaultString($request->company ?? null);
            $Item->fax      = $request->fax ?? null;
            $Item->from     = $isDraft ? $this->draftString($request->from ?? null) : $this->defaultString($request->from ?? null, 'Meinhardt (Thailand) Ltd.');
            $Item->cc       = $request->cc ?? null;
            $Item->subject  = $request->subject ?? null;

            // PO Info (ใช้ค่าที่ส่งมา ตรง ๆ)
            $Item->po_no            = $this->resolvePurchaseOrderNumber($request);
            $Item->status           = $status;
            $Item->po_date          = $this->nullableDateTime($request->po_date ?? null) ?: now();
            $Item->requisition_date = $this->nullableDateTime($request->requisition_date ?? null);
            $Item->page             = $request->page ?? 1;
            $Item->total_page       = $request->total_page ?? 1;
            $Item->circ             = $request->circ ?? null;

            // General
            $Item->quotation_no     = $request->quotation_no ?? null;
            $Item->quotation_date   = $this->nullableDateTime($request->quotation_date ?? null);
            $Item->delivery_date    = $request->delivery_date;
            $Item->payment_term     = $request->has('payment_term') ? $request->payment_term : self::DEFAULT_PAYMENT_TERM;
            $Item->other_conditions = $request->other_conditions ?? null;

            $Item->vat = isset($request->vat) ? (bool)$request->vat : false;
            $Item->currency_code = $this->normalizeCurrencyCodeInput($request->currency_code ?? null);

            $Item->sub_total   = $request->sub_total;
            $Item->vat_value   = $request->vat_value;
            $Item->discount    = $request->discount ?? 0;
            $Item->grand_total = $request->grand_total;

            // Approval & Review
            $Item->purchase_request_by   = $request->purchase_request_by ?? null;
            $Item->purchase_request_by_date = $this->normalizeDateTimeInput($request->purchase_request_by_date ?? null);
            $Item->purchase_request_by_status = $request->purchase_request_by_status ?? null;
            $Item->verified_by           = $request->verified_by ?? null;
            $Item->verified_by_date = $this->normalizeDateTimeInput($request->verified_by_date ?? null);
            $Item->verified_by_status = $request->verified_by_status ?? null;
            $Item->approved_by           = $request->approved_by ?? null;
            $Item->approved_by_date = $this->normalizeDateTimeInput($request->approved_by_date ?? null);
            $Item->approved_by_status = $request->approved_by_status ?? null;
            $Item->circ_date = $this->normalizeDateTimeInput($request->circ_date ?? null);
            $Item->circ_status = $request->circ_status ?? null;

            // Checklist
            $Item->delivery_on_time          = $request->delivery_on_time ?? null;
            $Item->meet_quality_requirement  = $request->meet_quality_requirement ?? null;
            $Item->meet_equipment_guidelines = $request->meet_equipment_guidelines ?? null;

            // Comments & Signatures
            $Item->comments          = $request->comments ?? null;
            $Item->comment_all       = $request->comment_all ?? null;
            $Item->signed_by         = $request->signed_by ?? null;
            $Item->signed_by_date = $this->normalizeDateTimeInput($request->signed_by_date ?? null);
            $Item->signed_by_status = $request->signed_by_status ?? null;
            $Item->acknowledged_by   = $request->acknowledged_by ?? null;
            $Item->acknowledged_by_date = $this->normalizeDateTimeInput($request->acknowledged_by_date ?? null);
            $Item->acknowledged_by_status = $request->acknowledged_by_status ?? null;

            if ($isDraft) {
                $this->applyDraftWorkflowDefaults($Item);
            }

            $Item->attachments = $this->encodeAttachments($normalizedAttachments);

            $Item->create_by = $loginBy->employee_code ?? $loginBy->id ?? 'admin';
            $Item->save();
            $Item->attachments = $normalizedAttachments;

            // Items
            foreach (($request->items ?? []) as $row) {
                if (!is_array($row) || $this->shouldSkipPurchaseOrderItem($row, $isDraft)) {
                    continue;
                }

                $qty   = isset($row['quantity']) ? (int)$row['quantity'] : 0;
                $price = isset($row['unit_price']) ? (float)$row['unit_price'] : 0;
                $amt   = isset($row['amount']) ? (float)$row['amount'] : $qty * $price;
                $needAssetCodeRegistration = $this->normalizeBooleanFlag($row['need_asset_code_registration'] ?? false);
                $assetCode = isset($row['asset_code']) ? trim((string) $row['asset_code']) : null;

                $detail                    = new PurchaseOrderItem();
                $detail->purchase_order_id = $Item->id;
                $detail->item              = trim((string) ($row['item'] ?? ''));
                $detail->description       = $row['description'] ?? null;
                $detail->need_asset_code_registration = $needAssetCodeRegistration;
                $detail->asset_code        = $needAssetCodeRegistration && $assetCode !== '' ? $assetCode : null;
                $detail->quantity          = $qty;
                $detail->unit_price        = $price;
                $detail->amount            = $amt;
                $detail->save();
            }

            $this->logDocumentCreateAudit($request, $Item);

            DB::commit();
            return $this->returnSuccess('บันทึกข้อมูลสำเร็จ', $Item->load('items'));

        } catch (\Throwable $e) {

            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด ' . $e->getMessage(), 500);
        }
    }

    // =========== update ===========
    public function update(Request $request, $id)
    {
        $loginBy = $request->login_by;
        DB::beginTransaction();

        try {

            $Item = PurchaseOrder::lockForUpdate()->find($id);
            if (!$Item) {
                DB::rollBack();
                return $this->returnErrorData('ไม่พบข้อมูลที่ต้องการแก้ไข', 404);
            }

            $workflowSnapshot = $this->purchaseOrderWorkflowSnapshot($Item);
            $wasDraft = $this->isDraftStatus($Item->status);
            $status = $wasDraft
                ? $this->normalizeDocumentStatus($request->input('status', $Item->status ?? self::STATUS_DRAFT))
                : (string) ($Item->status ?? self::STATUS_SUBMITTED);
            $isDraft = $this->isDraftStatus($status);

            if ($validationError = $this->validatePurchaseOrderRequest($request, $isDraft)) {
                DB::rollBack();
                return $validationError;
            }


            // Header
            $Item->to       = $isDraft ? $this->draftString($request->to ?? null) : $this->defaultString($request->to ?? null);
            $Item->company  = $isDraft ? $this->draftString($request->company ?? null) : $this->defaultString($request->company ?? null);
            $Item->fax      = $request->fax ?? null;
            $Item->from     = $isDraft ? $this->draftString($request->from ?? null) : $this->defaultString($request->from ?? null, 'Meinhardt (Thailand) Ltd.');
            $Item->cc       = $request->cc ?? null;
            $Item->subject  = $request->subject ?? null;

            // PO Info
            if ($request->has('purchase_requisition_id')) {
                $Item->purchase_requisition_id = $this->normalizePurchaseRequisitionId($request->purchase_requisition_id);
            }
            $Item->po_no            = $this->resolvePurchaseOrderNumber($request, $Item);
            $Item->status           = $status;
            $Item->po_date          = $this->nullableDateTime($request->po_date ?? null) ?: ($Item->po_date ?: now());
            $Item->requisition_date = $this->nullableDateTime($request->requisition_date ?? null);
            $Item->page             = $request->page ?? 1;
            $Item->total_page       = $request->total_page ?? 1;
            $Item->circ             = $request->circ ?? null;

            // General
            $Item->quotation_no     = $request->quotation_no ?? null;
            $Item->quotation_date   = $this->nullableDateTime($request->quotation_date ?? null);
            $Item->delivery_date    = $request->delivery_date;
            if ($request->has('payment_term')) {
                $Item->payment_term = $request->payment_term;
            } elseif ($Item->payment_term === null) {
                $Item->payment_term = self::DEFAULT_PAYMENT_TERM;
            }
            $Item->other_conditions = $request->other_conditions ?? null;

            $Item->vat = $request->boolean('vat');
            $Item->currency_code = $this->normalizeCurrencyCodeInput($request->input('currency_code'), $Item->currency_code ?? 'THB');

            $Item->sub_total   = $request->sub_total;
            $Item->vat_value   = $request->vat_value;
            $Item->discount    = $request->discount ?? 0;
            $Item->grand_total = $request->grand_total;

             // Approval & Review
            $Item->purchase_request_by   = $request->purchase_request_by ?? null;
            $Item->purchase_request_by_date = $this->normalizeDateTimeInput($request->purchase_request_by_date ?? null);
            $Item->purchase_request_by_status = $request->purchase_request_by_status ?? null;
            $Item->verified_by           = $request->verified_by ?? null;
            $Item->verified_by_date = $this->normalizeDateTimeInput($request->verified_by_date ?? null);
            $Item->verified_by_status = $request->verified_by_status ?? null;
            $Item->approved_by           = $request->approved_by ?? null;
            $Item->approved_by_date = $this->normalizeDateTimeInput($request->approved_by_date ?? null);
            $Item->approved_by_status = $request->approved_by_status ?? null;
            $Item->circ_date = $this->normalizeDateTimeInput($request->circ_date ?? null);
            $Item->circ_status = $request->circ_status ?? null;

            // Checklist
            $Item->delivery_on_time          = $request->delivery_on_time ?? null;
            $Item->meet_quality_requirement  = $request->meet_quality_requirement ?? null;
            $Item->meet_equipment_guidelines = $request->meet_equipment_guidelines ?? null;

            // Comments & Signatures
            $Item->comments          = $request->comments ?? null;
            $Item->comment_all       = $request->comment_all ?? null;
            $Item->signed_by         = $request->signed_by ?? null;
            $Item->signed_by_date = $this->normalizeDateTimeInput($request->signed_by_date ?? null);
            $Item->signed_by_status = $request->signed_by_status ?? null;
            $Item->acknowledged_by   = $request->acknowledged_by ?? null;
            $Item->acknowledged_by_date = $this->normalizeDateTimeInput($request->acknowledged_by_date ?? null);
            $Item->acknowledged_by_status = $request->acknowledged_by_status ?? null;

            $this->applyPurchaseOrderUpdateWorkflow(
                $Item,
                $workflowSnapshot,
                $wasDraft,
                $isDraft,
                $request->boolean('reset_workflow')
            );

            if ($request->has('attachments')) {
                $attachments = $request->input('attachments');
                $normalizedAttachments = $this->normalizeAttachments($attachments);
                if ($attachmentError = $this->validatePdfOnlyAttachments($normalizedAttachments)) {
                    DB::rollBack();
                    return $attachmentError;
                }
                $Item->attachments = $this->encodeAttachments($normalizedAttachments);
            }

            $Item->update_by = $loginBy->employee_code ?? $loginBy->id ?? 'admin';
            $Item->save();
            if (isset($normalizedAttachments)) {
                $Item->attachments = $normalizedAttachments;
            }

            // ลบ items เดิมแล้วสร้างใหม่
            PurchaseOrderItem::where('purchase_order_id', $Item->id)->delete();

            foreach (($request->items ?? []) as $row) {
                if (!is_array($row) || $this->shouldSkipPurchaseOrderItem($row, $isDraft)) {
                    continue;
                }

                $qty   = isset($row['quantity']) ? (int)$row['quantity'] : 0;
                $price = isset($row['unit_price']) ? (float)$row['unit_price'] : 0;
                $amt   = isset($row['amount']) ? (float)$row['amount'] : $qty * $price;
                $needAssetCodeRegistration = $this->normalizeBooleanFlag($row['need_asset_code_registration'] ?? false);
                $assetCode = isset($row['asset_code']) ? trim((string) $row['asset_code']) : null;

                $detail                    = new PurchaseOrderItem();
                $detail->purchase_order_id = $Item->id;
                $detail->item              = trim((string) ($row['item'] ?? ''));
                $detail->description       = $row['description'] ?? null;
                $detail->need_asset_code_registration = $needAssetCodeRegistration;
                $detail->asset_code        = $needAssetCodeRegistration && $assetCode !== '' ? $assetCode : null;
                $detail->quantity          = $qty;
                $detail->unit_price        = $price;
                $detail->amount            = $amt;
                $detail->save();
            }

            DB::commit();
            return $this->returnUpdateReturnData('อัปเดตข้อมูลสำเร็จ', $Item->load('items'));

        } catch (\Throwable $e) {

            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด ' . $e->getMessage(), 500);
        }
    }

    // =========== destroy ===========
    public function destroy($id, Request $request)
    {
        $loginBy = $request->login_by;

        if (!isset($id)) {
            return $this->returnErrorData('ไม่พบข้อมูล id', 404);
        }

        DB::beginTransaction();

        try {

            $Item = PurchaseOrder::find($id);
            if (!$Item) {
                DB::rollBack();
                return $this->returnErrorData('ไม่พบข้อมูลในระบบ', 404);
            }

            $Item->delete();

            // log
            $userId      = $loginBy->employee_code ?? $loginBy->id ?? 'admin';
            $type        = 'ลบข้อมูล purchase_order';
            $description = 'ผู้ใช้งาน ' . $userId . ' ได้ทำการ ' . $type . ' #' . $Item->id;
            $this->Log($userId, $description, $type);

            DB::commit();
            return $this->returnSuccess('ลบข้อมูลสำเร็จ', []);

        } catch (\Throwable $e) {

            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง ' . $e->getMessage(), 500);
        }
    }

    public function submit($id, Request $request)
    {
        $loginBy = $request->login_by;

        DB::beginTransaction();

        try {
            $Item = PurchaseOrder::with('items')->lockForUpdate()->find($id);
            if (!$Item) {
                DB::rollBack();
                return $this->returnErrorData('ไม่พบข้อมูลที่ต้องการส่งอนุมัติ', 404);
            }

            if ($validationError = $this->validateStoredPurchaseOrderForSubmit($Item)) {
                DB::rollBack();
                return $validationError;
            }

            $Item->po_no = $this->resolvePurchaseOrderNumber($request, $Item);
            $Item->status = self::STATUS_SUBMITTED;
            $Item->update_by = $loginBy->employee_code ?? $loginBy->id ?? 'admin';
            $this->applySubmittedWorkflowDefaults($Item);
            $Item->save();

            DB::commit();
            return $this->returnUpdateReturnData('ส่งอนุมัติสำเร็จ', $Item->load('items'));

        } catch (\Throwable $e) {

            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด ' . $e->getMessage(), 500);
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
            $Item = PurchaseOrder::with('items')->lockForUpdate()->find($id);
            if (!$Item) {
                DB::rollBack();
                return $this->returnErrorData('ไม่พบข้อมูลที่ต้องการดำเนินการ', 404);
            }

            if ($this->isDraftStatus($Item->status)) {
                DB::rollBack();
                return $this->workflowError('เอกสาร Draft ยังไม่สามารถส่งอนุมัติหรือดำเนินการได้', 409);
            }

            if ($this->normalizeWorkflowStatusValue($Item->status) === self::STATUS_APPROVED) {
                DB::rollBack();
                return $this->workflowError('เอกสารนี้อนุมัติครบแล้ว', 409);
            }

            if ($this->normalizeWorkflowStatusValue($Item->status) === self::STATUS_REJECTED) {
                DB::rollBack();
                return $this->workflowError('เอกสารนี้ถูก Reject แล้ว ต้องแก้ไขและส่งอนุมัติใหม่ก่อน', 409);
            }

            $currentStep = $this->currentPurchaseOrderActionStep($Item);
            if ($currentStep === null) {
                DB::rollBack();
                return $this->workflowError('ไม่พบ step ที่รอดำเนินการ', 409);
            }

            if ($currentStep['type'] !== $type) {
                DB::rollBack();
                return $this->workflowError('ยังไม่ถึงลำดับการดำเนินการนี้', 409);
            }

            $actorCode = $this->actorCodeFromRequest($request);
            $assigneeCode = $Item->{$currentStep['by']} ?? null;
            if (!$this->codesMatch($assigneeCode, $actorCode)) {
                DB::rollBack();
                return $this->workflowError('ผู้ใช้งานปัจจุบันไม่มีสิทธิ์ดำเนินการใน step นี้', 403);
            }

            $oldValue = $Item->{$currentStep['status']} ?? null;
            if ($this->isApprovedWorkflowStatus($oldValue) || $this->isRejectedWorkflowStatus($oldValue)) {
                DB::rollBack();
                return $this->workflowError('step นี้ถูกดำเนินการไปแล้ว', 409);
            }

            if ($currentStep['type'] === 'signed_by_status') {
                if ($request->has('delivery_on_time')) {
                    $Item->delivery_on_time = $this->nullableBooleanFlag($request->input('delivery_on_time'));
                }
                if ($request->has('meet_quality_requirement')) {
                    $Item->meet_quality_requirement = $this->nullableBooleanFlag($request->input('meet_quality_requirement'));
                }
                if ($request->has('meet_equipment_guidelines')) {
                    $Item->meet_equipment_guidelines = $this->nullableBooleanFlag($request->input('meet_equipment_guidelines'));
                }
                if ($request->has('comments')) {
                    $Item->comments = $request->input('comments');
                }
            }

            $actionDate = now()->format('Y-m-d H:i:s');
            $Item->{$currentStep['status']} = $decision;
            $Item->{$currentStep['date']} = $actionDate;

            $autoApprovedAcknowledgement = false;
            $oldAcknowledgementValue = null;
            if ($this->shouldAutoApprovePurchaseOrderAcknowledgement($Item, $currentStep, $decision)) {
                $oldAcknowledgementValue = $Item->acknowledged_by_status ?? null;
                $Item->acknowledged_by_status = $decision;
                $Item->acknowledged_by_date = $actionDate;
                $autoApprovedAcknowledgement = true;
            }

            if ($decision === self::STATUS_REJECTED) {
                $Item->status = self::STATUS_REJECTED;
            } else {
                $nextStep = $this->nextPurchaseOrderActionStep($Item, $currentStep['type']);
                if ($nextStep === null) {
                    $Item->status = self::STATUS_APPROVED;
                } elseif (!$this->isApprovedWorkflowStatus($Item->{$nextStep['status']} ?? null)) {
                    $Item->{$nextStep['status']} = $Item->{$nextStep['status']} ?: 'pending';
                    $Item->{$nextStep['date']} = null;
                    $Item->status = self::STATUS_SUBMITTED;
                }
            }

            $Item->update_by = $actorCode;
            $Item->save();

            $this->logActionRequestAudit(
                $request,
                'purchase_orders',
                $Item->id,
                $currentStep['status'],
                $oldValue,
                $decision,
                $request->input('comments') ?? $request->input('comment') ?? null
            );

            if ($autoApprovedAcknowledgement) {
                $this->logActionRequestAudit(
                    $request,
                    'purchase_orders',
                    $Item->id,
                    'acknowledged_by_status',
                    $oldAcknowledgementValue,
                    $decision,
                    'Auto-approved because Signed By and Acknowledge By are the same person'
                );
            }

            DB::commit();
            return $this->returnUpdateReturnData('อัปเดตสถานะสำเร็จ', $Item->load('items'));

        } catch (\Throwable $e) {
            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด ' . $e->getMessage(), 500);
        }
    }


    public function export(Request $request)
    {
        $columns = $this->purchaseOrderPageColumns();
        $query = PurchaseOrder::select($columns);
        $this->applyPurchaseOrderRequestFilters($query, $request, $columns);

        $items = $query->orderBy('id', 'desc')->get();
        $employeeLookup = $this->purchaseOrderExportEmployeeLookup($items);
        $rows = [];

        foreach ($items as $item) {
            $rows[] = [
                $item->po_no ?? '',
                $item->subject ?? '',
                $item->company ?? '',
                $item->to ?? '',
                $this->formatExportDate($item->po_date ?? null),
                $this->formatExportDate($item->requisition_date ?? null),
                $this->getPurchaseOrderWorkflowStatus($item),
                $item->currency_code ?? 'THB',
                (float) ($item->sub_total ?? 0),
                (float) ($item->vat_value ?? 0),
                (float) ($item->discount ?? 0),
                (float) ($item->grand_total ?? 0),
                $this->purchaseOrderExportEmployeeName($item->purchase_request_by, $employeeLookup),
                $this->purchaseOrderExportEmployeeName($item->verified_by, $employeeLookup),
                $this->purchaseOrderExportEmployeeName($item->approved_by, $employeeLookup),
                $this->purchaseOrderExportEmployeeName($item->circ, $employeeLookup),
                $this->purchaseOrderExportEmployeeName($item->signed_by, $employeeLookup),
                $this->purchaseOrderExportEmployeeName($item->acknowledged_by, $employeeLookup),
                $this->purchaseOrderExportEmployeeName($item->create_by, $employeeLookup),
                $this->formatExportDate($item->created_at ?? null),
            ];
        }

        $filename = 'purchase-orders-' . date('Ymd-His') . '.xlsx';
        return Excel::download(new PurchaseOrderExport($rows), $filename);
    }


    public function getNextNumber(Request $request): JsonResponse
    {
        $year = $this->purchaseDocumentNumberService()->yearFromDate(
            $request->input('year', $request->input('po_date', $request->input('date')))
        );
        $nextNumber = $this->getNextPurchaseOrderNumber(false, $year);

        return response()->json([
            'success' => true,
            'data' => [
                'next_po_no' => $nextNumber,
                'next_number' => $nextNumber,
                'year' => $year,
            ]
        ]);
    }
}
