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
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatRadioModule } from '@angular/material/radio';
import { forkJoin, map, of, Subject, switchMap, takeUntil } from 'rxjs';
import { CarService } from 'app/core/services/car.service';
import { Car, CarSeverity, CarSource, NonConformityType } from 'app/core/models/car.model';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { EmployeeService } from 'app/core/services/employee.service';
import { CAR_EMAIL_CONFIG, WorkflowEmailNotificationService } from 'app/core/services/workflow-email-notification.service';
import { FuseConfirmationService } from '@fuse/services/confirmation';

interface ResponseTimeInfo {
  canCalculate: boolean;
  inTime: boolean;
  overdue: boolean;
  severity: string;
  limitHours: number;
  elapsedHours: number | null;
  startDate: Date | null;
  endDate: Date | null;
  message: string;
}

@Component({
  selector: 'app-car-action',
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
    MatCheckboxModule,
    MatDatepickerModule,
    MatRadioModule,
  ],
  templateUrl: './car-action.component.html',
  styleUrls: ['./car-action.component.scss'],
})
export class CarActionComponent implements OnInit, OnDestroy {
  actionForm: FormGroup;
  loading = false;
  carId: string | null = null;
  car: Car | null = null;
  actionType: 'approved_by_status' | 'completed_by_status' | 'acknowledged_by_status' | 'verified_by_status' | 'approved_by_status_2' | null = null;
  employeeLookup = new Map<string, string>();
  employeeLookupWithTitle = new Map<string, string>();

  statusOptions = [
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
  ];

  readonly sourceOptions: Array<{ value: CarSource; label: string }> = [
    { value: CarSource.INTERNAL_IMS_AUDIT, label: 'Internal IMS Audit' },
    { value: CarSource.EXTERNAL_IMS_AUDIT, label: 'External IMS Audit' },
    { value: CarSource.MANAGEMENT_REVIEW, label: 'Management Review' },
    { value: CarSource.NON_CONFORMITY, label: 'Non-Conformity' },
    { value: CarSource.CLIENT_EXTERNAL_COMPLAINT, label: 'Client\'s or External Complaint' },
    { value: CarSource.INCIDENT_REPORTING_INVESTIGATION, label: 'Incident Reporting & Investigation' },
    { value: CarSource.OTHERS, label: 'Others' }
  ];

  readonly nonConformityTypeOptions: Array<{ value: NonConformityType; label: string }> = [
    { value: NonConformityType.NOT_CONFORM_CLIENT_REQUIREMENTS, label: 'Not conform to client\'s requirements' },
    { value: NonConformityType.VE_REQUESTED_MTL_DESIGN, label: 'VE has been requested on MTL\'s Design' },
    { value: NonConformityType.ERROR_IN_DESIGN, label: 'Error in design' },
    { value: NonConformityType.NOT_COMPLY_LAW_REGULATIONS, label: 'Not comply with law and related regulations' },
    { value: NonConformityType.ENVIRONMENTAL_ISSUE, label: 'Environmental issue' },
    { value: NonConformityType.HEALTH_SAFETY_ISSUE, label: 'Health & Safety issue' },
    { value: NonConformityType.NOT_FOLLOW_PROCEDURES, label: 'Not follow the Procedures' },
    { value: NonConformityType.OBJECTIVES_NOT_MET, label: 'Objectives not met' },
    { value: NonConformityType.OTHER_ISSUES, label: 'Other issues' }
  ];

  private _unsubscribeAll: Subject<any> = new Subject<any>();

