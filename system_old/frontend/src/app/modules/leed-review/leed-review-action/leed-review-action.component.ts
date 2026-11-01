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
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
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
import { formatDateTimeNoSecondsDisplay } from 'app/core/utils/date-format.util';
import { WorkflowEmailNotificationService, LEED_REVIEW_EMAIL_CONFIG } from 'app/core/services/workflow-email-notification.service';
import { FuseConfirmationService } from '@fuse/services/confirmation';

interface LeedChecklistItem {
  id: string;
  question: string;
}

type LeedActionType =
  | 'reviewed_by_status'
  | 'responded_by_status'
  | 'signed_by_status'
  | 'signed_by_tl_status'
  | 'acknowledged_by_status';

@Component({
  selector: 'app-leed-review-action',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatDatepickerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    MatSelectModule,
    MatSnackBarModule,
    ApprovalWorkflowComponent,
  ],
  templateUrl: './leed-review-action.component.html',
  styleUrls: ['./leed-review-action.component.scss'],
})
export class LeedReviewActionComponent implements OnInit, OnDestroy {
  private readonly apiKey = 'leedReview' as const;
  private readonly reviewDiscussionType: ProjectReviewDiscussionType =
    'leed_review';
  private readonly destroy$ = new Subject<void>();

  readonly checklistItems: LeedChecklistItem[] = [
    {
      id: '1',
      question:
        "Does the feasibility study meet the client's certification target?",
    },
    {
      id: '2',
      question:
        'Are the LEED credits and Pre-requisites pursued regarding to the latest Scorecard?',
    },
    {
      id: '3',
      question:
        'Are all LEED submittal (LEED credit forms, drawings, calculations) filled in with compliance checked?',
    },
    {
      id: '4',
      question:
        'Are all signatory confirmations endorsed by the authorized person as LEED required?',
    },
    {
      id: '5',
      question:
        'Are all design inputs in proposed energy model consistent with current design, and baseline energy model input consistent with ASHRAE 90.1 appendix G?',
    },
    {
      id: '6',
      question:
        "Can the total LEED score achieve the client's certification target?",
    },
  ];

