import { Component, OnDestroy, OnInit } from '@angular/core';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeHtml, SafeResourceUrl } from '@angular/platform-browser';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { FuseAlertType } from '@fuse/components/alert';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { PurchaseRequisitionService } from 'app/core/services/purchase-requisition.service';
import { AuthenticatedPdfService } from 'app/core/services/authenticated-pdf.service';
import { SignatureSetting, SignatureSettingService } from 'app/core/services/signature-setting.service';
import { getSignatureLookupRefsFromValues, getSignaturePrintHtml } from 'app/core/utils/signature-print.util';
import { PurchaseRequisitionNotificationService } from 'app/core/services/purchase-requisition-notification.service';
import {
  AttachmentDisplayItem,
  getAttachmentDisplayItems,
  getAttachmentIcon,
  getAttachmentPreviewType,
  getAttachmentTypeLabel,
} from 'app/core/utils/attachment-url.util';
import { finalize } from 'rxjs';
import { ViewActionsComponent } from 'app/core/components/view-actions';
import { DEFAULT_PURCHASE_PAYMENT_TERM } from 'app/core/constants/purchase-payment-term.constant';
import { paginatePurchaseRequisitionItemsByHeight, PurchaseRequisitionPrintPage } from './purchase-requisition-print.util';

export interface RequisitionItem {
  item: string;
  description: string;
  needAssetCodeRegistration?: boolean;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface PurchaseRequisitionDetail {
  id: string;
  requisitionNo: string;

  // General
  to: string;
  requestedBy: string;
  date: string;
  deadline?: string | null;
  recommendedBy?: string | null;
  receivedFrom?: string | null;
  reasonsForPurchase: string;

  // Items
  items: RequisitionItem[];
  discount: number;
  subTotal: number;
  vat7Percent: number;
  grandTotal: number;

  // Terms
  otherConditions?: string | null;
  paymentTerm?: string | null;
  quotationAttached: boolean;

  // Approval & workflow
  requestedDate?: string | null;
  verifiedByIS?: string | null;
  verifiedISDate?: string | null;
  verifiedByISStatus?: 'pending' | 'reject' | 'approved' | null;
  verifiedBy?: string | null;
  verifiedDate?: string | null;
  verifiedByStatus?: 'pending' | 'reject' | 'approved' | null;
  approvedBy?: string | null;
  approvedDate?: string | null;
  approvedByStatus?: 'pending' | 'reject' | 'approved' | null;
  approvedBy2?: string | null;
  approvedBy2Date?: string | null;
  approvedBy2Status?: 'pending' | 'reject' | 'approved' | null;
  acknowledgedBy?: string | null;
  acknowledgedDate?: string | null;
  acknowledgedByStatus?: 'pending' | 'reject' | 'approved' | null;
  needAssetCodeRegistration?: 'yes' | 'no' | '';
  actionByAdmin?: string | null;
  actionByAdminDate?: string | null;
  actionByAdminStatus?: 'pending' | 'reject' | 'approved' | null;

  // Meta
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  createdBy: string;
  createdAt: string;
  updatedAt: string;

  attachments?: {
    name: string;
    sizeKB?: number;
    type?: string;
    url?: string;
  }[];
}

interface ApprovalWorkflowStep {
  title: string;
  actor: string | number | null | undefined;
  actorLabel?: string | null;
  date: string | null | undefined;
  status: string | null | undefined;
  statusLabel?: string;
}

interface PrintablePurchaseRequisitionPage {
  items: any[];
  pageNumber: number;
  totalPages: number;
  isLast: boolean;
}

@Component({
  selector: 'app-purchase-requisition-view',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatSnackBarModule,
    ViewActionsComponent
  ],
  templateUrl: './purchase-requisition-view.component.html',
//   styleUrls: ['./purchase-requisition-view.component.scss']
  styles: [`
    :host { display:block; }

    .document-field label {
      display: block;
      margin-bottom: 0.375rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: rgb(71 85 105);
      text-transform: uppercase;
      letter-spacing: 0.025em;
    }

    .document-value {
      min-height: 2.5rem;
      padding: 0.5rem 0.75rem;
      border: 1px solid rgb(226 232 240);
      border-radius: 0.5rem;
      background: rgb(248 250 252);
      color: rgb(15 23 42);
      font-size: 0.875rem;
      line-height: 1.5;
    }

    .document-check-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: rgb(15 23 42);
    }

    .document-check-box {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.25rem;
      height: 1.25rem;
      border: 1px solid rgb(203 213 225);
      border-radius: 0.25rem;
      background: white;
      font-size: 0.875rem;
      font-weight: 700;
      color: rgb(37 99 235);
      flex-shrink: 0;
    }

    :host-context(.dark) .document-value {
      border-color: rgb(51 65 85);
      background: rgb(30 41 59);
      color: rgb(241 245 249);
    }

    :host-context(.dark) .document-check-box {
      border-color: rgb(71 85 105);
      background: rgb(15 23 42);
      color: rgb(59 130 246);
    }
  `]
})
export class PurchaseRequisitionViewComponent implements OnInit, OnDestroy {
  readonly defaultPaymentTerm = DEFAULT_PURCHASE_PAYMENT_TERM;
  requisition: PurchaseRequisitionDetail | null = null;
  prDocument: any = null;
  isLoading = false;
  alert: { type: FuseAlertType; message: string } | null = null;
  displayCurrency = 'THB';
  attachmentLinks: AttachmentDisplayItem[] = [];
  selectedAttachment: AttachmentDisplayItem | null = null;
  selectedAttachmentResourceUrl: SafeResourceUrl | null = null;
  isResendingEmail = false;
  isSubmittingDraft = false;
  isPrintDocumentMode = false;
  printDocumentHtml: SafeHtml | null = null;
  printDocumentStyles = '';
  printDocumentReady = false;
  private readonly printBodyClass = 'purchase-requisition-printing';
  private activeSignatureSettings = new Map<string, SignatureSetting>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private purchaseRequisitionService: PurchaseRequisitionService,
    private purchaseRequisitionNotificationService: PurchaseRequisitionNotificationService,
    private sanitizer: DomSanitizer,
    private authenticatedPdfService: AuthenticatedPdfService,
    private signatureSettingService: SignatureSettingService,
    private snackBar: MatSnackBar,
    private fuseConfirmationService: FuseConfirmationService
  ) {}

  ngOnInit(): void {
    this.isPrintDocumentMode =
      this.route.snapshot.data?.['printDocument'] === true ||
      this.route.snapshot.queryParamMap.has('printDocument');
    if (this.isPrintDocumentMode && typeof document !== 'undefined') {
      document.body.classList.add(this.printBodyClass);
    }
    this.route.params.subscribe(params => {
      const id = params['id'];
      if (id) {
        this.loadRequisition(id);
      }
    });
  }

  private loadRequisition(id: string): void {
    this.isLoading = true;
    this.alert = null;

    this.purchaseRequisitionService.findOne(id).subscribe({
      next: (response: any) => {
        // Handle both response formats: { status, data } or direct data
        let data: any;
        if (response.status !== undefined && response.data) {
          data = response.data;
        } else if (response.id) {
          data = response;
        } else {
          data = response;
        }


        
        // Normalize items: ensure amount is number (from API or computed as quantity * unit_price)
        const rawItems = data.items || [];
        const items = rawItems.map((item: any) => {
          const qty = Number(item.quantity) || 0;
          const unitPrice = Number(item.unit_price) || 0;
          let amount = Number(item.amount);
          if (isNaN(amount) || amount === 0) {
            amount = qty * unitPrice;
          }
          return {
            item: item.item || '',
            description: item.description || '',
            needAssetCodeRegistration: this.toBooleanFlag(item.need_asset_code_registration),
            quantity: qty,
            unitPrice,
            amount
          };
        });

        // Prefer totals from API so the printout matches the source document exactly.
        const calculatedItemsTotal = items.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
        const discountValue = Number(data.discount);
        const discount = Number.isFinite(discountValue) ? Math.max(0, discountValue) : 0;
        const hasVat = data.vat === 1 || data.vat === true || data.vat === '1';
        const subTotal = this.toOptionalNumber(data.sub_total);
        const vat7Percent = this.toOptionalNumber(data.vat_value);
        const grandTotal = this.toOptionalNumber(data.grand_total);
        const normalizedSubTotal = Number.isFinite(subTotal) ? subTotal : Math.max(0, calculatedItemsTotal - discount);
        const normalizedVat = Number.isFinite(vat7Percent) ? vat7Percent : (hasVat ? normalizedSubTotal * 0.07 : 0);
        const normalizedGrandTotal = Number.isFinite(grandTotal) ? grandTotal : (normalizedSubTotal + normalizedVat);
        this.displayCurrency = this.normalizeCurrencyCode(data.currency_code || data.currency || 'THB');
        this.attachmentLinks = getAttachmentDisplayItems(data.attachments);
        this.clearSelectedAttachment();

        const needAssetCodeRegistration =
	          data.need_asset_code_registration === 1 || data.need_asset_code_registration === '1' || data.need_asset_code_registration === true
	            ? 'yes'
	            : data.need_asset_code_registration === 0 || data.need_asset_code_registration === '0' || data.need_asset_code_registration === false
	              ? 'no'
	              : '';
	        const requisitionNo = this.resolveRequisitionNo(data);

	        this.requisition = {
	          id: String(data.id),
	          requisitionNo,
          to: data.to || '',
          requestedBy: data.requested_by || '',
          date: data.date || '',
          deadline: data.deadline || null,
          recommendedBy: data.recommended_by || null,
          receivedFrom: data.received_from || null,
          reasonsForPurchase: data.reasons_for_purchase || '',
          items,
          discount,
          subTotal: normalizedSubTotal,
          vat7Percent: normalizedVat,
          grandTotal: normalizedGrandTotal,
          otherConditions: data.other_conditions || null,
          paymentTerm: data.payment_term ?? this.defaultPaymentTerm,
          quotationAttached: data.quotation_attached === 1 || data.quotation_attached === true,
          requestedDate: data.requested_date || null,
          verifiedByIS: data.verified_by_is || null,
          verifiedISDate: data.verified_is_date || null,
          verifiedByISStatus: data.verified_by_is_status?.toLowerCase() || null,
          verifiedBy: data.verified_by || null,
          verifiedDate: data.verified_date || null,
          verifiedByStatus: data.verified_by_status?.toLowerCase() || null,
          approvedBy: data.approved_by || null,
          approvedDate: data.approved_date || null,
          approvedByStatus: data.approved_by_status?.toLowerCase() || null,
          approvedBy2: data.approved_by_2 || null,
          approvedBy2Date: data.approved_by_2_date || null,
          approvedBy2Status: data.approved_by_2_status?.toLowerCase() || null,
          acknowledgedBy: data.acknowledged_by || null,
          acknowledgedDate: data.acknowledged_date || null,
          acknowledgedByStatus: data.acknowledged_by_status?.toLowerCase() || null,
          needAssetCodeRegistration,
          actionByAdmin: data.action_by_admin || null,
          actionByAdminDate: data.action_by_admin_date || null,
          actionByAdminStatus: data.action_by_admin_status?.toLowerCase() || null,
          status: (data.status?.toLowerCase() || 'submitted') as 'draft' | 'submitted' | 'approved' | 'rejected',
          createdBy: data.create_by || '',
          createdAt: data.created_at || '',
          updatedAt: data.updated_at || '',
          attachments: this.attachmentLinks.map((attachment) => ({
            name: attachment.fileName,
            type: this.getAttachmentTypeLabel(attachment),
            url: attachment.href,
          }))
        };

	        // Build prDocument for display (similar to PO)
	        this.prDocument = {
	          requisitionNo,
          header: {
            to: data.to || '',
            date: data.date ? this.formatDate(data.date) : '',
            deadline: data.deadline ? this.formatDate(data.deadline) : null,
            recommendedBy: data.recommended_by || null,
            receivedFrom: data.received_from || null,
            reasonsForPurchase: data.reasons_for_purchase || '',
          },
          items: items.map((it: any) => ({
            name: it.item || '',
            description: it.description || '',
            needAssetCodeRegistration: it.needAssetCodeRegistration,
            qty: it.quantity ?? 0,
            unitPrice: it.unitPrice ?? 0,
            amount: it.amount ?? 0,
          })),
          totals: {
            discount,
            subTotal: normalizedSubTotal,
            vat: normalizedVat,
            grandTotal: normalizedGrandTotal,
          },
          general: {
            otherConditions: data.other_conditions || '',
            paymentTerm: data.payment_term ?? this.defaultPaymentTerm,
            quotationAttached: data.quotation_attached === 1 || data.quotation_attached === true,
          },
          approval: {
            requestedBy: data.requested_by || '',
            requestedByLabel: this.getEmployeeResponseLabel(data, 'requested_by'),
            not_it_equipment: data.not_it_equipment === 1 || data.not_it_equipment === true,
            requestedByDate: data.requested_by_date || data.requested_date || null,
            requestedByStatus: data.requested_by_status?.toLowerCase() || null,
            verifiedByIS: data.verified_by_is || '',
            verifiedByISLabel: this.getEmployeeResponseLabel(data, 'verified_by_is'),
            verifiedByISDate: data.verified_by_is_date || data.verified_is_date || null,
            verifiedByISStatus: data.verified_by_is_status?.toLowerCase() || null,
            verifiedBy: data.verified_by || '',
            verifiedByLabel: this.getEmployeeResponseLabel(data, 'verified_by'),
            verifiedByDate: data.verified_by_date || data.verified_date || null,
            verifiedByStatus: data.verified_by_status?.toLowerCase() || null,
            approvedBy: data.approved_by || '',
            approvedByLabel: this.getEmployeeResponseLabel(data, 'approved_by'),
            approvedByDate: data.approved_by_date || data.approved_date || null,
            approvedByStatus: data.approved_by_status?.toLowerCase() || null,
            approvedBy2: data.approved_by_2 || '',
            approvedBy2Label: this.getEmployeeResponseLabel(data, 'approved_by_2'),
            approvedBy2Date: data.approved_by_2_date || null,
            approvedBy2Status: data.approved_by_2_status?.toLowerCase() || null,
            acknowledgedBy: data.acknowledged_by || '',
            acknowledgedByLabel: this.getEmployeeResponseLabel(data, 'acknowledged_by'),
            acknowledgedByDate: data.acknowledged_by_date || data.acknowledged_date || null,
            acknowledgedByStatus: data.acknowledged_by_status?.toLowerCase() || null,
            needAssetCodeRegistration,
            actionByAdmin: data.action_by_admin || '',
            actionByAdminLabel: this.getEmployeeResponseLabel(data, 'action_by_admin'),
            actionByAdminDate: data.action_by_admin_date || null,
            actionByAdminStatus: data.action_by_admin_status?.toLowerCase() || null,
          },
        };

        const approval = this.prDocument.approval;
        const signatureRefs = getSignatureLookupRefsFromValues([
          approval.requestedBy,
          approval.verifiedByIS,
          approval.verifiedBy,
          approval.approvedBy,
          approval.approvedBy2,
          approval.acknowledgedBy,
          approval.actionByAdmin,
        ]);
        this.signatureSettingService.getActiveMapByCodes(signatureRefs).subscribe({
          next: (settings) => {
            this.activeSignatureSettings = settings;
            this.isLoading = false;
            this.refreshPrintDocumentRenderState();
          },
          error: () => {
            this.activeSignatureSettings.clear();
            this.isLoading = false;
            this.refreshPrintDocumentRenderState();
          },
        });
      },
      error: (error) => {
        console.error('Error loading requisition:', error);
        this.alert = {
          type: 'error',
          message: error?.error?.message || 'Failed to load requisition details. Please try again.'
        };
        this.isLoading = false;
      }
    });
  }

  getEmployeeLabel(ref: string | number | null | undefined): string {
    if (ref === null || ref === undefined) {
      return '-';
    }

    const normalizedRef = String(ref).trim();
    return normalizedRef || '-';
  }

  private getEmployeeResponseLabel(data: any, field: string): string {
    const employee = data?.[`${field}_employee`];
    const directLabel = this.cleanText(employee?.label ?? data?.[`${field}_label`]);
    if (directLabel) {
      return directLabel;
    }

    const initial = this.cleanText(employee?.initial ?? data?.[`${field}_initial`]);
    const name = this.cleanText(employee?.name ?? data?.[`${field}_name`]);
    return [initial ? initial.replace(/\.$/, '') : '', name].filter(Boolean).join(', ');
  }

  private cleanText(value: unknown): string {
    return String(value ?? '').trim();
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
    const approval = this.prDocument?.approval;
    if (!approval) {
      return [];
    }

    return [
      {
        title: 'Requested By',
        actor: approval.requestedBy,
        actorLabel: approval.requestedByLabel,
        date: approval.requestedByDate,
        status: approval.requestedByDate ? 'approved' : 'pending',
        statusLabel: approval.requestedByDate ? 'Submitted' : 'Pending',
      },
      ...(approval.verifiedByIS
        ? [{
            title: 'Verified By IS',
            actor: approval.verifiedByIS,
            actorLabel: approval.verifiedByISLabel,
            date: approval.verifiedByISDate,
            status: approval.verifiedByISStatus,
          }]
        : []),
      {
        title: 'Verified By',
        actor: approval.verifiedBy,
        actorLabel: approval.verifiedByLabel,
        date: approval.verifiedByDate,
        status: approval.verifiedByStatus,
      },
      {
        title: 'Approved By',
        actor: approval.approvedBy,
        actorLabel: approval.approvedByLabel,
        date: approval.approvedByDate,
        status: approval.approvedByStatus,
      },
      ...(approval.approvedBy2
        ? [{
            title: 'Approved By 2',
            actor: approval.approvedBy2,
            actorLabel: approval.approvedBy2Label,
            date: approval.approvedBy2Date,
            status: approval.approvedBy2Status,
          }]
        : []),
      {
        title: 'Acknowledged By',
        actor: approval.acknowledgedBy,
        actorLabel: approval.acknowledgedByLabel,
        date: approval.acknowledgedByDate,
        status: approval.acknowledgedByStatus,
      },
      ...(approval.actionByAdmin
        ? [{
            title: 'Action By',
            actor: approval.actionByAdmin,
            actorLabel: approval.actionByAdminLabel,
            date: approval.actionByAdminDate,
            status: this.getActionByAdminWorkflowStatus(approval),
            statusLabel: this.getActionByAdminWorkflowStatusLabel(approval),
          }]
        : []),
    ];
  }

  getWorkflowActorLabel(step: ApprovalWorkflowStep): string {
    const actorLabel = this.cleanText(step.actorLabel);
    return actorLabel || this.getEmployeeLabel(step.actor);
  }

  private getActionByAdminWorkflowStatus(approval: any): string {
    const status = String(approval?.actionByAdminStatus || '').toLowerCase();
    if (status === 'approve') {
      return 'approved';
    }
    if (status === 'reject') {
      return 'reject';
    }
    if (status) {
      return status;
    }

    return approval?.actionByAdminDate ? 'approved' : 'pending';
  }

  private getActionByAdminWorkflowStatusLabel(approval: any): string | undefined {
    const status = this.getActionByAdminWorkflowStatus(approval);
    if (status === 'approved') {
      return 'Actioned';
    }
    if (status === 'reject' || status === 'rejected') {
      return 'Rejected';
    }

    return undefined;
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

  onBack(): void {
    this.router.navigate(['/purchase-requisition']);
  }

  onEdit(): void {
    if (this.requisition) {
      this.router.navigate(['/purchase-requisition/edit', this.requisition.id]);
    }
  }

  onOpenPrintPdf(): void {
    if (!this.requisition?.id) {
      return;
    }

    this.openPdfUrl(this.purchaseRequisitionService.getPrintPdfUrl(String(this.requisition.id)));
  }

  onOpenCombinedPdf(): void {
    if (!this.requisition?.id) {
      return;
    }

    this.openPdfUrl(this.purchaseRequisitionService.getCombinedPdfUrl(String(this.requisition.id)));
  }

  private openPdfUrl(url: string): void {
    this.authenticatedPdfService.open(url);
  }

  isDraftDocument(): boolean {
    return String(this.requisition?.status || '').toLowerCase() === 'draft';
  }

  canSubmitDraft(): boolean {
    return this.isDraftDocument() && !!this.requisition?.id && !this.isSubmittingDraft;
  }

  onSubmitDraft(): void {
    if (!this.canSubmitDraft() || !this.requisition) {
      return;
    }

    const id = this.requisition.id;
    const confirmation = this.fuseConfirmationService.open({
      title: 'Submit Draft',
      message: 'Are you sure you want to submit this purchase requisition for approval?',
      icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
      actions: {
        confirm: { show: true, label: 'Submit', color: 'primary' },
        cancel: { show: true, label: 'Cancel' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result !== 'confirmed') {
        return;
      }

      this.isSubmittingDraft = true;
      this.purchaseRequisitionService.submit(id)
        .pipe(finalize(() => this.isSubmittingDraft = false))
        .subscribe({
          next: (requisition) => {
            this.snackBar.open('Purchase requisition submitted for approval', 'Close', { duration: 4000 });
            this.purchaseRequisitionNotificationService
              .notifyInitialAction(requisition, id)
              .subscribe({
                error: (error) => {
                  console.error('Failed to send purchase requisition email notification:', error);
                  this.snackBar.open('Submitted, but email notification could not be sent', 'Close', { duration: 5000 });
                }
              });
            this.loadRequisition(id);
          },
          error: (error) => {
            console.error('Error submitting purchase requisition:', error);
            this.snackBar.open(this.getSubmitDraftErrorMessage(error), 'Close', { duration: 5000 });
          },
        });
    });
  }

  private getSubmitDraftErrorMessage(error: any): string {
    return error?.error?.message || error?.message || 'Failed to submit purchase requisition. Please try again.';
  }

  onPrint(): void {
    if (!this.prDocument || !this.requisition) {
      return;
    }

    try {
      const printMarkup = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Purchase Requisition Form</title>
            <style>${this.getPrintStyles()}</style>
          </head>
          <body><div id="purchase-requisition-print-content">
            ${this.getPrintHtml()}
          </div></body>
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
        this.waitForPrintAssets(printWindow.document).then(() => {
          this.paginatePrintDocument(printWindow.document);
          printWindow.focus();
          printWindow.print();
          printWindow.close();
        }).catch(error => console.error('Failed to prepare purchase requisition print layout:', error));
      };
    } catch (error) {
      console.error('Failed to generate purchase requisition print view:', error);

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        return;
      }

      printWindow.document.open();
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Print Error</title>
          </head>
          <body style="font-family: Arial, sans-serif; padding: 24px;">
            <h2 style="margin: 0 0 12px;">Failed to render print document</h2>
            <pre style="white-space: pre-wrap;">${this.escapeHtml(String(error))}</pre>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  }

  private refreshPrintDocumentRenderState(): void {
    if (!this.isPrintDocumentMode || !this.requisition || !this.prDocument) {
      return;
    }

    this.printDocumentStyles = this.getPrintStyles();
    this.printDocumentHtml = this.sanitizer.bypassSecurityTrustHtml(`
      <style>${this.printDocumentStyles}</style>
      <div id="purchase-requisition-print-content">${this.getPrintHtml()}</div>
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
      this.paginatePrintDocument(document);
      this.printDocumentReady = true;

      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-print-document-ready', 'true');
        document.getElementById('frontend-print-ready')?.setAttribute('data-ready', 'true');
      }
    };

    if (typeof document === 'undefined') {
      this.printDocumentReady = true;
      return;
    }

    setTimeout(() => {
      this.waitForPrintAssets(document).then(setReady).catch(error =>
        console.error('Failed to prepare purchase requisition print layout:', error)
      );
    }, 0);
  }

  private async waitForPrintAssets(printDocument: Document): Promise<void> {
    await Promise.all(Array.from(printDocument.images).map(image =>
      image.decode().catch(() => undefined)
    ));
    await printDocument.fonts?.ready;
  }

  private paginatePrintDocument(printDocument: Document): void {
    const content = printDocument.getElementById('purchase-requisition-print-content');
    const firstPage = content?.querySelector<HTMLElement>('.print-page');
    if (!content || !firstPage) {
      return;
    }
    const items = Array.isArray(this.prDocument?.items) ? this.prDocument.items : [];
    const pageHeight = firstPage.getBoundingClientRect().height;
    const measurement = printDocument.createElement('div');
    measurement.setAttribute('aria-hidden', 'true');
    measurement.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none;';
    printDocument.body.appendChild(measurement);

    try {
      const measure = (isLast: boolean) => {
        measurement.innerHTML = this.getPrintHtml([{items, pageNumber: 1, totalPages: 1, isLast}]);
        const page = measurement.querySelector<HTMLElement>('.print-page')!;
        page.style.height = 'auto';
        const section = page.querySelector<HTMLElement>('.print-table-section')!;
        section.style.flex = 'none';
        section.style.minHeight = '0';
        const table = section.querySelector<HTMLElement>('table')!;
        table.style.height = 'auto';
        table.style.flex = 'none';
        page.querySelector<HTMLElement>('.body-row-filler')!.style.display = 'none';
        const heights = Array.from(page.querySelectorAll<HTMLElement>('.body-row:not(.body-row-filler)'))
          .map(row => row.getBoundingClientRect().height);
        const overhead = page.getBoundingClientRect().height - heights.reduce((sum, height) => sum + height, 0);
        // Allow for collapsed borders and fractional layout rounding at the A4 boundary.
        return {heights, capacity: Math.max(0, pageHeight - overhead - 2)};
      };
      const final = measure(true);
      const continuation = measure(false);
      const pages = paginatePurchaseRequisitionItemsByHeight(items, final.heights, continuation.capacity, final.capacity);
      content.innerHTML = this.getPrintHtml(pages);
    } finally {
      measurement.remove();
    }
  }

  onResendEmail(): void {
    if (!this.requisition || this.isResendingEmail) {
      return;
    }

    this.isResendingEmail = true;
    this.purchaseRequisitionNotificationService
      .resendCurrentPendingAction(this.requisition, this.requisition.id)
      .pipe(finalize(() => this.isResendingEmail = false))
      .subscribe({
        next: (result) => {
          this.snackBar.open(this.getResendEmailMessage(result), 'Close', { duration: 4000 });
        },
        error: (error) => {
          console.error('Failed to resend purchase requisition email notification:', error);
          this.snackBar.open('Failed to resend email notification', 'Close', { duration: 5000 });
        }
      });
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      case 'submitted':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'approved':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'rejected':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'draft':
        return 'Draft';
      case 'submitted':
        return 'Submitted';
      case 'approve':
      case 'approved':
        return 'Approved';
      case 'reject':
      case 'rejected':
        return 'Rejected';
      default:
        return status;
    }
  }

  formatDate(dateString?: string | Date | null): string {
    return formatDateDisplay(dateString);
  }

  formatCurrency(value: number | string | null | undefined, currency?: string): string {
    const amount = value != null ? Number(value) : NaN;
    if (!Number.isFinite(amount)) {
      return '-';
    }

    const currencyCode = this.normalizeCurrencyCode(currency || this.displayCurrency || 'THB');
    const options: Intl.NumberFormatOptions = {
      style: 'currency',
      currency: currencyCode,
    };

    try {
      return new Intl.NumberFormat('th-TH', options).format(amount);
    } catch {
      return `${new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount)} ${currencyCode}`;
    }
  }

	  private toOptionalNumber(value: unknown): number {
	    if (value === null || value === undefined || value === '') {
	      return NaN;
	    }

	    const numberValue = Number(value);
	    return Number.isFinite(numberValue) ? numberValue : NaN;
	  }

	  private resolveRequisitionNo(data: any): string {
	    const prNo = String(data?.pr_no || data?.prNo || '').trim();
	    return prNo || (data?.id ? `PR-${data.id}` : '-');
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

  private getSignatureOrPrintLabel(
    ref: string | number | null | undefined,
    actionDate: string | Date | null | undefined,
    label: string
  ): string {
    if (!label) {
      return '';
    }
    return getSignaturePrintHtml(ref, actionDate, {
      activeSignatureSettings: this.activeSignatureSettings,
      fallbackName: label,
    }) || this.escapeHtml(label);
  }

  private getPrintHtml(pages?: PurchaseRequisitionPrintPage<any>[]): string {
    const doc = this.prDocument;
    const approval = doc.approval;
    const header = doc.header;
    const totals = doc.totals;
    const requestedByLabel = this.getEmployeePrintLabel(approval.requestedBy);
    const verifiedByISLabel = this.getApprovedEmployeePrintLabel(approval.verifiedByIS, approval.verifiedByISStatus);
    const verifiedByLabel = this.getApprovedEmployeePrintLabel(approval.verifiedBy, approval.verifiedByStatus);
    const approvedByLabel = this.getApprovedEmployeePrintLabel(approval.approvedBy, approval.approvedByStatus);
    const approvedBy2Label = this.getApprovedEmployeePrintLabel(approval.approvedBy2, approval.approvedBy2Status);
    const acknowledgedByLabel = this.getApprovedEmployeePrintLabel(approval.acknowledgedBy, approval.acknowledgedByStatus);
    const hasNeedAssetCodeRegistrationAnswer =
      approval.needAssetCodeRegistration === 'yes' || approval.needAssetCodeRegistration === 'no';
    const actionByAdminLabel = hasNeedAssetCodeRegistrationAnswer
      ? this.getEmployeePrintLabel(approval.actionByAdmin)
      : '';
    const actionByAdminDate = hasNeedAssetCodeRegistrationAnswer
      ? this.formatPrintDate(approval.actionByAdminDate)
      : '';
    const printCurrency = this.escapeHtml(this.getPrintCurrencyLabel());

    return (pages ?? this.getPrintablePurchaseRequisitionPages()).map((printPage) => {
      const pageLabel = `${printPage.pageNumber} of ${printPage.totalPages}`;
      const continuationClass = printPage.pageNumber > 1 ? ' print-page--continuation' : '';
      const totalsFooterHtml = printPage.isLast ? `
          <tfoot>
            ${this.getPrintTotalsHtml(totals)}
          </tfoot>
      ` : '';
      const afterTableHtml = printPage.isLast ? `
        <div class="notes">
          <p><span class="underline">Note:</span> In case of purchasing software and/or IT equipment, this request must be verified by IT department to confirm our existing hardware is adequate and doesn't need any further upgrading.</p>
          <p>Payment Term: ${this.escapeHtml(doc.general.paymentTerm || this.defaultPaymentTerm)}</p>
        </div>

        <div class="full-line-field conditions-field">
          <span class="label">Other conditions (if any):</span>
          <span class="line-value">${this.escapeHtml(doc.general.otherConditions || '')}</span>
        </div>

        <div class="quotation-note">*Please fill in the price and attach quotation (if any)</div>

        <div class="signature-block">
          <div class="signature-row">
            <div class="line-field">
              <span class="label">Requested By:</span>
              <span class="line-value">${this.getSignatureOrPrintLabel(approval.requestedBy, approval.requestedByDate, requestedByLabel)}</span>
            </div>
            <div class="line-field date-field">
              <span class="label">Date:</span>
              <span class="line-value">${this.escapeHtml(this.formatPrintDate(approval.requestedByDate))}</span>
            </div>
          </div>

          <div class="signature-row with-caption">
            <div class="line-field">
              <span class="label">Verified By:</span>
              <span class="line-value">${this.getSignatureOrPrintLabel(approval.verifiedByIS, approval.verifiedByISDate, verifiedByISLabel)}</span>
            </div>
            <div class="mid-caption">(IS for all IT equipment only.)</div>
            <div class="line-field date-field">
              <span class="label">Date:</span>
              <span class="line-value">${this.escapeHtml(this.getApprovedPrintDate(approval.verifiedByISDate, approval.verifiedByISStatus))}</span>
            </div>
          </div>

          <div class="signature-row with-caption">
            <div class="line-field">
              <span class="label">Verified By:</span>
              <span class="line-value">${this.getSignatureOrPrintLabel(approval.verifiedBy, approval.verifiedByDate, verifiedByLabel)}</span>
            </div>
            <div class="mid-caption">(MD/DI/AD/TL)</div>
            <div class="line-field date-field">
              <span class="label">Date:</span>
              <span class="line-value">${this.escapeHtml(this.getApprovedPrintDate(approval.verifiedByDate, approval.verifiedByStatus))}</span>
            </div>
          </div>

          <div class="signature-row with-caption">
            <div class="line-field">
              <span class="label">Approved By:</span>
              <span class="line-value">${this.getSignatureOrPrintLabel(approval.approvedBy, approval.approvedByDate, approvedByLabel)}</span>
            </div>
            <div class="mid-caption">(MD/DI)</div>
            <div class="line-field date-field">
              <span class="label">Date:</span>
              <span class="line-value">${this.escapeHtml(this.getApprovedPrintDate(approval.approvedByDate, approval.approvedByStatus))}</span>
            </div>
          </div>

          ${approval.approvedBy2 ? `
          <div class="signature-row with-caption">
            <div class="line-field">
              <span class="label">Approved By 2:</span>
              <span class="line-value">${this.getSignatureOrPrintLabel(approval.approvedBy2, approval.approvedBy2Date, approvedBy2Label)}</span>
            </div>
            <div class="mid-caption">(Grand total over 50,000)</div>
            <div class="line-field date-field">
              <span class="label">Date:</span>
              <span class="line-value">${this.escapeHtml(this.getApprovedPrintDate(approval.approvedBy2Date, approval.approvedBy2Status))}</span>
            </div>
          </div>
          ` : ''}

          <div class="signature-row with-caption">
            <div class="line-field">
              <span class="label">Acknowledged:</span>
              <span class="line-value">${this.getSignatureOrPrintLabel(approval.acknowledgedBy, approval.acknowledgedByDate, acknowledgedByLabel)}</span>
            </div>
            <div class="mid-caption">(CA)</div>
            <div class="line-field date-field">
              <span class="label">Date:</span>
              <span class="line-value">${this.escapeHtml(this.getApprovedPrintDate(approval.acknowledgedByDate, approval.acknowledgedByStatus))}</span>
            </div>
          </div>

          <div class="checkbox-row">
            <span class="checkbox-label">Need asset code registration?</span>
            <span class="box">${approval.needAssetCodeRegistration === 'yes' ? '✓' : ''}</span>
            <span class="checkbox-text">Yes</span>
            <span class="box">${approval.needAssetCodeRegistration === 'no' ? '✓' : ''}</span>
            <span class="checkbox-text">No</span>
          </div>

          <div class="signature-row with-caption">
            <div class="line-field">
              <span class="label">Action by:</span>
              <span class="line-value">${this.getSignatureOrPrintLabel(approval.actionByAdmin, approval.actionByAdminDate, actionByAdminLabel)}</span>
            </div>
            <div class="mid-caption">(ADM)</div>
            <div class="line-field date-field">
              <span class="label">Date:</span>
              <span class="line-value">${this.escapeHtml(actionByAdminDate)}</span>
            </div>
          </div>
        </div>
      ` : '';

      return `
        <div class="print-page${continuationClass}">
          <div class="print-header">
            <div class="company-name">Meinhardt (Thailand) Ltd.</div>
            <div class="logo-block">
              <img src="/images/logo/logo-meinharde.png" alt="Meinhardt logo" />
              <div class="form-code">27 - FORM MTPC-02</div>
            </div>
          </div>

          <div class="title">PURCHASE REQUISITION FORM</div>

          <div class="two-col-row top-gap">
            <div class="line-field">
              <span class="label">To:</span>
              <span class="line-value">${this.escapeHtml(header.to)}</span>
            </div>
            <div class="line-field">
              <span class="label">Date:</span>
              <span class="line-value">${this.escapeHtml(header.date)}</span>
            </div>
          </div>

          <div class="two-col-row">
            <div class="line-field">
              <span class="label">Requested By</span>
              <span class="line-value">${this.escapeHtml(requestedByLabel)}</span>
            </div>
            <div class="line-field with-suffix">
              <span class="label">Recommended By:</span>
              <span class="line-value">${this.escapeHtml(header.recommendedBy || '')}</span>
              <span class="suffix">(if any)</span>
            </div>
          </div>

          <div class="two-col-row">
            <div class="line-field with-suffix">
              <span class="label">Deadline:</span>
              <span class="line-value">${this.escapeHtml(header.deadline || '')}</span>
              <span class="suffix">(if any)</span>
            </div>
            <div class="line-field with-suffix">
              <span class="label">Received From:</span>
              <span class="line-value">${this.escapeHtml(header.receivedFrom || '')}</span>
              <span class="suffix">(if any)</span>
            </div>
          </div>

          <div class="reason-block">
            <div class="full-line-field reason-first-line">
              <span class="label">Reasons for Purchase:</span>
              <span class="line-value">${this.escapeHtml(header.reasonsForPurchase || '')}</span>
            </div>
            <div class="reason-line"></div>
            <div class="reason-line"></div>
          </div>

          <div class="print-table-section">
            <table class="items-table">
              <colgroup>
                <col class="col-item" />
                <col class="col-desc" />
                <col class="col-qty" />
                <col class="col-price" />
                <col class="col-amount" />
              </colgroup>
              <thead>
                <tr>
                  <th class="col-item">Item(s)</th>
                  <th class="col-desc">Description</th>
                  <th class="col-qty">Quantity</th>
                  <th class="col-price">*Unit Price<br />(${printCurrency})</th>
                  <th class="col-amount">*Amount (${printCurrency})</th>
                </tr>
              </thead>
              <tbody>
                ${this.getPrintItemsHtml(printPage.items)}
              </tbody>
              ${totalsFooterHtml}
            </table>
          </div>

          ${afterTableHtml}

          <div class="print-footer">
            <div class="doc-code">MATL_REQ/EMS DOCUMENTATION/FORM/MTM/MTPC/02/RELEASED/CREATE/DEPARTMENT/PURPOSE/001/DATE/2020</div>
            <div class="page-no">Page ${pageLabel}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  private getPrintItemsHtml(pageItems: any[]): string {
    const items = Array.isArray(pageItems) ? pageItems : [];
    const itemRows = items.map((item: any) => `
      <tr class="body-row">
        <td class="item-cell body-cell">${this.escapeHtml(item?.name || '')}</td>
        <td class="desc-cell body-cell">${this.escapeHtml(item?.description || '')}</td>
        <td class="qty-cell body-cell">${this.escapeHtml(item?.qty != null ? String(item.qty) : '')}</td>
        <td class="price-cell body-cell">${this.formatPrintNumber(item?.unitPrice)}</td>
        <td class="amount-cell body-cell">${this.formatPrintNumber(item?.amount)}</td>
      </tr>
    `).join('');

    const fillerRow = `
      <tr class="body-row body-row-filler" aria-hidden="true">
        <td class="item-cell body-cell">&nbsp;</td>
        <td class="desc-cell body-cell">&nbsp;</td>
        <td class="qty-cell body-cell">&nbsp;</td>
        <td class="price-cell body-cell">&nbsp;</td>
        <td class="amount-cell body-cell">&nbsp;</td>
      </tr>
    `;

    return `${itemRows}${fillerRow}`;
  }

  private getPrintablePurchaseRequisitionPages(): PrintablePurchaseRequisitionPage[] {
    const items = Array.isArray(this.prDocument?.items) ? this.prDocument.items : [];

    return [{items, pageNumber: 1, totalPages: 1, isLast: true}];
  }

  ngOnDestroy(): void {
    if (typeof document !== 'undefined') {
      document.body.classList.remove(this.printBodyClass);
    }
  }

  private getPrintTotalsHtml(totals: any): string {
    const hasDiscount = Number(totals?.discount || 0) > 0;
    const rows = [
      ...(hasDiscount ? [{ label: 'Discount', value: totals.discount }] : []),
      { label: 'Sub Total', value: totals.subTotal },
      { label: 'VAT 7%', value: totals.vat },
      { label: 'Grand Total', value: totals.grandTotal },
    ];

    return rows.map((row, index) => `
      <tr>
        ${index === 0 ? `<td colspan="2" rowspan="${rows.length}" class="footer-spacer"></td>` : ''}
        <td colspan="2" class="total-label">${this.escapeHtml(row.label)}</td>
        <td class="total-value">${this.formatPrintNumber(row.value)}</td>
      </tr>
    `).join('');
  }

  private formatPrintNumber(value: number | null | undefined): string {
    if (value == null || isNaN(Number(value))) {
      return '';
    }

    const fractionDigits = this.getCurrencyFractionDigits();
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits
    }).format(Number(value));
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

  private formatPrintDate(value: string | Date | null | undefined): string {
    const formatted = this.formatDate(value);
    return formatted === '-' ? '' : formatted;
  }

  private toBooleanFlag(value: unknown): boolean {
    return value === 1 || value === '1' || value === true;
  }

  private getEmployeePrintLabel(ref: string | number | null | undefined): string {
    const label = this.getApprovalEmployeeLabelByRef(ref);
    if (label) {
      return label;
    }

    const fallback = this.getEmployeeLabel(ref);
    return fallback === '-' ? '' : fallback;
  }

  private getApprovalEmployeeLabelByRef(ref: string | number | null | undefined): string {
    const normalizedRef = this.cleanText(ref);
    if (!normalizedRef) {
      return '';
    }

    const approval = this.prDocument?.approval;
    if (!approval) {
      return '';
    }

    const approvalActors = [
      { actor: approval.requestedBy, label: approval.requestedByLabel },
      { actor: approval.verifiedByIS, label: approval.verifiedByISLabel },
      { actor: approval.verifiedBy, label: approval.verifiedByLabel },
      { actor: approval.approvedBy, label: approval.approvedByLabel },
      { actor: approval.approvedBy2, label: approval.approvedBy2Label },
      { actor: approval.acknowledgedBy, label: approval.acknowledgedByLabel },
      { actor: approval.actionByAdmin, label: approval.actionByAdminLabel },
    ];

    return this.cleanText(
      approvalActors.find((item) => this.cleanText(item.actor) === normalizedRef)?.label
    );
  }

  private getApprovedEmployeePrintLabel(ref: string | number | null | undefined, status: string | null | undefined): string {
    return this.isApprovedStatus(status) ? this.getEmployeePrintLabel(ref) : '';
  }

  private getApprovedPrintDate(value: string | Date | null | undefined, status: string | null | undefined): string {
    return this.isApprovedStatus(status) ? this.formatPrintDate(value) : '';
  }

  private isApprovedStatus(status: string | null | undefined): boolean {
    const normalized = String(status || '').trim().toLowerCase();
    return normalized === 'approve' || normalized === 'approved';
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

      @font-face {
        font-family: 'testimonia-font';
        src: url('/fonts/testimonia/Testimonia-3zp8X.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
        font-display: block;
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        min-height: 100%;
        background: #ffffff;
        color: #222222;
        font-family: 'Noto Sans Thai', Arial, Helvetica, sans-serif;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      body {
        font-size: 10px;
        line-height: 1.2;
      }

      .print-page {
        width: 176mm;
        height: 280mm;
        display: flex;
        flex-direction: column;
        margin: 0 auto;
        background: #ffffff;
      }

      .print-page--continuation {
        break-before: page;
        page-break-before: always;
      }

      .print-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 4mm;
      }

      .company-name {
        font-size: 11px;
        font-weight: 700;
        margin-top: 4mm;
      }

      .logo-block {
        text-align: right;
        font-size: 9px;
        font-weight: 700;
      }

      .logo-block img {
        display: block;
        width: 105px;
        height: auto;
        margin-left: auto;
        margin-bottom: 0;
      }

      .title {
        text-align: center;
        font-size: 11px;
        font-weight: 700;
        color: #1d4f91;
        margin-bottom: 5mm;
      }

      .top-gap {
        margin-top: 0;
      }

      .two-col-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        column-gap: 6mm;
        margin-bottom: 1.3mm;
      }

      .line-field,
      .full-line-field {
        display: flex;
        align-items: flex-end;
        min-width: 0;
      }

      .label {
        flex: 0 0 auto;
        font-weight: 400;
        margin-right: 3px;
        white-space: nowrap;
      }

      .line-value {
        flex: 1 1 auto;
        min-width: 0;
        border-bottom: 1px dotted #666666;
        min-height: 11px;
        padding: 0 2px 1px;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .with-suffix .suffix {
        flex: 0 0 auto;
        margin-left: 4px;
        white-space: nowrap;
      }

      .full-line-field {
        margin-top: 0.8mm;
        margin-bottom: 0;
      }

      .reason-block {
        margin-bottom: 3mm;
      }

      .reason-first-line {
        align-items: flex-start;
        margin-bottom: 1.2mm;
      }

      .reason-first-line .label {
        padding-top: 1px;
      }

      .reason-first-line .line-value {
        min-height: 6.2mm;
        line-height: 1.3;
        overflow: visible;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: break-word;
        word-wrap: break-word;
        text-overflow: clip;
      }

      .reason-line {
        border-bottom: 1px dotted #666666;
        height: 6.2mm;
      }

      .print-table-section {
        display: flex;
        min-height: 55mm;
        flex: 1 1 auto;
        flex-direction: column;
        margin-bottom: 3mm;
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
      .items-table td {
        border: 1px solid #8a8a8a;
        padding: 3px 4px;
      }

      .items-table th {
        text-align: center;
        font-weight: 700;
        height: 12mm;
        vertical-align: top;
      }

      .items-table tbody td.body-cell {
        vertical-align: top;
        height: 6mm;
        line-height: 1.2;
        border-top: none;
        border-bottom: none;
      }

      .items-table .col-item { width: 14%; }
      .items-table .col-desc { width: 40%; }
      .items-table .col-qty { width: 14%; }
      .items-table .col-price { width: 16%; }
      .items-table .col-amount { width: 16%; }

      .qty-cell,
      .price-cell,
      .amount-cell,
      .total-value {
        text-align: right;
      }

      .body-row {
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .items-table tbody .body-row-filler .body-cell {
        height: 100%;
        border-bottom: 1px solid #8a8a8a;
      }

      .desc-cell {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }

      .item-cell,
      .qty-cell,
      .price-cell,
      .amount-cell {
        white-space: nowrap;
      }

      .footer-spacer {
        border-right: 1px solid #8a8a8a;
        border-top: 1px solid #8a8a8a;
      }

      .total-label {
        font-weight: 400;
      }

      .notes {
        font-size: 9px;
        margin-bottom: 3mm;
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .notes p {
        margin: 0 0 2.5mm;
      }

      .underline {
        text-decoration: underline;
      }

      .conditions-field {
        margin-bottom: 2mm;
      }

      .quotation-note {
        font-size: 9px;
        margin-bottom: 4mm;
      }

      .signature-block {
        display: flex;
        flex-direction: column;
        gap: 2.5mm;
        font-size: 9px;
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .signature-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 52mm;
        column-gap: 5mm;
        align-items: end;
      }

      .signature-row .line-value:has(.signature-print-block) {
        position: relative;
        min-height: 6mm;
        overflow: visible;
        white-space: normal;
      }

      .signature-print-block {
        position: absolute;
        left: 50%;
        bottom: 5px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-end;
        min-width: 20mm;
        max-width: 100%;
        line-height: 1;
        transform: translateX(-50%);
        isolation: isolate;
        white-space: nowrap;
      }

      .signature-watermark {
        position: absolute;
        left: 50%;
        bottom: 1mm;
        z-index: 0;
        width: 4.5mm;
        height: 4.5mm;
        object-fit: contain;
        opacity: 0.09;
        transform: translateX(-50%);
      }

      .signature-name {
        position: relative;
        z-index: 1;
        font-family: 'testimonia-font', cursive;
        font-size: 18px;
        font-weight: 700;
        line-height: 0.8;
        color: #174ea6;
      }

      .signature-id {
        position: relative;
        z-index: 1;
        margin-top: 1px;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 6.5px;
        font-weight: 700;
        line-height: 1;
        color: #174ea6;
      }

      .signature-row.with-caption {
        grid-template-columns: minmax(0, 1fr) auto 52mm;
      }

      .mid-caption {
        align-self: end;
        padding-bottom: 1px;
        white-space: nowrap;
      }

      .date-field .line-value {
        min-width: 0;
      }

      .checkbox-row {
        display: flex;
        align-items: center;
        gap: 4mm;
        margin: 0.5mm 0 1.5mm;
      }

      .checkbox-label,
      .checkbox-text {
        white-space: nowrap;
      }

      .box {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 10px;
        height: 10px;
        border: 1px solid #666666;
        font-size: 9px;
        line-height: 1;
      }

      .print-footer {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        margin-top: 4mm;
        font-size: 6px;
        color: #555555;
      }

      .page-no {
        font-size: 7px;
        white-space: nowrap;
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
