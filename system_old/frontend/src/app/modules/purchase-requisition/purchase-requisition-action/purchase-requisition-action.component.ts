import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatRadioModule } from '@angular/material/radio';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Subject, takeUntil } from 'rxjs';
import { PurchaseRequisitionService } from 'app/core/services/purchase-requisition.service';
import { PurchaseRequisitionNotificationService } from 'app/core/services/purchase-requisition-notification.service';
import { DEFAULT_PURCHASE_PAYMENT_TERM } from 'app/core/constants/purchase-payment-term.constant';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import {
  AttachmentDisplayItem,
  getAttachmentDisplayItems,
  getAttachmentIcon,
  getAttachmentPreviewType,
  getAttachmentTypeLabel,
} from 'app/core/utils/attachment-url.util';
import { FuseConfirmationService } from '@fuse/services/confirmation';

interface RequisitionItem {
  item: string;
  description: string;
  needAssetCodeRegistration?: boolean;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface PurchaseRequisitionDetail {
  id: string;
  to: string;
  subject?: string | null;
  requestedBy: string;
  date: string;
  deadline?: string | null;
  recommendedBy?: string | null;
  receivedFrom?: string | null;
  reasonsForPurchase: string;
  items: RequisitionItem[];
  currencyCode?: string | null;
  discount: number;
  subTotal: number;
  vat7Percent: number;
  grandTotal: number;
  otherConditions?: string | null;
  paymentTerm?: string | null;
  quotationAttached: boolean;
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
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
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

@Component({
  selector: 'app-purchase-requisition-action',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatSnackBarModule,
    MatCardModule,
    MatRadioModule,
    MatCheckboxModule,
  ],
  templateUrl: './purchase-requisition-action.component.html',
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

    .acknowledged-asset-card {
      margin-top: 1.25rem;
      padding: 1.25rem;
      border: 1px solid rgb(226 232 240);
      border-radius: 0.875rem;
      background: rgb(248 250 252);
    }

    .acknowledged-asset-header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem 1rem;
      margin-bottom: 0.75rem;
    }

    .acknowledged-asset-title {
      display: inline-flex;
      align-items: center;
      margin: 0;
      font-size: 0.875rem;
      font-weight: 600;
      color: rgb(31 41 55);
    }

    .acknowledged-radio-group {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      align-items: center;
      margin-left: auto;
    }

    .acknowledged-items-table-wrap {
      margin-top: 0.875rem;
      overflow: hidden;
      border: 1px solid rgb(226 232 240);
      border-radius: 0.625rem;
      background: white;
    }

    .acknowledged-items-table-wrap--disabled {
      background: rgb(248 250 252);
    }

    .acknowledged-items-table {
      width: 100%;
      table-layout: fixed;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 0.8125rem;
      color: rgb(51 65 85);
    }

    .acknowledged-items-table th,
    .acknowledged-items-table td {
      padding: 0.4375rem 0.5rem;
      border-bottom: 1px solid rgb(226 232 240);
      text-align: left;
      vertical-align: middle;
    }

    .acknowledged-items-table th {
      background: rgb(248 250 252);
      color: rgb(51 65 85);
      font-size: 0.8125rem;
      font-weight: 600;
    }

    .acknowledged-items-table tbody tr {
      transition: background-color 150ms ease;
    }

    .acknowledged-items-table tbody tr:hover {
      background: rgb(239 246 255);
    }

    .acknowledged-items-table tbody tr:last-child td {
      border-bottom: 0;
    }

    .ack-col-check {
      width: 3rem;
      padding-left: 0.25rem !important;
      padding-right: 0.25rem !important;
      text-align: center !important;
    }

    .ack-col-item {
      width: 5.75rem;
    }

    .ack-col-description {
      min-width: 0;
    }

    .ack-item-name {
      font-weight: 600;
      color: rgb(15 23 42);
    }

    .ack-cell-ellipsis {
      display: block;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .acknowledged-items-table-wrap--disabled .acknowledged-items-table {
      color: rgb(100 116 139);
    }

    .acknowledged-items-table-wrap--disabled .ack-item-name {
      color: rgb(100 116 139);
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

    :host-context(.dark) .acknowledged-asset-card {
      border-color: rgb(51 65 85);
      background: rgb(15 23 42);
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

    :host-context(.dark) .acknowledged-asset-title,
    :host-context(.dark) .ack-item-name {
      color: rgb(241 245 249);
    }

    :host-context(.dark) .acknowledged-items-table-wrap {
      border-color: rgb(51 65 85);
      background: rgb(15 23 42);
    }

    :host-context(.dark) .acknowledged-items-table {
      color: rgb(203 213 225);
    }

    :host-context(.dark) .acknowledged-items-table th {
      background: rgb(30 41 59);
      color: rgb(203 213 225);
    }

    :host-context(.dark) .acknowledged-items-table tbody tr:hover {
      background: rgb(30 41 59);
    }

    :host-context(.dark) .acknowledged-items-table th,
    :host-context(.dark) .acknowledged-items-table td {
      border-bottom-color: rgb(51 65 85);
    }

    :host-context(.dark) .acknowledged-items-table-wrap--disabled {
      background: rgb(15 23 42);
    }

    :host-context(.dark) .acknowledged-items-table-wrap--disabled .acknowledged-items-table,
    :host-context(.dark) .acknowledged-items-table-wrap--disabled .ack-item-name {
      color: rgb(148 163 184);
    }

    :host-context(.dark) .document-check-box {
      border-color: rgb(71 85 105);
      background: rgb(15 23 42);
      color: rgb(59 130 246);
    }
  `]
})
export class PurchaseRequisitionActionComponent implements OnInit, OnDestroy {
  readonly defaultPaymentTerm = DEFAULT_PURCHASE_PAYMENT_TERM;

  actionForm: FormGroup;
  loading = false;
  requisitionId: string | null = null;
  requisition: PurchaseRequisitionDetail | null = null;
  actionType: 'verified_by_is_status' | 'verified_by_status' | 'approved_by_status' | 'approved_by_2_status' | 'acknowledged_by_status' | 'action_by_admin' | null = null;
  prDocument: any = null;
  displayCurrency: string = 'THB';
  attachmentLinks: AttachmentDisplayItem[] = [];
  selectedAttachment: AttachmentDisplayItem | null = null;
  selectedAttachmentResourceUrl: SafeResourceUrl | null = null;

  private _unsubscribeAll: Subject<any> = new Subject<any>();

  constructor(
    private fb: FormBuilder,
    private purchaseRequisitionService: PurchaseRequisitionService,
    private purchaseRequisitionNotificationService: PurchaseRequisitionNotificationService,
    private route: ActivatedRoute,
    public router: Router,
    private snackBar: MatSnackBar,
    private fuseConfirmationService: FuseConfirmationService,
    private sanitizer: DomSanitizer
  ) {
    this.actionForm = this.createForm();
    this.actionForm.get('needAssetCodeRegistration')?.valueChanges
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe(() => {
        if (this.actionType === 'acknowledged_by_status') {
          this.updateItemAssetFlagControlsAvailability();
        }
      });
  }

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this._unsubscribeAll)).subscribe(params => {
      this.requisitionId = params['id'];
      this.actionType = params['type'] as 'verified_by_is_status' | 'verified_by_status' | 'approved_by_status' | 'approved_by_2_status' | 'acknowledged_by_status' | 'action_by_admin';

      if (this.requisitionId) {
        this.loadRequisition();
      }
    });
  }

  ngOnDestroy(): void {
    this._unsubscribeAll.next(null);
    this._unsubscribeAll.complete();
  }

  onPreview(): void {
    if (!this.requisitionId || typeof window === 'undefined') {
      return;
    }

    const url = this.router.serializeUrl(
      this.router.createUrlTree(['/print/purchase-requisition', this.requisitionId])
    );

    window.open(url, '_blank', 'noopener');
  }

  private createForm(): FormGroup {
    return this.fb.group({
      status: ['', Validators.required],
      // ใช้เฉพาะกรณี Acknowledged By เท่านั้น
      needAssetCodeRegistration: [''],
      itemAssetFlags: this.fb.array([]),
    });
  }

  get itemAssetFlagsFormArray(): FormArray {
    return this.actionForm.get('itemAssetFlags') as FormArray;
  }

  private setupFormForActionType(): void {
    if (!this.actionType || !this.requisition) return;

    this.actionForm.patchValue({
      status: this.actionType === 'action_by_admin' ? 'approved' : '',
    });

    // ถ้าเป็นขั้น Acknowledged ให้เตรียมค่าและ validate ของ Need Asset Code Registration
    const needCtrl = this.actionForm.get('needAssetCodeRegistration');
    if (this.actionType === 'acknowledged_by_status') {
      const currentNeed =
        this.requisition.needAssetCodeRegistration === 'yes'
          ? 'yes'
          : this.requisition.needAssetCodeRegistration === 'no'
          ? 'no'
          : '';
      needCtrl?.setValidators([Validators.required]);
      needCtrl?.setValue(currentNeed);
      needCtrl?.updateValueAndValidity();
    } else {
      needCtrl?.clearValidators();
      needCtrl?.setValue('');
      needCtrl?.updateValueAndValidity();
    }

    this.syncItemAssetFlagsFormArray();
  }

  private syncItemAssetFlagsFormArray(): void {
    const itemFlags = this.itemAssetFlagsFormArray;
    itemFlags.clear();

    (this.requisition?.items || []).forEach((item) => {
      const control = this.fb.control(item.needAssetCodeRegistration === true);
      control.valueChanges
        .pipe(takeUntil(this._unsubscribeAll))
        .subscribe(() => this.syncNeedAssetCodeFromItemFlags());
      if (this.actionType !== 'acknowledged_by_status') {
        control.disable({ emitEvent: false });
      }
      itemFlags.push(control);
    });

    this.updateItemAssetFlagControlsAvailability();
  }

  private updateItemAssetFlagControlsAvailability(): void {
    const needValue = this.actionForm.get('needAssetCodeRegistration')?.value;
    const shouldDisable =
      this.actionType !== 'acknowledged_by_status' || needValue === 'no';

    this.itemAssetFlagsFormArray.controls.forEach((control) => {
      if (needValue === 'no' && control.value !== false) {
        control.setValue(false, { emitEvent: false });
      }

      if (shouldDisable && control.enabled) {
        control.disable({ emitEvent: false });
      } else if (!shouldDisable && control.disabled) {
        control.enable({ emitEvent: false });
      }
    });
  }

  private syncNeedAssetCodeFromItemFlags(): void {
    if (this.actionType !== 'acknowledged_by_status') {
      return;
    }

    const hasSelectedAssetItem = this.itemAssetFlagsFormArray.getRawValue()
      .some((checked: boolean) => checked === true);
    const needCtrl = this.actionForm.get('needAssetCodeRegistration');
    if (hasSelectedAssetItem && needCtrl?.value !== 'yes') {
      needCtrl?.setValue('yes', { emitEvent: false });
    }
  }

  private loadRequisition(): void {
    if (!this.requisitionId) return;

    this.loading = true;
    this.purchaseRequisitionService.findOne(this.requisitionId)
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: (response) => {
          let data: any;
          const res = response as any;
          if (res.status !== undefined && res.data) {
            data = res.data;
          } else if (res.id) {
            data = res;
          } else {
            data = res;
          }

          const items = data.items || [];
          const mappedItems = items.map((item: any) => {
            const quantity = Number(item.quantity) || 0;
            const unitPrice = Number(item.unit_price) || 0;
            const amount = item.amount ? Number(item.amount) : (quantity * unitPrice);

            return {
              item: item.item || '',
              description: item.description || '',
              needAssetCodeRegistration: this.toBooleanFlag(item.need_asset_code_registration),
              quantity: quantity,
              unitPrice: unitPrice,
              amount: amount
            };
          });

          const itemsTotal = mappedItems.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
          const discountValue = Number(data.discount);
          const discount = Number.isFinite(discountValue) ? Math.max(0, discountValue) : 0;
          const hasVat = data.vat === 1 || data.vat === true || data.vat === '1';
          const apiSubTotal = this.toOptionalNumber(data.sub_total);
          const apiVat = this.toOptionalNumber(data.vat_value);
          const apiGrandTotal = this.toOptionalNumber(data.grand_total);
          const subTotal = Number.isFinite(apiSubTotal) ? apiSubTotal : Math.max(0, itemsTotal - discount);
          const vat7Percent = Number.isFinite(apiVat) ? apiVat : (hasVat ? subTotal * 0.07 : 0);
          const grandTotal = Number.isFinite(apiGrandTotal) ? apiGrandTotal : subTotal + vat7Percent;
          const currencyCode = data.currency_code || data.currency || 'THB';
          this.displayCurrency = currencyCode;
          this.attachmentLinks = getAttachmentDisplayItems(data.attachments);
          this.clearSelectedAttachment();

          const needAssetCodeRegistration = this.toNeedAssetCodeRegistrationFormValue(data.need_asset_code_registration);
          const requisitionNo = this.resolveRequisitionNo(data);

          this.requisition = {
            id: String(data.id),
            to: data.to || '',
            subject: data.subject || '',
            requestedBy: data.requested_by || '',
            date: data.date || '',
            deadline: data.deadline || null,
            recommendedBy: data.recommended_by || null,
            receivedFrom: data.received_from || null,
            reasonsForPurchase: data.reasons_for_purchase || '',
            items: mappedItems,
            currencyCode,
            discount,
            subTotal: subTotal,
            vat7Percent: vat7Percent,
            grandTotal: grandTotal,
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
            status: (data.status?.toLowerCase() || 'submitted') as any,
            actionByAdmin: data.action_by_admin || null,
            actionByAdminDate: data.action_by_admin_date || null,
            attachments: this.attachmentLinks.map((attachment) => ({
              name: attachment.fileName,
              type: this.getAttachmentTypeLabel(attachment),
              url: attachment.href,
            }))
          };

          // Build prDocument for display (similar to View)
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
            items: mappedItems.map((it: any) => ({
              name: it.item || '',
              description: it.description || '',
              needAssetCodeRegistration: it.needAssetCodeRegistration,
              qty: it.quantity ?? 0,
              unitPrice: it.unitPrice ?? 0,
              amount: it.amount ?? 0,
            })),
            totals: {
              discount: Number(discount) || 0,
              subTotal: Number(subTotal) || 0,
              vat: Number(vat7Percent) || 0,
              grandTotal: Number(grandTotal) || 0,
            },
            general: {
              otherConditions: data.other_conditions || '',
              paymentTerm: data.payment_term ?? this.defaultPaymentTerm,
              quotationAttached: data.quotation_attached === 1 || data.quotation_attached === true,
            },
            approval: {
              requestedBy: data.requested_by || '',
              requestedByLabel: this.getEmployeeResponseLabel(data, 'requested_by'),
              requestedByDate: data.requested_date || null,
              requestedByStatus: data.requested_by_status?.toLowerCase() || null,
              verifiedByIS: data.verified_by_is || '',
              verifiedByISLabel: this.getEmployeeResponseLabel(data, 'verified_by_is'),
              verifiedByISDate: data.verified_is_date || null,
              verifiedByISStatus: data.verified_by_is_status?.toLowerCase() || null,
              verifiedBy: data.verified_by || '',
              verifiedByLabel: this.getEmployeeResponseLabel(data, 'verified_by'),
              verifiedByDate: data.verified_date || null,
              verifiedByStatus: data.verified_by_status?.toLowerCase() || null,
              approvedBy: data.approved_by || '',
              approvedByLabel: this.getEmployeeResponseLabel(data, 'approved_by'),
              approvedByDate: data.approved_date || null,
              approvedByStatus: data.approved_by_status?.toLowerCase() || null,
              approvedBy2: data.approved_by_2 || '',
              approvedBy2Label: this.getEmployeeResponseLabel(data, 'approved_by_2'),
              approvedBy2Date: data.approved_by_2_date || null,
              approvedBy2Status: data.approved_by_2_status?.toLowerCase() || null,
              acknowledgedBy: data.acknowledged_by || '',
              acknowledgedByLabel: this.getEmployeeResponseLabel(data, 'acknowledged_by'),
              acknowledgedByDate: data.acknowledged_date || null,
              acknowledgedByStatus: data.acknowledged_by_status?.toLowerCase() || null,
              needAssetCodeRegistration,
              actionByAdmin: data.action_by_admin || '',
              actionByAdminLabel: this.getEmployeeResponseLabel(data, 'action_by_admin'),
              actionByAdminDate: data.action_by_admin_date || null,
            },
          };

          this.setupFormForActionType();
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading requisition:', error);
          this.snackBar.open('Error loading requisition', 'Close', { duration: 3000 });
          this.loading = false;
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

  setDecision(status: 'approved' | 'reject'): void {
    const control = this.actionForm.get('status');
    control?.setValue(status);
    control?.markAsTouched();
    control?.updateValueAndValidity();
  }

  getCurrentActionStatus(): string | null | undefined {
    switch (this.actionType) {
      case 'verified_by_is_status':
        return this.requisition?.verifiedByISStatus || 'pending';
      case 'verified_by_status':
        return this.requisition?.verifiedByStatus || 'pending';
      case 'approved_by_status':
        return this.requisition?.approvedByStatus || 'pending';
      case 'approved_by_2_status':
        return this.requisition?.approvedBy2Status || 'pending';
      case 'acknowledged_by_status':
        return this.requisition?.acknowledgedByStatus || 'pending';
      case 'action_by_admin':
        return this.requisition?.actionByAdminDate ? 'approved' : 'pending';
      default:
        return 'pending';
    }
  }

  getActionOwnerLabel(): string {
    const label = this.getActionOwnerTitle();
    let ref: string | number | null | undefined = null;

    switch (this.actionType) {
      case 'verified_by_is_status':
        ref = this.requisition?.verifiedByIS;
        break;
      case 'verified_by_status':
        ref = this.requisition?.verifiedBy;
        break;
      case 'approved_by_status':
        ref = this.requisition?.approvedBy;
        break;
      case 'approved_by_2_status':
        ref = this.requisition?.approvedBy2;
        break;
      case 'acknowledged_by_status':
        ref = this.requisition?.acknowledgedBy;
        break;
      case 'action_by_admin':
        ref = this.requisition?.actionByAdmin;
        break;
    }

    return `${label}: ${this.getActionOwnerEmployeeLabel() || this.getEmployeeLabel(ref)}`;
  }

  private getActionOwnerEmployeeLabel(): string {
    const approval = this.prDocument?.approval;
    if (!approval) {
      return '';
    }

    switch (this.actionType) {
      case 'verified_by_is_status':
        return approval.verifiedByISLabel || '';
      case 'verified_by_status':
        return approval.verifiedByLabel || '';
      case 'approved_by_status':
        return approval.approvedByLabel || '';
      case 'approved_by_2_status':
        return approval.approvedBy2Label || '';
      case 'acknowledged_by_status':
        return approval.acknowledgedByLabel || '';
      case 'action_by_admin':
        return approval.actionByAdminLabel || '';
      default:
        return '';
    }
  }

  getActionOwnerTitle(): string {
    switch (this.actionType) {
      case 'verified_by_is_status':
        return 'Verified By IS';
      case 'verified_by_status':
        return 'Verified By';
      case 'approved_by_status':
        return 'Approved By';
      case 'approved_by_2_status':
        return 'Approved By 2';
      case 'acknowledged_by_status':
        return 'Acknowledged By';
      case 'action_by_admin':
        return 'Action By';
      default:
        return 'Action By';
    }
  }

  getActionSubmitLabel(): string {
    return this.actionType === 'action_by_admin' ? 'Submit Action' : 'Submit';
  }

  getDecisionActionText(status: string | null | undefined): string {
    if (this.actionType === 'action_by_admin') {
      return 'Action';
    }
    return String(status || '').toLowerCase() === 'reject' ? 'Reject' : 'Approve';
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
            status: approval.actionByAdminDate ? 'approved' : 'pending',
            statusLabel: approval.actionByAdminDate ? 'Actioned' : 'Pending',
          }]
        : []),
    ];
  }

  getWorkflowActorLabel(step: ApprovalWorkflowStep): string {
    const actorLabel = this.cleanText(step.actorLabel);
    return actorLabel || this.getEmployeeLabel(step.actor);
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

  onSubmit(): void {
    if (this.actionForm.invalid || !this.requisitionId || !this.actionType) {
      this.actionForm.markAllAsTouched();
      return;
    }

    const pendingFormData = this.actionForm.getRawValue();
    if (
      this.actionType === 'acknowledged_by_status' &&
      pendingFormData.needAssetCodeRegistration === 'yes' &&
      !pendingFormData.itemAssetFlags?.some((checked: boolean) => checked === true)
    ) {
      this.snackBar.open('Please select at least one item that needs asset code registration', 'Close', { duration: 5000 });
      return;
    }

    const decisionText = this.getDecisionActionText(pendingFormData.status);
    const confirmation = this.fuseConfirmationService.open({
      title: `Confirm ${decisionText}`,
      message: `Submit ${decisionText} for ${this.getActionOwnerTitle()} on ${this.prDocument?.requisitionNo || 'this requisition'}?`,
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
      const formData = this.actionForm.getRawValue();
      const itemAssetFlags = (formData.itemAssetFlags || []).map((checked: boolean) => checked === true);
      const hasSelectedAssetItem = itemAssetFlags.some((checked: boolean) => checked === true);

      const actionPayload: any = {
        decision: this.normalizeDecisionForApi(formData.status),
      };

      if (this.actionType === 'acknowledged_by_status') {
        actionPayload.item_asset_flags = itemAssetFlags;
        actionPayload.need_asset_code_registration = (() => {
          if (hasSelectedAssetItem) return 1;
          const need = formData.needAssetCodeRegistration;
          if (need === 'yes') return 1;
          if (need === 'no') return 0;
          return this.toNeedAssetCodeRegistrationPayload(this.requisition?.needAssetCodeRegistration);
        })();
      }

      this.purchaseRequisitionService.takeAction(this.requisitionId, this.actionType, actionPayload)
        .pipe(takeUntil(this._unsubscribeAll))
        .subscribe({
          next: (response) => {
            this.sendActionEmailNotification(response, actionPayload.decision);
            this.snackBar.open('Status updated successfully', 'Close', { duration: 3000 });
            this.router.navigate(['/purchase-requisition/list']);
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

  private getActionErrorMessage(error: any): string {
    return error?.error?.message || error?.message || 'Error updating status';
  }

  private sendActionEmailNotification(updatedPayload: any, status: string): void {
    if (!this.requisitionId || !this.actionType) {
      return;
    }

    this.purchaseRequisitionNotificationService
      .notifyAfterAction(
        {
          ...updatedPayload,
          id: this.requisitionId
        },
        this.actionType,
        status,
        this.requisitionId
      )
      .subscribe({
        error: (error) => {
          console.error('Failed to send purchase requisition email notification:', error);
          this.snackBar.open('Status updated, but email notification could not be sent', 'Close', { duration: 5000 });
        }
      });
  }

  private toNeedAssetCodeRegistrationFormValue(value: unknown): 'yes' | 'no' | '' {
    if (value === 1 || value === '1' || value === true) {
      return 'yes';
    }

    if (value === 0 || value === '0' || value === false) {
      return 'no';
    }

    return '';
  }

  private toBooleanFlag(value: unknown): boolean {
    return value === 1 || value === '1' || value === true;
  }

  private toNeedAssetCodeRegistrationPayload(value: unknown): 1 | 0 | null {
    if (value === 'yes' || value === 1 || value === '1' || value === true) {
      return 1;
    }

    if (value === 'no' || value === 0 || value === '0' || value === false) {
      return 0;
    }

    return null;
  }

  getActionTitle(): string {
    switch (this.actionType) {
      case 'verified_by_is_status':
        return 'Verify By IS Status';
      case 'verified_by_status':
        return 'Verify Status';
      case 'approved_by_status':
        return 'Approve Status';
      case 'approved_by_2_status':
        return 'Approve By 2 Status';
      case 'acknowledged_by_status':
        return 'Acknowledge Status';
      case 'action_by_admin':
        return 'Action By';
      default:
        return 'Update Status';
    }
  }

  getActionDescription(): string {
    switch (this.actionType) {
      case 'verified_by_is_status':
        return 'Update the IS verification status for this requisition';
      case 'verified_by_status':
        return 'Update the verification status for this requisition';
      case 'approved_by_status':
        return 'Update the approval status for this requisition';
      case 'approved_by_2_status':
        return 'Update the second approval status for this requisition';
      case 'acknowledged_by_status':
        return 'Update the acknowledgment status for this requisition';
      case 'action_by_admin':
        return 'Submit the admin action for this requisition';
      default:
        return 'Update the status for this requisition';
    }
  }

  // Helper functions for display
  formatDate(dateString?: string | null | Date): string {
    return formatDateDisplay(dateString);
  }

  formatDateTime(dateString: string | null | undefined | Date): string {
    return formatDateTimeDisplay(dateString);
  }

  formatCurrency(value: number | string | null | undefined, currency?: string): string {
    const amount = value != null ? Number(value) : NaN;
    if (!Number.isFinite(amount)) {
      return '-';
    }

    const currencyCode = currency || this.displayCurrency || 'THB';
    const options: Intl.NumberFormatOptions = {
      style: 'currency',
      currency: currencyCode,
    };

    try {
      return new Intl.NumberFormat('th-TH', options).format(amount);
    } catch {
      return new Intl.NumberFormat('th-TH', { ...options, currency: 'THB' }).format(amount);
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
}
