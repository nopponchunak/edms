import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatRadioModule } from '@angular/material/radio';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { catchError, forkJoin, map, of, Subject, switchMap, takeUntil } from 'rxjs';
import { PurchaseOrderService, PurchaseOrder, PurchaseOrderActionDto } from 'app/core/services/purchase-order.service';
import { AuthenticatedPdfService } from 'app/core/services/authenticated-pdf.service';
import { PurchaseRequisitionService } from 'app/core/services/purchase-requisition.service';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { EmployeeService } from 'app/core/services/employee.service';
import {
  AttachmentDisplayItem,
  getAttachmentDisplayItems,
  getAttachmentIcon,
  getAttachmentPreviewType,
  getAttachmentTypeLabel,
} from 'app/core/utils/attachment-url.util';
import { MatDividerModule } from '@angular/material/divider';
import { PURCHASE_ORDER_EMAIL_CONFIG, WorkflowEmailNotificationService } from 'app/core/services/workflow-email-notification.service';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { DEFAULT_PURCHASE_PAYMENT_TERM } from 'app/core/constants/purchase-payment-term.constant';
import { ApprovalWorkflowStep, buildApprovalWorkflowSteps } from '../po-approval-workflow.util';
import {
  excludePurchaseRequisitionPdfFromAttachments,
  getPurchaseRequisitionPdfDisplayItems,
} from '../po-purchase-requisition-pdf.util';
import { PurchaseOrderPrPdfCardComponent } from '../purchase-order-pr-pdf-card.component';

@Component({
  selector: 'app-purchase-order-action',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatRadioModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatSnackBarModule,
    MatCardModule,
    MatDividerModule,
    PurchaseOrderPrPdfCardComponent,
  ],
  templateUrl: './purchase-order-action.component.html',
  styles: [`
    @property --action-border-angle {
      syntax: '<angle>';
      inherits: false;
      initial-value: 0deg;
    }

    :host { display:block; }

    .action-status-card {
      --action-border-angle: 0deg;
      border: 2px solid transparent;
      border-radius: 0.75rem;
      background:
        linear-gradient(rgb(255 251 235), rgb(255 251 235)) padding-box,
        conic-gradient(from var(--action-border-angle), rgb(180 83 9) 0deg, rgb(251 191 36) 44deg, rgb(255 247 237) 78deg, rgb(249 115 22) 112deg, rgb(180 83 9) 148deg, rgb(180 83 9) 360deg) border-box;
      box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.16), 0 4px 8px rgba(15, 23, 42, 0.08);
      animation: action-border-run 3s linear infinite;
    }

    @keyframes action-border-run {
      to {
        --action-border-angle: 360deg;
      }
    }

    .action-status-card mat-card-header {
      padding: 1.25rem 1.25rem 0.875rem;
    }

    .action-status-card-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 0.75rem;
      width: 100%;
    }

    .action-status-card mat-card-content {
      padding: 0 1.25rem 1.25rem;
    }

    .action-status-title {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      color: rgb(146 64 14);
    }

    .action-status-subtitle {
      flex-shrink: 0;
      font-size: 0.875rem;
      font-weight: 400;
      color: rgb(107 114 128);
    }

    .document-value {
      border: 1px solid #e2e8f0;
      border-radius: 0.5rem;
      background-color: #f8fafc;
      padding: 0.5rem 0.75rem;
      font-size: 0.875rem;
      line-height: 1.25rem;
      color: #0f172a;
      min-height: 2.5rem;
      display: flex;
      align-items: center;
    }
    .document-label {
      font-size: 0.875rem;
      font-weight: 500;
      color: #475569;
      margin-bottom: 0.25rem;
    }
    .document-check-box {
      width: 1.25rem;
      height: 1.25rem;
      border: 1px solid #cbd5e1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background-color: #fff;
      font-size: 0.75rem;
      margin-right: 0.5rem;
    }
    .document-check-row {
      display: flex;
      align-items: center;
    }

    :host-context(.dark) .action-status-card {
      background:
        linear-gradient(rgb(69 26 3), rgb(69 26 3)) padding-box,
        conic-gradient(from var(--action-border-angle), rgb(245 158 11) 0deg, rgb(254 243 199) 44deg, rgb(249 115 22) 82deg, rgb(251 191 36) 118deg, rgb(245 158 11) 152deg, rgb(245 158 11) 360deg) border-box;
      box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.2), 0 4px 8px rgba(0, 0, 0, 0.28);
    }

    :host-context(.dark) .action-status-title {
      color: rgb(254 243 199);
    }

    :host-context(.dark) .action-status-subtitle {
      color: rgb(156 163 175);
    }

    @media (prefers-reduced-motion: reduce) {
      .action-status-card {
        --action-border-angle: 0deg;
        animation: none;
      }
    }
  `]
})
export class PurchaseOrderActionComponent implements OnInit, OnDestroy {
  readonly defaultPaymentTerm = DEFAULT_PURCHASE_PAYMENT_TERM;
  private readonly defaultFromLabel = 'Meinhardt (Thailand) Ltd.';

