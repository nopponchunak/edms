import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { finalize, forkJoin, Subject, takeUntil } from 'rxjs';
import { EmployeeOption, EmployeeService } from 'app/core/services/employee.service';
import { ConceptDesignCommentDialogComponent } from 'app/modules/concept-design-review/concept-design-review-action/concept-design-comment-dialog.component';
import {
  asBoolean,
  pickDate,
  pickString,
  pickStringArray,
  pickValue,
  mergeProjectReviewEmployeeLookup,
  ProjectReviewApiService,
  serializeDatesDeep,
} from 'app/core/services/project-review-api.service';
import {
  DiscussionParticipant,
  ProjectReviewDiscussionService,
  ProjectReviewDiscussionType,
} from 'app/core/services/project-review-discussion.service';
import {
  ApprovalWorkflowComponent,
  ApprovalWorkflowStep,
} from 'app/core/components/approval-workflow';
import {
  formatDateDisplay,
  formatDateTimeNoSecondsDisplay,
} from 'app/core/utils/date-format.util';
import { WorkflowEmailNotificationService, ENGINEERING_AUDIT_REVIEW_EMAIL_CONFIG } from 'app/core/services/workflow-email-notification.service';
import { FuseConfirmationService } from '@fuse/services/confirmation';

interface EngineeringAuditChecklistItem {
  id: string;
  question: string;
}

type EngineeringAuditActionType =
  | 'reviewed_by_status'
  | 'responded_by_status'
  | 'signed_by_status'
  | 'client_project_manager_signed_by_status'
  | 'acknowledged_by_status';

@Component({
  selector: 'app-engineering-audit-review-action',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    MatSelectModule,
    MatDialogModule,
    MatSnackBarModule,
    ApprovalWorkflowComponent,
  ],
  templateUrl: './engineering-audit-review-action.component.html',
  styleUrls: ['./engineering-audit-review-action.component.scss'],
})
export class EngineeringAuditReviewActionComponent implements OnInit, OnDestroy {
  private readonly apiKey = 'engineeringAuditReview' as const;
  private readonly reviewDiscussionType: ProjectReviewDiscussionType = 'engineering_audit_review';
  private readonly destroy$ = new Subject<void>();

  readonly checklistItems: EngineeringAuditChecklistItem[] = [
    { id: '1', question: 'Is audit/study methodology sound?' },
    { id: '2', question: 'Are audit/study assumptions and parameters valid?' },
    { id: '3', question: 'Are loadings appropriate?' },
    { id: '4', question: 'Are proposed analysis methods appropriate?' },
    { id: '5', question: 'Are proposed investigations methods appropriate?' },
    { id: '6', question: 'Are proposed recommendations effective and buildable?' },
    { id: '7', question: "Does audit/study report meet client's requirements?" },
    { id: '8', question: 'Does the audit/study satisfy legal and statutory requirements?' },
    {
      id: '9',
      question:
        'Does the audit/study satisfy health, safety and environmental requirements?',
    },
  ];

