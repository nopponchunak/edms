import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule, FormControl } from '@angular/forms';
import { ApprovalWorkflowComponent, ApprovalWorkflowStep } from '../../../core/components/approval-workflow';
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
  ProjectReviewApiService,
  serializeDatesDeep,
} from 'app/core/services/project-review-api.service';
import { formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import {
  DiscussionParticipant,
  ProjectReviewDiscussionService,
  ProjectReviewDiscussionType,
} from 'app/core/services/project-review-discussion.service';
import { ProjectReviewAttachmentsCardComponent } from 'app/core/components/project-review-attachments-card/project-review-attachments-card.component';
import { WorkflowEmailNotificationService, CONSTRUCTION_VALIDATION_EMAIL_CONFIG } from 'app/core/services/workflow-email-notification.service';
import { FuseConfirmationService } from '@fuse/services/confirmation';

export interface ReviewChecklistItem {
  id: string;
  question: string;
  type: string;
  required: boolean;
}

@Component({
  selector: 'app-construction-validation-action',
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
  templateUrl: './construction-validation-action.component.html',
  styleUrls: ['./construction-validation-action.component.scss'],
})
export class ConstructionValidationActionComponent implements OnInit, OnDestroy {
  private readonly apiKey = 'constructionValidation' as const;
  private readonly reviewDiscussionType: ProjectReviewDiscussionType = 'construction_validation';
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

  constructionValidationChecklist: ReviewChecklistItem[] = [
    {
      id: '1',
      question: 'Have all the comments been incorporated? (20 - FORM MTDD-01/02/03/04)',
      type: 'yes_no',
      required: true,
    },
    {
      id: '2',
      question: 'Have the Client/PM/CM/Contractor comments been incorporated?',
      type: 'yes_no',
      required: true,
    },
    {
      id: '3',
      question: 'If yes to item 2 above, is a Project Managers Instruction required?',
      type: 'yes_no',
      required: true,
    },
  ];

  statusOptions = [
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
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
          console.error('Error loading construction validation data:', error);
          this.snackBar.open('Failed to load construction validation data.', 'Close', { duration: 3000 });
        },
      });
  }

  private patchFormValues(): void {
    if (!this.recordData) return;

    // Build checklist form array
    const responses = this.recordData.checklist_responses || this.recordData.checklistResponses || [];
    this.checklistResponses.clear();

    this.constructionValidationChecklist.forEach((item) => {
      const response = responses.find((r: any) => r.id === item.id);
      this.checklistResponses.push(
        this.fb.group({
          id: [item.id],
          question: [item.question],
          response: [response?.response || 'yes', []],
        })
      );
    });

    this.actionForm.patchValue({
      reviewerForAction: pickString(this.recordData, 'reviewer_for_action', 'reviewerForAction'),
      teamLeadForAction: pickString(this.recordData, 'team_lead_for_action', 'teamLeadForAction'),
      directorForAction: pickString(this.recordData, 'director_for_action', 'directorForAction'),
      status: this.getAutoDerivedStatus(),
      comments: this.recordData.comments || '',
      recommendedActions: pickValue(this.recordData, 'recommended_actions', 'recommendedActions') || '',
      recommendedActionsSatisfactorilyTaken: this.recordData.recommended_actions_satisfactorily_taken ?? false,
      note: this.recordData.note || '',
      signedDate: this.getCurrentActionDate() || new Date()
    });

    if (this.isChecklistLocked()) {
      this.actionForm.get('comments')?.disable();
      this.actionForm.get('recommendedActions')?.disable();
      this.checklistResponses.controls.forEach((control) => control.disable());
    } else {
      this.actionForm.get('comments')?.enable();
      this.actionForm.get('recommendedActions')?.enable();
      this.checklistResponses.controls.forEach((control) => control.enable());
    }

    if (this.isRecommendedActionsLocked()) {
      this.actionForm.get('recommendedActionsSatisfactorilyTaken')?.disable();
      this.actionForm.get('note')?.disable();
    } else {
      this.actionForm.get('recommendedActionsSatisfactorilyTaken')?.enable();
      this.actionForm.get('note')?.enable();
    }

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

    const statusControl = this.actionForm.get('status');
    if (this.isFirstTLAction()) {
      statusControl?.disable();
    } else {
      statusControl?.enable();
    }
    this.actionForm.get('signedDate')?.enable();
  }

  private getCurrentActionStatus(): string {
    if (!this.recordData || !this.actionType) return '';
    const status = pickString(this.recordData, this.actionType, this.toCamelCase(this.actionType)) || '';
    return status.trim().toLowerCase();
  }

  private getCurrentActionDate(): Date | null {
    if (!this.recordData || !this.actionType) return null;
    const baseAction = this.actionType.replace('_status', '');
    return pickDate(this.recordData, `${baseAction}_date`, `${this.toCamelCase(baseAction)}Date`) || null;
  }

  private toCamelCase(value: string): string {
    return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
  }

  getActionTitle(): string {
    switch (this.actionType) {
      case 'completed_by_status': return 'Action Request: Review Checklist';
      case 'responded_by_status': return 'Action Request: Response Submission';
      case 'signed_by_tl_status':
      case 'signed_by_t_l_status': return 'Action Request: Team Leader Approval';
      case 'acknowledged_by_tl_status': return 'Action Request: Team Leader Approval';
      case 'acknowledged_by_di_status':
      case 'acknowledged_by_status': return 'Action Request: Director Acknowledgment';
      default: return 'Action Request: Construction Validation';
    }
  }

  getStepLabel(): string {
    const type = String(this.actionType || '');
    if (type.includes('completed_by')) return 'Approved By Reviewer';
    if (type.includes('responded_by')) return 'Responded By';
    if (type.includes('signed_by_tl') || type.includes('signed_by_t_l')) return 'Approved By Reviewer';
    if (type.includes('acknowledged_by_tl') || type.includes('acknowledged_by_t_l')) return 'Approved By TL';
    if (type.includes('acknowledged_by')) return 'Acknowledged By (DI)';
    return 'Sign By';
  }

  getActionDescription(): string {
    switch (this.actionType) {
      case 'completed_by_status': return 'Complete the validation checklist and assign the next person.';
      case 'responded_by_status': return 'Provide response to the validation checklist.';
      case 'signed_by_tl_status':
      case 'signed_by_t_l_status': return 'Review and sign to approve the validation package.';
      case 'acknowledged_by_tl_status': return 'Provide acknowledgment for the construction validation.';
      case 'acknowledged_by_di_status':
      case 'acknowledged_by_status': return 'Provide final acknowledgment for the construction validation.';
      default: return 'Please complete the required actions for this construction validation.';
    }
  }

  getButtonLabel(): string {
    switch (this.actionType) {
      case 'completed_by_status': return 'Approve By Reviewer';
      case 'responded_by_status': return 'Submit Response';
      case 'signed_by_tl_status':
      case 'signed_by_t_l_status': return 'Approve By Reviewer';
      case 'acknowledged_by_tl_status': return 'Approve By TL';
      case 'acknowledged_by_di_status':
      case 'acknowledged_by_status': return 'Acknowledge';
      default: return 'Submit';
    }
  }

  onSubmit(): void {
    if (this.isReviewedApproved()) return;

    if (this.actionForm.invalid) {
      this.snackBar.open('Please fill in all required fields.', 'Close', { duration: 3000 });
      return;
    }

    const raw = this.actionForm.getRawValue();

    if (this.isFirstTLAction() && String(raw?.status || '').trim().toLowerCase() !== 'rejected' && !this.hasRecommendedActionsDecision()) {
      this.snackBar.open('Please select whether the recommended actions have been satisfactorily taken.', 'Close', {
        duration: 3000,
      });
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
    const baseAction = this.actionType?.replace('_status', '') || '';

    const now = new Date();
    const selectedDate = new Date(raw.signedDate || now);
    selectedDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
    const effectiveStatus = this.getEffectiveStatus(raw);

    const updates: any = {
      [this.actionType!]: effectiveStatus,
      [`${baseAction}_date`]: selectedDate,
      [baseAction]: this.getCurrentAssigneeCode(),
    };

    if (this.actionType === 'completed_by_status') {
      updates['completed_by_status'] = effectiveStatus;
      updates['completedByStatus'] = effectiveStatus;
      updates['completed_by_date'] = selectedDate;
      updates['completedByDate'] = selectedDate;

      if (effectiveStatus === 'approved') {
        updates.status = 'responded';
      }
    } else if (this.actionType === 'responded_by_status') {
      updates['responded_by_status'] = effectiveStatus;
      updates['respondedByStatus'] = effectiveStatus;
      updates['responded_by_date'] = selectedDate;
      updates['respondedByDate'] = selectedDate;
      updates['responded_by'] = this.getCurrentAssigneeCode();
      updates['respondedBy'] = this.getCurrentAssigneeCode();

      if (effectiveStatus === 'approved') {
        updates.status = 'responded';
      }
    } else if (this.actionType?.includes('signed_by_tl') || this.actionType?.includes('signed_by_t_l')) {
      updates['signed_by_tl_status'] = effectiveStatus;
      updates['signed_by_t_l_status'] = effectiveStatus;
      updates['signedByTLStatus'] = effectiveStatus;
      updates['signed_by_tl_date'] = selectedDate;
      updates['signed_by_t_l_date'] = selectedDate;
      updates['signedByTLDate'] = selectedDate;

      if (effectiveStatus === 'approved') {
        updates.status = 'signed';
      }
    } else if (this.actionType?.includes('acknowledged_by_tl')) {
      updates['acknowledged_by_tl_status'] = effectiveStatus;
      updates['acknowledged_by_t_l_status'] = effectiveStatus;
      updates['acknowledgedByTLStatus'] = effectiveStatus;
      updates['acknowledged_by_tl_date'] = selectedDate;
      updates['acknowledged_by_t_l_date'] = selectedDate;
      updates['acknowledgedByTLDate'] = selectedDate;

      if (effectiveStatus === 'approved') {
        updates.status = 'acknowledged';
      }
    } else if (this.actionType?.includes('acknowledged_by_di') || this.actionType === 'acknowledged_by_status') {
      updates['acknowledged_by_di_status'] = effectiveStatus;
      updates['acknowledged_by_d_i_status'] = effectiveStatus;
      updates['acknowledgedByDIStatus'] = effectiveStatus;
      updates['acknowledged_by_di_date'] = selectedDate;
      updates['acknowledged_by_d_i_date'] = selectedDate;
      updates['acknowledgedByDIDate'] = selectedDate;
      updates['acknowledged_by_status'] = effectiveStatus;

      if (effectiveStatus === 'approved') {
        updates.status = 'completed';
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
      updates.status = 'responded';
    }

    const payload = serializeDatesDeep({
      ...this.recordData,
      ...updates,
      comments: raw.comments,
      recommendedActions: raw.recommendedActions,
      recommended_actions: raw.recommendedActions,
      recommendedActionsSatisfactorilyTaken: raw.recommendedActionsSatisfactorilyTaken,
      recommended_actions_satisfactorily_taken: raw.recommendedActionsSatisfactorilyTaken,
      note: raw.note,
      reviewer_for_action: raw.reviewerForAction,
      team_lead_for_action: raw.teamLeadForAction,
      director_for_action: raw.directorForAction,
      checklist_responses: this.constructionValidationChecklist.map((item, index) => ({
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
          this.snackBar.open('Construction validation updated successfully.', 'Close', { duration: 3000 });
          this.router.navigate(['/construction-validation']);

          // Trigger email notification for the next action step or status update
          const emailStatus = this.shouldReturnToResponder(raw) ? 'returned' : payload[this.actionType!];
          this.workflowEmailNotificationService.notifyAfterAction(
            CONSTRUCTION_VALIDATION_EMAIL_CONFIG,
            payload,
            this.actionType!,
            emailStatus
          ).subscribe({
            next: () => console.log('Action notification sent successfully'),
            error: (err) => console.error('Error sending action notification:', err)
          });
        },
        error: (error) => {
          console.error('Error updating construction validation:', error);
          this.snackBar.open('Failed to update construction validation.', 'Close', { duration: 3000 });
        },
      });

    });
  }

  get workflowSteps(): ApprovalWorkflowStep[] {
    const source = this.recordData ?? {};

    return [
      {
        key: 'completedBy',
        title: 'Approved By Reviewer',
        assignee: this.getEmployeeLabel(source.completed_by || source.completedBy),
        date: this.getWorkflowDate(source, 'completedByDate', 'completed_by_date'),
        status: this.getWorkflowStatus(source, 'completedByStatus', 'completed_by_status'),
      },
      {
        key: 'respondedBy',
        title: 'Responded By',
        assignee: this.getEmployeeLabel(source.responded_by || source.respondedBy),
        date: this.getWorkflowDate(source, 'respondedByDate', 'responded_by_date'),
        status: this.getWorkflowStatus(source, 'respondedByStatus', 'responded_by_status'),
      },
      {
        key: 'signedByTL',
        title: 'Approved By Reviewer',
        assignee: this.getEmployeeLabel(source.signed_by_tl || source.signedByTL || source.signed_by_t_l),
        date: this.getWorkflowDate(source, 'signedByTLDate', 'signed_by_tl_date', 'signed_by_t_l_date'),
        status: this.getWorkflowStatus(source, 'signedByTLStatus', 'signed_by_tl_status', 'signed_by_t_l_status'),
      },
      {
        key: 'acknowledgedByTL',
        title: 'Approved By TL',
        assignee: this.getEmployeeLabel(source.acknowledged_by_tl || source.acknowledgedByTL || source.acknowledged_by_t_l),
        date: this.getWorkflowDate(source, 'acknowledgedByTLDate', 'acknowledged_by_tl_date', 'acknowledged_by_t_l_date'),
        status: this.getWorkflowStatus(source, 'acknowledgedByTLStatus', 'acknowledged_by_tl_status', 'acknowledged_by_t_l_status'),
      },
      {
        key: 'acknowledgedByDI',
        title: 'Acknowledged By (DI)',
        assignee: this.getEmployeeLabel(source.acknowledged_by_di || source.acknowledgedByDI || source.acknowledged_by_d_i || source.acknowledged_by),
        date: this.getWorkflowDate(source, 'acknowledgedByDIDate', 'acknowledged_by_di_date', 'acknowledged_by_d_i_date', 'acknowledged_by_date'),
        status: this.getWorkflowStatus(source, 'acknowledgedByDIStatus', 'acknowledged_by_di_status', 'acknowledged_by_d_i_status', 'acknowledged_by_status'),
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
    return status === 'approved';
  }

  isChecklistLocked(): boolean {
    return this.actionType !== 'completed_by_status' || this.isReviewedApproved();
  }

  isCommentsLocked(): boolean {
    const type = String(this.actionType || '');
    return type !== 'completed_by_status' || this.isReviewedApproved();
  }

  isReviewerNotesLocked(): boolean {
    return this.actionType !== 'completed_by_status' || this.isReviewedApproved();
  }

  canShowDetailedDiscussion(): boolean {
    const type = String(this.actionType || '');
    return ['completed_by_status', 'responded_by_status', 'signed_by_tl_status', 'signed_by_t_l_status'].includes(type) || this.isReviewedApproved();
  }

  isRecommendedActionsLocked(): boolean {
    return !this.isFirstTLAction() || this.isReviewedApproved();
  }

  isFirstTLAction(): boolean {
    const type = String(this.actionType || '');
    return type === 'signed_by_tl_status' || type === 'signed_by_t_l_status';
  }

  private hasRecommendedActionsDecision(): boolean {
    const value = this.actionForm.getRawValue()?.recommendedActionsSatisfactorilyTaken;
    return value === true || value === false || value === 'true' || value === 'false' || value === 'yes' || value === 'no';
  }

  private shouldReturnToResponder(raw: any): boolean {
    if (String(raw?.status || '').trim().toLowerCase() === 'rejected') {
      return false;
    }

    return this.isFirstTLAction() && !this.isActionsTakenApproved(raw?.recommendedActionsSatisfactorilyTaken);
  }

  private getEffectiveStatus(raw: any): string {
    if (!this.isFirstTLAction()) {
      return String(raw?.status || '').trim().toLowerCase();
    }

    const selectedStatus = String(raw?.status || '').trim().toLowerCase();
    if (selectedStatus === 'rejected') {
      return 'rejected';
    }

    return this.isActionsTakenApproved(raw?.recommendedActionsSatisfactorilyTaken) ? 'approved' : 'pending';
  }

  private getAutoDerivedStatus(): string {
    if (!this.isFirstTLAction()) {
      return this.getCurrentActionStatus() || 'pending';
    }

    return this.isActionsTakenApproved(
      pickValue(
        this.recordData,
        'recommended_actions_satisfactorily_taken',
        'recommendedActionsSatisfactorilyTaken'
      )
    )
      ? 'approved'
      : 'pending';
  }

  private isActionsTakenApproved(value: any): boolean {
    return value === true || String(value ?? '').trim().toLowerCase() === 'true' || String(value ?? '').trim().toLowerCase() === 'yes';
  }

  private getCurrentAssigneeCode(): string {
    if (!this.recordData || !this.actionType) {
      return '';
    }

    const baseAction = this.actionType.replace('_status', '');
    if (baseAction === 'completed_by') {
      return pickString(this.recordData, 'completed_by', 'completedBy', 'signed_by_tl', 'signedByTL', 'signed_by_t_l', 'prepared_by', 'preparedBy') || '';
    }
    if (baseAction === 'responded_by') {
      return pickString(this.recordData, 'responded_by', 'respondedBy', 'prepared_by', 'preparedBy') || '';
    }
    if (baseAction === 'signed_by_tl' || baseAction === 'signed_by_t_l') {
      return pickString(this.recordData, 'signed_by_tl', 'signedByTL', 'signed_by_t_l', 'team_lead_for_action', 'teamLeadForAction') || '';
    }
    if (baseAction === 'acknowledged_by_tl') {
      return pickString(this.recordData, 'acknowledged_by_tl', 'acknowledgedByTL', 'acknowledged_by_t_l') || '';
    }
    if (baseAction === 'acknowledged_by_di' || baseAction === 'acknowledged_by') {
      return pickString(this.recordData, 'acknowledged_by_di', 'acknowledgedByDI', 'acknowledged_by_d_i', 'director_for_action', 'directorForAction') || '';
    }

    return pickString(this.recordData, baseAction, this.toCamelCase(baseAction)) || '';
  }

  getCurrentAssignee(): string {
    return this.getCurrentAssigneeCode();
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

    pushParticipant(this.recordData?.signed_by_tl || this.recordData?.signedByTL || this.recordData?.signed_by_t_l, 'signed_by_tl', 'reviewer');
    pushParticipant(this.recordData?.acknowledged_by_tl || this.recordData?.acknowledgedByTL || this.recordData?.acknowledged_by_t_l, 'acknowledged_by_tl', 'reviewer');
    pushParticipant(this.recordData?.acknowledged_by_di || this.recordData?.acknowledgedByDI || this.recordData?.acknowledged_by_d_i, 'acknowledged_by_di', 'reviewer');
    pushParticipant(this.recordData?.completed_by || this.recordData?.completedBy, 'completed_by', 'reviewer');
    pushParticipant(this.recordData?.responded_by || this.recordData?.respondedBy, 'responded_by', 'team');

    return participants;
  }
}
