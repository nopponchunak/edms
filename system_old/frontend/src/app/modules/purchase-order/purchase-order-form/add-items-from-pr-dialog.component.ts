import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { PurchaseRequisitionService, PrForSelectionItem } from 'app/core/services/purchase-requisition.service';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
    selector: 'app-add-items-from-pr-dialog',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        MatDialogModule,
        MatButtonModule,
        MatCheckboxModule,
        MatTableModule,
        MatProgressSpinnerModule,
        MatIconModule,
        MatFormFieldModule,
        MatInputModule
    ],
    templateUrl: './add-items-from-pr-dialog.component.html',
    styleUrls: ['./add-items-from-pr-dialog.component.scss']
})
export class AddItemsFromPrDialogComponent implements OnInit {
    private readonly dialogRef = inject<MatDialogRef<AddItemsFromPrDialogComponent>>(MatDialogRef);
    private readonly purchaseRequisitionService = inject(PurchaseRequisitionService);

    loading = true;
    error: string | null = null;
    list: PrForSelectionItem[] = [];
    private originalApprovedList: PrForSelectionItem[] = [];
    searchTerm = '';
    selectedIds = new Set<number>();
    expandedIds = new Set<number>();

	    readonly displayedColumns = ['expand', 'select', 'no', 'id', 'subject', 'to', 'date', 'currency', 'totalAmount', 'itemsCount'];

    ngOnInit(): void {
        this.purchaseRequisitionService.getPurchaseRequisitionsForSelection().subscribe({
            next: (data) => {
                this.originalApprovedList = (data || []).filter(pr => {
                    // Helper: Check if a status is 'approved'
                    const isApproved = (s: string | undefined) => s?.toLowerCase() === 'approve' || s?.toLowerCase() === 'approved';
                    // Helper: Check if a status is 'rejected'
                    const isRejected = (s: string | undefined) => s?.toLowerCase() === 'reject' || s?.toLowerCase() === 'rejected';

                    // Define workflow steps to check
                    const steps = [
                        { by: pr.verified_by_is, status: pr.verified_by_is_status },
                        { by: pr.verified_by, status: pr.verified_by_status },
                        { by: pr.approved_by, status: pr.approved_by_status },
                        { by: pr.acknowledged_by, status: pr.acknowledged_by_status }
                    ];

                    // 1. If any assigned step is rejected, it's not eligible
                    if (steps.some(step => step.by && isRejected(step.status))) return false;

                    // 2. Strict check: ALL ASSIGNED workflow steps MUST be approved.
                    const isAllWorkflowApproved = steps.every(step => {
                        if (!step.by) return true; // Skip unassigned steps
                        return isApproved(step.status);
                    });

                    // 3. Optional: Fallback to main status field if present
                    const mainStatus = pr.status?.toLowerCase();
                    const isMainStatusApproved = mainStatus === 'approved' || mainStatus === 'approve' || mainStatus === 'acknowledged' || mainStatus === 'completed';

                    return isMainStatusApproved || isAllWorkflowApproved;
                });
                this.applySearch();
                this.loading = false;
            },
            error: (err) => {
                this.error = err?.error?.message || err?.message || 'Failed to load purchase requisitions';
                this.loading = false;
            }
        });
    }

    applySearch(): void {
        const term = (this.searchTerm || '').toLowerCase().trim();
        if (!term) {
            this.list = [...this.originalApprovedList];
            return;
        }

	        this.list = this.originalApprovedList.filter(pr =>
	            String(pr.id).includes(term) ||
	            (pr.subject || '').toLowerCase().includes(term) ||
	            (pr.to || '').toLowerCase().includes(term) ||
	            (pr.No != null && String(pr.No).includes(term))
	        );
    }

    toggleExpand(pr: PrForSelectionItem): void {
        const id = pr.id;
        if (this.expandedIds.has(id)) {
            this.expandedIds.delete(id);
        } else {
            this.expandedIds.add(id);
        }
    }

