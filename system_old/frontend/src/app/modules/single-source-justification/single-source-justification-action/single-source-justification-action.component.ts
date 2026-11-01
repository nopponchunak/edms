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
import { Subject, takeUntil } from 'rxjs';
import { ApiService } from 'app/core/services/api.service';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { EmployeeService } from 'app/core/services/employee.service';
import { forkJoin } from 'rxjs';
import { SINGLE_SOURCE_JUSTIFICATION_EMAIL_CONFIG, WorkflowEmailNotificationService } from 'app/core/services/workflow-email-notification.service';
import { FuseConfirmationService } from '@fuse/services/confirmation';

export interface UpdateStatusDto {
  table: string;
  field: 'assessed_by' | 'verified_by' | 'approved_by' | 'acknowledged_by';
  status: 'pending' | 'reject' | 'approved';
}

@Component({
  selector: 'app-single-source-justification-action',
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
  templateUrl: './single-source-justification-action.component.html',
})
export class SingleSourceJustificationActionComponent implements OnInit, OnDestroy {
  actionForm: FormGroup;
  loading = false;
  justificationId: string | null = null;
  justification: any = null;
  actionType: 'assessed_by_status' | 'verify_by_status' | 'approved_by_status' | 'acknowledged_by_status' | null = null;
  employeeLookup = new Map<string, string>();
  employeeLookupWithTitle = new Map<string, string>();
  projectTypes: any[] = [];

  statusOptions = [
    { value: 'pending', label: 'Pending' },
    { value: 'reject', label: 'Reject' },
    { value: 'approved', label: 'Approve' },
  ];