  actionForm: FormGroup;
  loading = false;
  purchaseOrderId: string | null = null;
  purchaseOrder: PurchaseOrder | null = null;
  actionType: 'verified_by_status' | 'approved_by_status' | 'circ_status' | 'signed_by_status' | 'acknowledged_by_status' | null = null;
  employeeLookup = new Map<string, string>();
  employeeLookupWithTitle = new Map<string, string>();
  poDocument: any = null;
  displayCurrency = 'THB';
  attachmentLinks: AttachmentDisplayItem[] = [];
  selectedAttachment: AttachmentDisplayItem | null = null;
  selectedAttachmentResourceUrl: SafeResourceUrl | null = null;
  purchaseRequisitionPdfLinks: AttachmentDisplayItem[] = [];
  selectedPurchaseRequisitionPdf: AttachmentDisplayItem | null = null;
  selectedPurchaseRequisitionPdfResourceUrl: SafeResourceUrl | null = null;
  private purchaseRequisitionPdfObjectUrl: string | null = null;

  statusOptions = [
    { value: 'PENDING', label: 'Pending' },
    { value: 'REJECT', label: 'Reject' },
    { value: 'APPROVED', label: 'Approve' },
  ];

  private _unsubscribeAll: Subject<any> = new Subject<any>();

  constructor(
    private fb: FormBuilder,
    private purchaseOrderService: PurchaseOrderService,
    private purchaseRequisitionService: PurchaseRequisitionService,
    private employeeService: EmployeeService,
    private workflowEmailNotificationService: WorkflowEmailNotificationService,
    private route: ActivatedRoute,
    public router: Router,
    private snackBar: MatSnackBar,
    private fuseConfirmationService: FuseConfirmationService,
    private authenticatedPdfService: AuthenticatedPdfService,
    private sanitizer: DomSanitizer
  ) {
    this.actionForm = this.createForm();
  }

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this._unsubscribeAll)).subscribe(params => {
      this.purchaseOrderId = params['id'];
      this.actionType = params['type'] as 'verified_by_status' | 'approved_by_status' | 'circ_status' | 'signed_by_status' | 'acknowledged_by_status';

      if (this.purchaseOrderId) {
        this.loadPurchaseOrder();
      }

      if (this.actionType) {
        this.setupFormForActionType();
      }
    });
  }

  ngOnDestroy(): void {
    this.clearSelectedPurchaseRequisitionPdf();
    this._unsubscribeAll.next(null);
    this._unsubscribeAll.complete();
  }

  onPreview(): void {
    if (!this.purchaseOrderId || typeof window === 'undefined') {
      return;
    }

    const url = this.router.serializeUrl(
      this.router.createUrlTree(['/print/purchase-order', this.purchaseOrderId])
    );

    window.open(url, '_blank', 'noopener');
  }

  private createForm(): FormGroup {
    return this.fb.group({
      status: ['', Validators.required],
      deliveryOnTime: [''],
      meetQualityRequirement: [''],
      meetGuidelines: [''],
      comments: [''],
    });
  }

  private setupFormForActionType(): void {
    if (!this.actionType) return;

    if (this.purchaseOrder) {
      this.actionForm.patchValue({
        status: '',
        deliveryOnTime: this.purchaseOrder.deliveryOnTime === true ? 'yes' : this.purchaseOrder.deliveryOnTime === false ? 'no' : '',
        meetQualityRequirement: this.purchaseOrder.meetQualityRequirement === true ? 'yes' : this.purchaseOrder.meetQualityRequirement === false ? 'no' : '',
        meetGuidelines: this.purchaseOrder.meetGuidelinesForEquipment === true ? 'yes' : this.purchaseOrder.meetGuidelinesForEquipment === false ? 'no' : '',
        comments: this.purchaseOrder.deliveryComments || '',
      });
    }
  }

  private loadPurchaseOrder(): void {
    if (!this.purchaseOrderId) return;

    this.loading = true;
    forkJoin({
      purchaseOrder: this.purchaseOrderService.findOne(this.purchaseOrderId),
      employeeLookup: this.employeeService.getEmployeeLookupMap(),
      employeeLookupWithTitle: this.employeeService.getEmployeeLookupMapWithTitle()
    })
      .pipe(
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
          const codes = [
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
          return this.employeeService.ensureEmployeesInLookup(employeeLookup, codes).pipe(
            switchMap(updatedLookup => {
              return this.employeeService.ensureEmployeesInLookup(employeeLookupWithTitle, codes).pipe(
                map(updatedLookupWithTitle => ({ purchaseOrder, employeeLookup: updatedLookup, employeeLookupWithTitle: updatedLookupWithTitle }))
              );
            })
          );
        }),
        takeUntil(this._unsubscribeAll)
      )
      .subscribe({
        next: ({ purchaseOrder, employeeLookup, employeeLookupWithTitle }) => {
          this.employeeLookup = employeeLookup;
          this.employeeLookupWithTitle = employeeLookupWithTitle;

          const discount = Number((purchaseOrder as any).discount) || 0;
          const hasVat = purchaseOrder.vat === 1 || purchaseOrder.vat === true;
          const currencyCode = (purchaseOrder as any).currency_code || (purchaseOrder as any).currency || 'THB';
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

          // Build poDocument for display (matching View)
          this.poDocument = {
            taxId: '0105534077670',
            header: {
              to: purchaseOrder.to,
              company: purchaseOrder.company,
              fax: purchaseOrder.fax || '',
              from: this.getPurchaseOrderFromDisplayValue(purchaseOrder),
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

          this.setupFormForActionType();
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading purchase order:', error);
          this.snackBar.open('Error loading request', 'Close', { duration: 3000 });
          this.loading = false;
        }
      });
  }

  getEmployeeLabel(ref: string | number | null | undefined): string {
    return this.employeeService.formatEmployeeReference(ref, this.employeeLookup);
  }

  private getPurchaseOrderFromDisplayValue(purchaseOrder: PurchaseOrder): string {
    const fromValue = String(purchaseOrder?.from || '').trim();
    if (!this.isIgnoredFromValue(fromValue)) {
      return fromValue;
    }

    const requestedByLabel = this.employeeService.formatEmployeeReference(purchaseOrder?.purchaseRequestBy, this.employeeLookup, '');
    if (!this.isIgnoredFromValue(requestedByLabel)) {
      return requestedByLabel;
    }

    const createdByLabel = this.employeeService.formatEmployeeReference(purchaseOrder?.createdBy, this.employeeLookup, '');
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

  getEmployeeLabelWithTitle(ref: string | number | null | undefined): string {
    return this.employeeService.formatEmployeeReference(ref, this.employeeLookupWithTitle);
  }

  setDecision(status: 'APPROVED' | 'REJECT'): void {
    const control = this.actionForm.get('status');
    control?.setValue(status);
    control?.markAsTouched();
    control?.updateValueAndValidity();
  }

  getCurrentActionStatus(): string | null | undefined {
    switch (this.actionType) {
      case 'verified_by_status':
        return this.purchaseOrder?.verifiedByStatus || 'pending';
      case 'approved_by_status':
        return this.purchaseOrder?.approvedByStatus || 'pending';
      case 'circ_status':
        return this.purchaseOrder?.circStatus || 'pending';
      case 'signed_by_status':
        return this.purchaseOrder?.signedByStatus || 'pending';
      case 'acknowledged_by_status':
        return this.purchaseOrder?.acknowledgedByStatus || 'pending';
      default:
        return 'pending';
    }
  }

  getActionOwnerLabel(): string {
    const label = this.getActionOwnerTitle();
    let ref: string | number | null | undefined = null;

    switch (this.actionType) {
      case 'verified_by_status':
        ref = this.purchaseOrder?.verifiedBy;
        break;
      case 'approved_by_status':
        ref = this.purchaseOrder?.approvedBy;
        break;
      case 'circ_status':
        ref = this.purchaseOrder?.circ;
        break;
      case 'signed_by_status':
        ref = this.purchaseOrder?.signedBy;
        break;
      case 'acknowledged_by_status':
        ref = this.purchaseOrder?.acknowledgedBy;
        break;
    }

    return `${label}: ${this.getEmployeeLabel(ref)}`;
  }

  getActionOwnerTitle(): string {
    switch (this.actionType) {
      case 'verified_by_status':
        return 'Verified By';
      case 'approved_by_status':
        return 'Approved By';
      case 'circ_status':
        return 'Circ';
      case 'signed_by_status':
        return 'Signed By';
      case 'acknowledged_by_status':
        return 'Acknowledged By';
      default:
        return 'Action By';
    }
  }

  getActionSubmitLabel(): string {
    return 'Submit';
  }

  getDecisionActionText(status: string | null | undefined): string {
    return String(status || '').toLowerCase() === 'reject' ? 'Reject' : 'Approve';
  }

  onSubmit(): void {
    if (this.actionForm.invalid || !this.purchaseOrderId || !this.actionType) {
      this.actionForm.markAllAsTouched();
      return;
    }

    const pendingFormData = this.actionForm.value;
    const decisionText = this.getDecisionActionText(pendingFormData.status);
    const confirmation = this.fuseConfirmationService.open({
      title: `Confirm ${decisionText}`,
      message: `Submit ${decisionText} for ${this.getActionOwnerTitle()} on ${this.poDocument?.poInfo?.poNo || 'this purchase order'}?`,
      icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
      actions: {
        cancel: { show: true, label: 'Cancel' },
        confirm: { show: true, label: `Confirm ${decisionText}`, color: 'primary' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result !== 'confirmed') return;

      this.loading = true;
      const formData = this.actionForm.value;
      const decision = this.normalizeDecisionForApi(formData.status);
      const actionPayload: PurchaseOrderActionDto = {
        decision,
      };

      if (this.actionType === 'signed_by_status') {
        actionPayload.comments = formData.comments || '';
        actionPayload.delivery_on_time = this.toNullableYesNoFlag(formData.deliveryOnTime);
        actionPayload.meet_quality_requirement = this.toNullableYesNoFlag(formData.meetQualityRequirement);
        actionPayload.meet_equipment_guidelines = this.toNullableYesNoFlag(formData.meetGuidelines);
      }

      this.purchaseOrderService.takeAction(this.purchaseOrderId!, this.actionType, actionPayload)
        .pipe(takeUntil(this._unsubscribeAll))
        .subscribe({
          next: (updatedPurchaseOrder) => {
            this.sendActionEmailNotification(updatedPurchaseOrder, decision);
            this.snackBar.open('Status updated successfully', 'Close', { duration: 3000 });
            this.router.navigate(['/purchase-order']);
          },
          error: (error) => {
            console.error('Error updating status:', error);
            this.snackBar.open(this.getActionErrorMessage(error), 'Close', { duration: 5000 });
            this.loading = false;
          }
        });

    });
  }

  private normalizeDecisionForApi(status: string | null | undefined): 'approved' | 'rejected' {
    return String(status || '').toLowerCase() === 'reject' ? 'rejected' : 'approved';
  }

  private toNullableYesNoFlag(value: string | null | undefined): 1 | 0 | null {
    if (value === 'yes') return 1;
    if (value === 'no') return 0;
    return null;
  }

  private getActionErrorMessage(error: any): string {
    return error?.error?.message || error?.message || 'Error updating status';
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

  private sendActionEmailNotification(updatedPayload: any, status: string): void {
    if (!this.purchaseOrderId || !this.actionType || !updatedPayload) {
      return;
    }

    this.workflowEmailNotificationService
      .notifyAfterAction(
        PURCHASE_ORDER_EMAIL_CONFIG,
        {
          ...updatedPayload,
          id: this.purchaseOrderId
        },
        this.actionType,
        status,
        this.purchaseOrderId
      )
      .subscribe({
        error: (error) => {
          console.error('Failed to send purchase order email notification:', error);
          this.snackBar.open('Status updated, but email notification could not be sent', 'Close', { duration: 5000 });
        }
      });
  }


  isSignedAction(): boolean {
    return this.actionType === 'signed_by_status';
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

  getActionTitle(): string {
    switch (this.actionType) {
      case 'verified_by_status':
        return 'Verify Status';
      case 'approved_by_status':
        return 'Approve Status';
      case 'circ_status':
        return 'Circ Status';
      case 'signed_by_status':
        return 'Sign Status';
      case 'acknowledged_by_status':
        return 'Acknowledge Status';
      default:
        return 'Update Status';
    }
  }

  getActionDescription(): string {
    switch (this.actionType) {
      case 'verified_by_status':
        return 'Update the verification status for this order';
      case 'approved_by_status':
        return 'Update the approval status for this order';
      case 'circ_status':
        return 'Update the circulation approval status for this order';
      case 'signed_by_status':
        return 'Update the signature status for this order';
      case 'acknowledged_by_status':
        return 'Update the acknowledgment status for this order';
      default:
        return 'Update the status for this order';
    }
  }

  // Helper functions for display
  /** แสดง delivery date: ถ้าเป็น string ใช้เลย ถ้าเป็น Date แปลงเป็นวันที่ */
  getDeliveryDateDisplay(value: Date | string | null | undefined): string {
    if (value == null || value === '') return '-';
    if (typeof value === 'string') return value;
    return this.formatDate(value);
  }

  formatDate(dateString?: string | null | Date): string {
    return formatDateDisplay(dateString);
  }

  formatDateTime(dateString: string | null | undefined | Date): string {
    return formatDateTimeDisplay(dateString);
  }

  formatCurrency(value: number | string | null | undefined, currency?: string): string {
    if (value === null || value === undefined) return '-';

    const amount = Number(value);
    const currencyCode = currency || this.displayCurrency || 'THB';

    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number.isFinite(amount) ? amount : 0);
  }

  getByStatusText(status: string | null | undefined): string {
    if (!status) return 'Pending';
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'pending': return 'Pending';
      case 'reject': case 'rejected': return 'Rejected';
      case 'approve': case 'approved': return 'Approved';
      default: return status;
    }
  }

  getByStatusColor(status: string | null | undefined): string {
    if (!status) return 'bg-yellow-100 text-yellow-800';
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approve': case 'approved': return 'bg-green-100 text-green-800';
      case 'reject': case 'rejected': return 'bg-red-100 text-red-800';
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

  hasAssetCodeItems(items: any[] | null | undefined): boolean {
    return Array.isArray(items) && items.some((item) => item?.needAssetCodeRegistration === true);
  }
}
