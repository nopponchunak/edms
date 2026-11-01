import { Component, OnDestroy, OnInit } from '@angular/core';
import { formatDateDisplay } from 'app/core/utils/date-format.util';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';
import { Router } from '@angular/router';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';

import { ProposalContractReviewService } from 'app/core/services/proposal-contract-review.service';
import { Subject, of } from 'rxjs';
import { catchError, finalize, switchMap, takeUntil, map } from 'rxjs/operators';
import { EmployeeService } from 'app/core/services/employee.service';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';

export interface ProposalContractReview {
  id: string;
  projectName: string;
  projectNo: string;
  proposalNumber: string;
  projectType: string;
  location: string;
  clientName: string;
  estimatedValue: number;
  currency: string;
  status:
    | 'draft'
    | 'submitted'
    | 'proposal_reviewed'
    | 'contract_reviewed'
    | 'approved'
    | 'declined';
  filledInBy: string;
  createdAt: string;
  proposalReviewers: string[];
  contractReviewers: string[];
  submittedAt?: string;
  proposalReviewedAt?: string;
  contractReviewedAt?: string;
}

@Component({
  selector: 'app-proposal-contract-review-approve-list',
  standalone: true,
  imports: [
        ListTableSortModule,
    CommonModule,
    FormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCardModule,
    FuseAlertComponent,
  ],
  templateUrl: './proposal-contract-review-approve-list.component.html',
  styleUrls: ['./proposal-contract-review-approve-list.component.scss'],
})
export class ProposalContractReviewApproveListComponent implements OnInit, OnDestroy {
  displayedColumns: string[] = [
    'projectName',
    'projectNo',
    'proposalNumber',
    'projectType',
    'clientName',
    'estimatedValue',
    'status',
    'filledInBy',
    'submittedAt',
    'actions',
  ];

  dataSource: ProposalContractReview[] = [];
  filteredDataSource: ProposalContractReview[] = [];
  isLoading = false;
  alert: { type: FuseAlertType; message: string } | null = null;

  // Filter options
  searchTerm = '';
  statusFilter = '';
  projectTypeFilter = '';
  employeeLookup = new Map<string, string>();

