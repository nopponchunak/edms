import { Component, OnInit, OnDestroy } from '@angular/core';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeHtml, SafeResourceUrl } from '@angular/platform-browser';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PurchaseOrderService } from 'app/core/services/purchase-order.service';
import { AuthenticatedPdfService } from 'app/core/services/authenticated-pdf.service';
import { PurchaseOrder } from 'app/core/services/purchase-order.service';
import { PurchaseRequisitionService } from 'app/core/services/purchase-requisition.service';
import { PURCHASE_ORDER_EMAIL_CONFIG, WorkflowEmailNotificationService } from 'app/core/services/workflow-email-notification.service';
import {
  AttachmentDisplayItem,
  getAttachmentDisplayItems,
  getAttachmentIcon,
  getAttachmentPreviewType,
  getAttachmentTypeLabel,
} from 'app/core/utils/attachment-url.util';
import { EmployeeService } from 'app/core/services/employee.service';
import { SignatureSetting, SignatureSettingService } from 'app/core/services/signature-setting.service';
import { catchError, finalize, forkJoin, map, of, Subject, switchMap, takeUntil } from 'rxjs';
import { ViewActionsComponent } from 'app/core/components/view-actions';
import { DEFAULT_PURCHASE_PAYMENT_TERM } from 'app/core/constants/purchase-payment-term.constant';
import { formatPoSignatureId, getPoSignatureLookupCandidates } from './po-signature-print.util';
import { ApprovalWorkflowStep, buildApprovalWorkflowSteps } from '../po-approval-workflow.util';
import {
  excludePurchaseRequisitionPdfFromAttachments,
  getPurchaseRequisitionPdfDisplayItems,
} from '../po-purchase-requisition-pdf.util';
import { PurchaseOrderPrPdfCardComponent } from '../purchase-order-pr-pdf-card.component';

interface PrintablePurchaseOrderPage {
  items: any[];
  pageNumber: number;
  totalPages: number;
  isLast: boolean;
}

@Component({
  selector: 'app-purchase-order-view',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatSnackBarModule,
    ViewActionsComponent,
    PurchaseOrderPrPdfCardComponent,
  ],
  templateUrl: './purchase-order-view.component.html',
  styleUrls: ['./purchase-order-view.component.scss'],
})
export class PurchaseOrderViewComponent implements OnInit, OnDestroy {
  readonly defaultPaymentTerm = DEFAULT_PURCHASE_PAYMENT_TERM;
  readonly printRowsPerPage = 12;
  readonly printPageMaxWeight = 14;
  private readonly defaultFromLabel = 'Meinhardt (Thailand) Ltd.';

