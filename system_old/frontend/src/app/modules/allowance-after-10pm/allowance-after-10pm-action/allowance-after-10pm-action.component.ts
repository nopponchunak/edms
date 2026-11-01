import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
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
import { AttachmentDisplayItem, getAttachmentDisplayItems } from 'app/core/utils/attachment-url.util';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { getCurrentUserCode, isApproved, isRejected } from 'app/core/utils/action-request-filter.util';
import { formatProjectDisplay } from 'app/core/utils/project-display.util';
import { ALLOWANCE_AFTER_10PM_EMAIL_CONFIG, WorkflowEmailNotificationService } from 'app/core/services/workflow-email-notification.service';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { normalizeAllowanceAfter10pmDiscipline } from '../allowance-after-10pm-discipline.util';

type AllowanceActionType = 'tl_by_status' | 'di_by_status';

@Component({
  selector: 'app-allowance-after-10pm-action',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSnackBarModule,
  ],
  templateUrl: './allowance-after-10pm-action.component.html',
  styleUrls: ['./allowance-after-10pm-action.component.scss'],
})
export class AllowanceAfter10pmActionComponent implements OnInit, OnDestroy {
  actionForm: FormGroup;
  loading = false;
  allowanceId: string | null = null;
  allowance: any = null;
  actionType: AllowanceActionType | null = null;
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
      this.allowanceId = params['id'];
      const actionType = String(params['type'] || '');
      if (!this.isValidActionType(actionType)) {
        this.snackBar.open('Invalid action type for allowance form', 'Close', { duration: 3000 });
        this.router.navigate(['/allowance-after-10pm/list']);
        return;
      }
      this.actionType = actionType;

