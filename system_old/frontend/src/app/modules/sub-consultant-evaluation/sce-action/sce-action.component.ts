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
import { forkJoin, map, of, Subject, switchMap, takeUntil } from 'rxjs';
import { SubConsultantEvaluationService, SubConsultantEvaluation } from 'app/core/services/sub-consultant-evaluation.service';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { getAttachmentUrl } from 'app/core/utils/attachment-url.util';
import { MatDividerModule } from '@angular/material/divider';
import { EmployeeService } from 'app/core/services/employee.service';
import { SUB_CONSULTANT_EVALUATION_EMAIL_CONFIG, WorkflowEmailNotificationService } from 'app/core/services/workflow-email-notification.service';
import { FuseConfirmationService } from '@fuse/services/confirmation';

@Component({
  selector: 'app-sce-action',
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
    MatDividerModule,
  ],
  templateUrl: './sce-action.component.html',
  styleUrls: ['./sce-action.component.scss'],
})
export class SceActionComponent implements OnInit, OnDestroy {
  actionForm: FormGroup;
  loading = false;
  evaluationId: number | null = null;
  evaluation: SubConsultantEvaluation | null = null;
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
    private evaluationService: SubConsultantEvaluationService,
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
      this.evaluationId = params['id'] ? +params['id'] : null;
      this.actionType = params['type'] as 'evaluated_by_status' | 'acknowledged_by_status' | 'approved_by_status';

