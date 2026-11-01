import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { catchError, forkJoin, map, Observable, of, Subject, switchMap, takeUntil } from 'rxjs';
import { SupplierEvaluationService } from 'app/core/services/supplier-evaluation.service';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { getAttachmentUrl } from 'app/core/utils/attachment-url.util';
import { EmployeeService } from 'app/core/services/employee.service';
import { SUPPLIER_EVALUATION_EMAIL_CONFIG, WorkflowEmailNotificationService } from 'app/core/services/workflow-email-notification.service';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { SupplierStatusUpdateResult, SuppliersService } from 'app/core/services/suppliers.service';

interface SupplierDeactivationActionResult {
  required: boolean;
  updated: boolean;
  supplier?: SupplierStatusUpdateResult['supplier'];
  reason?: SupplierStatusUpdateResult['reason'] | 'error';
  error?: unknown;
}

@Component({
  selector: 'app-supplier-evaluation-action',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  templateUrl: './supplier-evaluation-action.component.html',
  styleUrls: ['./supplier-evaluation-action.component.scss'],
})
export class SupplierEvaluationActionComponent implements OnInit, OnDestroy {
  actionForm: FormGroup;
  loading = false;
  evaluationId: string | null = null;
  evaluation: any = null;
  actionType: 'evaluated_by_status' | 'acknowledged_by_status' | 'approved_by_status' | null = null;
  getAttachmentUrl = getAttachmentUrl;
  employeeLookup = new Map<string, string>();
  employeeLookupWithTitle = new Map<string, string>();

  statusOptions = [
    { value: 'PENDING', label: 'Pending' },
    { value: 'REJECT', label: 'Reject' },
    { value: 'APPROVED', label: 'Approve' },
  ];

  private _unsubscribeAll: Subject<any> = new Subject<any>();

