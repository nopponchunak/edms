import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatRadioModule } from '@angular/material/radio';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { finalize, forkJoin, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { SchematicDesignCommentDialogComponent } from './schematic-design-comment-dialog.component';
import {
  ApprovalWorkflowComponent,
  ApprovalWorkflowStep,
} from 'app/core/components/approval-workflow';
import { EmployeeOption, EmployeeService } from 'app/core/services/employee.service';
import {
  pickDate,
  pickString,
  pickStringArray,
  pickValue,
  mergeProjectReviewEmployeeLookup,
  ProjectReviewApiService,
  serializeDatesDeep,
} from 'app/core/services/project-review-api.service';
import { formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import {
  DiscussionParticipant,
  ProjectReviewDiscussionService,
  ProjectReviewDiscussionType,
} from 'app/core/services/project-review-discussion.service';
import { WorkflowEmailNotificationService, SCHEMATIC_DESIGN_REVIEW_EMAIL_CONFIG } from 'app/core/services/workflow-email-notification.service';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { ProjectReviewAttachmentsCardComponent } from 'app/core/components/project-review-attachments-card/project-review-attachments-card.component';

export interface ReviewChecklistItem {
  id: string;
  question: string;
  type: string;
  required: boolean;
}

@Component({
  selector: 'app-schematic-design-review-action',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatRadioModule,
    MatCardModule,
    MatDividerModule,
    MatChipsModule,
    MatDialogModule,
    ApprovalWorkflowComponent,
    ProjectReviewAttachmentsCardComponent,
  ],
  templateUrl: './schematic-design-review-action.component.html',
  styleUrls: ['./schematic-design-review-action.component.scss'],
})
export class SchematicDesignReviewActionComponent implements OnInit, OnDestroy {
  private readonly apiKey = 'schematicDesignReview' as const;
  private readonly reviewDiscussionType: ProjectReviewDiscussionType = 'schematic_design_review';
  private readonly formType = 'MTDD-02';
  readonly isSafari =
    typeof navigator !== 'undefined' &&
    /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  actionForm: FormGroup;
  loading = false;
  recordId: string | null = null;
  actionType: string | null = null;
  recordData: any = null;
  hasDiscussionComments = false;
  employeeOptions: EmployeeOption[] = [];
  employeeLookupMap = new Map<string, string>();

  schematicDesignChecklist: ReviewChecklistItem[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    public router: Router,
    private snackBar: MatSnackBar,
    private employeeService: EmployeeService,
    private projectReviewApi: ProjectReviewApiService,
    private projectReviewDiscussionService: ProjectReviewDiscussionService,
    private dialog: MatDialog,
    private workflowEmailNotificationService: WorkflowEmailNotificationService,
    private fuseConfirmationService: FuseConfirmationService
  ) {
    this.actionForm = this.fb.group({
      status: ['', Validators.required],
      comments: [''],
      recommendedActions: [''],
      recommendedActionsSatisfactorilyTaken: [''],
      recommendedActionsNote: [''],
      signedDate: [new Date()],
      checklistResponses: this.fb.array(this.schematicDesignChecklist.map(() => '')),
    });
  }

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.recordId = params['id'];
      this.actionType = params['type']; // e.g. reviewed_by_status

      if (this.recordId) {
        this.loadData();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get checklistResponses(): FormArray {
    return this.actionForm.get('checklistResponses') as FormArray;
  }

  private loadData(): void {
    this.loading = true;
    forkJoin({
      record: this.projectReviewApi.getById(this.apiKey, this.recordId!),
      employees: this.employeeService.getEmployeeOptions('', 2000),
      lookupMap: this.employeeService.getEmployeeLookupMap()
    })
      .pipe(
        finalize(() => (this.loading = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: ({ record, employees, lookupMap }) => {
          this.recordData = record;
          this.employeeOptions = employees;
          this.employeeLookupMap = mergeProjectReviewEmployeeLookup([record], lookupMap);
          this.patchForm();
          this.refreshDiscussionCommentState();
        },
        error: (error) => {
          console.error('Error loading data:', error);
          this.snackBar.open('Failed to load review data.', 'Close', { duration: 3000 });
        },
      });
  }

  private patchForm(): void {
    if (!this.recordData) return;

    // Load checklist items from API data
    const rawResponses = this.recordData.checklist_responses ?? this.recordData.checklistResponses ?? [];

    // Clear and rebuild checklistResponses FormArray
    this.checklistResponses.clear();
    this.schematicDesignChecklist = [];

    if (rawResponses && Array.isArray(rawResponses)) {
      rawResponses.forEach((res: any) => {
        // Add to our display list
        this.schematicDesignChecklist.push({
          id: String(res.id || ''),
          question: res.question || '',
          type: 'boolean',
          required: true
        });

        // Add to FormArray with existing response
        this.checklistResponses.push(this.fb.control(res.response || res.value || ''));
      });
    }

    // Patch existing comments if any
    this.actionForm.patchValue({
      comments: this.recordData.comments || '',
      recommendedActions: pickValue(this.recordData, 'recommended_actions', 'recommendedActions') || '',
      status: this.getAutoDerivedStatus() || this.getCurrentActionStatus() || '',
      recommendedActionsSatisfactorilyTaken: pickValue(this.recordData, 'recommended_actions_satisfactorily_taken', 'recommendedActionsSatisfactorilyTaken') || '',
      recommendedActionsNote: pickValue(this.recordData, 'recommended_actions_note', 'recommendedActionsNote') || '',
      signedDate: pickDate(this.recordData, ...this.getCurrentActionDatePaths()) || new Date()
    });

    if (this.isCommentsLocked()) {
      this.actionForm.get('comments')?.disable();
    } else {
      this.actionForm.get('comments')?.enable();
    }

    if (this.isRecommendedActionsFieldLocked()) {
      this.actionForm.get('recommendedActions')?.disable();
    } else {
      this.actionForm.get('recommendedActions')?.enable();
    }

    if (this.isChecklistLocked()) {
      this.checklistResponses.controls.forEach((control) => control.disable());
    } else {
      this.checklistResponses.controls.forEach((control) => control.enable());
    }

    if (this.isRecommendedActionsLocked()) {
      this.actionForm.get('recommendedActionsSatisfactorilyTaken')?.disable();
      this.actionForm.get('recommendedActionsNote')?.disable();
    } else {
      this.actionForm.get('recommendedActionsSatisfactorilyTaken')?.enable();
      this.actionForm.get('recommendedActionsNote')?.enable();
    }

    const statusControl = this.actionForm.get('status');
    const signedDateControl = this.actionForm.get('signedDate');
    const recommendedActionsControl = this.actionForm.get(
      'recommendedActionsSatisfactorilyTaken'
    );

    if (this.isFirstTLAction() && !this.isReviewedApproved()) {
      recommendedActionsControl?.setValidators([Validators.required]);
    } else {
      recommendedActionsControl?.clearValidators();
    }
    recommendedActionsControl?.updateValueAndValidity({ emitEvent: false });

    if (this.shouldShowManualStatusFields()) {
      statusControl?.setValidators([Validators.required]);
      statusControl?.enable();
      signedDateControl?.enable();
    } else {
      statusControl?.clearValidators();
      if (!statusControl?.value) {
        statusControl?.setValue(this.getAutoDerivedStatus() || 'pending', {
          emitEvent: false,
        });
      }
      statusControl?.disable();
      signedDateControl?.disable();
    }
    statusControl?.updateValueAndValidity({ emitEvent: false });

    signedDateControl?.updateValueAndValidity({ emitEvent: false });
  }

  private getCurrentActionStatus(): string {
    if (!this.recordData || !this.actionType) return '';
    const status = pickString(this.recordData, ...this.getCurrentActionStatusPaths()) || '';
    return status.trim().toLowerCase();
  }

  private getCurrentActionStatusPaths(): string[] {
    const type = String(this.actionType || '').trim();
    if (!type) return [];

    switch (type) {
      case 'signed_by_t_l_status':
        return ['signed_by_t_l_status', 'signed_by_tl_status', 'signedByTLStatus'];
      case 'signed_by_t_l2_status':
        return ['signed_by_t_l2_status', 'signed_by_tl2_status', 'signedByTL2Status'];
      case 'reviewed_by_status':
        return ['reviewed_by_status', 'reviewedByStatus'];
      case 'responded_by_status':
        return ['responded_by_status', 'respondedByStatus'];
      case 'acknowledged_by_status':
        return ['acknowledged_by_status', 'acknowledgedByStatus'];
      default:
        return [type];
    }
  }

  private getCurrentActionDatePaths(): string[] {
    const type = String(this.actionType || '').trim();
    if (!type) return [];

    switch (type) {
      case 'signed_by_t_l_status':
        return ['signed_by_t_l_date', 'signed_by_tl_date', 'signedByTLDate'];
      case 'signed_by_t_l2_status':
        return ['signed_by_t_l2_date', 'signed_by_tl2_date', 'signedByTL2Date'];
      case 'reviewed_by_status':
        return ['reviewed_by_date', 'reviewedByDate'];
      case 'responded_by_status':
        return ['responded_by_date', 'respondedByDate'];
      case 'acknowledged_by_status':
        return ['acknowledged_by_date', 'acknowledgedByDate'];
      default:
        return [`${type.replace('_status', '')}_date`];
    }
  }

  onSubmit(): void {
    if (this.isReviewedApproved()) {
      return;
    }

    if (this.actionForm.invalid || !this.recordId || !this.actionType) {
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
    const raw = this.actionForm.getRawValue();
    const baseAction = this.actionType.replace('_status', '');
    const effectiveStatus = this.getEffectiveStatus(raw);

    // Map status and date fields correctly for the API
    const now = new Date();
    const selectedDate = new Date(raw.signedDate || now);

    // Always apply current time to the selected date as requested
    selectedDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

    const updates: any = {
      [this.actionType]: effectiveStatus,
      [`${baseAction}_date`]: selectedDate,
      [baseAction]: this.recordData[baseAction] || this.recordData.reviewedBy,
    };

    // Fix: Standardize on t_l and t_l2 variants and ensure they are synced
    if (this.actionType.includes('signed_by_tl') || this.actionType.includes('signed_by_t_l')) {
      const isTL2 = this.actionType.includes('tl2') || this.actionType.includes('t_l2');
      const prefix = isTL2 ? 'signed_by_tl2' : 'signed_by_tl';
      const prefix_underscore = isTL2 ? 'signed_by_t_l2' : 'signed_by_t_l';

      updates[`${prefix}_status`] = effectiveStatus;
      updates[`${prefix_underscore}_status`] = effectiveStatus;
      updates[`${prefix}_date`] = raw.signedDate || new Date();
      updates[`${prefix_underscore}_date`] = raw.signedDate || new Date();
    }

    if (this.shouldReturnToResponder(raw)) {
      updates['respondedByStatus'] = 'pending';
      updates['responded_by_status'] = 'pending';
      updates['respondedByDate'] = null;
      updates['responded_by_date'] = null;

      updates['signedByTLStatus'] = 'pending';
      updates['signed_by_tl_status'] = 'pending';
      updates['signed_by_t_l_status'] = 'pending';
      updates['signedByTLDate'] = null;
      updates['signed_by_tl_date'] = null;
      updates['signed_by_t_l_date'] = null;
      updates[this.actionType] = 'pending';
      updates[`${baseAction}_date`] = null;
    }

    const payload = serializeDatesDeep({
      ...this.recordData,
      ...updates,
      recommended_actions: raw.recommendedActions,
      recommended_actions_satisfactorily_taken: raw.recommendedActionsSatisfactorilyTaken,
      recommended_actions_note: raw.recommendedActionsNote,
      comments: raw.comments,
      checklistResponses: this.schematicDesignChecklist.map((item, index) => ({
        id: item.id,
        question: item.question,
        response: raw.checklistResponses[index] ?? '',
      })),
    });

    this.projectReviewApi
      .update(this.apiKey, this.recordId, payload)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          this.snackBar.open('Status updated successfully.', 'Close', { duration: 3000 });
          this.router.navigate(['/schematic-design-review']);

          // Trigger email notification for the next action step or status update
          const emailStatus = this.shouldReturnToResponder(raw) ? 'returned' : payload[this.actionType!];
          this.workflowEmailNotificationService.notifyAfterAction(
            SCHEMATIC_DESIGN_REVIEW_EMAIL_CONFIG,
            payload,
            this.actionType!,
            emailStatus
          ).subscribe({
            next: () => console.log('Action notification sent successfully'),
            error: (err) => console.error('Error sending action notification:', err)
          });
        },
        error: (error) => {
          console.error('Error updating status:', error);
          this.snackBar.open('Failed to update status.', 'Close', { duration: 3000 });
        },
      });

    });
  }

  openCommentDialog(): void {
    const dialogRef = this.dialog.open(SchematicDesignCommentDialogComponent, {
      width: '95vw',
      maxWidth: '1000px',
      maxHeight: '90vh',
      height: '80vh',
      data: {
        recordId: this.recordId,
        reviewType: this.reviewDiscussionType,
        participants: this.getDiscussionParticipants(),
      },
      panelClass: 'custom-dialog-container'
    });

    dialogRef.afterClosed()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.refreshDiscussionCommentState());
  }

  private refreshDiscussionCommentState(): void {
    if (!this.recordId) {
      this.hasDiscussionComments = false;
      return;
    }

    this.projectReviewDiscussionService
      .hasDiscussionMessages(this.reviewDiscussionType, this.recordId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (hasComments) => {
          this.hasDiscussionComments = hasComments;
        },
        error: () => {
          this.hasDiscussionComments = false;
        },
      });
  }

  isReviewedApproved(): boolean {
    const status = this.getCurrentActionStatus();
    return status === 'approved' || status === 'approve';
  }

  isChecklistLocked(): boolean {
    // Only reviewer can update the checklist.
    if (this.actionType !== 'reviewed_by_status') {
      return true;
    }
    return this.isReviewedApproved();
  }

  isCommentsLocked(): boolean {
    const type = String(this.actionType || '');
    const canEditComments = type === 'reviewed_by_status';
    return !canEditComments || this.isReviewedApproved();
  }

  canShowDetailedDiscussion(): boolean {
    const type = String(this.actionType || '');
    return ['reviewed_by_status', 'responded_by_status', 'signed_by_tl_status', 'signed_by_t_l_status'].includes(type) || this.isReviewedApproved();
  }

  isRecommendedActionsLocked(): boolean {
    return !this.isFirstTLAction() || this.isReviewedApproved();
  }

  shouldShowManualStatusFields(): boolean {
    return !this.isFirstTLAction();
  }

  isRecommendedActionsFieldLocked(): boolean {
    return this.actionType !== 'reviewed_by_status' || this.isReviewedApproved();
  }

  private getDiscussionParticipants(): DiscussionParticipant[] {
    const participants: DiscussionParticipant[] = [];
    const pushParticipant = (
      rawCode: any,
      workflowRole: string,
      authorRole: 'reviewer' | 'team'
    ) => {
      const code = String(rawCode ?? '').trim();
      if (!code || participants.some((item) => item.code === code && item.workflowRole === workflowRole)) {
        return;
      }

      participants.push({
        code,
        name: this.getEmployeeLabel(code),
        workflowRole,
        authorRole,
      });
    };

    pushParticipant(this.recordData?.signed_by_tl || this.recordData?.signedByTL, 'signed_by_tl', 'reviewer');
    pushParticipant(this.recordData?.signed_by_tl2 || this.recordData?.signedByTL2, 'signed_by_tl2', 'reviewer');
    pushParticipant(this.recordData?.acknowledged_by || this.recordData?.acknowledgedBy, 'acknowledged_by', 'reviewer');
    pushParticipant(this.recordData?.reviewed_by || this.recordData?.reviewedBy, 'reviewed_by', 'reviewer');
    pushParticipant(this.recordData?.responded_by || this.recordData?.respondedBy, 'responded_by', 'team');

    return participants;
  }

  // UI Helpers
  isTLAction(): boolean {
    const type = String(this.actionType || '');
    return type.includes('signed_by_tl') ||
           type.includes('signed_by_t_l') ||
           type.includes('acknowledged_by');
  }

  getActionTitle(): string {
    const type = String(this.actionType || '');
    if (type === 'reviewed_by_status') {
      return 'Action Request: Review Checklist';
    }
    if (type === 'responded_by_status') {
      return 'Action Request: Response Submission';
    }
    if (this.isTLAction()) {
      return 'Action Request: Team Leader Approval';
    }
    return 'Action Request: Schematic Design Review';
  }

  getStepLabel(): string {
    const type = String(this.actionType || '');
    if (type.includes('reviewed_by')) return 'Approved by Reviewer';
    if (type.includes('responded_by')) return 'Responded by';
    if (type.includes('signed_by_tl2') || type.includes('signed_by_t_l2')) return 'Approved by TL';
    if (type.includes('signed_by_tl') || type.includes('signed_by_t_l')) return 'Approved by Reviewer';
    if (type.includes('acknowledged_by')) return 'Acknowledged by';
    return 'Sign by';
  }

  getButtonLabel(): string {
    const type = String(this.actionType || '');
    if (type.includes('reviewed_by')) return 'Approve';
    if (type.includes('responded_by')) return 'Submit Response';
    if (type.includes('signed_by_tl') || type.includes('signed_by_t_l')) return 'Approve';
    if (type.includes('acknowledged_by')) return 'Acknowledge';
    return 'Submit';
  }

  getActionDescription(): string {
    if (this.actionType === 'reviewed_by_status') {
      return 'Please review the schematic design checklist and provide your response.';
    }
    if (this.actionType === 'responded_by_status') {
      return 'Please respond to the reviewer comments before the request moves to the next approval step.';
    }
    if (this.isTLAction()) {
      return 'Please verify if recommended actions have been satisfactorily taken.';
    }
    return 'Please process this action request.';
  }

  get workflowSteps(): ApprovalWorkflowStep[] {
    const source = this.recordData ?? {};

    return [
      {
        key: 'reviewedBy',
        title: 'Approved By Reviewer',
        assignee: this.getEmployeeLabel(
          source.reviewed_by || source.reviewedBy
        ),
        date: this.getWorkflowDate(
          source,
          'reviewedByDate',
          'reviewed_by_date'
        ),
        status: this.getWorkflowStatus(
          source,
          'reviewedByStatus',
          'reviewed_by_status'
        ),
      },
      {
        key: 'respondedBy',
        title: 'Responded By',
        assignee: this.getEmployeeLabel(
          source.responded_by || source.respondedBy
        ),
        date: this.getWorkflowDate(
          source,
          'respondedByDate',
          'responded_by_date'
        ),
        status: this.getWorkflowStatus(
          source,
          'respondedByStatus',
          'responded_by_status'
        ),
      },
      {
        key: 'signedByTL',
        title: 'Approved By Reviewer',
        assignee: this.getEmployeeLabel(
          source.signed_by_tl || source.signedByTL || source.signed_by_t_l
        ),
        date: this.getWorkflowDate(
          source,
          'signedByTLDate',
          'signed_by_tl_date',
          'signed_by_t_l_date'
        ),
        status: this.getWorkflowStatus(
          source,
          'signedByTLStatus',
          'signed_by_tl_status',
          'signed_by_t_l_status'
        ),
      },
      {
        key: 'signedByTL2',
        title: 'Approved By TL',
        assignee: this.getEmployeeLabel(
          source.signed_by_tl2 || source.signedByTL2 || source.signed_by_t_l2
        ),
        date: this.getWorkflowDate(
          source,
          'signedByTL2Date',
          'signed_by_tl2_date',
          'signed_by_t_l2_date'
        ),
        status: this.getWorkflowStatus(
          source,
          'signedByTL2Status',
          'signed_by_tl2_status',
          'signed_by_t_l2_status'
        ),
      },
      {
        key: 'acknowledgedBy',
        title: 'Acknowledged By (DI)',
        assignee: this.getEmployeeLabel(
          source.acknowledged_by ||
            source.acknowledgedBy ||
            source.acknowledged_by_d_i
        ),
        date: this.getWorkflowDate(
          source,
          'acknowledgedByDate',
          'acknowledged_by_date',
          'acknowledged_by_d_i_date'
        ),
        status: this.getWorkflowStatus(
          source,
          'acknowledgedByStatus',
          'acknowledged_by_status',
          'acknowledged_by_d_i_status'
        ),
      },
    ];
  }

  private getWorkflowDate(source: any, ...keys: string[]): string {
    return formatDateTimeDisplay(pickValue(source, ...keys));
  }

  private getWorkflowStatus(source: any, ...keys: string[]): string {
    return pickString(source, ...keys) || 'pending';
  }

  isFirstTLAction(): boolean {
    const type = String(this.actionType || '');
    return type === 'signed_by_tl_status' || type === 'signed_by_t_l_status';
  }

  private shouldReturnToResponder(raw: any): boolean {
    if (String(raw?.status || '').trim().toLowerCase() === 'rejected') {
      return false;
    }

    const actionsTaken = String(raw?.recommendedActionsSatisfactorilyTaken || '').trim().toLowerCase();
    return this.isFirstTLAction() && actionsTaken === 'no';
  }

  private getEffectiveStatus(raw: any): string {
    if (!this.isFirstTLAction()) {
      return String(raw?.status || '').trim().toLowerCase();
    }

    const selectedStatus = String(raw?.status || '').trim().toLowerCase();
    if (selectedStatus === 'rejected') {
      return 'rejected';
    }

    const actionsTaken = String(raw?.recommendedActionsSatisfactorilyTaken || '').trim().toLowerCase();
    if (actionsTaken === 'yes') {
      return 'approved';
    }

    return 'pending';
  }

  private getAutoDerivedStatus(): string {
    if (!this.isFirstTLAction()) {
      return '';
    }

    const actionsTaken = String(
      pickValue(this.recordData, 'recommended_actions_satisfactorily_taken', 'recommendedActionsSatisfactorilyTaken') || ''
    ).trim().toLowerCase();

    if (actionsTaken === 'yes') {
      return 'approved';
    }

    if (actionsTaken === 'no') {
      return 'pending';
    }

    return '';
  }

  getDocumentTypesDisplay(): string {
    const docTypes = pickStringArray(this.recordData, 'documentTypes', 'document_types');
    const other = pickString(this.recordData, 'documentTypesOther', 'document_types_other');

    let display = docTypes.filter(d => d !== 'Other').join(', ');
    if (docTypes.includes('Other') && other) {
      if (display) display += `, Other (${other})`;
      else display = `Other (${other})`;
    } else if (docTypes.includes('Other')) {
      if (display) display += ', Other';
      else display = 'Other';
    }

    return display || '-';
  }

  getEmployeeLabel(value: any): string {
    const code = String(value || '').trim();
    if (!code || code === '-') return '-';

    // 1. Try lookup map for "initial, name" format
    const fromMap = this.employeeLookupMap.get(code);
    if (fromMap) return fromMap;

    // 2. Try employeeOptions as fallback
    const match = this.employeeOptions.find(o => o.code === code || String(o.employeeId) === code);
    if (match) return match.displayLabel;

    return code;
  }

  formatDate(date: any): string {
    return formatDateTimeDisplay(date);
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'approved': return 'Approved';
      case 'rejected': return 'Rejected';
      case 'pending': return 'Pending';
      default: return status || 'Pending';
    }
  }

  getStatusBadgeClass(status: string): string {
    const s = String(status || '').toLowerCase();
    if (s === 'approved') return 'bg-green-100 text-green-800';
    if (s === 'rejected') return 'bg-red-100 text-red-800';
    return 'bg-yellow-100 text-yellow-800';
  }

  isChecklistResponse(index: number, value: string): boolean {
    const responses = this.recordData?.checklistResponses ?? this.recordData?.checklist_responses ?? [];
    return String(responses[index]?.response || '').toLowerCase() === value.toLowerCase();
  }
}
