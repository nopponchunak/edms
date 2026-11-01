import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule, FormControl } from '@angular/forms';
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
import { SubmissionDesignCommentDialogComponent } from '../../submission-review/submission-review-action/submission-design-comment-dialog.component';
import { EmployeeOption, EmployeeService } from 'app/core/services/employee.service';
import {
  pickDate,
  pickString,
  pickStringArray,
  pickValue,
  mergeProjectReviewEmployeeLookup,
  projectReviewEmployeeLabelFromRecord,
  ProjectReviewApiService,
  serializeDatesDeep,
} from 'app/core/services/project-review-api.service';
import { formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import {
  DiscussionParticipant,
  ProjectReviewDiscussionService,
  ProjectReviewDiscussionType,
} from 'app/core/services/project-review-discussion.service';
import {
  ApprovalWorkflowComponent,
  ApprovalWorkflowStep,
} from 'app/core/components/approval-workflow';
import { ProjectReviewAttachmentsCardComponent } from 'app/core/components/project-review-attachments-card/project-review-attachments-card.component';
import { WorkflowEmailNotificationService, TENDER_CSA_REVIEW_EMAIL_CONFIG } from 'app/core/services/workflow-email-notification.service';
import { FuseConfirmationService } from '@fuse/services/confirmation';

export interface ReviewChecklistItem {
  id: string;
  question: string;
  type: string;
  required: boolean;
}

@Component({
  selector: 'app-tender-csa-review-action',
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
  templateUrl: './tender-csa-review-action.component.html',
  styleUrls: ['./tender-csa-review-action.component.scss'],
})
export class TenderCsaReviewActionComponent implements OnInit, OnDestroy {
  private readonly apiKey = 'tenderCsaReview' as const;
  private readonly reviewDiscussionType: ProjectReviewDiscussionType = 'tender_csa_review';
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

  tenderCsaReviewChecklist: ReviewChecklistItem[] = [
    { id: '1', question: 'Have all the comments been incorporated? (20 - FORM MTDD-01/02/03)', type: 'yes_no', required: true },
    { id: '2', question: 'Have comments from local authority been incorporated?', type: 'yes_no', required: true },
    { id: '3', question: 'Have all clashes between CSA/MEP/Specialist designers been resolved?', type: 'yes_no', required: true },
  ];

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
      note: [''],
      signedDate: [new Date()],
      checklistResponses: this.fb.array([]),
      reviewerForAction: [''],
      teamLeadForAction: [''],
      directorForAction: [''],
    });
  }

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.recordId = params['id'];
      this.actionType = params['type'];

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
          this.patchFormValues();
          this.refreshDiscussionCommentState();
        },
        error: (error) => {
          console.error('Error loading Tender Review CSA data:', error);
          this.snackBar.open('Failed to load Tender Review CSA data.', 'Close', { duration: 3000 });
        },
      });
  }

  private patchFormValues(): void {
    if (!this.recordData) return;

    // Build checklist form array
    const responses = this.recordData.checklist_responses || this.recordData.checklistResponses || [];
    this.checklistResponses.clear();

    this.tenderCsaReviewChecklist.forEach((item) => {
      const response = responses.find((r: any) => r.id === item.id);
      this.checklistResponses.push(
        this.fb.group({
          id: [item.id],
          question: [item.question],
          response: [response?.response || (item.type === 'yes_no' ? 'yes' : ''), []],
        })
      );
    });

    this.actionForm.patchValue({
      reviewerForAction: pickString(this.recordData, 'reviewer_for_action', 'reviewerForAction'),
      teamLeadForAction: pickString(this.recordData, 'team_lead_for_action', 'teamLeadForAction'),
      directorForAction: pickString(this.recordData, 'director_for_action', 'directorForAction'),
      status: this.getAutoDerivedStatus(),
      comments: this.recordData.signed_by_tl_note || this.recordData.acknowledged_by_d_i_note || this.recordData.comments || '',
      recommendedActions: pickValue(this.recordData, 'recommended_actions', 'recommendedActions') || '',
      recommendedActionsSatisfactorilyTaken: this.recordData.recommended_actions_satisfactorily_taken ?? false,
      note: this.recordData.note || '',
      signedDate: this.getCurrentActionDate() || new Date()
    });

    if (this.isCommentsLocked()) {
      this.actionForm.get('comments')?.disable();
    } else {
      this.actionForm.get('comments')?.enable();
    }

    if (this.isReviewerNotesLocked()) {
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
      this.actionForm.get('note')?.disable();
    } else {
      this.actionForm.get('recommendedActionsSatisfactorilyTaken')?.enable();
      this.actionForm.get('note')?.enable();
    }

    this.actionForm.get('status')?.enable();
    this.actionForm.get('signedDate')?.enable();
  }

  private getCurrentActionStatus(): string {
    if (!this.recordData || !this.actionType) return '';

    const paths = [this.actionType, this.toCamelCase(this.actionType)];
    if (this.actionType === 'reviewed_by_status') {
      paths.push('reviewed_by_tl_status', 'reviewed_by_t_l_status', 'reviewedByStatus');
    } else if (this.actionType.includes('signed_by_tl') || this.actionType.includes('signed_by_t_l')) {
      paths.push('signed_by_tl_status', 'signed_by_t_l_status', 'signedByTLStatus');
    } else if (this.actionType === 'acknowledged_by_status') {
      paths.push('acknowledged_by_d_i_status', 'acknowledgedByStatus');
    } else if (this.actionType === 'responded_by_status') {
      paths.push('respondedByStatus');
    }

    const status = pickString(this.recordData, ...paths) || '';
    return status.trim().toLowerCase();
  }

  private getCurrentActionDate(): Date | null {
    if (!this.recordData || !this.actionType) return null;
    const baseAction = this.actionType.replace('_status', '');
    const paths = [`${baseAction}_date`, `${this.toCamelCase(baseAction)}Date`];
    if (baseAction === 'reviewed_by') {
      paths.push('reviewed_by_tl_date', 'reviewed_by_t_l_date');
    } else if (baseAction === 'signed_by_tl' || baseAction === 'signed_by_t_l') {
      paths.push('signed_by_tl_date', 'signed_by_t_l_date');
    } else if (baseAction === 'acknowledged_by') {
      paths.push('acknowledged_by_d_i_date');
    } else if (baseAction === 'responded_by') {
      paths.push('respondedByDate');
    }
    return pickDate(this.recordData, ...paths) || null;
  }

  private toCamelCase(value: string): string {
    return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
  }

  getActionTitle(): string {
    switch (this.actionType) {
      case 'reviewed_by_status': return 'Action Request: Review Checklist';
      case 'responded_by_status': return 'Action Request: Response Submission';
      case 'signed_by_vve_status': return 'Action Request: VVE Signing';
      case 'signed_by_t_l_status':
      case 'signed_by_tl_status': return 'Action Request: Team Leader Signing';
      case 'acknowledged_by_status': return 'Action Request: Director Acknowledgment';
      default: return 'Action Request: Tender Review CSA';
    }
  }

  getActionDescription(): string {
    switch (this.actionType) {
      case 'reviewed_by_status': return 'Complete the review checklist and provide review comments.';
      case 'responded_by_status': return 'Please respond to the review comments before the signing step.';
      case 'signed_by_vve_status': return 'Please verify recommended actions and sign this Tender Review CSA.';
      case 'signed_by_t_l_status':
      case 'signed_by_tl_status': return 'Review and sign to approve the tender package.';
      case 'acknowledged_by_status': return 'Provide final acknowledgment for the Tender Review CSA.';
      default: return 'Please complete the required actions for this Tender Review CSA.';
    }
  }

  getButtonLabel(): string {
    switch (this.actionType) {
      case 'reviewed_by_status': return 'Submit Review';
      case 'responded_by_status': return 'Submit Response';
      case 'signed_by_vve_status': return 'Sign & Approve';
      case 'signed_by_t_l_status':
      case 'signed_by_tl_status': return 'Sign & Approve';
      case 'acknowledged_by_status': return 'Acknowledge';
      default: return 'Submit';
    }
  }

  getStepLabel(): string {
    const type = String(this.actionType || '');
    if (type.includes('reviewed_by')) return 'Reviewed by';
    if (type.includes('responded_by')) return 'Responded by';
    if (type.includes('signed_by')) return 'Signed by';
    if (type.includes('acknowledged_by')) return 'Acknowledged by';
    return 'Sign by';
  }

  onSubmit(): void {
    if (this.isReviewedApproved()) return;

    if (this.actionForm.invalid) {
      this.snackBar.open('Please fill in all required fields.', 'Close', { duration: 3000 });
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
    const baseAction = this.actionType?.replace('_status', '') || '';
    const effectiveStatus = this.getEffectiveStatus(raw);

    // Map status and date fields correctly
    const now = new Date();
    const selectedDate = new Date(raw.signedDate || now);
    selectedDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

    const updates: any = {
      [this.actionType!]: effectiveStatus,
      [`${baseAction}_date`]: selectedDate,
      [baseAction]: this.getCurrentAssigneeCode(),
    };

    // Standardize and sync all variants (tl vs t_l, d_i vs acknowledged_by)
    if (this.actionType?.includes('reviewed_by')) {
      updates['reviewed_by_status'] = effectiveStatus;
      updates['reviewed_by_tl_status'] = effectiveStatus;
      updates['reviewed_by_t_l_status'] = effectiveStatus;
      updates['reviewed_by_date'] = selectedDate;
      updates['reviewed_by_tl_date'] = selectedDate;
      updates['reviewed_by_t_l_date'] = selectedDate;
      updates['reviewed_by_note'] = raw.comments;
      updates['comments'] = raw.comments;

      if (effectiveStatus === 'approved') {
        updates.status = 'responded';
      }
    } else if (this.actionType?.includes('responded_by')) {
      updates['responded_by_status'] = effectiveStatus;
      updates['respondedByStatus'] = effectiveStatus;
      updates['responded_by_date'] = selectedDate;
      updates['respondedByDate'] = selectedDate;
      updates['responded_by'] = this.getCurrentAssigneeCode();
      updates['respondedBy'] = this.getCurrentAssigneeCode();
      updates['comments'] = raw.comments;
      if (effectiveStatus === 'approved') {
        updates.status = 'responded';
      }
    } else if (this.actionType?.includes('signed_by_vve') || this.actionType?.includes('signed_by_v_v_e')) {
      const p1 = 'signed_by_vve';
      const p2 = 'signed_by_v_v_e';

      updates[`${p1}_status`] = effectiveStatus;
      updates[`${p2}_status`] = effectiveStatus;
      updates[`${p1}_date`] = selectedDate;
      updates[`${p2}_date`] = selectedDate;
      updates[`${p1}_note`] = raw.comments;
      updates[`${p2}_note`] = raw.comments;
      updates['comments'] = raw.comments;

      if (effectiveStatus === 'approved') {
        updates.status = 'signed';
      }
    } else if (this.actionType?.includes('signed_by_tl') || this.actionType?.includes('signed_by_t_l')) {
      const p1 = 'signed_by_tl';
      const p2 = 'signed_by_t_l';

      updates[`${p1}_status`] = effectiveStatus;
      updates[`${p2}_status`] = effectiveStatus;
      updates[`${p1}_date`] = selectedDate;
      updates[`${p2}_date`] = selectedDate;
      updates[`${p1}_note`] = raw.comments;
      updates[`${p2}_note`] = raw.comments;
      updates['comments'] = raw.comments;

      if (effectiveStatus === 'approved') {
        updates.status = 'signed';
      }
    } else if (this.actionType?.includes('acknowledged_by')) {
      updates['acknowledged_by_status'] = effectiveStatus;
      updates['acknowledged_by_d_i_status'] = effectiveStatus;
      updates['acknowledged_by_date'] = selectedDate;
      updates['acknowledged_by_d_i_date'] = selectedDate;
      updates['acknowledged_by_d_i_note'] = raw.comments;
      updates['acknowledged_by_note'] = raw.comments;
      updates['comments'] = raw.comments;

      if (effectiveStatus === 'approved') {
        updates.status = 'acknowledged';
      }
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
      updates[this.actionType!] = 'pending';
      updates[`${baseAction}_date`] = null;
      updates['status'] = 'responded';
    }

    const payload = serializeDatesDeep({
      ...this.recordData,
      ...updates,
      recommendedActions: raw.recommendedActions,
      recommended_actions: raw.recommendedActions,
      recommended_actions_satisfactorily_taken: raw.recommendedActionsSatisfactorilyTaken,
      note: raw.note,
      reviewer_for_action: raw.reviewerForAction,
      team_lead_for_action: raw.teamLeadForAction,
      director_for_action: raw.directorForAction,
      checklist_responses: this.tenderCsaReviewChecklist.map((item, index) => ({
        id: item.id,
        question: item.question,
        response: raw.checklistResponses[index]?.response ?? '',
      })),
    });

    this.projectReviewApi
      .update(this.apiKey, this.recordId!, serializeDatesDeep(payload))
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          this.snackBar.open('Tender review updated successfully.', 'Close', { duration: 3000 });
          this.router.navigate(['/tender/csa/review']);

          // Trigger email notification for the next action step or status update
          const emailStatus = this.shouldReturnToResponder(raw) ? 'returned' : payload[this.actionType!];
          this.workflowEmailNotificationService.notifyAfterAction(
            TENDER_CSA_REVIEW_EMAIL_CONFIG,
            payload,
            this.actionType!,
            emailStatus
          ).subscribe({
            next: () => console.log('Action notification sent successfully'),
            error: (err) => console.error('Error sending action notification:', err)
          });
        },
        error: (error) => {
          console.error('Error updating Tender Review CSA:', error);
          this.snackBar.open('Failed to update Tender Review CSA.', 'Close', { duration: 3000 });
        },
      });

    });
  }

  get workflowSteps(): ApprovalWorkflowStep[] {
    const source = this.recordData ?? {};

    return [
      {
        key: 'reviewedBy',
        title: 'Approved By Reviewer',
        assignee: this.getEmployeeLabel(source.reviewed_by || source.reviewedBy || source.reviewer_for_action),
        date: this.getWorkflowDate(source, 'reviewedByDate', 'reviewed_by_date', 'reviewed_by_tl_date', 'reviewed_by_t_l_date'),
        status: this.getWorkflowStatus(source, 'reviewed_by_tl_status', 'reviewed_by_t_l_status', 'reviewedByStatus', 'reviewed_by_status'),
      },
      {
        key: 'respondedBy',
        title: 'Responded By',
        assignee: this.getEmployeeLabel(source.responded_by || source.respondedBy || source.prepared_by || source.preparedBy),
        date: this.getWorkflowDate(source, 'respondedByDate', 'responded_by_date'),
        status: this.getWorkflowStatus(source, 'respondedByStatus', 'responded_by_status'),
      },
      {
        key: 'signedByVVE',
        title: 'Approved By Reviewer',
        assignee: this.getEmployeeLabel(source.signed_by_vve || source.signed_by_v_v_e || source.signedByVVE || source.reviewer_for_action || source.reviewed_by),
        date: this.getWorkflowDate(source, 'signedByVVEDate', 'signed_by_vve_date', 'signed_by_v_v_e_date'),
        status: this.getWorkflowStatus(source, 'signedByVVEStatus', 'signed_by_vve_status', 'signed_by_v_v_e_status'),
      },
      {
        key: 'signedByTL',
        title: 'Approved By TL',
        assignee: this.getEmployeeLabel(source.signed_by_tl || source.signed_by_t_l || source.signedByTL || source.team_lead_for_action),
        date: this.getWorkflowDate(source, 'signedByTLDate', 'signed_by_tl_date', 'signed_by_t_l_date'),
        status: this.getWorkflowStatus(source, 'signedByTLStatus', 'signed_by_tl_status', 'signed_by_t_l_status'),
      },
      {
        key: 'acknowledgedBy',
        title: 'Acknowledged By (DI)',
        assignee: this.getEmployeeLabel(source.acknowledged_by_d_i || source.acknowledged_by || source.acknowledgedBy || source.director_for_action),
        date: this.getWorkflowDate(source, 'acknowledgedByDate', 'acknowledged_by_d_i_date', 'acknowledged_by_date'),
        status: this.getWorkflowStatus(source, 'acknowledgedByStatus', 'acknowledged_by_d_i_status', 'acknowledged_by_status'),
      },
    ];
  }

  private getWorkflowDate(source: any, ...keys: string[]): string {
    return formatDateTimeDisplay(pickValue(source, ...keys));
  }

  private getWorkflowStatus(source: any, ...keys: string[]): string {
    return pickString(source, ...keys) || 'pending';
  }

  isReviewedApproved(): boolean {
    const status = this.getCurrentActionStatus();
    return status === 'approved' || status === 'approve';
  }

  isChecklistLocked(): boolean {
    if (this.actionType !== 'reviewed_by_status') return true;
    return this.isReviewedApproved();
  }

  isCommentsLocked(): boolean {
    const type = String(this.actionType || '');
    const canEditComments = type === 'reviewed_by_status';
    return !canEditComments || this.isReviewedApproved();
  }

  isReviewerNotesLocked(): boolean {
    return this.actionType !== 'reviewed_by_status' || this.isReviewedApproved();
  }

  canShowDetailedDiscussion(): boolean {
    const type = String(this.actionType || '');
    return ['reviewed_by_status', 'responded_by_status', 'signed_by_vve_status', 'signed_by_tl_status', 'signed_by_t_l_status'].includes(type) || this.isReviewedApproved();
  }

  isRecommendedActionsLocked(): boolean {
    return !this.isFirstVVEAction() || this.isReviewedApproved();
  }

  isTLAction(): boolean {
    const type = String(this.actionType || '');
    return type.includes('signed_by_tl') || type.includes('signed_by_t_l') || type.includes('signed_by_vve') || type.includes('acknowledged_by');
  }

  isFirstVVEAction(): boolean {
    const type = String(this.actionType || '');
    return type === 'signed_by_vve_status' || type === 'signed_by_v_v_e_status';
  }

  showStatusDropdown(): boolean {
    return !this.isFirstVVEAction();
  }

  isFirstTLAction(): boolean {
    const type = String(this.actionType || '');
    return type === 'signed_by_tl_status' || type === 'signed_by_t_l_status';
  }

  private shouldReturnToResponder(raw: any): boolean {
    if (String(raw?.status || '').trim().toLowerCase() === 'rejected') {
      return false;
    }

    const actionsTaken = String(raw?.recommendedActionsSatisfactorilyTaken ?? '').trim().toLowerCase();
    return this.isFirstVVEAction() && (actionsTaken === 'no' || actionsTaken === 'false');
  }

  private getEffectiveStatus(raw: any): string {
    if (!this.isFirstVVEAction()) {
      return String(raw?.status || '').trim().toLowerCase();
    }

    const selectedStatus = String(raw?.status || '').trim().toLowerCase();
    if (selectedStatus === 'rejected') {
      return 'rejected';
    }

    const actionsTaken = String(raw?.recommendedActionsSatisfactorilyTaken ?? '').trim().toLowerCase();
    if (actionsTaken === 'yes' || actionsTaken === 'true') {
      return 'approved';
    }

    return 'pending';
  }

  private getAutoDerivedStatus(): string {
    if (!this.isFirstVVEAction()) {
      return this.getCurrentActionStatus() || 'pending';
    }

    const actionsTaken = String(
      pickValue(
        this.recordData,
        'recommended_actions_satisfactorily_taken',
        'recommendedActionsSatisfactorilyTaken'
      ) ?? ''
    )
      .trim()
      .toLowerCase();

    if (actionsTaken === 'yes' || actionsTaken === 'true') {
      return 'approved';
    }

    return 'pending';
  }

  getCurrentAssignee(): string {
    return this.getCurrentAssigneeCode();
  }

  private getCurrentAssigneeCode(): string {
    if (!this.recordData) return '';
    const baseAction = this.actionType?.replace('_status', '') || '';

    // Check variants for assignee
    const paths = [baseAction];
    if (baseAction.includes('signed_by_tl') || baseAction.includes('signed_by_t_l')) {
      paths.push('signed_by_tl', 'signed_by_t_l', 'signedByTL', 'team_lead_for_action');
    } else if (baseAction === 'reviewed_by') {
      paths.push('reviewed_by', 'reviewed_by_tl', 'reviewed_by_t_l', 'reviewedBy', 'reviewer_for_action');
    } else if (baseAction === 'responded_by') {
      paths.push('responded_by', 'respondedBy', 'prepared_by', 'preparedBy');
    } else if (baseAction === 'acknowledged_by') {
      paths.push('acknowledged_by', 'acknowledged_by_d_i', 'acknowledgedBy', 'director_for_action');
    }

    return pickString(this.recordData, ...paths);
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

    const fromRecord = projectReviewEmployeeLabelFromRecord(this.recordData, value);
    if (fromRecord) return fromRecord;

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

  openCommentDialog(): void {
    const dialogRef = this.dialog.open(SubmissionDesignCommentDialogComponent, {
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
    pushParticipant(this.recordData?.acknowledged_by || this.recordData?.acknowledgedBy, 'acknowledged_by', 'reviewer');
    pushParticipant(this.recordData?.reviewed_by || this.recordData?.reviewedBy, 'reviewed_by', 'reviewer');
    pushParticipant(this.recordData?.responded_by || this.recordData?.respondedBy, 'responded_by', 'team');

    return participants;
  }
}
