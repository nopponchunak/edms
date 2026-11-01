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
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { forkJoin, map, of, Subject, switchMap, takeUntil } from 'rxjs';
import { ApiService } from 'app/core/services/api.service';
import { getAttachmentUrl } from 'app/core/utils/attachment-url.util';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { EmployeeService } from 'app/core/services/employee.service';
import { SubConsultantCreatePayload, SubConsultantService } from 'app/core/services/sub-consultant.service';
import { SUB_CONSULTANT_ASSESSMENT_EMAIL_CONFIG, WorkflowEmailNotificationService } from 'app/core/services/workflow-email-notification.service';
import { FuseConfirmationService } from '@fuse/services/confirmation';

@Component({
  selector: 'app-sub-consultant-assessment-action',
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
    MatCardModule,
    MatDividerModule,
    MatChipsModule,
  ],
  templateUrl: './sub-consultant-assessment-action.component.html',
  styleUrls: ['./sub-consultant-assessment-action.component.scss'],
})
export class SubConsultantAssessmentActionComponent implements OnInit, OnDestroy {
  actionForm: FormGroup;
  loading = false;
  assessmentId: string | null = null;
  assessment: any = null;
  actionType: 'assessed_by_status' | 'approved_by_status' | 'acknowledged_by_status' | null = null;
  employeeLookup = new Map<string, string>();
  employeeLookupWithTitle = new Map<string, string>();

  readonly assessmentInformationOptions = [
    { key: 'info_company_profile_biodata', label: 'Company Profile / Biodata' },
    { key: 'info_project_reference_certificates', label: 'Project Reference / Certificates' },
    { key: 'info_site_visit', label: 'Site Visit' },
    { key: 'info_previous_assessment_record', label: 'Previous Assessment Record' },
    { key: 'info_previous_evaluation_record', label: 'Previous Evaluation Record' },
    { key: 'info_iso_certificates', label: 'ISO Certificates' }
  ] as const;

  readonly assessmentAreas = [
    {
      label: 'Experience since establishment',
      scoreKey: 'score_experience_since_establishment' as const,
      criteria: ['1-2 years', '3-5 years', '6-10 years', '10+ years']
    },
    {
      label: 'Fully qualified staff',
      scoreKey: 'score_fully_qualified_staff' as const,
      criteria: ['1-4 persons', '5-10 persons', '11-50 persons', '50+ persons']
    },
    {
      label: 'Satisfactorily completed projects similar to that MTL would use them for',
      scoreKey: 'score_completed_similar_projects' as const,
      criteria: ['0-1 projects', '2-4 projects', '5-10 projects', '10+ projects']
    }
  ] as const;

  getAttachmentUrl = getAttachmentUrl;

  statusOptions = [
    { value: 'PENDING', label: 'Pending' },
    { value: 'REJECT', label: 'Reject' },
    { value: 'APPROVED', label: 'Approve' },
  ];

  private _unsubscribeAll: Subject<any> = new Subject<any>();