  constructor(
    private fb: FormBuilder,
    private carService: CarService,
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
    this.setupFollowUpOptionSync();

    this.route.params.pipe(takeUntil(this._unsubscribeAll)).subscribe(params => {
      this.carId = params['id'];
      this.actionType = params['type'] as 'approved_by_status' | 'completed_by_status' | 'acknowledged_by_status' | 'verified_by_status' | 'approved_by_status_2';

      if (this.carId) {
        this.loadCar();
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
      initialApprovalDecision: ['yes', Validators.required],
      comments: [''],
      // For verified_by_status (Follow up)
      raCaSatisfactory: [false],
      raCaSatisfactoryDescription: [''],
      furtherActionRequired: [false],
      furtherActionDescription: [''],
      verifiedByDate: [new Date()],
      // For approved_by_status_2 (Final review)
      responseTimeCheck: [false],
      approvedByDate: [new Date()],
      // For acknowledged_by_status
      acknowledgedByDate: [new Date()],
      // For completed_by_status (Section 2: Disposition)
      causeOfNonConformity: [''],
      remedialAction: [''],
      correctiveAction: [''],
      completedByDate: [new Date()],
      time: ['']
    });
  }

  private setupFollowUpOptionSync(): void {
    const raControl = this.actionForm.get('raCaSatisfactory');
    const raDescriptionControl = this.actionForm.get('raCaSatisfactoryDescription');
    const furtherControl = this.actionForm.get('furtherActionRequired');
    const furtherDescriptionControl = this.actionForm.get('furtherActionDescription');

    raControl?.valueChanges.pipe(takeUntil(this._unsubscribeAll)).subscribe((checked: boolean) => {
      if (!checked) return;

      furtherControl?.patchValue(false, { emitEvent: false });
      furtherDescriptionControl?.patchValue('', { emitEvent: false });
    });

    furtherControl?.valueChanges.pipe(takeUntil(this._unsubscribeAll)).subscribe((checked: boolean) => {
      if (!checked) return;

      raControl?.patchValue(false, { emitEvent: false });
      raDescriptionControl?.patchValue('', { emitEvent: false });
    });
  }

  private loadCar(): void {
    if (!this.carId) return;

    this.loading = true;
    forkJoin({
      car: this.carService.findOne(this.carId),
      employeeLookup: this.employeeService.getEmployeeLookupMap(),
      employeeLookupWithTitle: this.employeeService.getEmployeeLookupMapWithTitle()
    })
      .pipe(
        switchMap(({ car, employeeLookup, employeeLookupWithTitle }) => {
          const codes = [
            car.to,
            car.carIssuedBy,
            car.completedBy,
            car.acknowledgedBy,
            car.verifiedBy,
            car.approvedBy,
            (car as any).verifiedBy2,
            (car as any).approvedBy2,
            (car as any).create_by,
            (car as any).update_by
          ].filter(code => !!code);
          return this.employeeService.ensureEmployeesInLookup(employeeLookup, codes).pipe(
            switchMap(updatedLookup => {
              return this.employeeService.ensureEmployeesInLookup(employeeLookupWithTitle, codes).pipe(
                map(updatedLookupWithTitle => ({ car, employeeLookup: updatedLookup, employeeLookupWithTitle: updatedLookupWithTitle }))
              );
            })
          );
        }),
        takeUntil(this._unsubscribeAll)
      )
      .subscribe({
        next: ({ car, employeeLookup, employeeLookupWithTitle }) => {
          this.car = car;
          this.employeeLookup = employeeLookup;
          this.employeeLookupWithTitle = employeeLookupWithTitle;
          this.setupFormForActionType();
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading CAR:', error);
          this.snackBar.open('Error loading CAR', 'Close', { duration: 3000 });
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

  isInitialReviewStage(): boolean {
    return this.actionType === 'approved_by_status';
  }

  public isPendingStatus(status: string | null | undefined): boolean {
    return !status || status.toLowerCase() === 'pending';
  }

  private isApprovedStatus(status: string | null | undefined): boolean {
    if (!status) return false;
    const normalized = status.toLowerCase();
    return normalized === 'approved' || normalized === 'approve';
  }

  private setupFormForActionType(): void {
    if (!this.actionType || !this.car) return;

    let currentStatus = null;
    const formValue: any = {};

    switch (this.actionType) {
      case 'approved_by_status':
        currentStatus = this.car.approvedByStatus?.toLowerCase() || 'pending';
        formValue.initialApprovalDecision = 'yes';
        formValue.approvedByDate = this.car.approvedByDate ? new Date(this.car.approvedByDate) : new Date();
        break;
      case 'verified_by_status':
        currentStatus = this.car.verifiedByStatus?.toLowerCase() || 'pending';
        formValue.raCaSatisfactory = this.car.raCaSatisfactory === true || this.car.raCaSatisfactory === 1;
        formValue.raCaSatisfactoryDescription = this.car.raCaSatisfactoryDescription || '';
        formValue.furtherActionRequired = this.car.furtherActionRequired === true || this.car.furtherActionRequired === 1;
        formValue.furtherActionDescription = this.car.furtherActionDescription || '';
        formValue.verifiedByDate = this.car.verifiedByDate ? new Date(this.car.verifiedByDate) : new Date();
        break;
      case 'approved_by_status_2':
        currentStatus = this.car.approvedByStatus2?.toLowerCase() || 'pending';
        formValue.comments = this.car.imrComments || '';
        formValue.responseTimeCheck = this.car.responseTimeCheck === true || this.car.responseTimeCheck === 1;
        const responseTimeInfo = this.getResponseTimeInfo();
        if (responseTimeInfo.canCalculate) {
          formValue.responseTimeCheck = responseTimeInfo.inTime;
        }
        const approvedDate2 = this.car.approvedByDate2 ? new Date(this.car.approvedByDate2) : new Date();
        formValue.approvedByDate = approvedDate2;
        formValue.time = `${String(approvedDate2.getHours()).padStart(2, '0')}:${String(approvedDate2.getMinutes()).padStart(2, '0')}`;
        break;
      case 'acknowledged_by_status':
        currentStatus = this.car.acknowledgedByStatus?.toLowerCase() || 'pending';
        formValue.acknowledgedByDate = this.car.acknowledgedByDate ? new Date(this.car.acknowledgedByDate) : new Date();
        break;
      case 'completed_by_status':
        currentStatus = this.car.completedByStatus?.toLowerCase() || 'pending';
        formValue.causeOfNonConformity = this.car.causeOfNonConformity || '';
        formValue.remedialAction = this.car.remedialAction || '';
        formValue.correctiveAction = this.car.correctiveAction || '';
        formValue.completedByDate = this.car.completedByDate ? new Date(this.car.completedByDate) : new Date();
        break;
    }

    this.actionForm.patchValue({
      status: currentStatus,
      ...formValue
    });
  }

  onSubmit(): void {
    if (this.actionForm.invalid || !this.carId || !this.actionType || !this.car) {
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
    const initialApprovalRejected = this.actionType === 'approved_by_status' && formData.initialApprovalDecision === 'no';
    const status = initialApprovalRejected ? 'pending' : (this.actionType === 'approved_by_status' ? 'approved' : formData.status.toLowerCase());

    if (initialApprovalRejected) {
      this.loading = false;
      this.sendInitialApprovalEditRequestEmail();
      return;
    }

    const isFollowUpAction = this.actionType === 'verified_by_status';
    const existingRaCaSatisfactory = this.car.raCaSatisfactory === true || this.car.raCaSatisfactory === 1;
    const existingFurtherActionRequired = this.car.furtherActionRequired === true || this.car.furtherActionRequired === 1;
    const furtherActionRequired = isFollowUpAction ? !!formData.furtherActionRequired : existingFurtherActionRequired;
    const raCaSatisfactory = isFollowUpAction ? (!!formData.raCaSatisfactory && !furtherActionRequired) : existingRaCaSatisfactory;
    const raCaSatisfactoryDescription = isFollowUpAction
      ? (raCaSatisfactory ? (formData.raCaSatisfactoryDescription || '').trim() : '')
      : (this.car.raCaSatisfactoryDescription || '');
    const furtherActionDescription = isFollowUpAction
      ? (furtherActionRequired ? (formData.furtherActionDescription || '').trim() : '')
      : (this.car.furtherActionDescription || '');

    const getCurrentLocalDateTime = (): string => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    };
    const actionTimestamp = getCurrentLocalDateTime();

    // เตรียม payload สำหรับ PUT /api/cars/:id
    const updateData: any = {
      department: this.car.department,
      project_name: this.car.projectName,
      ref_no: this.car.refNo,
      project_no: this.car.projectNo,
      to: this.car.to,
      date: this.car.date,
      action_type: this.actionType,
      cause_of_non_conformity: (formData.causeOfNonConformity || this.car.causeOfNonConformity || '').trim(),
      remedial_action: (formData.remedialAction || this.car.remedialAction || '').trim(),
      corrective_action: (formData.correctiveAction || this.car.correctiveAction || '').trim(),
      imr_comments: (formData.comments || this.car.imrComments || '').trim(),
      due_date: formData.dueDate ? formatDateDisplay(formData.dueDate) : (this.car.dueDate || null),
      verified_by: this.car.verifiedBy || '',
      completed_by: this.car.completedBy || '',
      acknowledged_by: this.car.acknowledgedBy || '',
      approved_by: this.car.approvedBy || '',
      response_time_check: (formData.responseTimeCheck !== undefined ? (formData.responseTimeCheck ? 1 : 0) : (this.car.responseTimeCheck ? 1 : 0)),
      ra_ca_satisfactory: raCaSatisfactory ? 1 : 0,
      ra_ca_satisfactory_description: raCaSatisfactoryDescription,
      further_action_required: furtherActionRequired ? 1 : 0,
      further_action_description: furtherActionDescription,
    };

    // Keep all current status and date fields by default
    updateData.approved_by_status = this.getStepStatus(1) || 'pending';
    updateData.approved_by_date = this.getStepDate(1) || null;

    updateData.completed_by_status = this.getStepStatus(2) || 'pending';
    updateData.completed_by_date = this.getStepDate(2) || null;

    updateData.acknowledged_by_status = this.getStepStatus(3) || 'pending';
    updateData.acknowledged_by_date = this.getStepDate(3) || null;

    updateData.verified_by_status = this.getStepStatus(4) || 'pending';
    updateData.verified_by_date = this.getStepDate(4) || null;

    updateData.verified_by_status_2 = null;
    updateData.verified_by_date_2 = null;

    updateData.approved_by_status_2 = this.getStepStatus(5) || 'pending';
    updateData.approved_by_date_2 = this.getStepDate(5) || null;
    updateData.approve_by_status_2 = this.getStepStatus(5) || 'pending';
    updateData.approve_by_date_2 = this.getStepDate(5) || null;

    // Apply specific step updates
    let notificationStatus = status;

    switch (this.actionType) {
      case 'verified_by_status':
        if (furtherActionRequired) {
          updateData.completed_by_status = 'pending';
          updateData.completed_by_date = null;
          updateData.acknowledged_by_status = 'pending';
          updateData.acknowledged_by_date = null;
          updateData.verified_by_status = 'pending';
          updateData.verified_by_date = null;
          updateData.approved_by_status_2 = 'pending';
          updateData.approved_by_date_2 = null;
          updateData.approve_by_status_2 = 'pending';
          updateData.approve_by_date_2 = null;
          notificationStatus = 'returned_for_correction';
        } else {
          updateData.verified_by_status = status;
          updateData.verified_by_date = actionTimestamp;
        }
        break;

      case 'completed_by_status':
        updateData.completed_by_status = status;
        updateData.completed_by_date = actionTimestamp;
        break;

      case 'acknowledged_by_status':
        updateData.acknowledged_by_status = status;
        updateData.acknowledged_by_date = actionTimestamp;
        break;

      case 'approved_by_status':
        updateData.approved_by_status = status;
        updateData.approved_by_date = actionTimestamp;
        break;

      case 'approved_by_status_2':
        updateData.approved_by_status_2 = status;
        updateData.approved_by_date_2 = actionTimestamp;
        updateData.approve_by_status_2 = status;
        updateData.approve_by_date_2 = actionTimestamp;
        break;
    }

    this.loading = true;
    this.carService.update(this.carId, updateData)
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: () => {
          this.sendActionEmailNotification(updateData, notificationStatus);
          this.snackBar.open('Status updated successfully', 'Close', { duration: 3000 });
          this.router.navigate(['/cars/list']);
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
    if (!this.carId || !this.actionType) {
      return;
    }

    this.workflowEmailNotificationService
      .notifyAfterAction(
        CAR_EMAIL_CONFIG,
        {
          ...this.car,
          ...updatedPayload,
          id: this.carId
        },
        this.actionType,
        status,
        this.carId
      )
      .subscribe({
        error: (error) => {
          console.error('Failed to send CAR email notification:', error);
          this.snackBar.open('Status updated, but email notification could not be sent', 'Close', { duration: 5000 });
        }
      });
  }

  private sendInitialApprovalEditRequestEmail(): void {
    if (!this.carId || !this.car) {
      return;
    }

    this.loading = true;
    this.workflowEmailNotificationService
      .sendEditRequest(
        CAR_EMAIL_CONFIG,
        this.car,
        this.carId,
        this.car.carIssuedBy,
        `/cars/edit/${encodeURIComponent(this.carId)}`,
        this.getStepPerson(1)
      )
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: (response) => {
          if (response?.status === 'skipped') {
            this.snackBar.open('Could not send edit request email: missing creator email', 'Close', { duration: 5000 });
            this.loading = false;
            return;
          }

          this.snackBar.open('Edit request email sent to document creator', 'Close', { duration: 3000 });
          this.router.navigate(['/cars/list']);
        },
        error: (error) => {
          console.error('Failed to send CAR edit request email:', error);
          this.snackBar.open('Could not send edit request email', 'Close', { duration: 5000 });
          this.loading = false;
        }
      });
  }

  getActionTitle(): string {
    switch (this.actionType) {
      case 'approved_by_status':
        return 'Step 1: Approve Status';
      case 'completed_by_status':
        return 'Step 2: Complete Status';
      case 'acknowledged_by_status':
        return 'Step 3: Acknowledge Status';
      case 'verified_by_status':
        return 'Step 4: Verify Status';
      case 'approved_by_status_2':
        return 'Step 5: Approve 2 Status';
      default:
        return 'Update Status';
    }
  }

  getActionDescription(): string {
    switch (this.actionType) {
      case 'approved_by_status':
        return 'Step 1: Approval of the CAR document by IMR';
      case 'completed_by_status':
        return 'Step 2: Completion of the disposition of non-conformity';
      case 'acknowledged_by_status':
        return 'Step 3: Acknowledgment of the plan by supervisor';
      case 'verified_by_status':
        return 'Step 4: Verification of the remedial and corrective actions (RA & CA)';
      case 'approved_by_status_2':
        return 'Step 5: Final approval with comments and response time check';
      default:
        return 'Update the status for this CAR';
    }
  }

  formatDate(dateString: string | null | undefined): string {
    return formatDateDisplay(dateString);
  }

  formatDateTime(dateString: string | null | undefined): string {
    return formatDateTimeDisplay(dateString);
  }

  getResponseTimeInfo(): ResponseTimeInfo {
    const severity = this.getSeverityLabel(this.car?.severity);
    const limitHours = severity === 'MAJOR' ? 48 : 168;
    const startDate = this.parseWorkflowDateTime(this.getStepDate(1));
    const endDate = this.parseWorkflowDateTime(this.getStepDate(4));

    if (!startDate || !endDate) {
      return {
        canCalculate: false,
        inTime: false,
        overdue: false,
        severity,
        limitHours,
        elapsedHours: null,
        startDate,
        endDate,
        message: 'Cannot calculate response time because approval/issuer verification date is missing.'
      };
    }

    const elapsedHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);

    if (elapsedHours < 0) {
      return {
        canCalculate: false,
        inTime: false,
        overdue: false,
        severity,
        limitHours,
        elapsedHours,
        startDate,
        endDate,
        message: 'Cannot calculate response time because issuer verification date is before initial IMR approval date.'
      };
    }

    const inTime = elapsedHours <= limitHours;

    return {
      canCalculate: true,
      inTime,
      overdue: !inTime,
      severity,
      limitHours,
      elapsedHours,
      startDate,
      endDate,
      message: inTime ? 'Recipient responded within the specified time.' : 'Recipient response exceeded the specified time.'
    };
  }

  getResponseTimePanelClass(info: ResponseTimeInfo): string {
    if (!info.canCalculate) {
      return 'border-yellow-200 bg-yellow-50 text-yellow-900';
    }

    return info.inTime
      ? 'border-green-200 bg-green-50 text-green-900'
      : 'border-red-200 bg-red-50 text-red-900';
  }

  getResponseTimeBadgeClass(info: ResponseTimeInfo): string {
    if (!info.canCalculate) {
      return 'bg-yellow-100 text-yellow-800';
    }

    return info.inTime
      ? 'bg-green-100 text-green-800'
      : 'bg-red-100 text-red-800';
  }

  getResponseTimeIcon(info: ResponseTimeInfo): string {
    if (!info.canCalculate) {
      return 'heroicons_solid:exclamation-triangle';
    }

    return info.inTime ? 'heroicons_solid:check-circle' : 'heroicons_solid:x-circle';
  }

  getResponseTimeStatusLabel(info: ResponseTimeInfo): string {
    if (!info.canCalculate) {
      return 'Not calculated';
    }

    return info.inTime ? 'In time' : 'Overdue';
  }

  formatResponseLimit(limitHours: number): string {
    if (limitHours % 24 === 0) {
      const days = limitHours / 24;
      return `${days} day${days === 1 ? '' : 's'} (${limitHours} hours)`;
    }

    return `${limitHours} hours`;
  }

  formatElapsedHours(hours: number | null): string {
    if (hours === null || Number.isNaN(hours)) {
      return '-';
    }

    if (hours < 0) {
      return '-';
    }

    const totalMinutes = Math.round(hours * 60);
    const wholeHours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (wholeHours >= 24) {
      const days = Math.floor(wholeHours / 24);
      const remainingHours = wholeHours % 24;
      return `${days}d ${remainingHours}h ${minutes}m`;
    }

    if (wholeHours > 0) {
      return `${wholeHours}h ${minutes}m`;
    }

    return `${minutes}m`;
  }

  formatResponseDate(date: Date | null): string {
    return date ? formatDateTimeDisplay(date) : '-';
  }

  private parseWorkflowDateTime(value: string | Date | null | undefined): Date | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : value;
    }

    const trimmed = String(value).trim();
    if (!trimmed || trimmed === 'null') {
      return null;
    }

    const ymdTime = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (ymdTime) {
      const date = new Date(
        Number(ymdTime[1]),
        Number(ymdTime[2]) - 1,
        Number(ymdTime[3]),
        Number(ymdTime[4] || 0),
        Number(ymdTime[5] || 0),
        Number(ymdTime[6] || 0)
      );
      return isNaN(date.getTime()) ? null : date;
    }

    const dmyTime = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (dmyTime) {
      const date = new Date(
        Number(dmyTime[3]),
        Number(dmyTime[2]) - 1,
        Number(dmyTime[1]),
        Number(dmyTime[4] || 0),
        Number(dmyTime[5] || 0),
        Number(dmyTime[6] || 0)
      );
      return isNaN(date.getTime()) ? null : date;
    }

    const date = new Date(trimmed);
    return isNaN(date.getTime()) ? null : date;
  }



  getByStatusText(status: string | null | undefined): string {
    if (!status) return 'Pending';
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'pending': return 'Pending';
      case 'approved':
      case 'approve': return 'Approved';
      case 'rejected':
      case 'reject': return 'Rejected';
      default: return status;
    }
  }