      if (this.actionType === 'evaluated_by_status') {
        this.snackBar.open('Evaluated By does not require status action', 'Close', { duration: 3000 });
        this.router.navigate(['/sub-consultant-evaluation/list'], { queryParams: { tab: 'action' } });
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

    // Set initial values based on action type
    if (this.evaluation) {
      let currentStatus = null;

      switch (this.actionType) {
        case 'evaluated_by_status':
          currentStatus = this.evaluation.evaluated_by_status ? this.evaluation.evaluated_by_status.toUpperCase() : 'PENDING';
          break;
        case 'acknowledged_by_status':
          currentStatus = this.evaluation.acknowledged_by_status ? this.evaluation.acknowledged_by_status.toUpperCase() : 'PENDING';
          break;
        case 'approved_by_status':
          currentStatus = this.evaluation.approved_by_status ? this.evaluation.approved_by_status.toUpperCase() : 'PENDING';
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
      .pipe(
        switchMap(({ evaluation, employeeLookup, employeeLookupWithTitle }) => {
          const codes = [
            evaluation.evaluated_by,
            evaluation.approved_by,
            evaluation.acknowledged_by,
            evaluation.create_by,
            evaluation.update_by
          ].filter(code => !!code);
          return this.employeeService.ensureEmployeesInLookup(employeeLookup, codes).pipe(
            switchMap(updatedLookup => {
              return this.employeeService.ensureEmployeesInLookup(employeeLookupWithTitle, codes).pipe(
                map(updatedLookupWithTitle => ({ evaluation, employeeLookup: updatedLookup, employeeLookupWithTitle: updatedLookupWithTitle }))
              );
            })
          );
        }),
        takeUntil(this._unsubscribeAll)
      )
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
    const statusLower = (formData.status as string).toLowerCase();
    const actionTimestamp = this.getCurrentLocalDateTime();
    const updatePayload: any = {
      to: this.evaluation.to || '',
      circ: this.evaluation.circ || '',
      sub_consultant_name: this.evaluation.sub_consultant_name || '',
      project_name: this.evaluation.project_name || '',
      project_no: this.evaluation.project_no || '',
      department_value_duration: this.evaluation.department_value_duration || '',
      scope_of_services: this.evaluation.scope_of_services || '',
      anti_corruption_is_violation: this.evaluation.anti_corruption_is_violation || 0,
      cad_software_confirmed: this.evaluation.cad_software_confirmed || 0,
      is_maintained: this.evaluation.is_maintained || 0,
      is_removed: this.evaluation.is_removed || 0,
      evaluated_by: this.evaluation.evaluated_by || null,
      evaluated_date: this.evaluation.evaluated_date || null,
      evaluated_by_status: this.evaluation.evaluated_by_status || null,
      approved_by: this.evaluation.approved_by || null,
      approved_date: this.evaluation.approved_date || null,
      approved_by_status: this.evaluation.approved_by_status || null,
      acknowledged_by: this.evaluation.acknowledged_by || null,
      acknowledged_date: this.evaluation.acknowledged_date || null,
      acknowledged_by_status: this.evaluation.acknowledged_by_status || null,
      items: this.evaluation.items || [],
      files: this.evaluation.files || [],
    };

    switch (this.actionType) {
      case 'approved_by_status':
        updatePayload.approved_by_status = statusLower;
        updatePayload.approved_date = actionTimestamp;
        break;
      case 'acknowledged_by_status':
        updatePayload.acknowledged_by_status = statusLower;
        updatePayload.acknowledged_date = actionTimestamp;
        break;
    }

    this.evaluationService.update(this.evaluationId, updatePayload)
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: () => {
          this.sendActionEmailNotification(updatePayload, statusLower);
          this.snackBar.open('Status updated successfully', 'Close', { duration: 3000 });
          this.router.navigate(['/sub-consultant-evaluation/list'], { queryParams: { tab: 'action' } });
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
    if (!this.evaluationId || !this.actionType) {
      return;
    }

    this.workflowEmailNotificationService
      .notifyAfterAction(
        SUB_CONSULTANT_EVALUATION_EMAIL_CONFIG,
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
          console.error('Failed to send sub-consultant evaluation email notification:', error);
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
        return 'Evaluated Status';
      case 'acknowledged_by_status':
        return 'Acknowledged Status';
      case 'approved_by_status':
        return 'Approved Status';
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

  formatDate(dateString?: string | null): string {
    return formatDateDisplay(dateString);
  }

  formatDateTime(dateString: string | null | undefined): string {
    if (!dateString) return '-';
    // Handle API responses that might be strings
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
  }

  getByStatusText(status: string | null | undefined): string {
    if (!status) return 'Pending';
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'pending':
        return 'Pending';
      case 'reject':
      case 'rejected':
        return 'Rejected';
      case 'approve':
      case 'approved':
        return 'Approved';
      default:
        return status;
    }
  }

  getByStatusColor(status: string | null | undefined): string {
    if (!status) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'approve':
      case 'approved':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'reject':
      case 'rejected':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  }

  getWorkflowIcon(status: string | null | undefined): string {
    if (!status) return 'schedule';
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'approve':
      case 'approved':
        return 'check';
      case 'reject':
      case 'rejected':
        return 'close';
      default:
        return 'schedule';
    }
  }

  getWorkflowIconClass(status: string | null | undefined): string {
    if (!status) return 'text-yellow-600 dark:text-yellow-300';
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'approve':
      case 'approved':
        return 'text-green-600 dark:text-green-300';
      case 'reject':
      case 'rejected':
        return 'text-red-600 dark:text-red-300';
      case 'pending':
        return 'text-yellow-600 dark:text-yellow-300';
      default:
        return 'text-gray-600 dark:text-gray-300';
    }
  }

  calculateAverage(): string {
    if (!this.evaluation || !this.evaluation.items || this.evaluation.items.length === 0) {
      return '-';
    }

    const validRatings = this.evaluation.items
      .filter(item => item.item_no !== 8) // Exclude "Others" item
      .map(item => {
        const rating = typeof item.rating === 'string' ? parseFloat(item.rating) : item.rating;
        return isNaN(rating) ? 0 : rating;
      })
      .filter(rating => rating > 0);

    if (validRatings.length === 0) {
      return '-';
    }

    const sum = validRatings.reduce((acc, rating) => acc + rating, 0);
    const average = sum / validRatings.length;
    return average.toFixed(2);
  }

  parseFloat(value: string | number | null | undefined): number {
    if (value === null || value === undefined) return 0;
    return typeof value === 'string' ? parseFloat(value) : value;
  }
}