  constructor(
    private fb: FormBuilder,
    private apiService: ApiService,
    private employeeService: EmployeeService,
    private subConsultantService: SubConsultantService,
    private workflowEmailNotificationService: WorkflowEmailNotificationService,
    private route: ActivatedRoute,
    public router: Router,
    private snackBar: MatSnackBar,
    private fuseConfirmationService: FuseConfirmationService
  ) {
    this.actionForm = this.fb.group({
      status: ['', Validators.required],
    });
  }

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this._unsubscribeAll)).subscribe((params) => {
      this.assessmentId = params['id'];
      this.actionType = params['type'] as
        | 'assessed_by_status'
        | 'approved_by_status'
        | 'acknowledged_by_status';

      if (this.actionType === 'assessed_by_status') {
        this.snackBar.open('Assessed By does not require status action', 'Close', {
          duration: 3000,
        });
        this.router.navigate(['/sub-consultant-assessment']);
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

  private setupFormForActionType(): void {
    if (!this.actionType || !this.assessment) return;

    let currentStatus = 'PENDING';
    const raw = this.getStatusForActionType();
    if (raw) {
      const u = String(raw).toUpperCase();
      if (u === 'PENDING' || u === 'REJECT' || u === 'APPROVED') currentStatus = u;
    }

    this.actionForm.patchValue({ status: currentStatus });
  }

  private getStatusForActionType(): string | null | undefined {
    if (!this.assessment) return null;
    switch (this.actionType) {
      case 'assessed_by_status':
        return this.assessment.assessed_by_status ?? null;
      case 'approved_by_status':
        return this.assessment.approved_by_status ?? null;
      case 'acknowledged_by_status':
        return this.assessment.acknowledged_by_status ?? null;
      default:
        return null;
    }
  }

  private loadAssessment(): void {
    if (!this.assessmentId) return;

    this.loading = true;
    forkJoin({
      response: this.apiService.getSubConsultantAssessment(this.assessmentId),
      employeeLookup: this.employeeService.getEmployeeLookupMap(),
      employeeLookupWithTitle: this.employeeService.getEmployeeLookupMapWithTitle()
    })
      .pipe(
        switchMap(({ response, employeeLookup, employeeLookupWithTitle }) => {
          const data = (response as any)?.data;
          if (!data) return forkJoin({ response: of(response), employeeLookup: of(employeeLookup), employeeLookupWithTitle: of(employeeLookupWithTitle) });

          const codes = [
            data.assessed_by,
            data.approved_by,
            data.acknowledged_by,
            data.create_by,
            data.update_by
          ].filter(code => !!code);

          return this.employeeService.ensureEmployeesInLookup(employeeLookup, codes).pipe(
            switchMap(updatedLookup => {
              return this.employeeService.ensureEmployeesInLookup(employeeLookupWithTitle, codes).pipe(
                map(updatedLookupWithTitle => ({ response, employeeLookup: updatedLookup, employeeLookupWithTitle: updatedLookupWithTitle }))
              );
            })
          );
        }),
        takeUntil(this._unsubscribeAll)
      )
      .subscribe({
        next: ({ response, employeeLookup, employeeLookupWithTitle }) => {
          this.employeeLookup = employeeLookup;
          this.employeeLookupWithTitle = employeeLookupWithTitle;
          const res = response as any;
          if (res?.status && res?.data) {
            this.assessment = res.data;
            this.setupFormForActionType();
          } else {
            this.snackBar.open(res?.message || 'Failed to load assessment', 'Close', {
              duration: 3000,
            });
          }
          this.loading = false;
        },
        error: (err) => {
          console.error('Error loading assessment:', err);
          this.snackBar.open(
            err?.error?.message || 'Error loading assessment',
            'Close',
            { duration: 3000 }
          );
          this.loading = false;
        },
      });
  }

  getEmployeeLabel(ref: string | number | null | undefined): string {
    return this.employeeService.formatEmployeeReference(ref, this.employeeLookup);
  }

  getEmployeeLabelWithTitle(ref: string | number | null | undefined): string {
    return this.employeeService.formatEmployeeReference(ref, this.employeeLookupWithTitle);
  }

  onSubmit(): void {
    if (this.actionForm.invalid || !this.assessmentId || !this.actionType || !this.assessment) return;

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

      const formData = this.actionForm.value;
      const statusLower = (formData.status as string).toLowerCase();

      if (this.shouldAskAddToSubConsultantList(statusLower)) {
        this.openAddToSubConsultantListDialog(statusLower);
        return;
      }

      this.submitStatusUpdate(statusLower, null);
    });
  }

  private shouldAskAddToSubConsultantList(status: string): boolean {
    return this.actionType === 'approved_by_status' && status === 'approved';
  }

  private openAddToSubConsultantListDialog(statusLower: string): void {
    const type = this.assessment?.scope_of_service || '-';
    const confirmation = this.fuseConfirmationService.open({
      title: 'Add to Sub-Consultant List?',
      message: `Do you want to add this sub-consultant to the Sub-Consultant List with type "${type}"?`,
      icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
      actions: {
        cancel: { show: true, label: 'No' },
        confirm: { show: true, label: 'Yes', color: 'primary' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      this.submitStatusUpdate(statusLower, result === 'confirmed');
    });
  }

  private submitStatusUpdate(statusLower: string, addToSubConsultantList: boolean | null): void {
    if (!this.assessmentId || !this.actionType || !this.assessment) return;

    this.loading = true;
    const actionTimestamp = this.getCurrentLocalDateTime();
    const updatePayload: any = {
      to: this.assessment.to || '',
      circ: this.assessment.circ || '',
      scope_of_service: this.assessment.scope_of_service || '',
      company: this.assessment.company || '',
      score_experience_since_establishment: this.assessment.score_experience_since_establishment || 0,
      score_fully_qualified_staff: this.assessment.score_fully_qualified_staff || 0,
      score_completed_similar_projects: this.assessment.score_completed_similar_projects || 0,
      ems_iso_14001: this.assessment.ems_iso_14001 || 0,
      ems_ohsas_18001: this.assessment.ems_ohsas_18001 || 0,
      ems_iso_45001: this.assessment.ems_iso_45001 || 0,
      recommendation: this.assessment.recommendation || '',
      recommendation_reason: this.assessment.recommendation_reason || '',
      assessed_by: this.assessment.assessed_by || null,
      assessed_by_date: this.assessment.assessed_by_date || null,
      assessed_by_status: this.assessment.assessed_by_status || null,
      assessed_date: this.assessment.assessed_date || this.assessment.assessed_by_date || null,
      approved_by: this.assessment.approved_by || null,
      approved_by_date: this.assessment.approved_by_date || null,
      approved_by_status: this.assessment.approved_by_status || null,
      approved_date: this.assessment.approved_date || this.assessment.approved_by_date || null,
      acknowledged_by: this.assessment.acknowledged_by || null,
      acknowledged_by_date: this.assessment.acknowledged_by_date || null,
      acknowledged_by_status: this.assessment.acknowledged_by_status || null,
      acknowledged_date: this.assessment.acknowledged_date || this.assessment.acknowledged_by_date || null,
      info_company_profile_biodata: this.assessment.info_company_profile_biodata || 0,
      info_project_reference_certificates: this.assessment.info_project_reference_certificates || 0,
      info_site_visit: this.assessment.info_site_visit || 0,
      info_previous_assessment_record: this.assessment.info_previous_assessment_record || 0,
      info_previous_evaluation_record: this.assessment.info_previous_evaluation_record || 0,
      info_iso_certificates: this.assessment.info_iso_certificates || 0,
      decision_sub_consultant_list: addToSubConsultantList === null
        ? this.assessment.decision_sub_consultant_list ?? null
        : (addToSubConsultantList ? 1 : 0),
      remark: this.assessment.remark || null,
      references: this.assessment.references || [],
      attachments: this.assessment.attachments || [],
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

    this.apiService
      .updateSubConsultantAssessment(this.assessmentId, updatePayload)
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: () => {
          this.sendActionEmailNotification(updatePayload, statusLower);
          this.snackBar.open('Status updated successfully', 'Close', { duration: 3000 });

          if (addToSubConsultantList) {
            this.createSubConsultantFromAssessment();
            return;
          }

          this.finishActionWithNavigation();
        },
        error: (err) => {
          console.error('Error updating status:', err);
          this.snackBar.open(
            err?.error?.message || 'Error updating status',
            'Close',
            { duration: 3000 }
          );
          this.loading = false;
        },
      });
  }

  private createSubConsultantFromAssessment(): void {
    const payload = this.buildSubConsultantListPayload();

    this.subConsultantService
      .create(payload)
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: () => {
          this.snackBar.open('Sub-Consultant added to Sub-Consultant List successfully', 'Close', { duration: 3000 });
          this.finishActionWithNavigation();
        },
        error: (err) => {
          console.error('Error adding sub-consultant to Sub-Consultant List:', err);
          this.snackBar.open(
            err?.error?.message || 'Status updated, but Sub-Consultant could not be added to the list',
            'Close',
            { duration: 5000 }
          );
          this.finishActionWithNavigation();
        },
      });
  }

  private buildSubConsultantListPayload(): SubConsultantCreatePayload {
    return {
      type: String(this.assessment?.scope_of_service || '').trim() || 'General',
      name: String(this.assessment?.company || '').trim() || '-',
      status: 'Active',
      address: '-',
      phone: '-',
      email: '-',
      contact_person: this.getPrimaryReferenceName(),
    };
  }

  private getPrimaryReferenceName(): string {
    const references = Array.isArray(this.assessment?.references) ? this.assessment.references : [];
    const firstReference = references.find((reference: any) => !!reference?.reference_name);
    return firstReference?.reference_name || '-';
  }

  private finishActionWithNavigation(): void {
    this.loading = false;
    this.router.navigate(['/sub-consultant-assessment']);
  }

  private sendActionEmailNotification(updatedPayload: any, status: string): void {
    if (!this.assessmentId || !this.actionType) {
      return;
    }

    this.workflowEmailNotificationService
      .notifyAfterAction(
        SUB_CONSULTANT_ASSESSMENT_EMAIL_CONFIG,
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
          console.error('Failed to send sub-consultant assessment email notification:', error);
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

  formatDate(dateString?: string | null | Date): string {
    return formatDateDisplay(dateString);
  }

  formatDateTime(dateString?: string | null | Date): string {
    if (!dateString) return '-';
    const date = new Date(dateString as string);
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
    const s = String(status).toLowerCase();
    if (s === 'pending') return 'Pending';
    if (s === 'reject' || s === 'rejected') return 'Rejected';
    if (s === 'approve' || s === 'approved') return 'Approved';
    return status;
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

  getStatusBadgeClass(status: string): string {
    switch (status?.toLowerCase()) {
      case 'draft':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      case 'assessed':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'approved':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'acknowledged':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'rejected':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  }

  getStatusLabel(status: string): string {
    switch (status?.toLowerCase()) {
      case 'draft':
        return 'Draft';
      case 'pending':
        return 'Pending';
      case 'assessed':
        return 'Assessed';
      case 'approved':
        return 'Approved';
      case 'acknowledged':
        return 'Acknowledged';
      case 'rejected':
        return 'Rejected';
      default:
        return status;
    }
  }

  getRecommendationLabel(recommendation: string): string {
    switch (recommendation) {
      case 'accept':
        return 'Accept';
      case 'not_accept':
        return 'Not Accept';
      default:
        return recommendation;
    }
  }

  getRecommendationBadgeClass(recommendation: string): string {
    switch (recommendation) {
      case 'accept':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'not_accept':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  }

  getOpinionLabel(opinion: string): string {
    switch (opinion) {
      case 'good':
        return 'Good';
      case 'neutral':
        return 'Neutral';
      case 'poor':
        return 'Poor';
      default:
        return opinion;
    }
  }

  getOpinionBadgeClass(opinion: string): string {
    switch (opinion) {
      case 'good':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'neutral':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'poor':
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

  get meetsMinimumScore(): boolean {
    return this.assessment ? (this.assessment.item1_total_score || 0) >= 15 : false;
  }

  get hasPositiveReference(): boolean {
    return this.assessment ? this.assessment.references?.some((ref: any) => ref.opinion === 'good') : false;
  }

  isAssessmentInfoChecked(key: string): boolean {
    return this.assessment?.[key] === 1;
  }

  getAssessmentScore(key: string): number | string {
    return this.assessment?.[key] ?? '-';
  }

  get hasCompliance(): boolean {
    if (!this.assessment) {
      return false;
    }

    return this.assessment.ems_iso_14001 === 1
      || this.assessment.ems_ohsas_18001 === 1
      || this.assessment.ems_iso_45001 === 1;
  }

  getReferenceLabel(index: number): string {
    return String.fromCharCode(97 + index);
  }
}