  private destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private proposalContractReviewService: ProposalContractReviewService,
    private employeeService: EmployeeService,
    private fuseConfirmationService: FuseConfirmationService
  ) {}

  ngOnInit(): void {
    this.employeeService.getEmployeeLookupMap().subscribe((lookup) => {
      this.employeeLookup = lookup;
    });
    this.loadPendingReviews();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ---------------------------
  // ✅ โหลดจาก API จริง
  // ---------------------------
  loadPendingReviews(): void {
    this.isLoading = true;
    this.alert = null;

    // ✅ รองรับชื่อเมธอด list ที่อาจต่างกันใน service
    const svc: any = this.proposalContractReviewService as any;
    const listFn =
      svc.getAll ??
      svc.getList ??
      svc.list ??
      svc.get ??
      null;

    if (!listFn) {
      this.isLoading = false;
      this.showAlert(
        'error',
        'Service has no list method (getAll/getList/list/get). Please add one.'
      );
      return;
    }

    // เรียกโดยไม่ส่ง params ก่อน (ถ้า service ของคุณต้องการ params ค่อยแก้ตรงนี้)
    (listFn.call(svc) as any)
      .pipe(
        takeUntil(this.destroy$),
        catchError((err: any) => {
          console.error('[APPROVE-LIST] load error', err);
          this.showAlert('error', err?.error?.message || 'Failed to load data');
          return of([]);
        }),
        finalize(() => (this.isLoading = false))
      )
      .subscribe((res: any) => {
        const rows = res?.data ?? res ?? [];

        const mapped: ProposalContractReview[] = (rows as any[]).map((d: any) =>
          this.mapApiToListModel(d)
        );

        // ✅ เอาเฉพาะงานที่ “รออนุมัติ”
        this.dataSource = mapped.filter(
          (item) =>
            item.status === 'submitted' ||
            item.status === 'proposal_reviewed' ||
            item.status === 'contract_reviewed'
        );

        this.filteredDataSource = [...this.dataSource];
        this.onFilterChange();
      });
  }

  private mapApiToListModel(d: any): ProposalContractReview {
    const location = [d.city, d.country].filter(Boolean).join(', ');

    const num = (v: any) => {
      const n = typeof v === 'string' ? Number(v) : Number(v ?? 0);
      return isNaN(n) ? 0 : n;
    };

    const proposalReviewers = [d.proposal_reviewer1, d.proposal_reviewer2, d.proposal_reviewer3].filter(
      Boolean
    );
    const contractReviewers = [d.contract_reviewer1, d.contract_reviewer2, d.contract_reviewer3].filter(
      Boolean
    );

    return {
      id: String(d.id),
      projectName: d.project_name ?? d.projectName ?? '-',
      projectNo: d.project_no ?? d.projectNo ?? '-',
      proposalNumber: d.proposal_number ?? d.proposalNumber ?? '-',
      projectType: d.project_type ?? d.projectType ?? '-',
      location: location || d.location || '-',
      clientName: d.client_name ?? d.clientName ?? '-',
      estimatedValue: num(d.estimated_total_fees ?? d.estimatedValue),
      currency: d.currency ?? 'THB',
      status: (d.status ?? 'draft') as any,
      filledInBy: d.filled_in_by ?? d.filledInBy ?? '-',
      createdAt: d.created_at ?? d.createdAt ?? '',
      submittedAt: d.submitted_at ?? d.submittedAt ?? undefined,
      proposalReviewedAt: d.proposal_reviewed_at ?? d.proposalReviewedAt ?? undefined,
      contractReviewedAt: d.contract_reviewed_at ?? d.contractReviewedAt ?? undefined,
      proposalReviewers,
      contractReviewers,
    };
  }

  onFilterChange(): void {
    this.filteredDataSource = this.dataSource.filter((item) => {
      const term = (this.searchTerm || '').toLowerCase();

      const matchesSearch =
        !term ||
        item.projectName?.toLowerCase().includes(term) ||
        item.projectNo?.toLowerCase().includes(term) ||
        item.proposalNumber?.toLowerCase().includes(term) ||
        item.clientName?.toLowerCase().includes(term) ||
        this.getEmployeeLabel(item.filledInBy).toLowerCase().includes(term);

      const matchesStatus = !this.statusFilter || item.status === this.statusFilter;
      const matchesProjectType = !this.projectTypeFilter || item.projectType === this.projectTypeFilter;

      return matchesSearch && matchesStatus && matchesProjectType;
    });
  }

  onView(id: string): void {
    this.router.navigate(['/proposal-contract-review-approve/view', id]);
  }

  getEmployeeLabel(ref: string | number | null | undefined): string {
    return this.employeeService.formatEmployeeReference(ref, this.employeeLookup, 'N/A');
  }

  // ---------------------------
  // ✅ Approve/Decline ยิง API จริง
  // (getById -> update เพราะ backend ต้องการ payload ครบ)
  // ---------------------------
  onApprove(id: string): void {
    this.confirmStatusUpdate(id, 'approved');
  }

  onDecline(id: string): void {
    this.confirmStatusUpdate(id, 'declined');
  }

  private confirmStatusUpdate(id: string, newStatus: 'approved' | 'declined'): void {
    const confirmation = this.fuseConfirmationService.open({
      title: 'Confirm review',
      message: `Are you sure you want to ${newStatus === 'approved' ? 'approve' : 'decline'} this review?`,
      icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
      actions: {
        cancel: { show: true, label: 'Cancel' },
        confirm: { show: true, label: 'Confirm', color: 'primary' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result !== 'confirmed') return;
      this.updateStatus(id, newStatus);
    });
  }

  private updateStatus(id: string, newStatus: 'approved' | 'declined'): void {
    this.isLoading = true;

    this.proposalContractReviewService
      .getById(id)
      .pipe(
        takeUntil(this.destroy$),
        catchError((err) => {
          console.error('[APPROVE-LIST] getById error', err);
          this.showAlert('error', err?.error?.message || 'Failed to load review');
          return of(null);
        }),
        switchMap((res: any) => {
          const raw = res?.data ?? res;
          if (!raw) return of(false);

          const payload = {
            ...raw,
            status: newStatus,
          };

          return this.proposalContractReviewService.update(id, payload).pipe(
            map(() => true),
            catchError((err) => {
              console.error('[APPROVE-LIST] update error', err);
              this.showAlert('error', err?.error?.message || 'Update status failed!');
              return of(false);
            })
          );
        }),
        finalize(() => (this.isLoading = false))
      )
      .subscribe((success) => {
        if (!success) return;

        // ✅ ลบออกจาก pending list (เพราะ approved/declined ไม่ใช่ pending)
        this.dataSource = this.dataSource.filter((d) => d.id !== id);
        this.onFilterChange();
        this.showAlert('success', `Review ${newStatus} successfully!`);
      });
  }

  showAlert(type: FuseAlertType, message: string): void {
    this.alert = { type, message };
    setTimeout(() => (this.alert = null), 5000);
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'submitted':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'proposal_reviewed':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'contract_reviewed':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'approved':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'declined':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'submitted':
        return 'Submitted';
      case 'proposal_reviewed':
        return 'Proposal Reviewed';
      case 'contract_reviewed':
        return 'Contract Reviewed';
      case 'approved':
        return 'Approved';
      case 'declined':
        return 'Declined';
      default:
        return status;
    }
  }

  formatDate(dateString: string): string {
    return formatDateDisplay(dateString);
  }

  formatCurrency(value: number, currency: string): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'THB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value || 0);
  }

  getStatusOptions(): string[] {
    return ['submitted', 'proposal_reviewed', 'contract_reviewed'];
  }

  getProjectTypeOptions(): string[] {
    const types = this.dataSource.map((item) => item.projectType);
    return [...new Set(types)].sort();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.statusFilter = '';
    this.projectTypeFilter = '';
    this.onFilterChange();
  }
}