  actionForm: FormGroup;
  loading = false;
  recordId: string | null = null;
  actionType: LeedActionType | null = null;
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
      checklistResponses: this.fb.array([]),
      comments: [''],
      recommendedActions: [''],
      nonConformanceToQP: [''],
      recommendedActionsSatisfactorilyTaken: [''],
      recommendedActionsNote: [''],
    });
  }

  ngOnInit(): void {
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
          console.error('Error loading leed review action:', error);
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
      const matched = responses.find(
        (response: any) => String(response?.id ?? '') === item.id
      );
      this.checklistResponses.push(
        this.fb.control(
          matched?.response ?? matched?.value ?? responses[index]?.response ?? ''
        )
      );
    });

    this.actionForm.patchValue(
      {
        status: this.getCurrentActionStatus() || 'approved',
        signedDate:
          pickDate(this.recordData, ...this.getCurrentActionDatePaths()) ||
          new Date(),
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
          pickString(
            this.recordData,
            'reviewerFollowUpNote',
            'reviewer_follow_up_note'
          ) || pickString(this.recordData, 'note'),
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
          this.router.navigate(['/leed-review']);

          // Trigger email notification for the next action step or status update
          this.workflowEmailNotificationService.notifyAfterAction(
            LEED_REVIEW_EMAIL_CONFIG,
            payload,
            this.actionType!,
            payload[this.actionType!]
          ).subscribe({
            error: (err) => console.error('Error sending action notification:', err)
          });
        },
        error: (error) => {
          console.error('Error updating leed review action:', error);
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
      case 'signed_by_tl_status':
        return this.buildTLUpdates(raw, selectedDate);
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
    const actionsTaken = String(
      raw.recommendedActionsSatisfactorilyTaken || ''
    )
      .trim()
      .toLowerCase();
    const updates: any = {
      recommendedActionsSatisfactorilyTaken: actionsTaken === 'yes',
      recommended_actions_satisfactorily_taken: actionsTaken === 'yes',
      reviewerFollowUpNote: raw.recommendedActionsNote,
      reviewer_follow_up_note: raw.recommendedActionsNote,
      note: raw.recommendedActionsNote,
    };

    if (actionsTaken === 'no') {
      this.applyFullActionLoopReset(updates);
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

  private buildTLUpdates(raw: any, selectedDate: Date): any {
    const status = String(raw.status || 'approved').trim().toLowerCase();
    const approved = this.isApprovedStatus(status);
    return {
      status: 'tl_review',
      signedByTLStatus: status,
      signed_by_tl_status: status,
      signedByTLDate: approved ? selectedDate : null,
      signed_by_tl_date: approved ? selectedDate : null,
      tlReviewDate: approved ? selectedDate : null,
      tl_review_date: approved ? selectedDate : null,
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
      signedByStatus: 'returned',
      signed_by_status: 'returned',
      signedByDate: null,
      signed_by_date: null,
      reviewerFollowUpDate: null,
      reviewer_follow_up_date: null,
      signedByTLStatus: 'pending',
      signed_by_tl_status: 'pending',
      signedByTLDate: null,
      signed_by_tl_date: null,
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

    this.setControlState('comments', false);
    this.setControlState('recommendedActions', false);
    this.setControlState('nonConformanceToQP', false);
    this.setControlState('recommendedActionsSatisfactorilyTaken', false);
    this.setControlState('recommendedActionsNote', false);

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
    }

    statusControl?.updateValueAndValidity({ emitEvent: false });
    dateControl?.updateValueAndValidity({ emitEvent: false });
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
      case 'signed_by_tl_status':
        return ['signedByTLStatus', 'signed_by_tl_status'];
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
        return [
          'respondedByDate',
          'responded_by_date',
          'peResponseDate',
          'pe_response_date',
        ];
      case 'signed_by_status':
        return [
          'signedByDate',
          'signed_by_date',
          'reviewerFollowUpDate',
          'reviewer_follow_up_date',
        ];
      case 'signed_by_tl_status':
        return [
          'signedByTLDate',
          'signed_by_tl_date',
          'tlReviewDate',
          'tl_review_date',
        ];
      case 'acknowledged_by_status':
        return [
          'acknowledgedByDate',
          'acknowledged_by_date',
          'diAcknowledgeDate',
          'di_acknowledge_date',
        ];
      default:
        return [];
    }
  }

  private normalizeActionType(value: unknown): LeedActionType | null {
    const normalized = String(value || '').trim() as LeedActionType;
    return [
      'reviewed_by_status',
      'responded_by_status',
      'signed_by_status',
      'signed_by_tl_status',
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

  isTLAction(): boolean {
    return this.actionType === 'signed_by_tl_status';
  }

  isAcknowledgedAction(): boolean {
    return this.actionType === 'acknowledged_by_status';
  }

  canShowStatusSelect(): boolean {
    return !this.isSignedAction();
  }

  canShowDetailedDiscussion(): boolean {
    return !!this.actionType;
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

    const data = this.recordData;
    pushParticipant(data?.preparedBy ?? data?.prepared_by, 'prepared_by', 'team');
    pushParticipant(data?.reviewedBy ?? data?.reviewed_by, 'reviewed_by', 'reviewer');
    pushParticipant(data?.respondedBy ?? data?.responded_by, 'responded_by', 'team');
    pushParticipant(data?.signedBy ?? data?.signed_by, 'signed_by', 'reviewer');
    pushParticipant(data?.signedByTL ?? data?.signed_by_tl, 'signed_by_tl', 'reviewer');
    pushParticipant(data?.acknowledgedBy ?? data?.acknowledged_by, 'acknowledged_by', 'reviewer');

    return participants;
  }

  getEmployeeLabel(code: string): string {
    return this.employeeLookupMap.get(code) || code;
  }

  get workflowSteps(): ApprovalWorkflowStep[] {
    const source = this.recordData ?? {};

    return [
      {
        key: 'reviewedBy',
        title: 'Reviewed By (DI/TL/VVE)',
        assignee: this.getWorkflowAssignee(source, 'reviewedBy', 'reviewed_by'),
        date: this.getWorkflowDate(source, 'reviewedByDate', 'reviewed_by_date'),
        status: this.getWorkflowStatus(source, 'reviewedByStatus', 'reviewed_by_status'),
      },
      {
        key: 'respondedBy',
        title: 'Responded By (PE/TE)',
        assignee: this.getWorkflowAssignee(source, 'respondedBy', 'responded_by'),
        date: this.getWorkflowDate(source, 'respondedByDate', 'responded_by_date'),
        status: this.getWorkflowStatus(source, 'respondedByStatus', 'responded_by_status'),
      },
      {
        key: 'signedBy',
        title: 'Signed By (DI/TL/VVE)',
        assignee: this.getWorkflowAssignee(source, 'signedBy', 'signed_by'),
        date: this.getWorkflowDate(source, 'signedByDate', 'signed_by_date'),
        status: this.getWorkflowStatus(source, 'signedByStatus', 'signed_by_status'),
      },
      {
        key: 'signedByTL',
        title: 'Signed By (TL)',
        assignee: this.getWorkflowAssignee(source, 'signedByTL', 'signed_by_tl'),
        date: this.getWorkflowDate(source, 'signedByTLDate', 'signed_by_tl_date'),
        status: this.getWorkflowStatus(source, 'signedByTLStatus', 'signed_by_tl_status'),
      },
      {
        key: 'acknowledgedBy',
        title: 'Acknowledged By (DI)',
        assignee: this.getWorkflowAssignee(source, 'acknowledgedBy', 'acknowledged_by'),
        date: this.getWorkflowDate(source, 'acknowledgedByDate', 'acknowledged_by_date'),
        status: this.getWorkflowStatus(source, 'acknowledgedByStatus', 'acknowledged_by_status'),
      },
    ];
  }

  private getWorkflowAssignee(source: any, ...keys: string[]): string {
    const code = String(pickValue(source, ...keys) ?? '').trim();
    return code ? this.getEmployeeLabel(code) : '-';
  }

  private getWorkflowDate(source: any, ...keys: string[]): string {
    return formatDateTimeNoSecondsDisplay(pickValue(source, ...keys) as string | Date | null | undefined);
  }

  private getWorkflowStatus(source: any, ...keys: string[]): string {
    return pickString(source, ...keys) || 'pending';
  }

  getActionTitle(): string {
    switch (this.actionType) {
      case 'reviewed_by_status':
        return 'Review Action';
      case 'responded_by_status':
        return 'Response Submission';
      case 'signed_by_status':
        return 'Reviewer Follow-up';
      case 'signed_by_tl_status':
        return 'Team Lead Review';
      case 'acknowledged_by_status':
        return 'DI Acknowledgment';
      default:
        return 'Action Request';
    }
  }

  getActionDescription(): string {
    return 'Update the status and details for this LEED review workflow step.';
  }

  getStepLabel(): string {
    switch (this.actionType) {
      case 'reviewed_by_status':
        return 'Reviewed By';
      case 'responded_by_status':
        return 'Responded By';
      case 'signed_by_status':
        return 'Signed By';
      case 'signed_by_tl_status':
        return 'Signed By TL';
      case 'acknowledged_by_status':
        return 'Acknowledged By';
      default:
        return 'Assignee';
    }
  }

  getCurrentAssigneeLabel(): string {
    const code = this.getCurrentAssigneeCode();
    return this.getEmployeeLabel(code);
  }

  private getCurrentAssigneeCode(): string {
    const data = this.recordData;
    switch (this.actionType) {
      case 'reviewed_by_status':
        return data?.reviewedBy ?? data?.reviewed_by;
      case 'responded_by_status':
        return data?.respondedBy ?? data?.responded_by;
      case 'signed_by_status':
        return data?.signedBy ?? data?.signed_by;
      case 'signed_by_tl_status':
        return data?.signedByTL ?? data?.signed_by_tl;
      case 'acknowledged_by_status':
        return data?.acknowledgedBy ?? data?.acknowledged_by;
      default:
        return '';
    }
  }
}