  private _unsubscribeAll: Subject<any> = new Subject<any>();

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
    this.actionForm = this.createForm();
  }

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this._unsubscribeAll)).subscribe(params => {
      this.justificationId = params['id'];
      this.actionType = params['type'] as 'assessed_by_status' | 'verify_by_status' | 'approved_by_status' | 'acknowledged_by_status';

      if (this.actionType === 'assessed_by_status') {
        this.snackBar.open('Assessed By does not require status action', 'Close', { duration: 3000 });
        this.router.navigate(['/single-source-justification']);
        return;
      }

      if (this.justificationId) {
        this.loadJustification();
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
      comments: [''],
      correspondingPO: [''],
    });
  }

  private setupFormForActionType(): void {
    if (!this.actionType || !this.justification) return;

    let currentStatus = null;
    let currentComments = '';

    switch (this.actionType) {
      case 'assessed_by_status':
        currentStatus = this.justification.assessed_by_status?.toLowerCase() || 'pending';
        break;
      case 'approved_by_status':
        currentStatus = this.justification.approved_by_status?.toLowerCase() || 'pending';
        currentComments = this.justification.approved_by_comments || '';
        break;
      case 'verify_by_status':
        currentStatus = this.justification.verify_by_status?.toLowerCase() || 'pending';
        currentComments = this.justification.verify_by_comment || '';
        break;
      case 'acknowledged_by_status':
        currentStatus = this.justification.acknowledged_by_status?.toLowerCase() || 'pending';
        currentComments = this.justification.acknowledged_by_comments || '';
        break;
    }

    this.actionForm.patchValue({
      status: currentStatus,
      comments: currentComments,
      correspondingPO: this.justification.corresponding_po_no || '',
    });
  }

  private loadJustification(): void {
    if (!this.justificationId) return;

    this.loading = true;
    forkJoin({
      response: this.apiService.getSingleSourceJustification(this.justificationId),
      employeeLookup: this.employeeService.getEmployeeLookupMap(),
      employeeLookupWithTitle: this.employeeService.getEmployeeLookupMapWithTitle(),
      projectTypesResp: this.apiService.getProjectTypes()
    })
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: ({ response, employeeLookup, employeeLookupWithTitle, projectTypesResp }) => {
          this.employeeLookup = employeeLookup;
          this.employeeLookupWithTitle = employeeLookupWithTitle;

          if (projectTypesResp?.status && Array.isArray(projectTypesResp.data)) {
            this.projectTypes = projectTypesResp.data;
          }

          const res = response as any;
          if (res.status && res.data) {
            this.justification = res.data;
            this.setupFormForActionType();
          } else {
            this.snackBar.open('Error loading request', 'Close', { duration: 3000 });
          }
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading justification:', error);
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

  getItemSuppliedLabel(code: string): string {
    if (!code || code === '-') return '-';
    const projectType = this.projectTypes.find((pt: any) => pt.code === code);
    if (projectType) {
      return `${projectType.code} - ${projectType.name}`;
    }
    return code;
  }

  onSubmit(): void {
    if (this.actionForm.invalid || !this.justificationId || !this.actionType) {
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
    const comments = formData.comments?.trim() || '';
    const correspondingPO = formData.correspondingPO?.trim() || '';

    this.updateActionData(formData.status, comments, correspondingPO || null);

    });
  }

  /**
   * PUT ข้อมูล action ทั้ง status, comments, corresponding_po_no และ datetime
   */
  private updateActionData(status: string, comments: string, correspondingPO: string | null): void {
    if (!this.justification) return;
    const actionTimestamp = this.getCurrentLocalDateTime();
    const normalizedStatus = status.toLowerCase() as 'pending' | 'reject' | 'approved';
    const fieldName = this.actionType?.replace('_by_status', '_by') || '';

    const updateData: any = {
      sub_consultant_supplier_name: this.justification.sub_consultant_supplier_name,
      items_supplied: this.justification.items_supplied,
      justification_type: this.justification.justification_type,
      circumstances_selection: this.justification.circumstances_selection,
      alternatives_considered: this.justification.alternatives_considered || 0,
      reason_no_alternatives: this.justification.reason_no_alternatives || null,
      comments: this.justification.comments || null,
      rationale_selection: this.justification.rationale_selection,
      corresponding_po_no: this.justification.corresponding_po_no || null,
      assessed_by: this.justification.assessed_by || null,
      assessed_by_date: this.justification.assessed_by_date || null,
      assessed_by_status: this.justification.assessed_by_status || null,
      verify_by: this.justification.verify_by || null,
      verify_by_date: this.justification.verify_by_date || null,
      verify_by_status: this.justification.verify_by_status || null,
      verify_by_comment: this.justification.verify_by_comment || null,
      approved_by: this.justification.approved_by || null,
      approved_by_date: this.justification.approved_by_date || null,
      approved_by_status: this.justification.approved_by_status || null,
      approved_by_comments: this.justification.approved_by_comments || null,
      acknowledged_by: this.justification.acknowledged_by || null,
      acknowledged_by_date: this.justification.acknowledged_by_date || null,
      acknowledged_by_status: this.justification.acknowledged_by_status || null,
      acknowledged_by_comments: this.justification.acknowledged_by_comments || null,
    };

    if (correspondingPO !== null) {
      updateData.corresponding_po_no = correspondingPO;
    }

    switch (this.actionType) {
      case 'verify_by_status':
        updateData.verify_by_status = normalizedStatus;
        updateData.verify_by_date = actionTimestamp;
        updateData.verify_by_comment = comments || null;
        break;
      case 'approved_by_status':
        updateData.approved_by_status = normalizedStatus;
        updateData.approved_by_date = actionTimestamp;
        updateData.approved_date = actionTimestamp;
        updateData.approved_by_comments = comments || null;
        break;
      case 'acknowledged_by_status':
        updateData.acknowledged_by_status = normalizedStatus;
        updateData.acknowledged_by_date = actionTimestamp;
        updateData.acknowledged_date = actionTimestamp;
        updateData.acknowledged_by_comments = comments || null;
        break;
    }

    this.apiService.updateSingleSourceJustification(this.justificationId, updateData)
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: () => {
          const updateStatusDto: UpdateStatusDto = {
            table: 'single_source_justifications',
            field: fieldName as 'assessed_by' | 'verified_by' | 'approved_by' | 'acknowledged_by',
            status: normalizedStatus,
          };

          this.apiService.updateStatus(this.justificationId!, updateStatusDto)
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
              next: () => {
                this.sendActionEmailNotification(updateData, normalizedStatus);
                this.snackBar.open('Status updated successfully', 'Close', { duration: 3000 });
                this.router.navigate(['/single-source-justification']);
              },
              error: (error) => {
                console.error('Error updating status:', error);
                this.snackBar.open('Error updating status', 'Close', { duration: 3000 });
                this.loading = false;
              }
            });
        },
        error: (error) => {
          console.error('Error updating request:', error);
          this.snackBar.open('Error updating request', 'Close', { duration: 3000 });
          this.loading = false;
        }
      });
  }

  private sendActionEmailNotification(updatedPayload: any, status: string): void {
    if (!this.justificationId || !this.actionType) {
      return;
    }

    this.workflowEmailNotificationService
      .notifyAfterAction(
        SINGLE_SOURCE_JUSTIFICATION_EMAIL_CONFIG,
        {
          ...updatedPayload,
          id: this.justificationId
        },
        this.actionType,
        status,
        this.justificationId
      )
      .subscribe({
        error: (error) => {
          console.error('Failed to send single source justification email notification:', error);
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
      case 'verify_by_status':
        return 'Verify Status';
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
      case 'verify_by_status':
        return 'Update the verification status for this request';
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

  isSingleSourceType(type: string | null | undefined): boolean {
    return type === 'single_source' || type === 'single-source';
  }

  isPriceJustificationType(type: string | null | undefined): boolean {
    return type === 'price_justification' || type === 'price-justification';
  }

  hasAlternativesConsidered(): boolean {
    return Number(this.justification?.alternatives_considered || 0) > 0;
  }

  hasNoAlternativesConsidered(): boolean {
    return !this.hasAlternativesConsidered();
  }

  getJustificationTypeLabel(type: string): string {
    switch (type) {
      case 'single_source':
      case 'single-source':
        return 'Single Source';
      case 'price_justification':
      case 'price-justification':
        return 'Price Justification';
      default:
        return type;
    }
  }
}
