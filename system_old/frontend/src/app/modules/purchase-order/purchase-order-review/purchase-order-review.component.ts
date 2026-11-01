// purchase-order-review.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatRadioModule } from '@angular/material/radio';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { DEFAULT_PURCHASE_PAYMENT_TERM } from 'app/core/constants/purchase-payment-term.constant';
import { PurchaseOrder, PurchaseOrderService } from 'app/core/services/purchase-order.service';
import { finalize } from 'rxjs';
import { mapPurchaseOrderReviewItems } from './purchase-order-review.util';

@Component({
  selector: 'app-purchase-order-review',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatRadioModule,
    MatFormFieldModule,
    MatInputModule,
    MatDividerModule,
  ],
  templateUrl: './purchase-order-review.component.html',
  styleUrls: ['./purchase-order-review.component.scss'],
})
export class PurchaseOrderReviewComponent implements OnInit {
  readonly defaultPaymentTerm = DEFAULT_PURCHASE_PAYMENT_TERM;

  isLoading = false;
  purchaseOrder: any = null;

  // Purchase order document prepared from the API response.
  poDocument: any = null;

  // ตัวแปรของ Approval Decision
  approvalDecision: 'approve' | 'decline' | null = null;
  approvalComments = '';

  constructor(private route: ActivatedRoute, private router: Router,
    private purchaseOrderService: PurchaseOrderService,
    private fuseConfirmationService: FuseConfirmationService
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.loadPurchaseOrder(id);
  }

  /** Load the requested PO and prepare its review document. */
  private loadPurchaseOrder(id: string | null): void {
    if (!id) {
      this.onBackToList();
      return;
    }

    this.isLoading = true;
    this.purchaseOrderService.findOne(id).pipe(
      finalize(() => this.isLoading = false)
    ).subscribe({
      next: (purchaseOrder: PurchaseOrder) => {
        this.purchaseOrder = purchaseOrder;
        const itemsTotal = (purchaseOrder.items || []).reduce(
          (sum, item) => sum + (Number(item.amount) || 0), 0
        );
        const discount = Number(purchaseOrder.discount) || 0;
        const subTotal = Number(purchaseOrder.subTotal) || Math.max(0, itemsTotal - discount);
        const vat = Number(purchaseOrder.vatValue) || 0;
        const grandTotal = Number(purchaseOrder.grandTotal) || subTotal + vat;

        this.poDocument = {
          taxId: '0105534077670',
          header: {
            to: purchaseOrder.to,
            company: purchaseOrder.company,
            fax: purchaseOrder.fax || '',
            from: purchaseOrder.from || '',
            cc: purchaseOrder.cc || '',
          },
          poInfo: {
            poNo: purchaseOrder.poNo || '',
            poDate: purchaseOrder.poDate ? this.formatDate(purchaseOrder.poDate) : '-',
            requisitionDate: this.formatDate(purchaseOrder.requisitionDate),
            page: purchaseOrder.pageNumber || 1,
            of: purchaseOrder.totalPages || 1,
            circ: purchaseOrder.circ || '-',
          },
          items: mapPurchaseOrderReviewItems(purchaseOrder.items),
          totals: { discount, subTotal, vat, grandTotal },
          general: {
            quotationNo: purchaseOrder.quotationNo || '',
            quotationDate: purchaseOrder.quotationDate ? this.formatDate(purchaseOrder.quotationDate) : '-',
            deliveryDate: purchaseOrder.deliveryDate ? this.formatDate(purchaseOrder.deliveryDate) : '-',
            paymentTerm: purchaseOrder.paymentTerm ?? this.defaultPaymentTerm,
            otherConditions: purchaseOrder.otherConditions || '',
          },
          approval: {
            purchaseRequestBy: purchaseOrder.purchaseRequestBy || '-',
            purchaseRequestDate: purchaseOrder.purchaseRequestByDate ? this.formatDate(purchaseOrder.purchaseRequestByDate) : '-',
            verifiedBy: purchaseOrder.verifiedBy || '-',
            verifiedDate: purchaseOrder.verifiedByDate ? this.formatDate(purchaseOrder.verifiedByDate) : '-',
          },
          comments: {
            main: purchaseOrder.deliveryComments || '',
            signedBy: purchaseOrder.signedBy || '-',
            signedDate: purchaseOrder.signedByDate ? this.formatDate(purchaseOrder.signedByDate) : '-',
            ackBy: purchaseOrder.acknowledgedBy || '-',
            ackDate: purchaseOrder.acknowledgedByDate ? this.formatDate(purchaseOrder.acknowledgedByDate) : '-',
          },
        };
      },
      error: () => this.onBackToList()
    });
  }

  // ===== Navigation =====
  onBackToList(): void {
    this.router.navigate(['/purchase-order'], {
      queryParamsHandling: 'preserve',
    });
  }

  // ใช้กับปุ่ม Cancel ใน Approval Decision
  onBack(): void {
    this.onBackToList();
  }

  onEdit(): void {
    if (!this.purchaseOrder) return;
    this.router.navigate(['/purchase-order', this.purchaseOrder.id, 'edit']);
  }

  // ===== ตัดสินใจอนุมัติ / ปฏิเสธ (mock) =====
  onApprove(): void {
    if (!this.approvalDecision || !this.purchaseOrder) {
      return;
    }

    const confirmation = this.fuseConfirmationService.open({
      title: 'Confirm review',
      message: 'Are you sure you want to submit this review decision?',
      icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
      actions: {
        cancel: { show: true, label: 'Cancel' },
        confirm: { show: true, label: 'Confirm', color: 'primary' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result !== 'confirmed') return;

      if (this.approvalDecision === 'approve') {
        alert(
          'Mock: APPROVED PO ' +
            this.purchaseOrder!.poNo +
            '\nComments: ' +
            (this.approvalComments || '-')
        );
      } else {
        alert(
          'Mock: DECLINED PO ' +
            this.purchaseOrder!.poNo +
            '\nComments: ' +
            (this.approvalComments || '-')
        );
      }
    });
  }

  // ===== helpers =====
  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'DRAFT':
        return 'bg-gray-100 text-gray-800';
      case 'SUBMITTED':
        return 'bg-blue-100 text-blue-800';
      case 'APPROVED':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  formatDate(date: Date | string): string {
    if (!date) return '-';
    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }

  formatCurrency(amount: number | null | undefined): string {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
    }).format(amount || 0);
  }
}