  constructor(
    private fb: FormBuilder,
    private evaluationService: SupplierEvaluationService,
    private employeeService: EmployeeService,
    private suppliersService: SuppliersService,
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
      this.evaluationId = params['id'];
      this.actionType = params['type'] as 'evaluated_by_status' | 'acknowledged_by_status' | 'approved_by_status';

      if (this.actionType === 'evaluated_by_status') {
        this.snackBar.open('Evaluated By does not require status action', 'Close', { duration: 3000 });
        this.router.navigate(['/supplier-evaluation']);
        return;
      }

      if (this.evaluationId) {
        this.loadEvaluation();
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

    if (this.evaluation) {
      let currentStatus = null;

      switch (this.actionType) {
        case 'evaluated_by_status':
          currentStatus = this.evaluation.evaluatedByStatus?.toUpperCase() || 'PENDING';
          break;
        case 'acknowledged_by_status':
          currentStatus = this.evaluation.acknowledgedByStatus?.toUpperCase() || 'PENDING';
          break;
        case 'approved_by_status':
          currentStatus = this.evaluation.approvedByStatus?.toUpperCase() || 'PENDING';
          break;
      }

      this.actionForm.patchValue({
        status: currentStatus,
      });
    }
  }

  private loadEvaluation(): void {
    if (!this.evaluationId) return;

    this.loading = true;
    forkJoin({
      evaluation: this.evaluationService.findOne(this.evaluationId),
      employeeLookup: this.employeeService.getEmployeeLookupMap(),
      employeeLookupWithTitle: this.employeeService.getEmployeeLookupMapWithTitle()
    })
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: ({ evaluation, employeeLookup, employeeLookupWithTitle }) => {
          this.evaluation = evaluation;
          this.employeeLookup = employeeLookup;
          this.employeeLookupWithTitle = employeeLookupWithTitle;
          this.setupFormForActionType();
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading evaluation:', error);
          this.snackBar.open('Error loading request', 'Close', { duration: 3000 });
          this.loading = false;
        }
      });
  }

  getEmployeeLabel(ref: string | number | null | undefined): string {
    return this.employeeService.formatEmployeeReference(ref, this.employeeLookup);
  }

  getEmployeeLabelWithTitle(ref: string | number | null | undefined): string {
    return this.employeeService.formatEmployeeReference(ref, this.employeeLookupWithTitle);
  }

  onSubmit(): void {
    if (this.actionForm.invalid || !this.evaluationId || !this.actionType || !this.evaluation) {
      return;
    }

    const willDeactivateSupplier = this.shouldDeactivateSupplierAfterApproval(
      this.actionForm.get('status')?.value
    );

    const confirmation = this.fuseConfirmationService.open({
      title: 'Confirm action',
      message: this.getConfirmationMessage(willDeactivateSupplier),
      icon: {
        show: true,
        name: willDeactivateSupplier ? 'heroicons_outline:exclamation-triangle' : 'heroicons_outline:question-mark-circle',
        color: willDeactivateSupplier ? 'warn' : 'primary'
      },
      actions: {
        cancel: { show: true, label: 'Cancel' },
        confirm: { show: true, label: 'Confirm', color: willDeactivateSupplier ? 'warn' : 'primary' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result !== 'confirmed') return;

      this.loading = true;
      const formData = this.actionForm.value;
      const statusLower = (formData.status as string).toLowerCase();
      const actionTimestamp = this.getCurrentLocalDateTime();
      const updatePayload: any = {
        supplier_name: this.evaluation.supplierName || '',
        project_name: this.evaluation.projectName || '',
        project_no: this.evaluation.projectNo || '',
        department_value_duration: this.evaluation.departmentValueDuration || '',
        anti_corruption_flag: this.evaluation.antiCorruptionFlag ? 1 : 0,
        average_rating: this.evaluation.averageRating || 0,
        decision: this.evaluation.decision || null,
        evaluated_by: this.evaluation.evaluatedBy || '',
        evaluated_date: this.evaluation.evaluatedDate || '',
        evaluated_by_status: this.evaluation.evaluatedByStatus || null,
        evaluated_by_date: this.evaluation.evaluatedByDate || null,
        approved_by: this.evaluation.approvedBy || '',
        approved_date: this.evaluation.approvedDate || '',
        approved_by_status: this.evaluation.approvedByStatus || null,
        approved_by_date: this.evaluation.approvedByDate || null,
        acknowledged_by: this.evaluation.acknowledgedBy || '',
        acknowledged_date: this.evaluation.acknowledgedDate || '',
        acknowledged_by_status: this.evaluation.acknowledgedByStatus || null,
        acknowledged_by_date: this.evaluation.acknowledgedByDate || null,
        items: this.evaluation.items || [],
        attachments: this.evaluation.attachments || [],
      };

      switch (this.actionType) {
        case 'approved_by_status':
          updatePayload.approved_by_status = statusLower;
          updatePayload.approved_by_date = actionTimestamp;
          updatePayload.approved_date = actionTimestamp;
          break;
        case 'acknowledged_by_status':
          updatePayload.acknowledged_by_status = statusLower;
          updatePayload.acknowledged_by_date = actionTimestamp;
          updatePayload.acknowledged_date = actionTimestamp;
          break;
      }

      this.evaluationService.update(this.evaluationId, updatePayload)
        .pipe(
          switchMap(() =>
            this.deactivateSupplierIfRequired(statusLower).pipe(
              map((deactivation) => ({ deactivation })),
              catchError((error) => {
                console.error('Error deactivating supplier:', error);
                return of({
                  deactivation: {
                    required: true,
                    updated: false,
                    reason: 'error' as const,
                    error,
                  },
                });
              })
            )
          ),
          takeUntil(this._unsubscribeAll)
        )
        .subscribe({
          next: ({ deactivation }) => {
            this.sendActionEmailNotification(updatePayload, statusLower);
            this.snackBar.open(
              this.getStatusUpdatedMessage(deactivation),
              'Close',
              { duration: deactivation.required ? 5000 : 3000 }
            );
            this.router.navigate(['/supplier-evaluation']);
          },
          error: (error) => {
            console.error('Error updating status:', error);
            this.snackBar.open('Error updating status', 'Close', { duration: 3000 });
            this.loading = false;
          }
        });

    });
  }

  shouldShowSupplierInactiveWarning(): boolean {
    return this.shouldDeactivateSupplierAfterApproval(this.actionForm.get('status')?.value);
  }

  getSupplierInactiveWarningText(): string {
    const supplierName = this.evaluation?.supplierName || 'This supplier';
    return `Approving this Supplier Evaluation will mark ${supplierName} as Inactive in the supplier list.`;
  }

  private deactivateSupplierIfRequired(status: string): Observable<SupplierDeactivationActionResult> {
    if (!this.shouldDeactivateSupplierAfterApproval(status)) {
      return of({ required: false, updated: false });
    }

    return this.suppliersService.deactivateByName(this.evaluation?.supplierName || '').pipe(
      map((result) => ({
        required: true,
        ...result,
      }))
    );
  }

  private shouldDeactivateSupplierAfterApproval(status: string | null | undefined): boolean {
    return (
      this.actionType === 'approved_by_status' &&
      this.isApprovedStatusValue(status) &&
      this.isRemoveDecision(this.evaluation?.decision)
    );
  }

  private isApprovedStatusValue(status: string | null | undefined): boolean {
    const normalized = String(status || '').trim().toLowerCase();
    return normalized === 'approve' || normalized === 'approved';
  }

  private isRemoveDecision(decision: string | null | undefined): boolean {
    return String(decision || '').trim().toLowerCase() === 'remove';
  }

  private getConfirmationMessage(willDeactivateSupplier: boolean): string {
    if (!willDeactivateSupplier) {
      return 'Are you sure you want to submit this action?';
    }

    const supplierName = this.evaluation?.supplierName || 'this supplier';
    return `Approving this request will mark ${supplierName} as Inactive in the supplier list. Continue?`;
  }

  private getStatusUpdatedMessage(deactivation: SupplierDeactivationActionResult): string {
    if (!deactivation.required) {
      return 'Status updated successfully';
    }

    const supplierName = deactivation.supplier?.name || this.evaluation?.supplierName || 'Supplier';

    if (deactivation.updated) {
      return `Status updated successfully. ${supplierName} was marked Inactive.`;
    }

    if (deactivation.reason === 'already_inactive') {
      return `Status updated successfully. ${supplierName} is already Inactive.`;
    }

    if (deactivation.reason === 'not_found') {
      return `Status updated, but ${supplierName} was not found in the supplier list.`;
    }

    return `Status updated, but ${supplierName} could not be marked Inactive.`;
  }

  private sendActionEmailNotification(updatedPayload: any, status: string): void {
    if (!this.evaluationId || !this.actionType) {
      return;
    }

    this.workflowEmailNotificationService
      .notifyAfterAction(
        SUPPLIER_EVALUATION_EMAIL_CONFIG,
        {
          ...updatedPayload,
          id: this.evaluationId
        },
        this.actionType,
        status,
        this.evaluationId
      )
      .subscribe({
        error: (error) => {
          console.error('Failed to send supplier evaluation email notification:', error);
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

  getActionTitle(): string {
    switch (this.actionType) {
      case 'evaluated_by_status':
        return 'Evaluate Status';
      case 'acknowledged_by_status':
        return 'Acknowledge Status';
      case 'approved_by_status':
        return 'Approve Status';
      default:
        return 'Update Status';
    }
  }

  getActionDescription(): string {
    switch (this.actionType) {
      case 'evaluated_by_status':
        return 'Update the evaluation status for this request';
      case 'acknowledged_by_status':
        return 'Update the acknowledgment status for this request';
      case 'approved_by_status':
        return 'Update the approval status for this request';
      default:
        return 'Update the status for this request';
    }
  }

  // Helper functions
  formatDate(dateString?: string | null): string {
    return formatDateDisplay(dateString);
  }

  formatDateTime(dateString: string | null | undefined): string {
    return formatDateTimeDisplay(dateString);
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