  getByStatusColor(status: string | null | undefined): string {
    if (!status) return 'bg-yellow-100 text-yellow-800';
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approved':
      case 'approve': return 'bg-green-100 text-green-800';
      case 'rejected':
      case 'reject': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }
  getSeverityLabel(severity: CarSeverity | string | null | undefined): string {
    if (!severity) return '-';
    return severity === 'major' || severity === CarSeverity.MAJOR ? 'MAJOR' : 'MINOR';
  }

  getSeverityColor(severity: CarSeverity | string | null | undefined): string {
    if (!severity) return 'bg-gray-100 text-gray-800';
    return severity === 'major' || severity === CarSeverity.MAJOR
        ? 'bg-red-100 text-red-800'
        : 'bg-yellow-100 text-yellow-800';
  }

  getSourceLabel(source: CarSource | string): string {
    if (typeof source === 'string' && !Object.values(CarSource).includes(source as CarSource)) {
        return source;
    }
    const sourceLabels: { [key: string]: string } = {
        'internal_ims_audit': 'Internal IMS Audit',
        'external_ims_audit': 'External IMS Audit',
        'management_review': 'Management Review',
        'non_conformity': 'Non-Conformity',
        'client_external_complaint': 'Client\'s or External Complaint',
        'incident_reporting_investigation': 'Incident Reporting & Investigation',
        'others': 'Others'
    };
    return sourceLabels[source as string] || String(source);
  }

