import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, Subject, takeUntil } from 'rxjs';
import { ApiService } from 'app/core/services/api.service';
import { EmployeeService } from 'app/core/services/employee.service';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { getCurrentUserCode, isApproved, isRejected } from 'app/core/utils/action-request-filter.util';
import { formatAttachmentSize, getAttachmentHref } from 'app/core/utils/attachment-url.util';
import { formatProjectDisplay } from 'app/core/utils/project-display.util';
import { EXPENSES_CLAIM_EMAIL_CONFIG, WorkflowEmailNotificationService } from 'app/core/services/workflow-email-notification.service';
import { FuseConfirmationService } from '@fuse/services/confirmation';

type ExpensesClaimActionType = 'verified_by_status' | 'approved_by_status';

@Component({
  selector: 'app-expenses-claim-action',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSnackBarModule,
  ],
  templateUrl: './expenses-claim-action.component.html',
  styleUrls: ['./expenses-claim-action.component.scss'],
})
export class ExpensesClaimActionComponent implements OnInit, OnDestroy {
  actionForm: FormGroup;
  loading = false;
  claimId: string | null = null;
  claim: any = null;
  actionType: ExpensesClaimActionType | null = null;
  employeeLookup = new Map<string, string>();
  employeeLookupWithTitle = new Map<string, string>();

  statusOptions = [
    { value: 'APPROVE', label: 'Approve' },
    { value: 'REJECT', label: 'Reject' },
  ];

