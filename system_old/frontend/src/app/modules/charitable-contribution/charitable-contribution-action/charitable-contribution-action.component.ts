import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { forkJoin, map, of, Subject, switchMap, takeUntil } from 'rxjs';
import { CharitableContributionService } from 'app/core/services/charitable-contribution.service';
import { EmployeeService } from 'app/core/services/employee.service';
import { CharitableContribution, CreateCharitableContributionRequest, FormStatus, RequestType } from 'app/core/models/charitable-contribution.model';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { CHARITABLE_CONTRIBUTION_EMAIL_CONFIG, WorkflowEmailNotificationService } from 'app/core/services/workflow-email-notification.service';
import { ApprovalWorkflowComponent, ApprovalWorkflowStep } from 'app/core/components/approval-workflow';
import { FuseConfirmationService } from '@fuse/services/confirmation';

@Component({
  selector: 'app-charitable-contribution-action',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatSnackBarModule,
    MatCardModule,
    MatDividerModule,
    ApprovalWorkflowComponent,
  ],
  templateUrl: './charitable-contribution-action.component.html',
  styleUrls: ['./charitable-contribution-action.component.scss'],
})
export class CharitableContributionActionComponent implements OnInit, OnDestroy {
  actionForm: FormGroup;
  loading = false;
  contributionId: string | null = null;
  contribution: CharitableContribution | null = null;
  actionType: 'acsc_by_status' | 'acsl_by_status' | 'approver_by_status' | 'approver_by_2_status' | 'ims_acknowledged_by_status' | null = null;

  statusOptions = [
    { value: 'REJECT', label: 'Reject' },
    { value: 'APPROVED', label: 'Approve' },
  ];

  readonly requestTypes = [
    { value: RequestType.CHARITABLE_CONTRIBUTION, label: 'Charitable Contribution' },
    { value: RequestType.SPONSORSHIP, label: 'Sponsorship' },
  ] as const;

  private _unsubscribeAll: Subject<any> = new Subject<any>();
  private approverLabelByCode = new Map<string, string>();
  private approverLabelWithTitleByCode = new Map<string, string>();