      if (this.allowanceId) {
        this.loadAllowance();
      }
    });
  }

  private isValidActionType(actionType: string): actionType is AllowanceActionType {
    return actionType === 'tl_by_status' || actionType === 'di_by_status';
  }

  ngOnDestroy(): void {
    this._unsubscribeAll.next();
    this._unsubscribeAll.complete();
  }

  private loadAllowance(): void {
    if (!this.allowanceId) return;

    this.loading = true;
    forkJoin({
      response: this.apiService.getAllowanceAfter10pm(this.allowanceId),
      employeeLookup: this.employeeService.getEmployeeLookupMap(),
      employeeLookupWithTitle: this.employeeService.getEmployeeLookupMapWithTitle(),
    })
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: ({ response, employeeLookup, employeeLookupWithTitle }) => {
          this.employeeLookup = employeeLookup;
          this.employeeLookupWithTitle = employeeLookupWithTitle;
          if (response?.status && response?.data) {
            this.allowance = response.data;
            this.ensureEmployeeNames();
            this.setupFormForActionType();
          } else {
            this.snackBar.open(response?.message || 'Failed to load allowance form', 'Close', { duration: 3000 });
          }
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading allowance after 10pm:', error);
          this.snackBar.open(error?.error?.message || 'Error loading allowance form', 'Close', { duration: 3000 });
          this.loading = false;
        }
      });
  }

  private ensureEmployeeNames(): void {
    const codes = [
      this.allowance?.claimant_name,
      this.allowance?.tl_by,
      this.allowance?.di_by,
      this.allowance?.notified_user,
      this.allowance?.create_by,
      this.allowance?.update_by
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
    const rawStatus = this.getCurrentActionStatus();

    if (isApproved(rawStatus)) {
      this.actionForm.patchValue({ status: 'APPROVE' });
    } else if (isRejected(rawStatus)) {
      this.actionForm.patchValue({ status: 'REJECT' });
    }
  }

  onSubmit(): void {
    if (this.actionForm.invalid || !this.allowanceId || !this.actionType || !this.allowance) {
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

    if (this.actionType === 'tl_by_status') {
      updatePayload.tl_by_status = statusLower;
      updatePayload.tl_by_date = actionTimestamp;
      updatePayload.status = statusLower === 'reject' ? 'rejected' : 'tl_approved';
    } else if (this.actionType === 'di_by_status') {
      updatePayload.di_by_status = statusLower;
      updatePayload.di_by_date = actionTimestamp;
      updatePayload.notified_user = this.allowance.notified_user || this.allowance.create_by || getCurrentUserCode() || null;
      updatePayload.notified_user_status = statusLower === 'reject' ? 'pending' : 'notified';
      updatePayload.notified_user_date = statusLower === 'reject' ? null : actionTimestamp;
      updatePayload.status = statusLower === 'reject' ? 'rejected' : 'notified';
    }

    this.apiService.updateAllowanceAfter10pm(this.allowanceId, updatePayload)
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: (response) => {
          this.loading = false;
          if (response?.status) {
            this.sendActionEmailNotification(updatePayload, statusLower);
            this.snackBar.open('Status updated successfully', 'Close', { duration: 3000 });
            this.router.navigate(['/allowance-after-10pm/list'], { queryParams: { tab: 'action' } });
          } else {
            this.snackBar.open(response?.message || 'Failed to update status', 'Close', { duration: 3000 });
          }
        },
        error: (error) => {
          console.error('Error updating allowance after 10pm status:', error);
          this.loading = false;
          this.snackBar.open(error?.error?.message || 'Error updating status', 'Close', { duration: 3500 });
        }
      });

    });
  }

  private sendActionEmailNotification(updatedPayload: any, status: string): void {
    if (!this.allowanceId || !this.actionType) {
      return;
    }

    this.workflowEmailNotificationService
      .notifyAfterAction(
        ALLOWANCE_AFTER_10PM_EMAIL_CONFIG,
        {
          ...updatedPayload,
          id: this.allowanceId,
        },
        this.actionType,
        status,
        this.allowanceId
      )
      .subscribe({
        error: (error) => {
          console.error('Failed to send allowance after 10pm email notification:', error);
          this.snackBar.open('Status updated, but email notification could not be sent', 'Close', { duration: 5000 });
        }
      });
  }

  private buildUpdatePayload(): any {
    return {
      claimant_name: this.allowance.claimant_name || '',
      discipline: normalizeAllowanceAfter10pmDiscipline(this.allowance.discipline),
      request_date: this.allowance.request_date || null,
      total_baht: this.allowance.total_baht || 0,
      attachments: this.allowance.attachments || [],
      tl_by: this.allowance.tl_by || null,
      tl_by_status: this.allowance.tl_by_status || 'pending',
      tl_by_date: this.allowance.tl_by_date || null,
      di_by: this.allowance.di_by || null,
      di_by_status: this.allowance.di_by_status || 'pending',
      di_by_date: this.allowance.di_by_date || null,
      account_by: null,
      account_by_status: null,
      account_by_date: null,
      notified_user: this.allowance.notified_user || this.allowance.create_by || getCurrentUserCode() || null,
      notified_user_status: this.allowance.notified_user_status || 'pending',
      notified_user_date: this.allowance.notified_user_date || null,
      status: this.allowance.status || 'submitted',
      items: (this.allowance.items || []).map((item: any, index: number) => ({
        seq: item.seq || index + 1,
        work_date: item.work_date || null,
        project_detail_id: item.project_detail_id || null,
        project_code: item.project_code || '',
        project_name: this.normalizeOptionalString(item.project_name),
        description: item.description || '',
        time_from: item.time_from || null,
        time_to: item.time_to || null,
        baht: Number(item.baht || 0),
      })),
    };
  }

  getActionTitle(): string {
    if (this.actionType === 'di_by_status') return 'Approve Allowance Form';
    return 'Verify Allowance Form';
  }

  getActionDescription(): string {
    return this.actionType === 'di_by_status'
      ? 'Review and approve or reject this allowance form.'
      : 'Review and verify or reject this allowance form.';
  }

  getEmployeeLabel(ref: string | number | null | undefined): string {
    return this.employeeService.formatEmployeeReference(ref, this.employeeLookup, '-');
  }

  getEmployeeLabelWithTitle(ref: string | number | null | undefined): string {
    return this.employeeService.formatEmployeeReference(ref, this.employeeLookupWithTitle, '-');
  }

  getEmployeeLabelWithoutTitle(ref: string | number | null | undefined): string {
    const label = this.getEmployeeLabelWithTitle(ref);
    if (!label || label === '-') return '-';
    return label.split('|')[0].trim();
  }

  getStatusText(status: string | null | undefined): string {
    if (!status) return 'Pending';
    const s = String(status).toLowerCase();
    if (s === 'approve' || s === 'approved') return 'Approved';
    if (s === 'reject' || s === 'rejected') return 'Rejected';
    if (s === 'notified') return 'Notified';
    return 'Pending';
  }

  getStatusBadgeClass(status: string | null | undefined): string {
    if (isApproved(status) || String(status || '').toLowerCase() === 'notified') return 'bg-green-100 text-green-800';
    if (isRejected(status)) return 'bg-red-100 text-red-800';
    return 'bg-yellow-100 text-yellow-800';
  }

  getStatusIcon(status: string | null | undefined): string {
    if (isApproved(status) || String(status || '').toLowerCase() === 'notified') return 'check';
    if (isRejected(status)) return 'close';
    return 'schedule';
  }

  getCurrentActionLabel(): string {
    if (this.actionType === 'di_by_status') return 'Approved By';
    return 'Verified By';
  }

  getCurrentActionEmployee(): string | number | null {
    if (!this.allowance) return null;
    if (this.actionType === 'di_by_status') return this.allowance.di_by;
    return this.allowance.tl_by;
  }

  private getCurrentActionStatus(): string | null {
    if (!this.allowance) return null;
    if (this.actionType === 'di_by_status') return this.allowance.di_by_status;
    return this.allowance.tl_by_status;
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

  formatTime(value: string | null | undefined): string {
    if (!value) return '-';
    return String(value).slice(0, 5);
  }

  formatProject(item: any): string {
    return formatProjectDisplay(item);
  }

  formatDiscipline(value: string | null | undefined): string {
    return normalizeAllowanceAfter10pmDiscipline(value) || '-';
  }

  get attachmentItems(): AttachmentDisplayItem[] {
    return getAttachmentDisplayItems(this.allowance?.attachments);
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
}