  actionForm: FormGroup;
  loading = false;
  recordId: string | null = null;
  actionType: EngineeringAuditActionType | null = null;
  recordData: any = null;
  hasDiscussionComments = false;
  employeeOptions: EmployeeOption[] = [];
  employeeLookupMap = new Map<string, string>();

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
      status: ['approved', Validators.required],
      signedDate: [new Date(), Validators.required],
      performingCalculationsDone: [''],
      checklistResponses: this.fb.array([]),
      comments: [''],
      recommendedActions: [''],
      nonConformanceToQP: [''],
      recommendedActionsSatisfactorilyTaken: [''],
      recommendedActionsNote: [''],
      clientProjectManagerFeedback: [''],
      clientProjectManagerComments: [''],
    });
  }

  ngOnInit(): void {
    this.actionForm
      .get('recommendedActionsSatisfactorilyTaken')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(() => this.updateConditionalValidators());

    this.actionForm
      .get('clientProjectManagerFeedback')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(() => this.updateConditionalValidators());

    this.route.params.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.recordId = params['id'] ?? null;
      this.actionType = this.normalizeActionType(params['type']);

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
    if (!this.recordId) {
      return;
    }

    this.loading = true;
    forkJoin({
      record: this.projectReviewApi.getById(this.apiKey, this.recordId),
      employees: this.employeeService.getEmployeeOptions('', 2000),
      lookupMap: this.employeeService.getEmployeeLookupMap(),
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
          console.error('Error loading engineering audit action:', error);
          this.snackBar.open('Failed to load action request.', 'Close', {
            duration: 3000,
          });
        },
      });
  }

  private patchForm(): void {
    const responses = this.getChecklistResponsesFromRecord();
    this.checklistResponses.clear();

    this.checklistItems.forEach((item, index) => {
      const matched = responses.find((response: any) => String(response?.id ?? '') === item.id);
      this.checklistResponses.push(
        this.fb.control(matched?.response ?? matched?.value ?? responses[index]?.response ?? '')
      );
    });

    this.actionForm.patchValue(
      {
        status: this.getCurrentActionStatus() || 'approved',
        signedDate: pickDate(this.recordData, ...this.getCurrentActionDatePaths()) || new Date(),
        performingCalculationsDone: this.toYesNo(
          pickValue(
            this.recordData,
            'performingCalculations.done',
            'performing_calculations.done'
          )
        ),
        comments:
          pickString(this.recordData, 'comments') ||
          pickString(this.recordData, 'reviewerComments', 'reviewer_comments'),
        recommendedActions:
          pickString(this.recordData, 'recommendedActions') ||
          pickString(
            this.recordData,
            'reviewerRecommendedAction',
            'reviewer_recommended_action'
          ),
        nonConformanceToQP: this.toYesNo(
          pickValue(this.recordData, 'nonConformanceToQP', 'non_conformance_to_qp')
        ),
        recommendedActionsSatisfactorilyTaken: this.toYesNo(
          pickValue(
            this.recordData,
            'recommendedActionsSatisfactorilyTaken',
            'recommended_actions_satisfactorily_taken'
          )
        ),
        recommendedActionsNote:
          pickString(this.recordData, 'reviewerFollowUpNote', 'reviewer_follow_up_note') ||
          pickString(this.recordData, 'note'),
        clientProjectManagerFeedback: this.toYesNo(
          pickValue(
            this.recordData,
            'clientProjectManagerFeedback',
            'client_project_manager_feedback'
          )
        ),
        clientProjectManagerComments:
          pickString(
            this.recordData,
            'clientProjectManagerComments',
            'client_project_manager_comments'
          ) || pickString(this.recordData, 'tlComments', 'tl_comments'),
      },
      { emitEvent: false }
    );

    this.configureActionControls();
  }

  onSubmit(): void {
    if (!this.recordId || !this.actionType) {
      return;
    }

    this.configureActionControls();
    if (this.actionForm.invalid) {
      this.actionForm.markAllAsTouched();
      this.snackBar.open('Please complete the required action fields.', 'Close', {
        duration: 3000,
      });
      return;
    }

    const raw = this.actionForm.getRawValue();
    const selectedDate = this.normalizeActionDate(raw.signedDate);
    const updates = this.buildActionUpdates(raw, selectedDate);
    const payload = serializeDatesDeep({
      ...this.recordData,
      ...updates,
    });

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
    this.projectReviewApi
      .update(this.apiKey, this.recordId, payload)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          this.snackBar.open('Action request updated successfully.', 'Close', {
            duration: 3000,
          });
          this.router.navigate(['/engineering-audit-review']);

          // Trigger email notification for the next action step or status update
          this.workflowEmailNotificationService.notifyAfterAction(
            ENGINEERING_AUDIT_REVIEW_EMAIL_CONFIG,
            payload,
            this.actionType!,
            payload[this.actionType!]
          ).subscribe({
            error: (err) => console.error('Error sending action notification:', err)
          });
        },
        error: (error) => {
          console.error('Error updating engineering audit action:', error);
          this.snackBar.open('Failed to update action request.', 'Close', {
            duration: 3000,
          });
        },
      });

    });
  }

  private buildActionUpdates(raw: any, selectedDate: Date): any {
    switch (this.actionType) {
      case 'reviewed_by_status':
        return this.buildReviewedUpdates(raw, selectedDate);
      case 'responded_by_status':
        return this.buildRespondedUpdates(raw, selectedDate);
      case 'signed_by_status':
        return this.buildSignedUpdates(raw, selectedDate);
      case 'client_project_manager_signed_by_status':
        return this.buildClientFeedbackUpdates(raw, selectedDate);
      case 'acknowledged_by_status':
        return this.buildAcknowledgedUpdates(raw, selectedDate);
      default:
        return {};
    }
  }

  private buildReviewedUpdates(raw: any, selectedDate: Date): any {
    const status = String(raw.status || 'approved').trim().toLowerCase();
    const approved = this.isApprovedStatus(status);
    return {
      status: 'in_review',
      reviewedByStatus: status,
      reviewed_by_status: status,
      reviewedByDate: approved ? selectedDate : null,
      reviewed_by_date: approved ? selectedDate : null,
      performingCalculations: {
        done: raw.performingCalculationsDone === 'yes',
      },
      performing_calculations: {
        done: raw.performingCalculationsDone === 'yes',
      },
      checklistResponses: this.checklistItems.map((item, index) => ({
        id: item.id,
        question: item.question,
        response: raw.checklistResponses[index] ?? '',
      })),
      checklist_responses: this.checklistItems.map((item, index) => ({
        id: item.id,
        question: item.question,
        response: raw.checklistResponses[index] ?? '',
      })),
      comments: raw.comments,
      reviewerComments: raw.comments,
      reviewer_comments: raw.comments,
      recommendedActions: raw.recommendedActions,
      reviewerRecommendedAction: raw.recommendedActions,
      reviewer_recommended_action: raw.recommendedActions,
      nonConformanceToQP: raw.nonConformanceToQP === 'yes',
      non_conformance_to_qp: raw.nonConformanceToQP === 'yes',
      respondedByStatus: 'pending',
      responded_by_status: 'pending',
    };
  }

  private buildRespondedUpdates(raw: any, selectedDate: Date): any {
    const status = String(raw.status || 'approved').trim().toLowerCase();
    const approved = this.isApprovedStatus(status);
    return {
      status: 'pe_response',
      respondedByStatus: status,
      responded_by_status: status,
      respondedByDate: approved ? selectedDate : null,
      responded_by_date: approved ? selectedDate : null,
      peResponseDate: approved ? selectedDate : null,
      pe_response_date: approved ? selectedDate : null,
    };
  }

  private buildSignedUpdates(raw: any, selectedDate: Date): any {
    const actionsTaken = String(raw.recommendedActionsSatisfactorilyTaken || '').trim().toLowerCase();
    const updates: any = {
      recommendedActionsSatisfactorilyTaken: actionsTaken,
      recommended_actions_satisfactorily_taken: actionsTaken,
      reviewerFollowUpNote: raw.recommendedActionsNote,
      reviewer_follow_up_note: raw.recommendedActionsNote,
      note: raw.recommendedActionsNote,
    };

    if (actionsTaken === 'no') {
      this.applyFullActionLoopReset(updates);
      updates.signedByStatus = 'returned';
      updates.signed_by_status = 'returned';
      return updates;
    }

    return {
      ...updates,
      status: 'reviewer_followup',
      signedByStatus: 'approved',
      signed_by_status: 'approved',
      signedByDate: selectedDate,
      signed_by_date: selectedDate,
      reviewerFollowUpDate: selectedDate,
      reviewer_follow_up_date: selectedDate,
    };
  }

  private buildClientFeedbackUpdates(raw: any, selectedDate: Date): any {
    const feedback = String(raw.clientProjectManagerFeedback || '').trim().toLowerCase();
    const updates: any = {
      clientProjectManagerFeedback: feedback,
      client_project_manager_feedback: feedback,
      clientProjectManagerComments: raw.clientProjectManagerComments,
      client_project_manager_comments: raw.clientProjectManagerComments,
      tlComments: raw.clientProjectManagerComments,
      tl_comments: raw.clientProjectManagerComments,
    };

    if (feedback === 'no') {
      this.applyFullActionLoopReset(updates);
      updates.clientProjectManagerSignedByStatus = 'returned';
      updates.client_project_manager_signed_by_status = 'returned';
      return updates;
    }

    return {
      ...updates,
      status: 'tl_review',
      clientProjectManagerSignedByStatus: 'approved',
      client_project_manager_signed_by_status: 'approved',
      clientProjectManagerSignedByDate: selectedDate,
      client_project_manager_signed_by_date: selectedDate,
      tlReviewDate: selectedDate,
      tl_review_date: selectedDate,
    };
  }

  private buildAcknowledgedUpdates(raw: any, selectedDate: Date): any {
    const status = String(raw.status || 'approved').trim().toLowerCase();
    const approved = this.isApprovedStatus(status);
    return {
      status: approved ? 'completed' : 'di_acknowledge',
      acknowledgedByStatus: status,
      acknowledged_by_status: status,
      acknowledgedByDate: approved ? selectedDate : null,
      acknowledged_by_date: approved ? selectedDate : null,
      diAcknowledgeDate: approved ? selectedDate : null,
      di_acknowledge_date: approved ? selectedDate : null,
    };
  }

  private applyFullActionLoopReset(updates: any): void {
    Object.assign(updates, {
      status: 'pe_response',
      respondedByStatus: 'pending',
      responded_by_status: 'pending',
      respondedByDate: null,
      responded_by_date: null,
      peResponseDate: null,
      pe_response_date: null,
      signedByStatus: 'pending',
      signed_by_status: 'pending',
      signedByDate: null,
      signed_by_date: null,
      reviewerFollowUpDate: null,
      reviewer_follow_up_date: null,
      clientProjectManagerSignedByStatus: 'pending',
      client_project_manager_signed_by_status: 'pending',
      clientProjectManagerSignedByDate: null,
      client_project_manager_signed_by_date: null,
      tlReviewDate: null,
      tl_review_date: null,
      acknowledgedByStatus: 'pending',
      acknowledged_by_status: 'pending',
      acknowledgedByDate: null,
      acknowledged_by_date: null,
      diAcknowledgeDate: null,
      di_acknowledge_date: null,
    });
  }

  private configureActionControls(): void {
    const statusControl = this.actionForm.get('status');
    const dateControl = this.actionForm.get('signedDate');

    this.setControlState('performingCalculationsDone', false);
    this.setControlState('comments', false);
    this.setControlState('recommendedActions', false);
    this.setControlState('nonConformanceToQP', false);
    this.setControlState('recommendedActionsSatisfactorilyTaken', false);
    this.setControlState('recommendedActionsNote', false);
    this.setControlState('clientProjectManagerFeedback', false);
    this.setControlState('clientProjectManagerComments', false);

    statusControl?.setValidators([Validators.required]);
    statusControl?.enable({ emitEvent: false });
    dateControl?.setValidators([Validators.required]);
    dateControl?.enable({ emitEvent: false });

    this.checklistResponses.controls.forEach((control) => {
      control.clearValidators();
      control.disable({ emitEvent: false });
      control.updateValueAndValidity({ emitEvent: false });
    });

    if (this.isReviewedAction()) {
      this.setControlState('performingCalculationsDone', true, [Validators.required]);
      this.setControlState('comments', true);
      this.setControlState('recommendedActions', true);
      this.setControlState('nonConformanceToQP', true, [Validators.required]);
      this.checklistResponses.controls.forEach((control) => {
        control.setValidators([Validators.required]);
        control.enable({ emitEvent: false });
        control.updateValueAndValidity({ emitEvent: false });
      });
    } else if (this.isSignedAction()) {
      statusControl?.clearValidators();
      statusControl?.disable({ emitEvent: false });
      this.setControlState('recommendedActionsSatisfactorilyTaken', true, [
        Validators.required,
      ]);
      this.setControlState('recommendedActionsNote', true);
    } else if (this.isClientFeedbackAction()) {
      statusControl?.clearValidators();
      statusControl?.disable({ emitEvent: false });
      this.setControlState('clientProjectManagerFeedback', true, [Validators.required]);
      this.setControlState('clientProjectManagerComments', true);
    }

    statusControl?.updateValueAndValidity({ emitEvent: false });
    dateControl?.updateValueAndValidity({ emitEvent: false });
    this.updateConditionalValidators();
  }

  private setControlState(
    controlName: string,
    enabled: boolean,
    validators: any[] = []
  ): void {
    const control = this.actionForm.get(controlName);
    if (!control) {
      return;
    }

    control.setValidators(validators);
    if (enabled) {
      control.enable({ emitEvent: false });
    } else {
      control.disable({ emitEvent: false });
    }
    control.updateValueAndValidity({ emitEvent: false });
  }

  private updateConditionalValidators(): void {
    const noteControl = this.actionForm.get('recommendedActionsNote');
    if (this.isSignedAction()) {
      const actionsTaken = String(
        this.actionForm.get('recommendedActionsSatisfactorilyTaken')?.value || ''
      ).toLowerCase();
      noteControl?.setValidators(actionsTaken === 'no' ? [Validators.required] : []);
      noteControl?.updateValueAndValidity({ emitEvent: false });
    }

    const commentsControl = this.actionForm.get('clientProjectManagerComments');
    if (this.isClientFeedbackAction()) {
      const feedback = String(
        this.actionForm.get('clientProjectManagerFeedback')?.value || ''
      ).toLowerCase();
      commentsControl?.setValidators(feedback === 'no' ? [Validators.required] : []);
      commentsControl?.updateValueAndValidity({ emitEvent: false });
    }
  }

  private getChecklistResponsesFromRecord(): any[] {
    const responses =
      this.recordData?.checklistResponses ?? this.recordData?.checklist_responses ?? [];
    return Array.isArray(responses) ? responses : [];
  }

  private getCurrentActionStatus(): string {
    return pickString(this.recordData, ...this.getCurrentActionStatusPaths())
      .trim()
      .toLowerCase();
  }

  private getCurrentActionStatusPaths(): string[] {
    switch (this.actionType) {
      case 'reviewed_by_status':
        return ['reviewedByStatus', 'reviewed_by_status'];
      case 'responded_by_status':
        return ['respondedByStatus', 'responded_by_status'];
      case 'signed_by_status':
        return ['signedByStatus', 'signed_by_status'];
      case 'client_project_manager_signed_by_status':
        return [
          'clientProjectManagerSignedByStatus',
          'client_project_manager_signed_by_status',
        ];
      case 'acknowledged_by_status':
        return ['acknowledgedByStatus', 'acknowledged_by_status'];
      default:
        return [];
    }
  }

  private getCurrentActionDatePaths(): string[] {
    switch (this.actionType) {
      case 'reviewed_by_status':
        return ['reviewedByDate', 'reviewed_by_date'];
      case 'responded_by_status':
        return ['respondedByDate', 'responded_by_date', 'peResponseDate', 'pe_response_date'];
      case 'signed_by_status':
        return ['signedByDate', 'signed_by_date', 'reviewerFollowUpDate', 'reviewer_follow_up_date'];
      case 'client_project_manager_signed_by_status':
        return [
          'clientProjectManagerSignedByDate',
          'client_project_manager_signed_by_date',
          'tlReviewDate',
          'tl_review_date',
        ];
      case 'acknowledged_by_status':
        return ['acknowledgedByDate', 'acknowledged_by_date', 'diAcknowledgeDate', 'di_acknowledge_date'];
      default:
        return [];
    }
  }

  private normalizeActionType(value: unknown): EngineeringAuditActionType | null {
    const normalized = String(value || '').trim() as EngineeringAuditActionType;
    return [
      'reviewed_by_status',
      'responded_by_status',
      'signed_by_status',
      'client_project_manager_signed_by_status',
      'acknowledged_by_status',
    ].includes(normalized)
      ? normalized
      : null;
  }

  private normalizeActionDate(value: unknown): Date {
    const now = new Date();
    const selectedDate = value ? new Date(String(value)) : now;
    if (Number.isNaN(selectedDate.getTime())) {
      return now;
    }

    if (selectedDate.getHours() === 0 && selectedDate.getMinutes() === 0) {
      selectedDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
    }

    return selectedDate;
  }

  private toYesNo(value: unknown): string {
    if (value === undefined || value === null || value === '') {
      return '';
    }
    return asBoolean(value) ? 'yes' : 'no';
  }

  private isApprovedStatus(status: string): boolean {
    return ['approved', 'approve', 'signed', 'acknowledged', 'completed'].includes(
      String(status || '').trim().toLowerCase()
    );
  }

  isReviewedAction(): boolean {
    return this.actionType === 'reviewed_by_status';
  }

  isRespondedAction(): boolean {
    return this.actionType === 'responded_by_status';
  }

  isSignedAction(): boolean {
    return this.actionType === 'signed_by_status';
  }

  isClientFeedbackAction(): boolean {
    return this.actionType === 'client_project_manager_signed_by_status';
  }

  isAcknowledgedAction(): boolean {
    return this.actionType === 'acknowledged_by_status';
  }

  canShowStatusSelect(): boolean {
    return !this.isSignedAction() && !this.isClientFeedbackAction();
  }

  canShowDetailedDiscussion(): boolean {
    return [
      'reviewed_by_status',
      'responded_by_status',
      'signed_by_status',
      'client_project_manager_signed_by_status',
      'acknowledged_by_status',
    ].includes(String(this.actionType || ''));
  }

  openCommentDialog(): void {
    if (!this.recordId) {
      return;
    }

    const dialogRef = this.dialog.open(ConceptDesignCommentDialogComponent, {
      width: '95vw',
      maxWidth: '1000px',
      maxHeight: '90vh',
      height: '80vh',
      data: {
        recordId: this.recordId,
        reviewType: this.reviewDiscussionType,
        participants: this.getDiscussionParticipants(),
      },
      panelClass: 'custom-dialog-container',
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

  private getDiscussionParticipants(): DiscussionParticipant[] {
    const participants: DiscussionParticipant[] = [];
    const pushParticipant = (
      rawCode: unknown,
      workflowRole: string,
      authorRole: 'reviewer' | 'team'
    ) => {
      const code = String(rawCode ?? '').trim();
      if (
        !code ||
        participants.some(
          (participant) =>
            participant.code === code && participant.workflowRole === workflowRole
        )
      ) {
        return;
      }

      participants.push({
        code,
        name: this.getEmployeeLabel(code),
        workflowRole,
        authorRole,
      });
    };

    pushParticipant(
      pickValue(this.recordData, 'reviewedBy', 'reviewed_by'),
      'signed_by_tl',
      'reviewer'
    );
    pushParticipant(
      pickValue(this.recordData, 'signedBy', 'signed_by'),
      'signed_by_tl2',
      'reviewer'
    );
    pushParticipant(
      pickValue(
        this.recordData,
        'clientProjectManagerSignedBy',
        'client_project_manager_signed_by'
      ),
      'signed_by_tl2',
      'reviewer'
    );
    pushParticipant(
      pickValue(this.recordData, 'acknowledgedBy', 'acknowledged_by'),
      'acknowledged_by',
      'reviewer'
    );
    pushParticipant(
      pickValue(this.recordData, 'respondedBy', 'responded_by'),
      'responded_by',
      'team'
    );

    return participants;
  }

  get workflowSteps(): ApprovalWorkflowStep[] {
    const source = this.recordData ?? {};

    return [
      {
        key: 'reviewedBy',
        title: 'Reviewed By (TL/DL/VVE)',
        assignee: this.getEmployeeLabel(pickValue(source, 'reviewedBy', 'reviewed_by')),
        date: this.getWorkflowDate(source, 'reviewedByDate', 'reviewed_by_date'),
        status: this.getWorkflowStatus(source, 'reviewedByStatus', 'reviewed_by_status'),
      },
      {
        key: 'respondedBy',
        title: 'Responded By (PE/TE)',
        assignee: this.getEmployeeLabel(pickValue(source, 'respondedBy', 'responded_by')),
        date: this.getWorkflowDate(source, 'respondedByDate', 'responded_by_date'),
        status: this.getWorkflowStatus(source, 'respondedByStatus', 'responded_by_status'),
      },
      {
        key: 'signedBy',
        title: 'Signed By (TL/DL/VVE)',
        assignee: this.getEmployeeLabel(pickValue(source, 'signedBy', 'signed_by')),
        date: this.getWorkflowDate(source, 'signedByDate', 'signed_by_date'),
        status: this.getWorkflowStatus(source, 'signedByStatus', 'signed_by_status'),
      },
      {
        key: 'clientProjectManagerSignedBy',
        title: 'Signed By (TL/PE)',
        assignee: this.getEmployeeLabel(
          pickValue(
            source,
            'clientProjectManagerSignedBy',
            'client_project_manager_signed_by'
          )
        ),
        date: this.getWorkflowDate(
          source,
          'clientProjectManagerSignedByDate',
          'client_project_manager_signed_by_date'
        ),
        status: this.getWorkflowStatus(
          source,
          'clientProjectManagerSignedByStatus',
          'client_project_manager_signed_by_status'
        ),
      },
      {
        key: 'acknowledgedBy',
        title: 'Acknowledged By (DI)',
        assignee: this.getEmployeeLabel(pickValue(source, 'acknowledgedBy', 'acknowledged_by')),
        date: this.getWorkflowDate(source, 'acknowledgedByDate', 'acknowledged_by_date'),
        status: this.getWorkflowStatus(source, 'acknowledgedByStatus', 'acknowledged_by_status'),
      },
    ];
  }

  private getWorkflowDate(source: any, ...keys: string[]): string {
    return formatDateTimeNoSecondsDisplay(
      pickValue(source, ...keys) as string | Date | null | undefined
    );
  }

  private getWorkflowStatus(source: any, ...keys: string[]): string {
    return pickString(source, ...keys) || 'pending';
  }

  getActionTitle(): string {
    switch (this.actionType) {
      case 'reviewed_by_status':
        return 'Action Request: Review Checklist';
      case 'responded_by_status':
        return 'Action Request: Response Submission';
      case 'signed_by_status':
        return 'Action Request: Verify Recommended Actions';
      case 'client_project_manager_signed_by_status':
        return 'Action Request: Verify Client Feedback';
      case 'acknowledged_by_status':
        return 'Action Request: Director Acknowledgment';
      default:
        return 'Action Request: Engineering Audit Review';
    }
  }

  getActionDescription(): string {
    switch (this.actionType) {
      case 'reviewed_by_status':
        return 'Review the audit/study checklist and record recommended actions.';
      case 'responded_by_status':
        return 'Respond to the latest reviewer or verification feedback.';
      case 'signed_by_status':
        return 'Confirm whether recommended actions have been satisfactorily taken.';
      case 'client_project_manager_signed_by_status':
        return 'Confirm whether client or project manager feedback requires another response cycle.';
      case 'acknowledged_by_status':
        return 'Acknowledge the completed engineering audit review.';
      default:
        return 'Process this engineering audit review action request.';
    }
  }

  getStepLabel(): string {
    switch (this.actionType) {
      case 'reviewed_by_status':
        return 'Reviewed by';
      case 'responded_by_status':
        return 'Responded by';
      case 'signed_by_status':
      case 'client_project_manager_signed_by_status':
        return 'Signed by';
      case 'acknowledged_by_status':
        return 'Acknowledged by';
      default:
        return 'Action by';
    }
  }

  getCurrentAssigneeLabel(): string {
    const value = (() => {
      switch (this.actionType) {
        case 'reviewed_by_status':
          return pickValue(this.recordData, 'reviewedBy', 'reviewed_by');
        case 'responded_by_status':
          return pickValue(this.recordData, 'respondedBy', 'responded_by');
        case 'signed_by_status':
          return pickValue(this.recordData, 'signedBy', 'signed_by');
        case 'client_project_manager_signed_by_status':
          return pickValue(
            this.recordData,
            'clientProjectManagerSignedBy',
            'client_project_manager_signed_by'
          );
        case 'acknowledged_by_status':
          return pickValue(this.recordData, 'acknowledgedBy', 'acknowledged_by');
        default:
          return '';
      }
    })();

    return this.getEmployeeLabel(value);
  }

  getEmployeeLabel(value: unknown): string {
    const code = String(value ?? '').trim();
    if (!code || code === '-') {
      return '-';
    }

    const fromMap = this.employeeLookupMap.get(code);
    if (fromMap) {
      return fromMap;
    }

    const match = this.employeeOptions.find((option) => {
      return [option.code, option.id, option.employeeId]
        .map((candidate) => String(candidate ?? '').trim())
        .includes(code);
    });

    return match?.displayLabel ?? code;
  }

  getDisciplineDisplay(): string {
    const values = pickStringArray(this.recordData, 'discipline');
    const other = pickString(this.recordData, 'disciplineOther', 'discipline_other');
    if (!values.length) {
      return other || '-';
    }

    return values.map((value) => (value === 'Other' && other ? other : value)).join(', ');
  }

  getDocumentsReviewedDisplay(): string {
    const values = pickStringArray(
      this.recordData,
      'documentsReviewed',
      'documents_reviewed'
    );
    const other = pickString(
      this.recordData,
      'documentsReviewedOther',
      'documents_reviewed_other'
    );
    if (!values.length) {
      return other || '-';
    }

    return values.map((value) => (value === 'Other' && other ? other : value)).join(', ');
  }

  getBooleanDisplay(value: unknown): string {
    if (value === undefined || value === null || value === '') {
      return '-';
    }
    return asBoolean(value) ? 'Yes' : 'No';
  }

  formatDate(value: unknown): string {
    return formatDateDisplay(value as string | Date | null | undefined);
  }
}