  private _unsubscribeAll = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private apiService: ApiService,
    private employeeService: EmployeeService,
    private workflowEmailNotificationService: WorkflowEmailNotificationService,
    private route: ActivatedRoute,
    public router: Router,
    private snackBar: MatSnackBar,
    private fuseConfirmationService: FuseConfirmationService
  ) {
    this.actionForm = this.fb.group({
      status: ['', Validators.required],
    });
  }

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this._unsubscribeAll)).subscribe((params) => {
      this.claimId = params['id'];
      const actionType = String(params['type'] || '');
      if (!this.isValidActionType(actionType)) {
        this.snackBar.open('Invalid action type for expenses claim', 'Close', { duration: 3000 });
        this.router.navigate(['/expenses-claim/list']);
        return;
      }
      this.actionType = actionType;

      if (this.claimId) {
        this.loadClaim();
      }
    });
  }

  private isValidActionType(actionType: string): actionType is ExpensesClaimActionType {
    return actionType === 'verified_by_status' || actionType === 'approved_by_status';
  }

  ngOnDestroy(): void {
    this._unsubscribeAll.next();
    this._unsubscribeAll.complete();
  }

  private loadClaim(): void {
    if (!this.claimId) return;

    this.loading = true;
    forkJoin({
      response: this.apiService.getExpensesClaim(this.claimId),
      employeeLookup: this.employeeService.getEmployeeLookupMap(),
      employeeLookupWithTitle: this.employeeService.getEmployeeLookupMapWithTitle(),
    })
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: ({ response, employeeLookup, employeeLookupWithTitle }) => {
          this.employeeLookup = employeeLookup;
          this.employeeLookupWithTitle = employeeLookupWithTitle;
          if (response?.status && response?.data) {
            this.claim = response.data;
            this.ensureEmployeeNames();
            this.setupFormForActionType();
          } else {
            this.snackBar.open(response?.message || 'Failed to load expenses claim', 'Close', { duration: 3000 });
          }
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading expenses claim:', error);
          this.snackBar.open(error?.error?.message || 'Error loading expenses claim', 'Close', { duration: 3000 });
          this.loading = false;
        }
      });
  }

  private ensureEmployeeNames(): void {
    const codes = [
      this.claim?.claimant_name,
      this.claim?.verified_by,
      this.claim?.approved_by,
      this.claim?.create_by,
      this.claim?.update_by
    ].filter((code) => !!code);

    if (codes.length === 0) return;

    forkJoin({
      employeeLookup: this.employeeService.ensureEmployeesInLookup(this.employeeLookup, codes),
      employeeLookupWithTitle: this.employeeService.ensureEmployeesInLookup(this.employeeLookupWithTitle, codes),
    })
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe(({ employeeLookup, employeeLookupWithTitle }) => {
        this.employeeLookup = employeeLookup;
        this.employeeLookupWithTitle = employeeLookupWithTitle;
      });
  }

  private setupFormForActionType(): void {
    const rawStatus = this.actionType === 'verified_by_status'
      ? this.claim?.verified_by_status
      : this.claim?.approved_by_status;

    if (isApproved(rawStatus)) {
      this.actionForm.patchValue({ status: 'APPROVE' });
    } else if (isRejected(rawStatus)) {
      this.actionForm.patchValue({ status: 'REJECT' });
    }
  }

  onSubmit(): void {
    if (this.actionForm.invalid || !this.claimId || !this.actionType || !this.claim) {
      this.actionForm.markAllAsTouched();
      return;
    }

        const confirmation = this.fuseConfirmationService.open({
      title: 'Confirm action',
      message: 'Are you sure you want to submit this action?',
      icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
      actions: {
        cancel: { show: true, label: 'Cancel' },
        confirm: { show: true, label: 'Confirm', color: 'primary' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result !== 'confirmed') return;

      this.loading = true;
    const statusLower = String(this.actionForm.value.status || '').toLowerCase();
    const actionTimestamp = this.getCurrentLocalDateTime();
    const updatePayload = this.buildUpdatePayload();

    if (this.actionType === 'verified_by_status') {
      updatePayload.verified_by_status = statusLower;
      updatePayload.verified_by_date = actionTimestamp;
      updatePayload.status = statusLower === 'reject' ? 'rejected' : 'verified';
    } else if (this.actionType === 'approved_by_status') {
      updatePayload.approved_by_status = statusLower;
      updatePayload.approved_by_date = actionTimestamp;
      updatePayload.status = statusLower === 'reject' ? 'rejected' : 'approved';
    }

    this.apiService.updateExpensesClaim(this.claimId, updatePayload)
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: (response) => {
          this.loading = false;
          if (response?.status) {
            this.sendActionEmailNotification(updatePayload, statusLower);
            this.snackBar.open('Status updated successfully', 'Close', { duration: 3000 });
            this.router.navigate(['/expenses-claim/list'], { queryParams: { tab: 'action' } });
          } else {
            this.snackBar.open(response?.message || 'Failed to update status', 'Close', { duration: 3000 });
          }
        },
        error: (error) => {
          console.error('Error updating expenses claim status:', error);
          this.loading = false;
          this.snackBar.open(error?.error?.message || 'Error updating status', 'Close', { duration: 3500 });
        }
      });

    });
  }

  private sendActionEmailNotification(updatedPayload: any, status: string): void {
    if (!this.claimId || !this.actionType) {
      return;
    }

    this.workflowEmailNotificationService
      .notifyAfterAction(
        EXPENSES_CLAIM_EMAIL_CONFIG,
        {
          ...updatedPayload,
          id: this.claimId,
        },
        this.actionType,
        status,
        this.claimId
      )
      .subscribe({
        error: (error) => {
          console.error('Failed to send expenses claim email notification:', error);
          this.snackBar.open('Status updated, but email notification could not be sent', 'Close', { duration: 5000 });
        }
      });
  }

  private buildUpdatePayload(): any {
    return {
      voucher_no: this.claim.voucher_no || '',
      claimant_name: this.claim.claimant_name || '',
      recive_by: this.claim.recive_by || this.claim.create_by || getCurrentUserCode() || null,
      claim_date: this.claim.claim_date || null,
      total_baht: this.claim.total_baht || 0,
      attachments: this.claim.attachments || [],
      verified_by: this.claim.verified_by || null,
      verified_by_status: this.claim.verified_by_status || 'pending',
      verified_by_date: this.claim.verified_by_date || null,
      approved_by: this.claim.approved_by || null,
      approved_by_status: this.claim.approved_by_status || 'pending',
      approved_by_date: this.claim.approved_by_date || null,
      account_by: null,
      account_by_status: null,
      account_by_date: null,
      status: this.claim.status || 'submitted',
      items: (this.claim.items || []).map((item: any, index: number) => ({
        seq: item.seq || index + 1,
        item_date: item.item_date || null,
        project_detail_id: item.project_detail_id || null,
        project_code: item.project_code || '',
        project_name: this.normalizeOptionalString(item.project_name),
        details: item.details || '',
        baht: Number(item.baht || 0),
      })),
    };
  }

  getActionTitle(): string {
    return this.actionType === 'approved_by_status' ? 'Approve Expenses Claim' : 'Verify Expenses Claim';
  }

  getActionDescription(): string {
    return this.actionType === 'approved_by_status'
      ? 'Review and approve or reject this expenses claim.'
      : 'Review and verify or reject this expenses claim.';
  }

  getEmployeeLabel(ref: string | number | null | undefined): string {
    return this.employeeService.formatEmployeeReference(ref, this.employeeLookup, '-');
  }

  getEmployeeLabelWithTitle(ref: string | number | null | undefined): string {
    return this.employeeService.formatEmployeeReference(ref, this.employeeLookupWithTitle, '-');
  }

  getStatusText(status: string | null | undefined): string {
    if (!status) return 'Pending';
    const s = String(status).toLowerCase();
    if (s === 'approve' || s === 'approved') return 'Approved';
    if (s === 'reject' || s === 'rejected') return 'Rejected';
    return 'Pending';
  }

  getStatusBadgeClass(status: string | null | undefined): string {
    if (isApproved(status)) return 'bg-green-100 text-green-800';
    if (isRejected(status)) return 'bg-red-100 text-red-800';
    return 'bg-yellow-100 text-yellow-800';
  }

  getStatusIcon(status: string | null | undefined): string {
    if (isApproved(status)) return 'check';
    if (isRejected(status)) return 'close';
    return 'schedule';
  }

  getCurrentActionLabel(): string {
    return this.actionType === 'approved_by_status' ? 'Approved By' : 'Verified By';
  }

  getCurrentActionEmployee(): string | number | null {
    if (!this.claim) return null;
    return this.actionType === 'approved_by_status' ? this.claim.approved_by : this.claim.verified_by;
  }

  formatDate(value: string | null | undefined): string {
    return formatDateDisplay(value);
  }

  formatDateTime(value: string | null | undefined): string {
    return formatDateTimeDisplay(value);
  }

  formatAmount(value: number | string | null | undefined): string {
    return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatProject(item: any): string {
    return formatProjectDisplay(item);
  }

  private getCurrentLocalDateTime(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  private normalizeOptionalString(value: unknown): string | null {
    const normalized = String(value ?? '').trim();
    return normalized || null;
  }

  getAttachmentHref(path: string | null | undefined): string {
    return getAttachmentHref(path);
  }

  formatAttachmentSize(value: unknown): string {
    return formatAttachmentSize(value);
  }
}