  constructor(
    private fb: FormBuilder,
    private charitableContributionService: CharitableContributionService,
    private employeeService: EmployeeService,
    private workflowEmailNotificationService: WorkflowEmailNotificationService,
    private route: ActivatedRoute,
    public router: Router,
    private snackBar: MatSnackBar,
    private fuseConfirmationService: FuseConfirmationService
  ) {
    this.actionForm = this.createForm();
  }

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this._unsubscribeAll)).subscribe(params => {
      this.contributionId = params['id'];
      this.actionType = params['type'] as typeof this.actionType;

      if (this.contributionId) {
        this.loadContribution();
      }

      if (this.actionType) {
        this.setupFormForActionType();
      }
    });
  }

  ngOnDestroy(): void {
    this._unsubscribeAll.next(null);
    this._unsubscribeAll.complete();
  }

  private createForm(): FormGroup {
    return this.fb.group({
      status: ['', Validators.required],
    });
  }

  private setupFormForActionType(): void {
    if (!this.actionType) return;

    if (this.contribution) {
      this.actionForm.patchValue({
        status: null,
      });
    }
  }

  private loadContribution(): void {
    if (!this.contributionId) return;

    this.loading = true;
    forkJoin({
      contribution: this.charitableContributionService.findOne(this.contributionId),
      employeeLookup: this.employeeService.getEmployeeLookupMap(),
      employeeLookupWithTitle: this.employeeService.getEmployeeLookupMapWithTitle()
    })
      .pipe(
        switchMap(({ contribution, employeeLookup, employeeLookupWithTitle }) => {
          const codes = [
            contribution.acscBy,
            contribution.acslBy,
            contribution.approverBy,
            contribution.approverBy2,
            contribution.imsAcknowledgedBy,
            (contribution as any).create_by,
            (contribution as any).update_by
          ].filter(code => !!code);
          return this.employeeService.ensureEmployeesInLookup(employeeLookup, codes).pipe(
            switchMap(updatedLookup => {
              return this.employeeService.ensureEmployeesInLookup(employeeLookupWithTitle, codes).pipe(
                map(updatedLookupWithTitle => ({ contribution, employeeLookup: updatedLookup, employeeLookupWithTitle: updatedLookupWithTitle }))
              );
            })
          );
        }),
        takeUntil(this._unsubscribeAll)
      )
      .subscribe({
        next: ({ contribution, employeeLookup, employeeLookupWithTitle }) => {
          this.contribution = contribution;
          this.approverLabelByCode = employeeLookup;
          this.approverLabelWithTitleByCode = employeeLookupWithTitle;
          this.setupFormForActionType();
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading contribution:', error);
          this.snackBar.open('Error loading request', 'Close', { duration: 3000 });
          this.loading = false;
        }
      });
  }

  getApproverDisplayLabel(code: string | null | undefined): string {
    if (code == null || code === '') return '-';
    const employee = this.contribution?.workflowEmployeeNames?.[code.trim()];
    if (employee?.name) return employee.name;
    return this.employeeService.formatEmployeeReference(code.trim(), this.approverLabelByCode);
  }

  getApproverDisplayLabelWithTitle(code: string | null | undefined): string {
    if (code == null || code === '') return '-';
    const employee = this.contribution?.workflowEmployeeNames?.[code.trim()];
    if (employee?.name) return employee.title ? `${employee.name}|${employee.title}` : employee.name;
    return this.employeeService.formatEmployeeReference(code.trim(), this.approverLabelWithTitleByCode);
  }

  onSubmit(): void {
    if (this.actionForm.invalid || !this.contributionId || !this.actionType || !this.contribution) {
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
    const formData = this.actionForm.value;
    const statusLower = (formData.status as string).toLowerCase() as 'pending' | 'reject' | 'approve';
    const actionTimestamp = this.getCurrentLocalDateTime();

    // สร้าง body ครบจาก GET มา (camelCase → snake_case) แล้ว patch เฉพาะ status + date ที่เปลี่ยน
    const fullBody = this.buildPutBodyFromContribution(this.contribution);
    if (this.actionType === 'acsc_by_status') {
      fullBody.acsc_by_status = statusLower;
      fullBody.acsc_by_date = actionTimestamp;
    } else if (this.actionType === 'acsl_by_status') {
      fullBody.acsl_by_status = statusLower;
      fullBody.acsl_by_date = actionTimestamp;
    } else if (this.actionType === 'approver_by_status') {
      fullBody.approver_by_status = statusLower;
      fullBody.approver_by_date = actionTimestamp;
    } else if (this.actionType === 'approver_by_2_status') {
      fullBody.approver_by_2_status = statusLower;
      fullBody.approver_by_2_date = actionTimestamp;
    } else if (this.actionType === 'ims_acknowledged_by_status') {
      fullBody.ims_acknowledged_by_status = statusLower;
      fullBody.ims_acknowledged_by_date = actionTimestamp;
    }

    this.charitableContributionService.action(this.contributionId, this.actionType, statusLower)
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: () => {
          this.sendActionEmailNotification(fullBody, statusLower);
          this.snackBar.open('Status updated successfully', 'Close', { duration: 3000 });
          this.router.navigate(['/charitable-contributions']);
        },
        error: (error) => {
          console.error('Error updating status:', error);
          this.snackBar.open(error?.error?.message || 'Error updating status', 'Close', { duration: 5000 });
          this.loading = false;
        }
      });

    });
  }

  private sendActionEmailNotification(updatedPayload: any, status: string): void {
    if (!this.contributionId || !this.actionType) {
      return;
    }

    this.workflowEmailNotificationService
      .notifyAfterAction(
        CHARITABLE_CONTRIBUTION_EMAIL_CONFIG,
        {
          ...updatedPayload,
          create_by: this.contribution?.createBy ?? null,
          id: this.contributionId
        },
        this.actionType,
        status,
        this.contributionId
      )
      .subscribe({
        error: (error) => {
          console.error('Failed to send charitable contribution email notification:', error);
          this.snackBar.open('Status updated, but email notification could not be sent', 'Close', { duration: 5000 });
        }
      });
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

  /** แปลง contribution ที่ GET มาเป็น body สำหรับ PUT (ครบทุกฟิลด์ snake_case) */
  private buildPutBodyFromContribution(c: CharitableContribution): CreateCharitableContributionRequest {
    return {
      request_type: c.requestType as any,
      event_description: c.eventDescription ?? '',
      event_purpose: c.eventPurpose ?? '',
      organizer_name: c.organizerName ?? '',
      contribution_description: c.contributionDescription ?? '',
      value_amount: c.valueAmount ?? 0,
      currency_code: c.currencyCode || 'THB',
      proposed_date: c.proposedDate ?? '',
      vat_amount: c.vatAmount ?? 0,
      acsc_by: c.acscBy ?? null,
      acsc_by_date: c.acscByDate ?? null,
      acsc_by_status: (c.acscByStatus as any) ?? null,
      acsl_by: c.acslBy ?? null,
      acsl_by_date: c.acslByDate ?? null,
      acsl_by_status: (c.acslByStatus as any) ?? null,
      ims_acknowledged_by: c.imsAcknowledgedBy ?? null,
      ims_acknowledged_by_date: c.imsAcknowledgedByDate ?? null,
      ims_acknowledged_by_status: (c.imsAcknowledgedByStatus as any) ?? null,
      approver_by: c.approverBy ?? null,
      approver_by_date: c.approverByDate ?? null,
      approver_by_status: (c.approverByStatus as any) ?? null,
      approver_by_2: c.approverBy2 ?? null,
      approver_by_2_date: c.approverBy2Date ?? null,
      approver_by_2_status: (c.approverBy2Status as any) ?? null,
      attachments: [],
    };
  }

  getActionTitle(): string {
    switch (this.actionType) {
      case 'acsc_by_status':
        return 'Verify (ACSC) Status';
      case 'acsl_by_status':
        return 'Acknowledge 2 (CA - JN) Status';
      case 'ims_acknowledged_by_status':
        return 'Acknowledge 1 (ACSL) Status';
      case 'approver_by_status':
        return 'Approve (DI/MD) Status';
      case 'approver_by_2_status':
        return 'Approve 2 (DI) Status';
      default:
        return 'Update Status';
    }
  }

  getActionDescription(): string {
    switch (this.actionType) {
      case 'acsc_by_status':
        return 'Update the ACSC verification status for this request';
      case 'acsl_by_status':
        return 'Update the Accounts (CA) acknowledgment status for this request';
      case 'ims_acknowledged_by_status':
        return 'Update the ACSL acknowledgment status for this request';
      case 'approver_by_status':
        return 'Update the first approval status for this request';
      case 'approver_by_2_status':
        return 'Update the second approval status for this request';
      default:
        return 'Update the status for this request';
    }
  }

  getCurrentActionLabel(): string {
    switch (this.actionType) {
      case 'acsc_by_status':
        return 'Verified by (ACSC)';
      case 'acsl_by_status':
        return 'Acknowledge 2 (CA - JN)';
      case 'ims_acknowledged_by_status':
        return 'Acknowledge 1 (ACSL)';
      case 'approver_by_status':
        return 'Approve (DI/MD)';
      case 'approver_by_2_status':
        return 'Approve 2 (DI)';
      default:
        return 'Current Assignee';
    }
  }

  getCurrentActionAssignee(): string {
    if (!this.contribution) {
      return 'N/A';
    }

    switch (this.actionType) {
      case 'acsc_by_status':
        return this.getApproverDisplayLabel(this.contribution.acscBy) || 'Not set';
      case 'acsl_by_status':
        return this.getApproverDisplayLabel(this.contribution.acslBy) || 'Not set';
      case 'ims_acknowledged_by_status':
        return this.getApproverDisplayLabel(this.contribution.imsAcknowledgedBy) || 'Not set';
      case 'approver_by_status':
        return this.getApproverDisplayLabel(this.contribution.approverBy) || 'Not set';
      case 'approver_by_2_status':
        return this.getApproverDisplayLabel(this.contribution.approverBy2) || 'Not set';
      default:
        return 'N/A';
    }
  }

  formatDate(dateString?: string | null): string {
    return formatDateDisplay(dateString);
  }

  formatDateTime(dateString: string | null | undefined): string {
    return formatDateTimeDisplay(dateString);
  }

  formatCurrency(value: string | number | null | undefined, currencyCode: string | null | undefined = 'THB'): string {
    if (value === null || value === undefined || value === '') return '-';
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numValue)) return '-';
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: currencyCode || 'THB',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(numValue);
  }

  getRequestTypeLabel(type: string | null | undefined): string {
    if (!type) return '-';
    switch (type.toLowerCase()) {
      case 'charitable_contribution': return 'Charitable Contribution';
      case 'sponsorship': return 'Sponsorship';
      default: return type;
    }
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

  getStatusLabel(status: any): string {
    const statusLabels: { [key: string]: string } = {
      'draft': 'Draft',
      'submitted': 'Submitted',
      'verified': 'Verified',
      'acknowledged': 'Acknowledged',
      'approved': 'Approved',
      'rejected': 'Rejected',
      'completed': 'Completed'
    };
    return statusLabels[status?.toLowerCase()] || status;
  }

  getStatusColor(status: any): string {
    const statusColors: { [key: string]: string } = {
      'draft': 'bg-gray-100 text-gray-800',
      'submitted': 'bg-blue-100 text-blue-800',
      'verified': 'bg-yellow-100 text-yellow-800',
      'acknowledged': 'bg-orange-100 text-orange-800',
      'approved': 'bg-green-100 text-green-800',
      'rejected': 'bg-red-100 text-red-800',
      'completed': 'bg-green-100 text-green-800'
    };
    return statusColors[status?.toLowerCase()] || 'bg-gray-100 text-gray-800';
  }

  isRequestTypeSelected(type: RequestType): boolean {
    return this.contribution?.requestType === type;
  }

  get workflowSteps(): ApprovalWorkflowStep[] {
    if (!this.contribution) return [];

    const steps: ApprovalWorkflowStep[] = [
      {
        key: 'request',
        title: 'Request (EE and above)',
        assignee: this.getApproverDisplayLabel(this.contribution.createBy),
        date: this.formatDateTime(this.contribution.createdAt),
        status: 'submitted'
      },
      {
        key: 'acsc',
        title: 'Verify (ACSC)',
        assignee: this.getApproverDisplayLabel(this.contribution.acscBy),
        date: this.formatDateTime(this.contribution.acscByDate),
        status: this.contribution.acscByStatus
      },
      {
        key: 'acsl',
        title: 'Acknowledge 1 (ACSL)',
        assignee: this.getApproverDisplayLabel(this.contribution.imsAcknowledgedBy),
        date: this.formatDateTime(this.contribution.imsAcknowledgedByDate),
        status: this.contribution.imsAcknowledgedBy
          ? this.contribution.imsAcknowledgedByStatus
          : 'unassigned'
      },
      {
        key: 'approver',
        title: 'Approve (DI/MD)',
        assignee: this.getApproverDisplayLabel(this.contribution.approverBy),
        date: this.formatDateTime(this.contribution.approverByDate),
        status: this.contribution.approverByStatus
      }
    ];

    if (this.contribution.approverBy2) {
      steps.push({
        key: 'approver2',
        title: 'Approve 2 (DI)',
        assignee: this.getApproverDisplayLabel(this.contribution.approverBy2),
        date: this.formatDateTime(this.contribution.approverBy2Date),
        status: this.contribution.approverBy2Status
      });
    }

    steps.push({
      key: 'accounts',
      title: 'Acknowledge 2 (CA - JN)',
      assignee: this.getApproverDisplayLabel(this.contribution.acslBy),
      date: this.formatDateTime(this.contribution.acslByDate),
      status: this.contribution.acslByStatus
    });

    return steps;
  }
}