  getNonConformityTypeLabel(type: NonConformityType | string): string {
    if (typeof type === 'string' && !Object.values(NonConformityType).includes(type as NonConformityType)) {
        return type;
    }
    const typeLabels: { [key: string]: string } = {
        'not_conform_client_requirements': 'Not conform to client\'s requirements',
        've_requested_mtl_design': 'VE has been requested on MTL\'s Design',
        'error_in_design': 'Error in design',
        'not_comply_law_regulations': 'Not comply with law and related regulations',
        'environmental_issue': 'Environmental issue',
        'health_safety_issue': 'Health & Safety issue',
        'not_follow_procedures': 'Not follow the Procedures',
        'objectives_not_met': 'Objectives not met',
        'other_issues': 'Other issues'
    };
    return typeLabels[type as string] || String(type);
  }

  getStatusBadgeClass(status: string | null | undefined): string {
    if (!status) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'approved':
      case 'approve':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'rejected':
      case 'reject':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  }

  isSourceSelected(source: CarSource | string): boolean {
    return !!this.car?.sources?.includes(source as CarSource);
  }

  isNonConformityTypeSelected(type: NonConformityType | string): boolean {
    return !!this.car?.nonConformityTypes?.includes(type as NonConformityType);
  }

  getStatusLabel(status: string | null | undefined): string {
    return this.getByStatusText(status);
  }

