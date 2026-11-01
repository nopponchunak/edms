import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatCardModule } from '@angular/material/card';
import { MatRadioModule } from '@angular/material/radio';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { DEFAULT_PURCHASE_PAYMENT_TERM } from 'app/core/constants/purchase-payment-term.constant';
import { PurchaseRequisitionService } from 'app/core/services/purchase-requisition.service';
import { getAttachmentUrl } from 'app/core/utils/attachment-url.util';
import { FuseConfirmationService } from '@fuse/services/confirmation';

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
  verifiedBy?: string | null;
  verifiedDate?: string | null;
  approvedBy?: string | null;
  approvedDate?: string | null;
  approvedBy2?: string | null;
  approvedBy2Date?: string | null;
  acknowledgedBy?: string | null;
  acknowledgedDate?: string | null;
  needAssetCodeRegistration?: 'yes' | 'no' | '';
  actionByAdmin?: string | null;
  actionByAdminDate?: string | null;

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

@Component({
  selector: 'app-purchase-requisition-review',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatCardModule,
    MatRadioModule,
    MatFormFieldModule,
    MatInputModule,
    FuseAlertComponent
  ],
  templateUrl: './purchase-requisition-review.component.html',
  // ถ้ายังไม่มีไฟล์ scss ให้คอมเมนต์บรรทัดนี้ไว้ก่อน
  // styleUrls: ['./purchase-requisition-review.component.scss']
})
export class PurchaseRequisitionReviewComponent implements OnInit {
  readonly defaultPaymentTerm = DEFAULT_PURCHASE_PAYMENT_TERM;

  requisition: PurchaseRequisitionDetail | null = null;
  isLoading = false;
  alert: { type: FuseAlertType; message: string } | null = null;

  // สำหรับส่วน Review
  reviewDecision: 'approve' | 'reject' | null = null;
  reviewComments = '';
  approvalDecision: 'approve' | 'decline' | null = null;
  approvalComments = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private purchaseRequisitionService: PurchaseRequisitionService,
    private fuseConfirmationService: FuseConfirmationService
  ) {}

  ngOnInit(): void {
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

        // Prefer totals from API; fall back to recalculating with discount and VAT flag.
        const items = data.items || [];
        const itemsTotal = items.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);
        const discountValue = Number(data.discount);
        const discount = Number.isFinite(discountValue) ? Math.max(0, discountValue) : 0;
        const hasVat = data.vat === 1 || data.vat === true || data.vat === '1';
        const apiSubTotal = this.toOptionalNumber(data.sub_total);
        const apiVat = this.toOptionalNumber(data.vat_value);
	        const apiGrandTotal = this.toOptionalNumber(data.grand_total);
	        const subTotal = Number.isFinite(apiSubTotal) ? apiSubTotal : Math.max(0, itemsTotal - discount);
	        const vat7Percent = Number.isFinite(apiVat) ? apiVat : (hasVat ? subTotal * 0.07 : 0);
	        const grandTotal = Number.isFinite(apiGrandTotal) ? apiGrandTotal : subTotal + vat7Percent;
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
          items: items.map((item: any) => ({
            item: item.item || '',
            description: item.description || '',
            needAssetCodeRegistration: this.toBooleanFlag(item.need_asset_code_registration),
            quantity: item.quantity || 0,
            unitPrice: item.unit_price || 0,
            amount: item.amount || 0
          })),
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
          verifiedBy: data.verified_by || null,
          verifiedDate: data.verified_date || null,
          approvedBy: data.approved_by || null,
          approvedDate: data.approved_date || null,
          approvedBy2: data.approved_by_2 || null,
          approvedBy2Date: data.approved_by_2_date || null,
          acknowledgedBy: data.acknowledged_by || null,
          acknowledgedDate: data.acknowledged_date || null,
          needAssetCodeRegistration: this.toNeedAssetCodeRegistrationFormValue(data.need_asset_code_registration),
          actionByAdmin: data.action_by_admin || null,
          actionByAdminDate: data.action_by_admin_date || null,
          status: (data.status?.toLowerCase() || 'submitted') as 'draft' | 'submitted' | 'approved' | 'rejected',
          createdBy: data.create_by || '',
          createdAt: data.created_at || '',
          updatedAt: data.updated_at || '',
          attachments: Array.isArray(data.attachments)
            ? data.attachments.map((path: string) => ({
                name: path.split('/').pop() || path,
                type: 'File',
                url: getAttachmentUrl(path)
              }))
            : []
        };

        this.isLoading = false;
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

  onBack(): void {
    this.router.navigate(['/purchase-requisition']);
  }

  onSubmitReview(): void {
    if (!this.reviewDecision) {
      this.showAlert('error', 'Please select your review decision (Approve / Reject).');
      return;
    }

    const text =
      this.reviewDecision === 'approve' ? 'approve this requisition?' : 'reject this requisition?';

    const confirmation = this.fuseConfirmationService.open({
      title: 'Confirm review',
      message: `Are you sure you want to ${text}`,
      icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
      actions: {
        cancel: { show: true, label: 'Cancel' },
        confirm: { show: true, label: 'Confirm', color: 'primary' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result !== 'confirmed') return;

      // TODO: เรียก API บันทึกผล review จริง ๆ
      this.showAlert(
        'success',
        this.reviewDecision === 'approve'
          ? 'Purchase requisition approved successfully!'
          : 'Purchase requisition rejected successfully!'
      );

      setTimeout(() => {
        this.router.navigate(['/purchase-requisition']);
      }, 1500);
    });
  }

  onApprove(): void {
    this.reviewDecision = this.approvalDecision === 'approve' ? 'approve' : this.approvalDecision === 'decline' ? 'reject' : null;
    this.reviewComments = this.approvalComments;
    this.onSubmitReview();
  }

  showAlert(type: FuseAlertType, message: string): void {
    this.alert = { type, message };
    setTimeout(() => (this.alert = null), 5000);
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
      case 'approved':
        return 'Approved';
      case 'rejected':
        return 'Rejected';
      default:
        return status;
    }
  }

  formatDate(dateString?: string | null): string {
    if (!dateString) {
      return '-';
    }
    const d = new Date(dateString);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }

  formatCurrency(value: number | null | undefined): string {
    if (value == null) {
      return '-';
    }
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
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
}
