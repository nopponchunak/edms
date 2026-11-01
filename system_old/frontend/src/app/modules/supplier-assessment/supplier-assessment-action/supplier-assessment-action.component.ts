import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatRadioModule } from '@angular/material/radio';
import { forkJoin, map, Subject, switchMap, takeUntil } from 'rxjs';
import { SupplierAssessmentService, UpdateStatusDto } from 'app/core/services/supplier-assessment.service';
import { EmployeeService } from 'app/core/services/employee.service';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { SUPPLIER_ASSESSMENT_EMAIL_CONFIG, WorkflowEmailNotificationService } from 'app/core/services/workflow-email-notification.service';
import { FuseConfirmationService } from '@fuse/services/confirmation';

@Component({
  selector: 'app-supplier-assessment-action',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatSnackBarModule,
    MatCardModule,
    MatRadioModule,
  ],
  templateUrl: './supplier-assessment-action.component.html',
})
export class SupplierAssessmentActionComponent implements OnInit, OnDestroy {
  actionForm: FormGroup;
  loading = false;
  assessmentId: string | null = null;
  assessment: any = null;
  actionType: 'assessed_by_status' | 'approved_by_status' | 'acknowledged_by_status' | null = null;
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
    private supplierAssessmentService: SupplierAssessmentService,
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
      this.assessmentId = params['id'];
      this.actionType = params['type'] as 'assessed_by_status' | 'approved_by_status' | 'acknowledged_by_status';

      if (this.actionType === 'assessed_by_status') {
        this.snackBar.open('Assessed By does not require status action', 'Close', { duration: 3000 });
        this.router.navigate(['/supplier-assessment']);
        return;
      }