  getStatusColor(status: string | null | undefined): string {
    return this.getByStatusColor(status);
  }

  // Utility methods to safely get step data (handling both snake_case and camelCase)
  getStepStatus(step: number): string | null | undefined {
    if (!this.car) return null;
    const car = this.car as any;
    switch (step) {
      case 1: return car.approved_by_status ?? car.approvedByStatus;
      case 2: return car.completed_by_status ?? car.completedByStatus;
      case 3: return car.acknowledged_by_status ?? car.acknowledgedByStatus;
      case 4: return car.verified_by_status ?? car.verifiedByStatus;
      case 5: return car.approved_by_status_2 ?? car.approvedByStatus2 ?? car.approve_by_status_2;
      default: return null;
    }
  }

  getStepDate(step: number): string | null | undefined {
    if (!this.car) return null;
    const car = this.car as any;
    switch (step) {
      case 1: return car.approved_by_date ?? car.approvedByDate;
      case 2: return car.completed_by_date ?? car.completedByDate;
      case 3: return car.acknowledged_by_date ?? car.acknowledgedByDate;
      case 4: return car.verified_by_date ?? car.verifiedByDate;
      case 5: return car.approved_by_date_2 ?? car.approvedByDate2 ?? car.approve_by_date_2;
      default: return null;
    }
  }

  getStepPerson(step: number): string | null | undefined {
    if (!this.car) return null;
    const car = this.car as any;
    switch (step) {
      case 1: return car.approved_by ?? car.approvedBy;
      case 2: return car.completed_by ?? car.completedBy;
      case 3: return car.acknowledged_by ?? car.acknowledgedBy;
      case 4: return car.verified_by ?? car.verifiedBy;
      case 5: return car.approved_by ?? car.approvedBy;
      default: return null;
    }
  }

  getStatusText(status: string | null | undefined): string {
    return this.getByStatusText(status);
  }

  getFinalVerifiedDate(): string | null | undefined {
    return this.getStepDate(4);
  }

  getFinalVerifiedStatus(): string | null | undefined {
    return this.getStepStatus(4);
  }

  getFinalApprovedDate(): string | null | undefined {
    return this.getStepDate(5);
  }

  getFinalApprovedStatus(): string | null | undefined {
    return this.getStepStatus(5);
  }

  isPendingWorkflowStatus(status: string | null | undefined): boolean {
    return !status || status.toLowerCase() === 'pending' || status === 'null';
  }
}