  private _unsubscribeAll: Subject<any> = new Subject<any>();
  purchaseOrder: PurchaseOrder | null = null;
  poDocument: any = null;
  displayCurrency = 'THB';
  /** Attachments from API with full URL for download */
  attachmentLinks: AttachmentDisplayItem[] = [];
  selectedAttachment: AttachmentDisplayItem | null = null;
  selectedAttachmentResourceUrl: SafeResourceUrl | null = null;
  purchaseRequisitionPdfLinks: AttachmentDisplayItem[] = [];
  selectedPurchaseRequisitionPdf: AttachmentDisplayItem | null = null;
  selectedPurchaseRequisitionPdfResourceUrl: SafeResourceUrl | null = null;
  private purchaseRequisitionPdfObjectUrl: string | null = null;
  isLoading = false;
  employeeLookup = new Map<string, string>();
  employeeLookupWithTitle = new Map<string, string>();
  activeSignatureSettings = new Map<string, SignatureSetting>();
  isResendingEmail = false;
  isPrintDocumentMode = false;
  printDocumentHtml: SafeHtml | null = null;
  printDocumentStyles = '';
  printDocumentReady = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private purchaseOrderService: PurchaseOrderService,
    private purchaseRequisitionService: PurchaseRequisitionService,
    private workflowEmailNotificationService: WorkflowEmailNotificationService,
    private employeeService: EmployeeService,
    private signatureSettingService: SignatureSettingService,
    private sanitizer: DomSanitizer,
    private authenticatedPdfService: AuthenticatedPdfService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.isPrintDocumentMode =
      this.route.snapshot.data?.['printDocument'] === true ||
      this.route.snapshot.queryParamMap.has('printDocument');
    this.loadPurchaseOrder();
  }

  ngOnDestroy(): void {
    this.clearSelectedPurchaseRequisitionPdf();
    this._unsubscribeAll.next(null);
    this._unsubscribeAll.complete();
  }

  private loadPurchaseOrder(): void {
    this.isLoading = true;

    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/purchase-order']);
      return;
    }

    forkJoin({
      purchaseOrder: this.purchaseOrderService.findOne(id),
      employeeLookup: this.employeeService.getEmployeeLookupMap(),
      employeeLookupWithTitle: this.employeeService.getEmployeeLookupMapWithTitle()
    }).pipe(
      switchMap(({ purchaseOrder, employeeLookup, employeeLookupWithTitle }) =>
        this.withPurchaseRequisitionDisplaySource(purchaseOrder).pipe(
          map((purchaseOrderWithRequisition) => ({
            purchaseOrder: purchaseOrderWithRequisition,
            employeeLookup,
            employeeLookupWithTitle,
          }))
        )
      ),
      switchMap(({ purchaseOrder, employeeLookup, employeeLookupWithTitle }) => {
        const employeeRefs = [
          purchaseOrder.purchaseRequestBy,
          purchaseOrder.verifiedBy,
          purchaseOrder.approvedBy,
          purchaseOrder.circ,
          purchaseOrder.signedBy,
          purchaseOrder.acknowledgedBy,
          purchaseOrder.createdBy,
          (purchaseOrder as any).updatedBy,
          (purchaseOrder as any).update_by
        ].filter(code => !!code);

        return forkJoin({
          employeeLookup: this.employeeService.ensureEmployeesInLookup(employeeLookup, employeeRefs),
          employeeLookupWithTitle: this.employeeService.ensureEmployeesInLookup(employeeLookupWithTitle, employeeRefs),
        }).pipe(
          switchMap((lookups) => {
            const signatureLookupRefs = this.getSignatureLookupRefsFromValues(employeeRefs, lookups.employeeLookup);

            return this.signatureSettingService.getActiveMapByCodes(signatureLookupRefs).pipe(
              catchError(() => of(new Map<string, SignatureSetting>())),
              map((activeSignatureSettings) => ({
                purchaseOrder,
                employeeLookup: lookups.employeeLookup,
                employeeLookupWithTitle: lookups.employeeLookupWithTitle,
                activeSignatureSettings,
              }))
            );
          })
        );
      }),
      takeUntil(this._unsubscribeAll)
    ).subscribe({
      next: ({ purchaseOrder, employeeLookup, employeeLookupWithTitle, activeSignatureSettings }) => {
        this.employeeLookup = employeeLookup;
        this.employeeLookupWithTitle = employeeLookupWithTitle;
        this.activeSignatureSettings = activeSignatureSettings;
        const discount = Number((purchaseOrder as any).discount) || 0;
        const hasVat = purchaseOrder.vat === 1 || purchaseOrder.vat === true;
        const currencyCode = this.normalizeCurrencyCode((purchaseOrder as any).currency_code || (purchaseOrder as any).currency || 'THB');
        const itemsTotal = purchaseOrder.items && purchaseOrder.items.length > 0
          ? purchaseOrder.items.reduce((sum, item) => {
              const amount = Number(item.amount);
              return sum + (Number.isFinite(amount) ? amount : 0);
            }, 0)
          : 0;
        const subTotal = Number(purchaseOrder.subTotal) || Math.max(0, itemsTotal - discount);
        const vat = Number(purchaseOrder.vatValue) || 0;
        const grandTotal = Number(purchaseOrder.grandTotal) || (subTotal + vat);

        this.purchaseOrder = {
          ...purchaseOrder,
          discount,
          subTotal,
          vatValue: vat,
          grandTotal
        };
        this.displayCurrency = currencyCode;

        const sourceAttachmentLinks = getAttachmentDisplayItems(purchaseOrder.attachments);
        this.purchaseRequisitionPdfLinks = getPurchaseRequisitionPdfDisplayItems(purchaseOrder, sourceAttachmentLinks);
        this.attachmentLinks = excludePurchaseRequisitionPdfFromAttachments(purchaseOrder, sourceAttachmentLinks);
        this.clearSelectedPurchaseRequisitionPdf();
        this.clearSelectedAttachment();

        // Build poDocument for display
        this.poDocument = {
          taxId: '0105534077670',
          header: {
            to: purchaseOrder.to,
            company: purchaseOrder.company,
            fax: purchaseOrder.fax || '',
            from: this.getPurchaseOrderFromPrintValue(purchaseOrder),
            cc: purchaseOrder.cc || '',
          },
          poInfo: {
            poNo: purchaseOrder.poNo || '',
            poDate: purchaseOrder.poDate ? this.formatDate(purchaseOrder.poDate) : '',
            requisitionDate: this.formatDate(purchaseOrder.requisitionDate),
            page: purchaseOrder.pageNumber || 1,
            of: purchaseOrder.totalPages || 1,
            circ: purchaseOrder.circ || '-',
          },
          items: purchaseOrder.items ? purchaseOrder.items.map((it) => ({
            name: it.item,
            description: it.description,
            needAssetCodeRegistration: it.needAssetCodeRegistration === true,
            assetCode: it.assetCode || '',
            qty: it.quantity,
            unitPrice: it.unitPrice,
            amount: it.amount,
          })) : [],
          totals: {
            discount,
            subTotal,
            vat,
            grandTotal,
          },
          general: {
            quotationNo: purchaseOrder.quotationNo || '',
            quotationDate: purchaseOrder.quotationDate ? this.formatDate(purchaseOrder.quotationDate) : '',
            deliveryDate: typeof purchaseOrder.deliveryDate === 'string'
                ? purchaseOrder.deliveryDate
                : (purchaseOrder.deliveryDate ? this.formatDate(purchaseOrder.deliveryDate) : ''),
            paymentTerm: purchaseOrder.paymentTerm ?? this.defaultPaymentTerm,
            otherConditions: purchaseOrder.otherConditions || '',
          },
          approval: {
            purchaseRequestBy: purchaseOrder.purchaseRequestBy || '',
            purchaseRequestByDate: purchaseOrder.purchaseRequestByDate || null,
            purchaseRequestByStatus: purchaseOrder.purchaseRequestByStatus || null,
            purchaseRequestDate: purchaseOrder.purchaseRequestByDate ? this.formatDate(purchaseOrder.purchaseRequestByDate) : '',
            verifiedBy: purchaseOrder.verifiedBy || '',
            verifiedByDate: purchaseOrder.verifiedByDate || null,
            verifiedByStatus: purchaseOrder.verifiedByStatus || null,
            verifiedDate: purchaseOrder.verifiedDate ? this.formatDate(purchaseOrder.verifiedDate) : '',
            approvedBy: purchaseOrder.approvedBy || '',
            approvedByDate: purchaseOrder.approvedByDate || null,
            approvedByStatus: purchaseOrder.approvedByStatus || null,
            approvedDate: purchaseOrder.approvedDate ? this.formatDate(purchaseOrder.approvedDate) : '',
            circ: purchaseOrder.circ || '',
            circDate: purchaseOrder.circDate || null,
            circStatus: purchaseOrder.circStatus || null,
            signedBy: purchaseOrder.signedBy || '',
            signedByDate: purchaseOrder.signedByDate || null,
            signedByStatus: purchaseOrder.signedByStatus || null,
            acknowledgedBy: purchaseOrder.acknowledgedBy || '',
            acknowledgedByDate: purchaseOrder.acknowledgedByDate || null,
            acknowledgedByStatus: purchaseOrder.acknowledgedByStatus || null,
          },
          checklist: {
            deliveryOnTime: purchaseOrder.deliveryOnTime,
            meetQualityRequirement: purchaseOrder.meetQualityRequirement,
            meetGuidelinesForEquipment: purchaseOrder.meetGuidelinesForEquipment,
          },
          comments: {
            main: purchaseOrder.deliveryComments || '',
            signedBy: purchaseOrder.signedBy || '',
            signedByDate: purchaseOrder.signedByDate || null,
            signedByStatus: purchaseOrder.signedByStatus || null,
            signedDate: purchaseOrder.signedDate ? this.formatDate(purchaseOrder.signedDate) : '',
            ackBy: purchaseOrder.acknowledgedBy || '',
            ackByDate: purchaseOrder.acknowledgedByDate || null,
            ackByStatus: purchaseOrder.acknowledgedByStatus || null,
            ackDate: purchaseOrder.acknowledgedByDate ? this.formatDate(purchaseOrder.acknowledgedByDate) : '',
          },
          meta: {
            vatEnabled: hasVat,
            currency: currencyCode,
            createdBy: purchaseOrder.createdBy || '-',
            createdAt: purchaseOrder.createdAt ? this.formatDateTime(purchaseOrder.createdAt) : '-',
            updatedAt: purchaseOrder.updatedAt ? this.formatDateTime(purchaseOrder.updatedAt) : '-',
            updatedBy: (purchaseOrder as any).updatedBy || (purchaseOrder as any).update_by || '-',
          },
        };

        this.isLoading = false;
        this.refreshPrintDocumentRenderState();
      },
      error: (error) => {
        console.error('Error loading purchase order:', error);
        this.isLoading = false;
        this.router.navigate(['/purchase-order']);
      }
    });
  }

  getEmployeeLabel(ref: string | number | null | undefined): string {
    return this.employeeService.formatEmployeeReference(ref, this.employeeLookup);
  }

  selectAttachment(attachment: AttachmentDisplayItem): void {
    this.selectedAttachment = attachment;
    this.selectedAttachmentResourceUrl = attachment.href
      ? this.sanitizer.bypassSecurityTrustResourceUrl(attachment.href)
      : null;
  }

  clearSelectedAttachment(): void {
    this.selectedAttachment = null;
    this.selectedAttachmentResourceUrl = null;
  }

  selectPurchaseRequisitionPdf(attachment: AttachmentDisplayItem): void {
    this.clearSelectedPurchaseRequisitionPdf();
    this.selectedPurchaseRequisitionPdf = attachment;
    if (attachment.type === 'backend-combined-pdf' && attachment.href) {
      this.authenticatedPdfService.loadObjectUrl(attachment.href)
        .pipe(takeUntil(this._unsubscribeAll))
        .subscribe({
          next: (objectUrl) => {
            if (this.selectedPurchaseRequisitionPdf !== attachment) {
              URL.revokeObjectURL(objectUrl);
              return;
            }
            this.purchaseRequisitionPdfObjectUrl = objectUrl;
            this.selectedPurchaseRequisitionPdfResourceUrl = this.sanitizer.bypassSecurityTrustResourceUrl(objectUrl);
          },
          error: () => this.snackBar.open('Unable to load purchase requisition PDF.', 'Close', { duration: 5000 }),
        });
      return;
    }
    this.selectedPurchaseRequisitionPdfResourceUrl = attachment.href
      ? this.sanitizer.bypassSecurityTrustResourceUrl(attachment.href)
      : null;
  }

  clearSelectedPurchaseRequisitionPdf(): void {
    if (this.purchaseRequisitionPdfObjectUrl) {
      URL.revokeObjectURL(this.purchaseRequisitionPdfObjectUrl);
      this.purchaseRequisitionPdfObjectUrl = null;
    }
    this.selectedPurchaseRequisitionPdf = null;
    this.selectedPurchaseRequisitionPdfResourceUrl = null;
  }

  isAttachmentSelected(attachment: AttachmentDisplayItem): boolean {
    return this.selectedAttachment?.href === attachment.href
      && this.selectedAttachment?.fileName === attachment.fileName;
  }

  getAttachmentPreviewType(attachment: AttachmentDisplayItem | null | undefined): 'pdf' | 'image' | 'file' {
    return getAttachmentPreviewType(attachment);
  }

  getAttachmentTypeLabel(attachment: AttachmentDisplayItem | null | undefined): string {
    return getAttachmentTypeLabel(attachment);
  }

  getAttachmentIcon(attachment: AttachmentDisplayItem | null | undefined): string {
    return getAttachmentIcon(attachment);
  }

  getWorkflowSteps(): ApprovalWorkflowStep[] {
    return buildApprovalWorkflowSteps(this.poDocument?.approval);
  }

  getWorkflowStepIcon(status: string | null | undefined): string {
    const normalizedStatus = String(status || 'pending').toLowerCase();
    if (normalizedStatus === 'approve' || normalizedStatus === 'approved') {
      return 'check';
    }
    if (normalizedStatus === 'reject' || normalizedStatus === 'rejected') {
      return 'close';
    }
    return 'schedule';
  }

  getWorkflowDotClass(status: string | null | undefined): string {
    const normalizedStatus = String(status || 'pending').toLowerCase();
    if (normalizedStatus === 'approve' || normalizedStatus === 'approved') {
      return 'border border-green-200 bg-green-50 text-green-500 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300';
    }
    if (normalizedStatus === 'reject' || normalizedStatus === 'rejected') {
      return 'border border-rose-200 bg-rose-50 text-rose-500 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300';
    }
    return 'border border-amber-200 bg-amber-50 text-amber-500 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300';
  }

  getWorkflowLineClass(status: string | null | undefined): string {
    const normalizedStatus = String(status || 'pending').toLowerCase();
    if (normalizedStatus === 'approve' || normalizedStatus === 'approved') {
      return 'bg-green-100 dark:bg-green-900/30';
    }
    if (normalizedStatus === 'reject' || normalizedStatus === 'rejected') {
      return 'bg-rose-100 dark:bg-rose-900/30';
    }
    return 'bg-amber-100 dark:bg-amber-900/25';
  }

  getWorkflowStatusText(step: ApprovalWorkflowStep): string {
    return step.statusLabel || this.getByStatusText(step.status);
  }

  get isDraftDocument(): boolean {
    return String(this.purchaseOrder?.status || '').toUpperCase() === 'DRAFT';
  }

  getDocumentStatusLabel(): string {
    return this.isDraftDocument ? 'Draft' : 'Submitted';
  }

  getDocumentStatusBadgeClass(): string {
    return this.isDraftDocument
      ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
      : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
  }

  private getResendEmailMessage(result: any): string {
    if (result?.status === 'skipped') {
      if (result.reason === 'no_pending_step') {
        return 'No pending workflow step to resend';
      }

      if (result.reason === 'missing_action_email') {
        return 'Current pending approver has no email address';
      }

      if (result.reason === 'missing_action_recipient') {
        return 'Current pending approver is missing';
      }

      return 'Email resend was skipped';
    }

    return 'Email resent to the current pending approver';
  }

  // ===== Navigation =====
  onBack(): void {
    this.router.navigate(['/purchase-order']);
  }

  onEdit(): void {
    if (!this.purchaseOrder) return;
    this.router.navigate(['/purchase-order', this.purchaseOrder.id, 'edit']);
  }

  onOpenPrintPdf(): void {
    if (!this.purchaseOrder?.id) {
      return;
    }

    this.openPdfUrl(this.purchaseOrderService.getPrintPdfUrl(String(this.purchaseOrder.id)));
  }

  onOpenCombinedPdf(): void {
    if (!this.purchaseOrder?.id) {
      return;
    }

    this.openPdfUrl(this.purchaseOrderService.getCombinedPdfUrl(String(this.purchaseOrder.id)));
  }

  private openPdfUrl(url: string): void {
    this.authenticatedPdfService.open(url);
  }

  onPrint(): void {
    if (!this.purchaseOrder || !this.poDocument) {
      return;
    }

    try {
      const printMarkup = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Purchase Order</title>
            <style>${this.getPrintStyles()}</style>
          </head>
          <body>
            ${this.getPrintHtml()}
          </body>
        </html>
      `;

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        return;
      }

      printWindow.document.open();
      printWindow.document.write(printMarkup);
      printWindow.document.close();

      printWindow.onload = () => {
        const printDocument = () => setTimeout(() => {
          printWindow.focus();
          printWindow.print();
          printWindow.close();
        }, 300);

        const fontsReady = printWindow.document?.fonts?.ready;
        if (fontsReady) {
          fontsReady.then(printDocument).catch(printDocument);
        } else {
          printDocument();
        }
      };
    } catch (error) {
      console.error('Failed to generate purchase order print view:', error);
    }
  }

  private refreshPrintDocumentRenderState(): void {
    if (!this.isPrintDocumentMode || !this.purchaseOrder || !this.poDocument) {
      return;
    }

    this.printDocumentStyles = this.getPrintStyles();
    this.printDocumentHtml = this.sanitizer.bypassSecurityTrustHtml(`
      <style>${this.printDocumentStyles}</style>
      ${this.getPrintHtml()}
    `);
    this.markPrintDocumentReadyAfterFontsLoaded();
  }

  private markPrintDocumentReadyAfterFontsLoaded(): void {
    this.printDocumentReady = false;

    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-print-document-ready', 'false');
      document.getElementById('frontend-print-ready')?.setAttribute('data-ready', 'false');
    }

    const setReady = () => {
      this.printDocumentReady = true;

      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-print-document-ready', 'true');
        document.getElementById('frontend-print-ready')?.setAttribute('data-ready', 'true');
      }
    };

    if (typeof document === 'undefined') {
      setReady();
      return;
    }

    setTimeout(() => {
      const fontsReady = document.fonts?.ready;
      if (fontsReady) {
        fontsReady.then(setReady).catch(setReady);
      } else {
        setReady();
      }
    }, 0);
  }

  onResendEmail(): void {
    if (!this.purchaseOrder || this.isResendingEmail) {
      return;
    }

    this.isResendingEmail = true;
    this.workflowEmailNotificationService
      .resendCurrentPendingAction(PURCHASE_ORDER_EMAIL_CONFIG, this.purchaseOrder, this.purchaseOrder.id)
      .pipe(finalize(() => this.isResendingEmail = false))
      .subscribe({
        next: (result) => {
          this.snackBar.open(this.getResendEmailMessage(result), 'Close', { duration: 4000 });
        },
        error: (error) => {
          console.error('Failed to resend purchase order email notification:', error);
          this.snackBar.open('Failed to resend email notification', 'Close', { duration: 5000 });
        }
      });
  }

  // ===== helpers =====
  formatDate(date: Date | string): string {
    return formatDateDisplay(date);
  }

  formatCurrency(amount: number | string | null | undefined, currency?: string): string {
    const n = amount != null ? Number(amount) : 0;
    const curr = this.normalizeCurrencyCode(currency || this.displayCurrency || 'THB');
    try {
      return new Intl.NumberFormat('th-TH', {
        style: 'currency',
        currency: curr,
      }).format(Number.isFinite(n) ? n : 0);
    } catch {
      return `${new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(Number.isFinite(n) ? n : 0)} ${curr}`;
    }
  }

  hasAssetCodeItems(items: any[] | null | undefined): boolean {
    return Array.isArray(items) && items.some((item) => item?.needAssetCodeRegistration === true);
  }

  formatDateTime(dateString: string | null | undefined | Date): string {
    return formatDateTimeDisplay(dateString);
  }

  getByStatusText(status: string | null | undefined): string {
    if (!status) return 'Pending';
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'pending': return 'Pending';
      case 'reject':
      case 'rejected': return 'Rejected';
      case 'approve':
      case 'approved': return 'Approved';
      default: return status;
    }
  }

  getByStatusColor(status: string | null | undefined): string {
    if (!status) return 'bg-yellow-100 text-yellow-800';
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approve':
      case 'approved': return 'bg-green-100 text-green-800';
      case 'reject':
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  getChecklistText(value: boolean | null | undefined): string {
    if (value === true) return 'Yes';
    if (value === false) return 'No';
    return '-';
  }

  getChecklistColor(value: boolean | null | undefined): string {
    if (value === true) return 'text-green-600 bg-green-50 border-green-200';
    if (value === false) return 'text-red-600 bg-red-50 border-red-200';
    return 'text-gray-600 bg-gray-50 border-gray-200';
  }

  private getPrintHtml(): string {
    const doc = this.poDocument;
    const po = this.purchaseOrder;
    const approval = doc.approval;
    const comments = doc.comments;
    const checklist = doc.checklist;
    const header = doc.header;
    const info = doc.poInfo;
    const general = doc.general;
    const totals = doc.totals;
    const purchaseRequestByDate = po?.poDate || null;
    const purchaseRequestByValue = this.getEmployeePrintValue(
      approval.purchaseRequestBy,
      purchaseRequestByDate,
      { allowNameOnlySignature: true }
    );
    const verifiedByLabel = this.getApprovedEmployeePrintValue(approval.verifiedBy, approval.verifiedByStatus, approval.verifiedByDate || po?.verifiedDate);
    const verifiedByDate = this.getApprovedPrintDate(approval.verifiedByDate || po?.verifiedDate, approval.verifiedByStatus);
    const approvedByLabel = this.getApprovedEmployeePrintValue(approval.approvedBy, approval.approvedByStatus, approval.approvedByDate || po?.approvedDate);
    const approvedByDate = this.getApprovedPrintDate(approval.approvedByDate || po?.approvedDate, approval.approvedByStatus);
    const signedByLabel = this.getApprovedEmployeePrintValue(comments.signedBy, comments.signedByStatus, comments.signedByDate || po?.signedDate);
    const signedByDate = this.getApprovedPrintDate(comments.signedByDate || po?.signedDate, comments.signedByStatus);
    const acknowledgedByLabel = this.getApprovedEmployeePrintValue(comments.ackBy, comments.ackByStatus, comments.ackByDate);
    const acknowledgedByDate = this.getApprovedPrintDate(comments.ackByDate, comments.ackByStatus);
    const circValue = this.getPrintCircValue(info.circ, approval, comments, po);
    const assetCodesText = this.getPrintAssetCodesText(doc.items);
    const itemColgroup = `
      <colgroup>
        <col class="col-item" />
        <col class="col-desc" />
        <col class="col-qty" />
        <col class="col-price" />
        <col class="col-amount" />
      </colgroup>
    `;
    const printCurrency = this.escapeHtml(this.getPrintCurrencyLabel());

    return this.getPrintablePurchaseOrderPages().map((printPage) => {
      const pageLabel = `${printPage.pageNumber} of ${printPage.totalPages}`;
      const continuationClass = printPage.pageNumber > 1 ? ' print-page--continuation' : '';
      const totalsFooterHtml = printPage.isLast ? `
          <tfoot>
            <tr>
              <td rowspan="3" class="footer-spacer footer-spacer--open"></td>
              <td rowspan="3" class="footer-spacer footer-spacer--open footer-asset-codes">
                ${assetCodesText ? `<div class="footer-asset-codes-text">Asset code : ${this.escapeHtml(assetCodesText)}</div>` : '&nbsp;'}
              </td>
              <td rowspan="3" class="footer-spacer footer-spacer--open"></td>
              <td class="total-label">Sub Total</td>
              <td class="total-value">${this.formatPrintCurrency(totals.subTotal)}</td>
            </tr>
            <tr>
              <td class="total-label">VAT 7%</td>
              <td class="total-value">${this.formatPrintCurrency(totals.vat)}</td>
            </tr>
            <tr>
              <td class="total-label">Grand Total</td>
              <td class="total-value">${this.formatPrintCurrency(totals.grandTotal)}</td>
            </tr>
          </tfoot>
      ` : '';
      const afterTableHtml = printPage.isLast ? `
        <div class="after-table">
          <div class="two-col-row">
            ${this.getPrintSplitField('Quotation No.:', general.quotationNo, 'Date:', general.quotationDate)}
          </div>
          <div class="full-row">
            ${this.getPrintSingleField('Delivery Date:', general.deliveryDate)}
          </div>
          <div class="full-row multiline-row">
            ${this.getPrintSingleField('Payment Term:', general.paymentTerm)}
          </div>
          <div class="full-row">
            ${this.getPrintSingleField('Other conditions (if any):', general.otherConditions)}
          </div>
          <div class="two-col-row">
            ${this.getPrintSplitFieldHtml('Purchase Request by:', purchaseRequestByValue, '(Staff)   Date:', this.formatPrintDate(purchaseRequestByDate))}
          </div>
          <div class="two-col-row">
            ${this.getPrintSplitFieldHtml('Spare Part case: Verified by:', verifiedByLabel, '(MD/DI/AD/TL)   Date:', verifiedByDate)}
          </div>
          <div class="two-col-row">
            ${this.getPrintSplitFieldHtml('Approved By:', approvedByLabel, '(MD/DI)   Date:', approvedByDate)}
          </div>

          <div class="check-row">
            <div class="check-group">
              <span class="check-label">Delivery on time?</span>
              <span class="check-box">${checklist.deliveryOnTime === true ? '✓' : ''}</span><span>Yes</span>
              <span class="check-box">${checklist.deliveryOnTime === false ? '✓' : ''}</span><span>No</span>
            </div>
            <div class="check-group">
              <span class="check-label">Meet quality requirement?</span>
              <span class="check-box">${checklist.meetQualityRequirement === true ? '✓' : ''}</span><span>Yes</span>
              <span class="check-box">${checklist.meetQualityRequirement === false ? '✓' : ''}</span><span>No</span>
            </div>
          </div>

          <div class="check-row">
            <div class="check-group long">
              <span class="check-label">Meet guidelines for equipment purchasing?</span>
              <span class="check-box">${checklist.meetGuidelinesForEquipment === true ? '✓' : ''}</span><span>Yes</span>
              <span class="check-box">${checklist.meetGuidelinesForEquipment === false ? '✓' : ''}</span><span>No</span>
            </div>
          </div>

          <div class="full-row comments-row">
            ${this.getPrintSingleField('Comments:', comments.main)}
          </div>

          <div class="two-col-row">
            ${this.getPrintSplitFieldHtml('Signed by:', signedByLabel, '(Requester/Inspector)   Date:', signedByDate)}
          </div>
          <div class="two-col-row">
            ${this.getPrintSplitFieldHtml('Acknowledged by:', acknowledgedByLabel, '(ADM)   Date:', acknowledgedByDate)}
          </div>
        </div>

        <div class="policy-box">
          <div class="policy-text">
            Meinhardt (Thailand) Ltd. operates a strict zero tolerance Policy to bribery, fraud and other serious misconduct such as corruption and theft.
            Please notify us at <span class="policy-link">acsc@meinhardt.net</span> to raise any concerns with respect to non-compliance with this Policy in confidence.
          </div>
        </div>
      ` : '';

      return `
        <div class="print-page${continuationClass}">
          <div class="print-header">
            <div class="company-block">
              <div class="company-name">Meinhardt (Thailand) Ltd.</div>
              <div class="company-address">Head Office</div>
              <div class="company-address">6th, 15th, 16th Floor, Thanapoom Tower</div>
              <div class="company-address">1550 New Petchburi Road</div>
              <div class="company-address">Makkasan, Ratchathevee</div>
              <div class="company-address">Bangkok 10400</div>
              <div class="company-address">Thailand</div>
              <div class="company-address">Tax ID. No. ${this.escapeHtml(doc.taxId || '0105534077670')}</div>
            </div>
            <div class="logo-block">
              <img src="/images/logo/logo-meinharde.png" alt="Meinhardt logo" />
              <div class="form-code">27 - FORM MTPC-03</div>
              <div class="contact-line"><span>Office:</span> <span>+66 (0) 2207-0568</span></div>
              <div class="contact-line"><span>Fax:</span> <span>+66 (0) 2207-0574</span></div>
              <div class="contact-line"><span>e-mail:</span> <span>thai@meinhardt.net</span></div>
              <div class="contact-line"><span>Web site:</span> <span>www.meinhardt.net</span></div>
            </div>
          </div>

          <div class="title">PURCHASE ORDER</div>

          <div class="top-fields">
            <div class="two-col-row">
              ${this.getPrintSplitField('To:', header.to, 'PO. No.:', info.poNo)}
            </div>
            <div class="two-col-row">
              ${this.getPrintSplitField('Company:', header.company, 'PO. Date:', info.poDate)}
            </div>
            <div class="two-col-row">
              ${this.getPrintSplitField('Fax No.:', header.fax, 'Requisition Date:', info.requisitionDate)}
            </div>
            <div class="two-col-row">
              ${this.getPrintSplitField('From:', header.from, 'Page:', pageLabel)}
            </div>
            <div class="two-col-row">
              ${this.getPrintSplitField('cc:', header.cc, 'Circ:', circValue)}
            </div>
          </div>

          <div class="print-table-section">
            <table class="items-table items-table--standard">
              ${itemColgroup}
              <thead>
                <tr>
                  <th class="col-item">Item(s)</th>
                  <th class="col-desc">Description</th>
                  <th class="col-qty">Quantity</th>
                  <th class="col-price">Unit Price<br />(${printCurrency})</th>
                  <th class="col-amount">Amount<br />(${printCurrency})</th>
                </tr>
              </thead>
              <tbody>
                ${this.getPrintItemsHtml(printPage.items, printPage.isLast)}
              </tbody>
              ${totalsFooterHtml}
            </table>
          </div>

          ${afterTableHtml}

          <div class="print-footer">
            <div>MATL_REQ/EMS DOCUMENTATION/FORM/MTM/MTPC/03/RELEASED/CREATE/DEPARTMENT/PURPOSE/001/DATE/2020</div>
            <div>Page ${pageLabel}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  private getPrintItemsHtml(pageItems: any[], isLastPage = false): string {
    const items = Array.isArray(pageItems) ? pageItems : [];
    const itemRows = items.map((item: any) => `
      <tr class="body-row">
        <td class="item-cell body-cell text-center">${this.escapeHtml(item?.name || '')}</td>
        <td class="desc-cell body-cell">${this.escapeHtml(item?.description || '')}</td>
        <td class="qty-cell body-cell text-center">${this.escapeHtml(item?.qty != null ? String(item.qty) : '')}</td>
        <td class="price-cell body-cell text-right">${this.formatPrintCurrency(item?.unitPrice)}</td>
        <td class="amount-cell body-cell text-right">${this.formatPrintCurrency(item?.amount)}</td>
      </tr>
    `).join('');
    const fillerCells = `
      <td class="item-cell body-cell">&nbsp;</td>
      <td class="desc-cell body-cell">&nbsp;</td>
      <td class="qty-cell body-cell">&nbsp;</td>
      <td class="price-cell body-cell">&nbsp;</td>
      <td class="amount-cell body-cell">&nbsp;</td>
    `;

    return `
      ${itemRows}
      <tr class="body-row body-row-filler${isLastPage ? ' body-row-filler--last' : ''}" aria-hidden="true">
        ${fillerCells}
      </tr>
    `;
  }

  private getPrintAssetCodesText(items: any[] | null | undefined): string {
    if (!Array.isArray(items)) {
      return '';
    }

    return items
      .filter((item) => item?.needAssetCodeRegistration === true)
      .map((item) => String(item?.assetCode || '').trim())
      .filter(Boolean)
      .join(', ');
  }

  private getPrintablePurchaseOrderPages(): PrintablePurchaseOrderPage[] {
    const items = Array.isArray(this.poDocument?.items) ? this.poDocument.items : [];
    const itemPages: any[][] = [];

    if (!items.length) {
      itemPages.push([]);
    } else {
      let pageItems: any[] = [];
      let pageWeight = 0;

      items.forEach((item) => {
        const rowWeight = this.getPrintItemRowWeight(item);
        const shouldStartNewPage = pageItems.length > 0
          && (
            pageItems.length >= this.printRowsPerPage ||
            pageWeight + rowWeight > this.printPageMaxWeight
          );

        if (shouldStartNewPage) {
          itemPages.push(pageItems);
          pageItems = [];
          pageWeight = 0;
        }

        pageItems.push(item);
        pageWeight += rowWeight;
      });

      if (pageItems.length > 0) {
        itemPages.push(pageItems);
      }
    }

    const totalPages = itemPages.length || 1;
    return itemPages.map((pageItems, index) => ({
      items: pageItems,
      pageNumber: index + 1,
      totalPages,
      isLast: index === totalPages - 1,
    }));
  }

  private getPrintItemRowWeight(item: any): number {
    const textLength = Math.max(
      String(item?.name || '').length,
      String(item?.description || '').length,
      String(item?.assetCode || '').length
    );
    const lineBreakCount = [
      item?.name,
      item?.description,
      item?.assetCode,
    ].reduce((count, value) => count + (String(value || '').match(/\n/g)?.length || 0), 0);

    if (textLength > 220 || lineBreakCount > 4) {
      return 3;
    }
    if (textLength > 140 || lineBreakCount > 2) {
      return 2.5;
    }
    if (textLength > 70 || lineBreakCount > 0) {
      return 1.75;
    }
    return 1;
  }

  private getPrintSplitField(leftLabel: string, leftValue: string | null | undefined, rightLabel: string, rightValue: string | null | undefined): string {
    return `
      <div class="split-col">
        <span class="field-label">${this.escapeHtml(leftLabel)}</span>
        <span class="field-value">${this.escapeHtml(leftValue || '')}</span>
      </div>
      <div class="split-col">
        <span class="field-label">${this.escapeHtml(rightLabel)}</span>
        <span class="field-value">${this.escapeHtml(rightValue || '')}</span>
      </div>
    `;
  }

  private getPrintSplitFieldHtml(leftLabel: string, leftValueHtml: string | null | undefined, rightLabel: string, rightValue: string | null | undefined): string {
    const valueHtml = leftValueHtml || '';
    const valueClass = valueHtml.includes('signature-print-block')
      ? 'field-value signature-field-value'
      : 'field-value';

    return `
      <div class="split-col">
        <span class="field-label">${this.escapeHtml(leftLabel)}</span>
        <span class="${valueClass}">${valueHtml}</span>
      </div>
      <div class="split-col">
        <span class="field-label">${this.escapeHtml(rightLabel)}</span>
        <span class="field-value">${this.escapeHtml(rightValue || '')}</span>
      </div>
    `;
  }

  private getPrintSingleField(label: string, value: string | null | undefined): string {
    return `
      <div class="single-field">
        <span class="field-label">${this.escapeHtml(label)}</span>
        <span class="field-value">${this.escapeHtml(value || '')}</span>
      </div>
    `;
  }

  private getEmployeePrintLabel(ref: string | number | null | undefined): string {
    const label = this.employeeService.formatEmployeeReference(ref, this.employeeLookup, '');
    return label === '-' ? '' : label;
  }

  private getPurchaseOrderFromPrintValue(purchaseOrder: PurchaseOrder): string {
    const fromValue = String(purchaseOrder?.from || '').trim();
    if (!this.isIgnoredFromValue(fromValue)) {
      return fromValue;
    }

    const requestedByLabel = this.getEmployeePrintLabel(purchaseOrder?.purchaseRequestBy);
    if (!this.isIgnoredFromValue(requestedByLabel)) {
      return requestedByLabel;
    }

    const createdByLabel = this.getEmployeePrintLabel(purchaseOrder?.createdBy);
    if (!this.isIgnoredFromValue(createdByLabel)) {
      return createdByLabel;
    }

    return this.defaultFromLabel;
  }

  private isIgnoredFromValue(value: unknown): boolean {
    const normalized = String(value || '').trim().toLowerCase();
    return !normalized
      || normalized === this.defaultFromLabel.toLowerCase()
      || normalized === 'admin'
      || normalized === 'administrator'
      || normalized === '-';
  }

  private getPrintCircValue(
    circRef: string | number | null | undefined,
    approval: any,
    comments: any,
    purchaseOrder: PurchaseOrder | null
  ): string {
    const fileSuffix = '/File T6PC';
    const circLabel = this.getEmployeePrintLabel(circRef);

    if (!circLabel || !this.shouldShowPrintCircPerson(circRef, approval, comments, purchaseOrder)) {
      return fileSuffix;
    }

    return `${circLabel}${fileSuffix}`;
  }

  private shouldShowPrintCircPerson(
    circRef: string | number | null | undefined,
    approval: any,
    comments: any,
    purchaseOrder: PurchaseOrder | null
  ): boolean {
    const normalizedCirc = this.normalizeEmployeeRef(circRef);
    if (!normalizedCirc) {
      return false;
    }

    const workflowActors = [
      {
        ref: approval?.verifiedBy,
        status: approval?.verifiedByStatus,
        date: approval?.verifiedByDate || purchaseOrder?.verifiedDate,
      },
      {
        ref: approval?.approvedBy,
        status: approval?.approvedByStatus,
        date: approval?.approvedByDate || purchaseOrder?.approvedDate,
      },
      {
        ref: approval?.circ,
        status: approval?.circStatus,
        date: approval?.circDate || purchaseOrder?.circDate,
      },
      {
        ref: comments?.signedBy,
        status: comments?.signedByStatus,
        date: comments?.signedByDate || purchaseOrder?.signedDate,
      },
      {
        ref: comments?.ackBy,
        status: comments?.ackByStatus,
        date: comments?.ackByDate || purchaseOrder?.acknowledgedByDate,
      },
    ];

    const matchedWorkflowActor = workflowActors.find((actor) => this.normalizeEmployeeRef(actor.ref) === normalizedCirc);
    if (matchedWorkflowActor) {
      return this.isApprovedStatus(matchedWorkflowActor.status) || !!matchedWorkflowActor.date;
    }

    return this.isApprovedStatus(comments?.signedByStatus) || !!comments?.signedByDate;
  }

  private normalizeEmployeeRef(ref: string | number | null | undefined): string {
    return String(ref ?? '').trim().toLowerCase();
  }

  private getEmployeePrintValue(
    ref: string | number | null | undefined,
    actionDate: string | Date | null | undefined,
    options: { allowNameOnlySignature?: boolean } = {}
  ): string {
    return this.getEmployeeSignaturePrintHtml(ref, actionDate, options.allowNameOnlySignature === true) || this.escapeHtml(this.getEmployeePrintLabel(ref));
  }

  private getApprovedEmployeePrintValue(ref: string | number | null | undefined, status: string | null | undefined, actionDate: string | Date | null | undefined): string {
    if (!this.isApprovedStatus(status)) {
      return '';
    }

    return this.getEmployeePrintValue(ref, actionDate);
  }

  private getEmployeeSignaturePrintHtml(
    ref: string | number | null | undefined,
    actionDate: string | Date | null | undefined,
    allowNameOnlySignature = false
  ): string {
    const normalizedRef = String(ref ?? '').trim();
    if (!normalizedRef) {
      return '';
    }

    const setting = this.getSignatureSettingForRef(normalizedRef);
    if (!setting) {
      return '';
    }

    const signId = formatPoSignatureId(setting.employee_code || normalizedRef, actionDate);
    if (!signId && !allowNameOnlySignature) {
      return '';
    }

    const name = this.getSignatureEmployeeName(setting) || this.getEmployeePrintLabel(ref);
    if (!name) {
      return '';
    }

    return `
      <span class="signature-print-block">
        <img class="signature-watermark" src="/favicon-32x32.png" alt="" />
        <span class="signature-name">${this.escapeHtml(name)}</span>
        ${signId ? `<span class="signature-id">${this.escapeHtml(signId)}</span>` : ''}
      </span>
    `;
  }

  private getSignatureSettingForRef(ref: string | number | null | undefined): SignatureSetting | null {
    const candidates = this.getSignatureLookupRefs(ref);
    for (const candidate of candidates) {
      const setting = this.activeSignatureSettings.get(candidate);
      if (setting) {
        return setting;
      }
    }

    return null;
  }

  private withPurchaseRequisitionDisplaySource(purchaseOrder: PurchaseOrder) {
    const requisitionId = String(purchaseOrder.purchaseRequisitionId || '').trim();
    if (!requisitionId || this.hasPurchaseRequisitionDisplaySource(purchaseOrder)) {
      return of(purchaseOrder);
    }

    return this.purchaseRequisitionService.findOne(requisitionId).pipe(
      map((response: any) => {
        const requisition = response?.status !== undefined && response?.data ? response.data : response;
        return requisition
          ? ({ ...purchaseOrder, purchaseRequisition: requisition } as PurchaseOrder)
          : purchaseOrder;
      }),
      catchError(() => of(purchaseOrder))
    );
  }

  private hasPurchaseRequisitionDisplaySource(purchaseOrder: PurchaseOrder): boolean {
    return [
      'purchaseRequisition',
      'purchase_requisition',
      'requisition',
      'purchaseRequest',
      'purchase_request',
      'pr',
    ].some((key) => !!(purchaseOrder as any)?.[key]);
  }

  private getSignatureLookupRefsFromValues(
    values: Array<string | number | null | undefined>,
    lookup?: Map<string, string>
  ): string[] {
    const refs = new Set<string>();
    values.forEach((value) => {
      this.getSignatureLookupRefs(value, lookup).forEach((candidate) => refs.add(candidate));
    });

    return Array.from(refs);
  }

  private getSignatureLookupRefs(
    ref: string | number | null | undefined,
    lookup: Map<string, string> = this.employeeLookup
  ): string[] {
    const normalizedRef = String(ref ?? '').trim();
    if (!normalizedRef) {
      return [];
    }

    const candidates = new Set<string>(getPoSignatureLookupCandidates(normalizedRef));
    const targetLabel = normalizedRef.toLowerCase();

    lookup?.forEach((label, code) => {
      if (String(label ?? '').trim().toLowerCase() === targetLabel) {
        getPoSignatureLookupCandidates(code).forEach((candidate) => candidates.add(candidate));
      }
    });

    return Array.from(candidates);
  }

  private getSignatureEmployeeName(setting: SignatureSetting): string {
    const firstname = setting.firstname || setting.employee?.firstname || '';
    const lastname = setting.lastname || setting.employee?.lastname || '';
    return [firstname, lastname].filter(Boolean).join(' ').trim();
  }

  private getApprovedPrintDate(value: string | Date | null | undefined, status: string | null | undefined): string {
    return this.isApprovedStatus(status) ? this.formatPrintDate(value) : '';
  }

  private isApprovedStatus(status: string | null | undefined): boolean {
    const normalized = String(status || '').trim().toLowerCase();
    return normalized === 'approve' || normalized === 'approved';
  }

  private formatPrintDate(value: string | Date | null | undefined): string {
    const formatted = value ? this.formatDate(value) : '';
    return formatted === '-' ? '' : formatted;
  }

  private formatPrintCurrency(value: number | string | null | undefined): string {
    const n = value != null ? Number(value) : NaN;
    if (!Number.isFinite(n)) {
      return '';
    }

    const fractionDigits = this.getCurrencyFractionDigits();
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits
    }).format(n);
  }

  private getCurrencyFractionDigits(currency = this.displayCurrency || 'THB'): number {
    const currencyCode = this.normalizeCurrencyCode(currency);
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currencyCode,
      }).resolvedOptions().maximumFractionDigits;
    } catch {
      return 2;
    }
  }

  private getPrintCurrencyLabel(): string {
    const currencyCode = this.normalizeCurrencyCode(this.displayCurrency || 'THB');
    return currencyCode === 'THB' ? 'Baht' : currencyCode;
  }

  private normalizeCurrencyCode(value: unknown): string {
    const text = String(value || '').trim().toUpperCase();
    const match = text.match(/[A-Z]{3}/);
    return match?.[0] || 'THB';
  }

  private escapeHtml(value: string | null | undefined): string {
    if (!value) {
      return '';
    }

    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private getPrintStyles(): string {
    return `
      @page {
        size: A4;
        margin: 8mm;
      }

      @font-face {
        font-family: 'testimonia-font';
        src: url('/fonts/testimonia/Testimonia-3zp8X.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: 'Noto Sans Thai';
        src: url('/fonts/noto-sans-thai/NotoSansThai-Regular.ttf') format('truetype');
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: 'Noto Sans Thai';
        src: url('/fonts/noto-sans-thai/NotoSansThai-Bold.ttf') format('truetype');
        font-weight: 700;
        font-style: normal;
        font-display: swap;
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        min-height: 100%;
        font-family: 'Noto Sans Thai', Arial, Helvetica, sans-serif;
        background: #ffffff;
        color: #222222;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      body {
        font-size: 10px;
        line-height: 1.18;
      }

      .print-page {
        width: 194mm;
        min-height: 281mm;
        display: flex;
        flex-direction: column;
        margin: 0 auto;
        background: #ffffff;
        break-after: page;
        page-break-after: always;
      }

      .print-page:last-child {
        break-after: auto;
        page-break-after: auto;
      }

      .print-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 3mm;
      }

      .company-name {
        font-size: 11px;
        font-weight: 700;
        margin-bottom: 1mm;
      }

      .company-address {
        font-size: 9px;
        line-height: 1.15;
      }

      .logo-block {
        text-align: right;
        font-size: 8.5px;
        font-weight: 700;
      }

      .logo-block img {
        width: 102px;
        height: auto;
        display: block;
        margin-left: auto;
        margin-bottom: 1px;
      }

      .contact-line {
        display: flex;
        justify-content: flex-end;
        gap: 4px;
        font-weight: 400;
      }

      .title {
        text-align: center;
        font-size: 11px;
        font-weight: 700;
        color: #1d4f91;
        margin: 0 0 4mm;
      }

      .top-fields,
      .after-table {
        margin-bottom: 3mm;
      }

      .two-col-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6mm;
        margin-bottom: 1.4mm;
      }

      .split-col,
      .single-field {
        display: flex;
        align-items: flex-end;
        min-width: 0;
      }

      .field-label {
        flex: 0 0 auto;
        white-space: nowrap;
        padding-right: 2px;
      }

      .field-value {
        flex: 1 1 auto;
        min-width: 0;
        border-bottom: 1px dotted #666666;
        min-height: 11px;
        padding: 0 2px 1px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .signature-field-value {
        position: relative;
        min-height: 34px;
        overflow: visible;
        white-space: normal;
        padding-bottom: 1px;
      }

      .signature-print-block {
        position: absolute;
        left: 50%;
        bottom: 2px;
        display: flex;
        min-width: 34mm;
        max-width: 100%;
        flex-direction: column;
        align-items: center;
        justify-content: flex-end;
        isolation: isolate;
        line-height: 1;
        transform: translateX(-50%);
        pointer-events: none;
      }

      .signature-watermark {
        position: absolute;
        left: 52%;
        right: auto;
        bottom: 1.1mm;
        z-index: 0;
        width: 4.5mm;
        height: 4.5mm;
        display: block;
        object-fit: contain;
        opacity: 0.09;
        transform: translateX(-50%);
        pointer-events: none;
      }

      .signature-name {
        position: relative;
        z-index: 1;
        font-family: 'testimonia-font', cursive;
        font-size: 22px;
        font-weight: 700;
        line-height: 0.78;
        color: #174ea6;
        white-space: nowrap;
      }

      .signature-id {
        position: relative;
        z-index: 1;
        margin-top: -1px;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 10px;
        font-weight: 700;
        line-height: 1;
        color: #174ea6;
        white-space: nowrap;
      }

      .full-row {
        margin-bottom: 1.4mm;
      }

      .multiline-row .field-value,
      .comments-row .field-value {
        white-space: normal;
      }

      .multiline-row .field-value {
        min-height: 18px;
      }

      .print-table-section {
        display: flex;
        min-height: 55mm;
        flex: 1 1 auto;
        flex-direction: column;
        margin: 2mm 0 3mm;
      }

      .items-table {
        width: 100%;
        height: 100%;
        flex: 1 1 auto;
        border-collapse: collapse;
        table-layout: fixed;
        margin: 0;
      }

      .items-table th,
      .items-table td,
      .items-table tfoot td {
        border: 1px solid #8a8a8a;
        padding: 3px 5px;
      }

      .items-table th {
        text-align: center;
        font-weight: 700;
        height: 12mm;
        vertical-align: top;
      }

      .items-table--standard .col-item { width: 13.95%; }
      .items-table--standard .col-desc { width: 34.88%; }
      .items-table--standard .col-qty { width: 13.95%; }
      .items-table--standard .col-price { width: 16.28%; }
      .items-table--standard .col-amount { width: 20.94%; }

      .text-right {
        text-align: right;
      }

      .text-center {
        text-align: center;
      }

      .items-table tbody .body-cell {
        height: 7mm;
        vertical-align: top;
        line-height: 1.2;
        border-top: none;
        border-bottom: none;
      }

      .body-row {
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .items-table tbody .body-row-filler .body-cell {
        height: 100%;
        border-bottom: 1px solid #8a8a8a;
      }

      .items-table tbody .body-row-filler--last .body-cell.item-cell,
      .items-table tbody .body-row-filler--last .body-cell.desc-cell,
      .items-table tbody .body-row-filler--last .body-cell.qty-cell {
        border-bottom: none;
      }

      .desc-cell {
        white-space: normal;
        overflow-wrap: break-word;
      }

      .item-cell,
      .qty-cell,
      .price-cell,
      .amount-cell {
        white-space: nowrap;
      }

      .footer-spacer {
        border-top: 1px solid #8a8a8a;
      }

      .footer-spacer--open {
        border-top: none !important;
      }

      .footer-asset-codes {
        vertical-align: bottom;
      }

      .footer-asset-codes-text {
        margin-bottom: 2mm;
        color: #222222;
        font-size: 9px;
        line-height: 1.25;
        overflow-wrap: anywhere;
        white-space: normal;
      }

      .total-label {
        text-align: left;
      }

      .total-value {
        text-align: right;
      }

      .check-row {
        display: flex;
        gap: 10mm;
        margin: 1.8mm 0;
      }

      .check-group {
        display: flex;
        align-items: center;
        gap: 3mm;
        white-space: nowrap;
      }

      .check-group.long {
        width: 100%;
      }

      .check-label {
        margin-right: 4mm;
      }

      .check-box {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 10px;
        height: 10px;
        border: 1px solid #666666;
        font-size: 9px;
        line-height: 1;
      }

      .policy-box {
        border: 1px solid #111111;
        padding: 2.5mm;
        margin-top: 3mm;
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .policy-text {
        font-size: 8px;
        line-height: 1.15;
      }

      .policy-link {
        text-decoration: underline;
      }

      .print-footer {
        display: flex;
        justify-content: space-between;
        font-size: 6px;
        color: #555555;
        margin-top: 2mm;
      }

      @media screen {
        body {
          padding: 8mm 0;
          background: #f3f4f6;
        }

        .print-page {
          padding: 0;
          box-shadow: 0 0 0 1px #dddddd;
        }

        .print-page + .print-page {
          margin-top: 8mm;
        }
      }
    `;
  }
}