      if (this.assessmentId) {
        this.loadAssessment();
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
      approvedSupplierList: ['-'],
      remark: [''],
    });
  }

  private setupFormForActionType(): void {
    if (!this.actionType || !this.assessment) return;

    let currentStatus = null;

    switch (this.actionType) {
      case 'assessed_by_status':
        currentStatus = this.assessment.assessedByStatus?.toUpperCase() || 'PENDING';
        break;
      case 'approved_by_status':
        currentStatus = this.assessment.approvedByStatus?.toUpperCase() || 'PENDING';
        break;
      case 'acknowledged_by_status':
        currentStatus = this.assessment.acknowledgedByStatus?.toUpperCase() || 'PENDING';
        break;
    }

    const patch: any = { status: currentStatus };
    if (this.actionType === 'approved_by_status' && this.assessment) {
      patch.approvedSupplierList = this.assessment.approvedForSupplierList === true ? 1 : '-';
      patch.remark = this.assessment.approvedRemark || '';
    }
    this.actionForm.patchValue(patch);
  }

  private loadAssessment(): void {
    if (!this.assessmentId) return;

    this.loading = true;
    forkJoin({
      assessment: this.supplierAssessmentService.findOne(parseInt(this.assessmentId, 10)),
      employeeLookup: this.employeeService.getEmployeeLookupMap(),
      employeeLookupWithTitle: this.employeeService.getEmployeeLookupMapWithTitle()
    })
      .pipe(
        switchMap(({ assessment, employeeLookup, employeeLookupWithTitle }) => {
          const codes = [
            assessment.assessedBy,
            assessment.approvedBy,
            assessment.acknowledgedBy,
            (assessment as any).createdBy,
            (assessment as any).updatedBy
          ].filter(code => !!code);

          return this.employeeService.ensureEmployeesInLookup(employeeLookup, codes).pipe(
            switchMap(updatedLookup => {
              return this.employeeService.ensureEmployeesInLookup(employeeLookupWithTitle, codes).pipe(
                map(updatedLookupWithTitle => ({ assessment, employeeLookup: updatedLookup, employeeLookupWithTitle: updatedLookupWithTitle }))
              );
            })
          );
        }),
        takeUntil(this._unsubscribeAll)
      )
      .subscribe({
        next: ({ assessment, employeeLookup, employeeLookupWithTitle }) => {
          this.assessment = assessment;
          this.employeeLookup = employeeLookup;
          this.employeeLookupWithTitle = employeeLookupWithTitle;
          this.setupFormForActionType();
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading assessment:', error);
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
    if (this.actionForm.invalid || !this.assessmentId || !this.actionType || !this.assessment) {
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

    // GET data already in this.assessment – build full payload for PUT
    const payload = { ...this.supplierAssessmentService.assessmentToUpdatePayload(this.assessment) };
    switch (this.actionType) {
      case 'assessed_by_status':
        payload.assessed_by_status = statusLower;
        break;
      case 'approved_by_status':
        payload.approved_by_status = statusLower;
        payload.approved_by_date = actionTimestamp;
        payload.approved_date = actionTimestamp;
        payload.approved_to_supplier_list = formData.approvedSupplierList ?? '-';
        payload.remark = formData.remark ?? '';
        break;
      case 'acknowledged_by_status':
        payload.acknowledged_by_status = statusLower;
        payload.acknowledged_by_date = actionTimestamp;
        payload.acknowledged_date = actionTimestamp;
        break;
    }

    const fieldName = this.actionType.replace('_by_status', '_by') as 'assessed_by' | 'approved_by' | 'acknowledged_by';
    const updateStatusDto: UpdateStatusDto = {
      table: 'supplier_assessments',
      field: fieldName,
      status: formData.status as 'PENDING' | 'REJECT' | 'APPROVED',
    };
    if (this.actionType === 'approved_by_status') {
      updateStatusDto.approved_to_supplier_list = formData.approvedSupplierList ?? '-';
      updateStatusDto.remark = formData.remark ?? '';
    }

    this.supplierAssessmentService.update(parseInt(this.assessmentId, 10), payload as any)
      .pipe(
        switchMap(() => this.supplierAssessmentService.updateStatus(this.assessmentId!, updateStatusDto)),
        takeUntil(this._unsubscribeAll)
      )
      .subscribe({
        next: () => {
          this.sendActionEmailNotification(payload, statusLower);
          this.snackBar.open('Status updated successfully', 'Close', { duration: 3000 });
          this.router.navigate(['/supplier-assessment']);
        },
        error: (error) => {
          console.error('Error updating status:', error);
          this.snackBar.open('Error updating status', 'Close', { duration: 3000 });
          this.loading = false;
        }
      });

    });
  }

  private sendActionEmailNotification(updatedPayload: any, status: string): void {
    if (!this.assessmentId || !this.actionType) {
      return;
    }

    this.workflowEmailNotificationService
      .notifyAfterAction(
        SUPPLIER_ASSESSMENT_EMAIL_CONFIG,
        {
          ...updatedPayload,
          id: this.assessmentId
        },
        this.actionType,
        status,
        this.assessmentId
      )
      .subscribe({
        error: (error) => {
          console.error('Failed to send supplier assessment email notification:', error);
          this.snackBar.open('Status updated, but email notification could not be sent', 'Close', { duration: 5000 });
        }
      });
  }

  private getCurrentLocalDateTime(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  getActionTitle(): string {
    switch (this.actionType) {
      case 'assessed_by_status':
        return 'Assess Status';
      case 'approved_by_status':
        return 'Approve Status';
      case 'acknowledged_by_status':
        return 'Acknowledge Status';
      default:
        return 'Update Status';
    }
  }

  getActionDescription(): string {
    switch (this.actionType) {
      case 'assessed_by_status':
        return 'Update the assessment status for this request';
      case 'approved_by_status':
        return 'Update the approval status for this request';
      case 'acknowledged_by_status':
        return 'Update the acknowledgment status for this request';
      default:
        return 'Update the status for this request';
    }
  }

  // Helper functions
  formatDate(dateString?: string | null | Date): string {
    return formatDateDisplay(dateString);
  }

  formatDateTime(dateString: string | null | undefined | Date): string {
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