    isExpanded(pr: PrForSelectionItem): boolean {
        return this.expandedIds.has(pr.id);
    }

    getDiscount(pr: PrForSelectionItem): number {
        const discount = Number(pr.discount);
        return Number.isFinite(discount) ? Math.max(0, discount) : 0;
    }

    getSubTotal(pr: PrForSelectionItem): number {
        const apiSubTotal = pr.sub_total === null || pr.sub_total === undefined || pr.sub_total === ''
            ? NaN
            : Number(pr.sub_total);
        if (Number.isFinite(apiSubTotal)) {
            return apiSubTotal;
        }

        const itemsTotal = (pr.items || []).reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
        return Math.max(0, itemsTotal - this.getDiscount(pr));
    }

    getVatAmount(pr: PrForSelectionItem): number {
        const apiVat = pr.vat_value === null || pr.vat_value === undefined || pr.vat_value === ''
            ? NaN
            : Number(pr.vat_value);
        if (Number.isFinite(apiVat)) {
            return apiVat;
        }

        return (pr.vat === true || pr.vat === 1 || pr.vat === '1') ? this.getSubTotal(pr) * 0.07 : 0;
    }

    /** ยอดรวมของ PR หลังหักส่วนลดและ VAT */
    getTotalAmount(pr: PrForSelectionItem): number {
        const apiGrandTotal = pr.grand_total === null || pr.grand_total === undefined || pr.grand_total === ''
            ? NaN
            : Number(pr.grand_total);
        if (Number.isFinite(apiGrandTotal)) {
            return apiGrandTotal;
        }

        return this.getSubTotal(pr) + this.getVatAmount(pr);
    }

    formatAmount(pr: PrForSelectionItem): string {
        const n = this.getTotalAmount(pr);
        return Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
    }

    formatItemAmount(value: string | number | undefined): string {
        const n = Number(value);
        return Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
    }

    isAssetCodeRequired(value: unknown): boolean {
        return value === 1 || value === '1' || value === true;
    }

    /** วันที่ format dd/MM/yyyy */
    formatDate(dateStr: string | undefined): string {
        if (!dateStr) return '-';
        const parts = String(dateStr).trim().split(/[-/]/);
        if (parts.length >= 3) {
            const y = parts[0].length === 4 ? parts[0] : parts[2];
            const m = parts[0].length === 4 ? parts[1] : parts[1];
            const d = parts[0].length === 4 ? parts[2] : parts[0];
            return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
        }
        return dateStr;
    }

    toggleSelection(pr: PrForSelectionItem): void {
        const id = pr.id;
        if (this.selectedIds.has(id)) {
            this.selectedIds.delete(id);
        } else {
            this.selectedIds.add(id);
        }
    }

    isSelected(pr: PrForSelectionItem): boolean {
        return this.selectedIds.has(pr.id);
    }

    toggleAll(): void {
        const visibleIds = this.list.map(pr => pr.id);
        const allVisibleSelected = visibleIds.every(id => this.selectedIds.has(id));

        if (allVisibleSelected) {
            visibleIds.forEach(id => this.selectedIds.delete(id));
        } else {
            visibleIds.forEach(id => this.selectedIds.add(id));
        }
    }

    get allSelected(): boolean {
        return this.list.length > 0 && this.list.every(pr => this.selectedIds.has(pr.id));
    }

    get someSelected(): boolean {
        return this.list.some(pr => this.selectedIds.has(pr.id));
    }

    get itemsCount(): number {
        return this.originalApprovedList.filter((pr) => this.selectedIds.has(pr.id)).reduce((sum, pr) => sum + (pr.items?.length || 0), 0);
    }

    cancel(): void {
        this.dialogRef.close();
    }

    confirm(): void {
        const selected = this.originalApprovedList.filter((pr) => this.selectedIds.has(pr.id));
        this.dialogRef.close(selected);
    }
}
