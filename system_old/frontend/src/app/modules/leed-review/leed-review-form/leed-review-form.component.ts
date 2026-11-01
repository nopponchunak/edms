import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, Subject, takeUntil } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import {
  ApprovalWorkflowComponent,
  ApprovalWorkflowStep,
} from 'app/core/components/approval-workflow';
import { ViewActionsComponent } from 'app/core/components/view-actions';
import { EmployeeOption, EmployeeService } from 'app/core/services/employee.service';
import {
  asBoolean,
  pickDate,
  pickIntegerOrString,
  pickString,
  pickStringArray,
  pickValue,
  mergeProjectReviewEmployeeLookup,
  ProjectReviewApiService,
  serializeDatesDeep,
} from 'app/core/services/project-review-api.service';
import { ExternalProject, ExternalProjectService } from 'app/core/services/external-project.service';
import { ConceptDesignCommentDialogComponent } from 'app/modules/concept-design-review/concept-design-review-action/concept-design-comment-dialog.component';
import {
  DiscussionParticipant,
  ProjectReviewDiscussionService,
  ProjectReviewDiscussionType,
} from 'app/core/services/project-review-discussion.service';
import { formatDateDisplay } from 'app/core/utils/date-format.util';
import { normalizeEmployeeControlValues } from 'app/core/utils/review-employee.utils';
import { WorkflowEmailNotificationService, LEED_REVIEW_EMAIL_CONFIG } from 'app/core/services/workflow-email-notification.service';
import { patchDefaultPreparedBy } from 'app/core/utils/prepared-by-default.util';
import { FuseConfirmationService } from '@fuse/services/confirmation';

interface ReviewChecklistItem {
  id: string;
  question: string;
}

function toLocalDateTimeString(value: unknown): string | null {
  const date =
    value instanceof Date ? value : value ? new Date(String(value)) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absOffsetMinutes = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absOffsetMinutes / 60)).padStart(2, '0');
  const offsetRemainingMinutes = String(absOffsetMinutes % 60).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}${sign}${offsetHours}:${offsetRemainingMinutes}`;
}

function serializeDateTimesDeep<T>(value: T): T {
  if (value instanceof Date) {
    return toLocalDateTimeString(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeDateTimesDeep(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce(
      (acc, [key, entryValue]) => {
        acc[key] = serializeDateTimesDeep(entryValue);
        return acc;
      },
      {} as Record<string, unknown>
    ) as T;
  }

  return value;
}

@Component({
  selector: 'app-leed-review-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    MatSelectModule,
    MatSnackBarModule,
    MatDialogModule,
    NgxMatSelectSearchModule,
    ApprovalWorkflowComponent,
    ViewActionsComponent,
  ],
  templateUrl: './leed-review-form.component.html',
  styleUrls: ['./leed-review-form.component.scss'],
})
export class LeedReviewFormComponent implements OnInit, OnDestroy {
  private readonly apiKey = 'leedReview' as const;
  private readonly reviewDiscussionType: ProjectReviewDiscussionType = 'leed_review';
  private readonly destroy$ = new Subject<void>();

  form: FormGroup;
  loading = false;
  isEdit = false;
  isView = false;
  formId: string | null = null;
  hasUnsavedChanges = false;
  hasDiscussionComments = false;
  recordData: any = null;

  readonly documentTypes = [
    'LEED Design Submittal',
    'LEED Construction Submittal',
    'LEED Specification',
    'Commissioning Specification',
    'Commissioning Plan',
    'Feasibility Study Report',
    'Energy Simulation Report',
    'Commissioning Report',
    'Other',
  ];

  readonly projectStages = [
    'Feasibility Study',
    'Design',
    'Construction',
    'Other',
  ];

  readonly checklistItems: ReviewChecklistItem[] = [
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

  employeeOptions: EmployeeOption[] = [];
  employeeLookupMap = new Map<string, string>();
  filteredPreparedByOptions: EmployeeOption[] = [];
  filteredReviewedByOptions: EmployeeOption[] = [];
  filteredRespondedByOptions: EmployeeOption[] = [];
  filteredSignedByOptions: EmployeeOption[] = [];
  filteredSignedByTLOptions: EmployeeOption[] = [];
  filteredAcknowledgedByOptions: EmployeeOption[] = [];
  preparedBySearchCtrl = new FormControl('');
  reviewedBySearchCtrl = new FormControl('');
  respondedBySearchCtrl = new FormControl('');
  signedBySearchCtrl = new FormControl('');
  signedByTLSearchCtrl = new FormControl('');
  acknowledgedBySearchCtrl = new FormControl('');

  projectSearchCtrl = new FormControl('');
  filteredProjectOptions: ExternalProject[] = [];

  private readonly employeeControlNames = [
    'preparedBy',
    'reviewedBy',
    'respondedBy',
    'signedBy',
    'signedByTL',
    'acknowledgedBy',
  ];
  private readonly printBodyClass = 'leed-review-printing';
  private printFallbackCleanupTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private snackBar: MatSnackBar,
    private projectReviewApi: ProjectReviewApiService,
    private projectReviewDiscussionService: ProjectReviewDiscussionService,
    private employeeService: EmployeeService,
    private projectService: ExternalProjectService,
    private workflowEmailNotificationService: WorkflowEmailNotificationService,
    private dialog: MatDialog,
    private fuseConfirmationService: FuseConfirmationService
  ) {
    this.form = this.createForm();
  }

  ngOnInit(): void {
    window.addEventListener('beforeprint', this.enableLeedReviewPrintMode);
    window.addEventListener('afterprint', this.disableLeedReviewPrintMode);

    this.initializeDocumentsReviewed();
    this.initializeProjectStages();
    this.initializeChecklistResponses();
    this.loadEmployees();
    this.setupProjectSearch();

    this.route.params.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.formId = params['id'] ?? null;
      this.isEdit = this.route.snapshot.url.some((segment) => segment.path === 'edit');
      this.isView = this.route.snapshot.url.some((segment) => segment.path === 'view');

      if (this.formId) {
        this.loadFormData(this.formId);
      } else {
        patchDefaultPreparedBy(this.form, {
          syncReviewedBy: true,
          syncRespondedBy: true,
        });
      }
    });

    this.form.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.hasUnsavedChanges = true;
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeprint', this.enableLeedReviewPrintMode);
    window.removeEventListener('afterprint', this.disableLeedReviewPrintMode);
    this.disableLeedReviewPrintMode();
    this.destroy$.next();
    this.destroy$.complete();
  }

  createForm(): FormGroup {
    return this.fb.group({
      projectId: [''],
      projectName: [''],
      projectNumber: [''],
      preparedBy: [''],
      documentsReviewed: this.fb.array([]),
      documentsReviewedOther: [''],
      projectStage: this.fb.array([]),
      projectStageOther: [''],
      reviewMethod: ['before_after_release'],
      checklistResponses: this.fb.array([]),
      comments: [''],
      recommendedActions: [''],
      nonConformanceToQP: [false],
      reviewedBy: [''],
      reviewedByDate: [new Date()],
      respondedBy: [''],
      respondedByDate: [new Date()],
      recommendedActionsSatisfactorilyTaken: [false],
      note: [''],
      signedBy: [''],
      signedByDate: [new Date()],
      signedByTL: [''],
      signedByTLDate: [new Date()],
      acknowledgedBy: [''],
      acknowledgedByDate: [new Date()],
    });
  }

  get documentsReviewedFormArray(): FormArray {
    return this.form.get('documentsReviewed') as FormArray;
  }

  get projectStageFormArray(): FormArray {
    return this.form.get('projectStage') as FormArray;
  }

  get checklistResponses(): FormArray {
    return this.form.get('checklistResponses') as FormArray;
  }

  loadFormData(id: string): void {
    this.loading = true;
    this.projectReviewApi
      .getById(this.apiKey, id)
      .pipe(
        finalize(() => {
          this.loading = false;
        })
      )
      .subscribe({
        next: (data) => {
          this.patchFormData(data);
          this.refreshDiscussionCommentState();
        },
        error: (error) => {
          console.error('Error loading value engineering review:', error);
          this.snackBar.open('Failed to load value engineering review', 'Close', {
            duration: 3000,
          });
        },
      });
  }

  saveForm(): void {
    this.persistForm(false);
  }

  submitForm(): void {
    const confirmation = this.fuseConfirmationService.open({
      title: 'Confirm submit',
      message: 'Are you sure you want to submit this review?',
      icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
      actions: {
        cancel: { show: true, label: 'Cancel' },
        confirm: { show: true, label: 'Submit', color: 'primary' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result !== 'confirmed') return;
      this.persistForm(true);
    });
  }

  goBack(): void {
    if (
      this.hasUnsavedChanges &&
      !confirm('You have unsaved changes. Are you sure you want to leave?')
    ) {
      return;
    }

    this.router.navigate(['/leed-review']);
  }

  onEdit(): void {
    if (this.formId) {
      this.router.navigate(['/leed-review/edit', this.formId]);
    }
  }

  get workflowSteps(): ApprovalWorkflowStep[] {
    const source = this.recordData ?? {};

    return [
      {
        key: 'reviewedBy',
        title: 'Reviewed By (DI/TL/VVE)',
        assignee: this.getEmployeeDisplay(this.form.get('reviewedBy')?.value),
        date: this.getWorkflowDate(source, 'reviewedByDate', 'reviewed_by_date'),
        status: this.getWorkflowStatus(source, 'reviewedByStatus', 'reviewed_by_status'),
      },
      {
        key: 'respondedBy',
        title: 'Responded By (PE/TE)',
        assignee: this.getEmployeeDisplay(this.form.get('respondedBy')?.value),
        date: this.getWorkflowDate(source, 'respondedByDate', 'responded_by_date'),
        status: this.getWorkflowStatus(source, 'respondedByStatus', 'responded_by_status'),
      },
      {
        key: 'signedBy',
        title: 'Signed By (DI/TL/VVE)',
        assignee: this.getEmployeeDisplay(this.form.get('signedBy')?.value),
        date: this.getWorkflowDate(source, 'signedByDate', 'signed_by_date'),
        status: this.getWorkflowStatus(source, 'signedByStatus', 'signed_by_status'),
      },
      {
        key: 'signedByTL',
        title: 'Signed By (TL)',
        assignee: this.getEmployeeDisplay(this.form.get('signedByTL')?.value),
        date: this.getWorkflowDate(source, 'signedByTLDate', 'signed_by_tl_date'),
        status: this.getWorkflowStatus(source, 'signedByTLStatus', 'signed_by_tl_status'),
      },
      {
        key: 'acknowledgedBy',
        title: 'Acknowledged By (DI)',
        assignee: this.getEmployeeDisplay(this.form.get('acknowledgedBy')?.value),
        date: this.getWorkflowDate(
          source,
          'acknowledgedByDate',
          'acknowledged_by_date'
        ),
        status: this.getWorkflowStatus(
          source,
          'acknowledgedByStatus',
          'acknowledged_by_status'
        ),
      },
    ];
  }

  onWorkflowAction(key: string): void {
    const type = this.mapWorkflowKeyToActionType(key);
    if (type && this.formId) {
      this.router.navigate(['/leed-review/action', this.formId, type]);
    }
  }

  private mapWorkflowKeyToActionType(key: string): string | null {
    switch (key) {
      case 'reviewedBy':
        return 'reviewed_by_status';
      case 'respondedBy':
        return 'responded_by_status';
      case 'signedBy':
        return 'signed_by_status';
      case 'signedByTL':
        return 'signed_by_tl_status';
      case 'acknowledgedBy':
        return 'acknowledged_by_status';
      default:
        return null;
    }
  }

  openCommentDialog(): void {
    if (!this.formId) {
      return;
    }

    const dialogRef = this.dialog.open(ConceptDesignCommentDialogComponent, {
      width: '95vw',
      maxWidth: '1000px',
      maxHeight: '90vh',
      height: '80vh',
      data: {
        recordId: this.formId,
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
    if (!this.formId) {
      this.hasDiscussionComments = false;
      return;
    }

    this.projectReviewDiscussionService
      .hasDiscussionMessages(this.reviewDiscussionType, this.formId)
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
        name: this.getEmployeeDisplay(code),
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

  onDocumentsReviewedChange(): void {
    const selected = this.getSelectedDocuments();
    const control = this.form.get('documentsReviewedOther');

    if (selected.includes('Other')) {
      control?.setValidators([Validators.required]);
    } else {
      control?.setValue('', { emitEvent: false });
      control?.clearValidators();
    }

    control?.updateValueAndValidity({ emitEvent: false });
  }

  onProjectStageChange(): void {
    const selected = this.getSelectedProjectStages();
    const control = this.form.get('projectStageOther');

    if (selected.includes('Other')) {
      control?.setValidators([Validators.required]);
    } else {
      control?.setValue('', { emitEvent: false });
      control?.clearValidators();
    }

    control?.updateValueAndValidity({ emitEvent: false });
  }

  onRecommendedActionsSatisfactorilyTakenChange(): void {
    const noteControl = this.form.get('note');
    noteControl?.clearValidators();
    noteControl?.updateValueAndValidity({ emitEvent: false });
  }

  getSelectedDocuments(): string[] {
    return this.extractSelectedValues(
      this.documentsReviewedFormArray,
      this.documentTypes
    );
  }

  getSelectedProjectStages(): string[] {
    return this.extractSelectedValues(
      this.projectStageFormArray,
      this.projectStages
    );
  }

  getChecklistResponseValue(index: number): string {
    const value = String(this.checklistResponses.at(index)?.value ?? '').toLowerCase();
    return value === 'na' ? 'n/a' : value;
  }

  isChecklistResponse(index: number, expected: 'yes' | 'no' | 'n/a'): boolean {
    return this.getChecklistResponseValue(index) === expected;
  }

  isPrintDocumentSelected(documentType: string): boolean {
    return this.getSelectedDocuments().includes(documentType);
  }

  isPrintProjectStageSelected(stage: string): boolean {
    return this.getSelectedProjectStages().includes(stage);
  }

  isPrintReviewMethodSelected(): boolean {
    const value = String(this.form.get('reviewMethod')?.value ?? '').trim();
    return value === 'before_after_release';
  }

  getPrintControlValue(controlName: string): string {
    const value = this.form.get(controlName)?.value;
    return value === undefined || value === null ? '' : String(value).trim();
  }

  getPrintEmployeeDisplay(value: unknown): string {
    const display = this.getEmployeeDisplay(value);
    return display === '-' ? '' : display;
  }

  getPrintEmployeeValue(controlName: string, ...paths: string[]): string {
    const sourceValue = pickValue(this.recordData ?? {}, ...paths);
    const value =
      sourceValue !== undefined && sourceValue !== null && String(sourceValue).trim() !== ''
        ? sourceValue
        : this.form.get(controlName)?.value;

    return this.getPrintEmployeeDisplay(value);
  }

  getPrintDate(...paths: string[]): string {
    const date = pickDate(this.recordData ?? {}, ...paths);
    if (date) {
      return formatDateDisplay(date);
    }

    if (this.recordData) {
      return '';
    }

    const fallbackDate = paths
      .map((path) => this.form.get(path)?.value)
      .find((value) => value !== undefined && value !== null && String(value).trim() !== '');

    return fallbackDate ? formatDateDisplay(fallbackDate) : '';
  }

  isNonConformanceYes(): boolean {
    return this.isPrintBooleanYes(this.getNonConformancePrintValue());
  }

  isNonConformanceNo(): boolean {
    return this.isPrintBooleanNo(this.getNonConformancePrintValue());
  }

  isRecommendedActionYes(): boolean {
    return this.isPrintBooleanYes(this.getRecommendedActionPrintValue());
  }

  isRecommendedActionNo(): boolean {
    return this.isPrintBooleanNo(this.getRecommendedActionPrintValue());
  }

  getBooleanDisplay(value: unknown): string {
    if (value === true) {
      return 'Yes';
    }

    if (value === false) {
      return 'No';
    }

    return '-';
  }

  getEmployeeDisplay(value: unknown): string {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      return '-';
    }

    const fromMap = this.employeeLookupMap.get(normalized);
    if (fromMap) {
      return fromMap;
    }

    const option = this.employeeOptions.find((employee) => {
      return [
        employee.id,
        employee.code,
        employee.employeeId,
        employee.displayLabel,
        employee.name,
      ]
        .map((candidate) => String(candidate ?? '').trim())
        .includes(normalized);
    });

    return option?.displayLabel ?? normalized;
  }

  formatDate(value: unknown): string {
    return formatDateDisplay(value as string | Date | null | undefined);
  }

  private initializeDocumentsReviewed(): void {
    this.documentsReviewedFormArray.clear();
    this.documentTypes.forEach(() =>
      this.documentsReviewedFormArray.push(this.fb.control(false))
    );
  }

  private initializeProjectStages(): void {
    this.projectStageFormArray.clear();
    this.projectStages.forEach(() =>
      this.projectStageFormArray.push(this.fb.control(false))
    );
  }

  private initializeChecklistResponses(): void {
    this.checklistResponses.clear();
    this.checklistItems.forEach(() => this.checklistResponses.push(this.fb.control('')));
    this.checklistResponses.updateValueAndValidity({ emitEvent: false });
  }

  private setupProjectSearch(): void {
    this.projectSearchCtrl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((term) =>
          this.projectService.getProjects(term ? term.toString().trim() : '', 20)
        ),
        takeUntil(this.destroy$)
      )
      .subscribe((projects) => {
        this.filteredProjectOptions = projects;
      });

    this.projectService
      .getProjects('', 20)
      .pipe(takeUntil(this.destroy$))
      .subscribe((projects) => {
        this.filteredProjectOptions = projects;
      });
  }

  onProjectSelectedById(projectId: number | string): void {
    const selectedProjectId = Number(projectId);
    const project = this.filteredProjectOptions.find(
      (option) => option.id === selectedProjectId
    );

    if (!project) {
      return;
    }

    this.form.patchValue({
      projectName: project.name,
      projectNumber: project.code,
    });
  }

  private extractSelectedValues(formArray: FormArray, options: string[]): string[] {
    return formArray.controls.reduce<string[]>((selected, control, index) => {
      if (control.value) {
        selected.push(options[index]);
      }
      return selected;
    }, []);
  }

  private loadEmployees(): void {
    this.employeeService.getEmployeeOptions('', 500).subscribe((employees) => {
      this.employeeOptions = employees;
      this.filteredPreparedByOptions = employees;
      this.filteredReviewedByOptions = employees;
      this.filteredRespondedByOptions = employees;
      this.filteredSignedByOptions = employees;
      this.filteredSignedByTLOptions = employees;
      this.filteredAcknowledgedByOptions = employees;
      normalizeEmployeeControlValues(
        this.form,
        this.employeeControlNames,
        this.employeeOptions
      );
      this.setupEmployeeSearchFilters();
    });
  }

  private setupEmployeeSearchFilters(): void {
    this.bindEmployeeSearch(
      this.preparedBySearchCtrl,
      'preparedBy',
      (employees) => (this.filteredPreparedByOptions = employees)
    );
    this.bindEmployeeSearch(
      this.reviewedBySearchCtrl,
      'reviewedBy',
      (employees) => (this.filteredReviewedByOptions = employees)
    );
    this.bindEmployeeSearch(
      this.respondedBySearchCtrl,
      'respondedBy',
      (employees) => (this.filteredRespondedByOptions = employees)
    );
    this.bindEmployeeSearch(
      this.signedBySearchCtrl,
      'signedBy',
      (employees) => (this.filteredSignedByOptions = employees)
    );
    this.bindEmployeeSearch(
      this.signedByTLSearchCtrl,
      'signedByTL',
      (employees) => (this.filteredSignedByTLOptions = employees)
    );
    this.bindEmployeeSearch(
      this.acknowledgedBySearchCtrl,
      'acknowledgedBy',
      (employees) => (this.filteredAcknowledgedByOptions = employees)
    );
  }

  private bindEmployeeSearch(
    searchControl: FormControl,
    controlName: string,
    update: (employees: EmployeeOption[]) => void
  ): void {
    searchControl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((term) =>
          this.employeeService.getEmployeeOptions(
            term ? term.toString().trim() : '',
            50
          )
        ),
        takeUntil(this.destroy$)
      )
      .subscribe((employees) => {
        this.employeeOptions = this.mergeEmployeeOptions(this.employeeOptions, employees);
        update(this.mergeSelectedEmployeeOption(employees, controlName));
      });
  }

  private mergeEmployeeOptions(
    current: EmployeeOption[],
    incoming: EmployeeOption[]
  ): EmployeeOption[] {
    const merged = new Map(current.map((option) => [option.code, option]));
    incoming.forEach((option) => {
      if (option?.code) {
        merged.set(option.code, option);
      }
    });

    return Array.from(merged.values());
  }

  private mergeSelectedEmployeeOption(
    employees: EmployeeOption[],
    controlName: string
  ): EmployeeOption[] {
    const currentValue = String(this.form.get(controlName)?.value ?? '').trim();
    if (!currentValue) {
      return employees;
    }

    const selected = this.employeeOptions.find((option) => {
      return [option.code, option.id, option.employeeId]
        .map((value) => String(value ?? '').trim())
        .includes(currentValue);
    });

    if (!selected || employees.some((option) => option.code === selected.code)) {
      return employees;
    }

    return [selected, ...employees];
  }

  private persistForm(navigateToList: boolean): void {
    this.onDocumentsReviewedChange();
    this.onProjectStageChange();
    this.onRecommendedActionsSatisfactorilyTakenChange();

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      const invalid = [];
      const controls = this.form.controls;
      for (const name in controls) {
        if (controls[name].invalid) {
          invalid.push({
            name: name,
            errors: controls[name].errors,
            value: controls[name].value
          });
        }
      }
      console.log('Invalid controls:', invalid);
      this.snackBar.open('Please fill in all required fields', 'Close', {
        duration: 3000,
      });
      return;
    }

    const payload = this.buildPayload();
    const request$ = this.formId
      ? this.projectReviewApi.update(this.apiKey, this.formId, payload)
      : this.projectReviewApi.create(this.apiKey, payload);

    this.loading = true;

    request$
      .pipe(
        finalize(() => {
          this.loading = false;
        })
      )
      .subscribe({
        next: (response) => {
          const savedId = String(response?.id ?? this.formId ?? '');
          if (!this.formId && savedId) {
            this.formId = savedId;
          }

          this.hasUnsavedChanges = false;
          this.form.markAsPristine();
          this.snackBar.open(
            navigateToList
              ? 'LEED review submitted successfully'
              : 'LEED review saved successfully',
            'Close',
            { duration: 3000 }
          );

          if (navigateToList) {
            this.router.navigate(['/leed-review']);
          }

          // Trigger email notification for the first action step if this is being submitted
          if (navigateToList && savedId) {
            this.workflowEmailNotificationService.notifyInitialAction(
              LEED_REVIEW_EMAIL_CONFIG,
              payload,
              savedId
            ).subscribe({
              next: () => console.log('Initial notification sent successfully'),
              error: (err) => console.error('Error sending initial notification:', err)
            });
          }
        },
        error: (error) => {
          console.error('Error saving LEED review:', error);
          this.snackBar.open('Failed to save LEED review', 'Close', {
            duration: 3000,
          });
        },
      });
  }

  private buildPayload(): any {
    const raw = this.form.getRawValue();
    const selectedDocuments = this.getSelectedDocuments();
    const selectedProjectStages = this.getSelectedProjectStages();
    const isCreateMode = !this.formId;

    const reviewedByDate = raw.reviewedBy ? raw.reviewedByDate : null;
    const respondedByDate = raw.respondedBy ? raw.respondedByDate : null;
    const signedByDate = raw.signedBy ? raw.signedByDate : null;
    const signedByTLDate = raw.signedByTL ? raw.signedByTLDate : null;
    const acknowledgedByDate = raw.acknowledgedBy ? raw.acknowledgedByDate : null;

    const payload = {
      ...raw,
      formType: 'mtlc',
      reviewMethod: raw.reviewMethod || 'before_after_release',
      documentsReviewed: selectedDocuments,
      documents_reviewed: selectedDocuments,
      projectStage: selectedProjectStages,
      project_stage: selectedProjectStages,
      checklistResponses: this.checklistItems.map((item, index) => ({
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
      preparedBy: raw.preparedBy,
      prepared_by: raw.preparedBy,
      reviewedBy: raw.reviewedBy,
      reviewed_by: raw.reviewedBy,
      reviewedByDate: reviewedByDate,
      reviewed_by_date: reviewedByDate,
      respondedBy: raw.respondedBy,
      responded_by: raw.respondedBy,
      respondedByDate: respondedByDate,
      responded_by_date: respondedByDate,
      signedBy: raw.signedBy,
      signed_by: raw.signedBy,
      signedByDate: signedByDate,
      signed_by_date: signedByDate,
      signedByTL: raw.signedByTL,
      signed_by_tl: raw.signedByTL,
      signedByTLDate: signedByTLDate,
      signed_by_tl_date: signedByTLDate,
      acknowledgedBy: raw.acknowledgedBy,
      acknowledged_by: raw.acknowledgedBy,
      acknowledgedByDate: acknowledgedByDate,
      acknowledged_by_date: acknowledgedByDate,
      reviewerForAction: raw.reviewedBy || '',
      reviewer_for_action: raw.reviewedBy || '',
      teamLeadForAction: raw.signedByTL || '',
      team_lead_for_action: raw.signedByTL || '',
      directorForAction: raw.acknowledgedBy || '',
      director_for_action: raw.acknowledgedBy || '',
      peResponseDate: respondedByDate,
      pe_response_date: respondedByDate,
      reviewerFollowUpDate: signedByDate,
      reviewer_follow_up_date: signedByDate,
      tlReviewDate: signedByTLDate,
      tl_review_date: signedByTLDate,
      diAcknowledgeDate: acknowledgedByDate,
      di_acknowledge_date: acknowledgedByDate,
      reviewedByStatus: isCreateMode ? 'pending' : undefined,
      reviewed_by_status: isCreateMode ? 'pending' : undefined,
      respondedByStatus: isCreateMode ? 'pending' : undefined,
      responded_by_status: isCreateMode ? 'pending' : undefined,
      signedByStatus: isCreateMode ? 'pending' : undefined,
      signed_by_status: isCreateMode ? 'pending' : undefined,
      signedByTLStatus: isCreateMode ? 'pending' : undefined,
      signed_by_tl_status: isCreateMode ? 'pending' : undefined,
      acknowledgedByStatus: isCreateMode ? 'pending' : undefined,
      acknowledged_by_status: isCreateMode ? 'pending' : undefined,
      peResponse: raw.respondedBy ? 'Responded' : '',
      pe_response: raw.respondedBy ? 'Responded' : '',
      reviewerFollowUpNote: raw.note,
      reviewer_follow_up_note: raw.note,
    };

    this.removeWorkflowDateFields(payload);

    return serializeDateTimesDeep(payload);
  }

  private removeWorkflowDateFields(payload: Record<string, unknown>): void {
    [
      'reviewedByDate',
      'reviewed_by_date',
      'respondedByDate',
      'responded_by_date',
      'signedByDate',
      'signed_by_date',
      'signedByTLDate',
      'signed_by_tl_date',
      'acknowledgedByDate',
      'acknowledged_by_date',
      'peResponseDate',
      'pe_response_date',
      'reviewerFollowUpDate',
      'reviewer_follow_up_date',
      'tlReviewDate',
      'tl_review_date',
      'diAcknowledgeDate',
      'di_acknowledge_date',
    ].forEach((field) => delete payload[field]);
  }

  private patchFormData(data: any): void {
    this.recordData = data;
    this.employeeLookupMap = mergeProjectReviewEmployeeLookup([data], this.employeeLookupMap);
    const documentsReviewedValues = pickStringArray(
      data,
      'documentsReviewed',
      'documents_reviewed'
    );
    const projectStageValues = pickStringArray(
      data,
      'projectStage',
      'project_stage'
    );
    const checklistValues =
      data?.checklistResponses ?? data?.checklist_responses ?? [];

    this.form.patchValue(
      {
        projectId: pickIntegerOrString(data, 'projectId', 'project_id'),
        projectName: pickString(data, 'projectName', 'project_name'),
        projectNumber: pickString(
          data,
          'projectNumber',
          'project_number',
          'project_no'
        ),
        preparedBy: pickIntegerOrString(data, 'preparedBy', 'prepared_by'),
        documentsReviewedOther: pickString(
          data,
          'documentsReviewedOther',
          'documents_reviewed_other'
        ),
        projectStageOther: pickString(
          data,
          'projectStageOther',
          'project_stage_other'
        ),
        reviewMethod:
          pickString(data, 'reviewMethod', 'review_method') ||
          'before_after_release',
        comments:
          pickString(data, 'comments') ||
          pickString(data, 'reviewerComments', 'reviewer_comments'),
        recommendedActions:
          pickString(data, 'recommendedActions') ||
          pickString(
            data,
            'reviewerRecommendedAction',
            'reviewer_recommended_action'
          ),
        nonConformanceToQP: asBoolean(
          data?.nonConformanceToQP ?? data?.non_conformance_to_qp
        ),
        reviewedBy: pickIntegerOrString(
          data,
          'reviewedBy',
          'reviewed_by',
          'reviewerForAction',
          'reviewer_for_action'
        ),
        reviewedByDate:
          pickDate(data, 'reviewedByDate', 'reviewed_by_date') ?? new Date(),
        respondedBy: pickIntegerOrString(
          data,
          'respondedBy',
          'responded_by',
          'preparedBy',
          'prepared_by'
        ),
        respondedByDate:
          pickDate(
            data,
            'respondedByDate',
            'responded_by_date',
            'peResponseDate',
            'pe_response_date'
          ) ?? new Date(),
        recommendedActionsSatisfactorilyTaken: asBoolean(
          data?.recommendedActionsSatisfactorilyTaken ??
            data?.recommended_actions_satisfactorily_taken
        ),
        note:
          pickString(data, 'note') ||
          pickString(
            data,
            'reviewerFollowUpNote',
            'reviewer_follow_up_note'
          ),
        signedBy: pickIntegerOrString(
          data,
          'signedBy',
          'signed_by',
          'reviewerForAction',
          'reviewer_for_action'
        ),
        signedByDate:
          pickDate(
            data,
            'signedByDate',
            'signed_by_date',
            'reviewerFollowUpDate',
            'reviewer_follow_up_date'
          ) ?? new Date(),
        signedByTL: pickIntegerOrString(
          data,
          'signedByTL',
          'signed_by_tl',
          'teamLeadForAction',
          'team_lead_for_action'
        ),
        signedByTLDate:
          pickDate(
            data,
            'signedByTLDate',
            'signed_by_tl_date',
            'tlReviewDate',
            'tl_review_date'
          ) ?? new Date(),
        acknowledgedBy: pickIntegerOrString(
          data,
          'acknowledgedBy',
          'acknowledged_by',
          'directorForAction',
          'director_for_action'
        ),
        acknowledgedByDate:
          pickDate(
            data,
            'acknowledgedByDate',
            'acknowledged_by_date',
            'diAcknowledgeDate',
            'di_acknowledge_date'
          ) ?? new Date(),
      },
      { emitEvent: false }
    );

    this.setSelectedOptions(
      this.documentsReviewedFormArray,
      this.documentTypes,
      documentsReviewedValues
    );
    this.setSelectedOptions(
      this.projectStageFormArray,
      this.projectStages,
      projectStageValues
    );
    this.setChecklistResponses(checklistValues);
    this.onDocumentsReviewedChange();
    this.onProjectStageChange();
    this.onRecommendedActionsSatisfactorilyTakenChange();

    if (this.employeeOptions.length) {
      normalizeEmployeeControlValues(
        this.form,
        this.employeeControlNames,
        this.employeeOptions
      );
    }

    this.form.markAsPristine();
    this.hasUnsavedChanges = false;
  }

  private setSelectedOptions(
    formArray: FormArray,
    options: string[],
    selectedValues: string[]
  ): void {
    const normalized = new Set(
      selectedValues
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
    );

    formArray.controls.forEach((control, index) => {
      control.setValue(normalized.has(options[index]), { emitEvent: false });
    });
  }

  private setChecklistResponses(values: any[]): void {
    const responsesById = new Map(
      (Array.isArray(values) ? values : []).map((item: any) => [
        String(item?.id ?? ''),
        item?.response ?? item?.value ?? '',
      ])
    );

    this.checklistResponses.controls.forEach((control, index) => {
      const response =
        responsesById.get(this.checklistItems[index].id) ??
        values?.[index]?.response ??
        values?.[index] ??
        '';

      control.setValue(response, { emitEvent: false });
    });
  }

  private getWorkflowStatus(source: any, ...keys: string[]): string {
    return pickString(source, ...keys) || 'pending';
  }

  private getWorkflowDate(source: any, ...keys: string[]): string {
    const value = keys.reduce<string | Date | null>((matched, key) => {
      if (matched !== undefined && matched !== null && matched !== '') {
        return matched;
      }

      const candidate = source?.[key];
      if (candidate instanceof Date || typeof candidate === 'string') {
        return candidate;
      }

      return null;
    }, null);

    return formatDateDisplay(value);
  }

  onPrint(): void {
    if (!this.isView || this.loading) {
      this.snackBar.open('Print document is not ready yet', 'Close', {
        duration: 2500,
      });
      return;
    }

    const printWindow = window.open('', '_blank', 'width=980,height=1200');
    if (this.writePrintWindow(printWindow)) {
      return;
    }

    this.enableLeedReviewPrintMode();
    this.schedulePrintModeFallbackCleanup();
    window.print();
  }

  private enableLeedReviewPrintMode = (): void => {
    document.body.classList.add(this.printBodyClass);
  };

  private disableLeedReviewPrintMode = (): void => {
    if (this.printFallbackCleanupTimer) {
      clearTimeout(this.printFallbackCleanupTimer);
      this.printFallbackCleanupTimer = null;
    }

    document.body.classList.remove(this.printBodyClass);
  };

  private schedulePrintModeFallbackCleanup(): void {
    if (this.printFallbackCleanupTimer) {
      clearTimeout(this.printFallbackCleanupTimer);
    }

    this.printFallbackCleanupTimer = setTimeout(this.disableLeedReviewPrintMode, 120000);
  }

  private writePrintWindow(printWindow: Window | null): boolean {
    const printRoot = document.querySelector('.leed-review-print-root');
    if (!printWindow || !printRoot) {
      return false;
    }

    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((node) => node.outerHTML)
      .join('\n');
    const baseHref = this.escapeAttribute(document.baseURI || `${window.location.origin}/`);

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <base href="${baseHref}">
    <title>LEED Review Print</title>
    ${styles}
    <style>
      body {
        margin: 0;
        background: #ffffff;
      }
      .screen-view {
        display: none !important;
      }
      .print-only {
        display: block !important;
      }
      @media screen {
        body {
          padding: 12px;
        }
      }
      @media print {
        html,
        body {
          width: auto !important;
          height: auto !important;
          min-height: 0 !important;
          max-height: none !important;
          overflow: visible !important;
        }
      }
    </style>
  </head>
  <body class="${this.printBodyClass}">
    ${printRoot.outerHTML}
    <script>
      const printWhenReady = () => {
        setTimeout(() => {
          window.focus();
          window.addEventListener('afterprint', () => {
            setTimeout(() => window.close(), 300);
          }, { once: true });
          window.print();
        }, 500);
      };
      if (document.readyState === 'complete') {
        printWhenReady();
      } else {
        window.addEventListener('load', printWhenReady, { once: true });
      }
    </script>
  </body>
</html>`);
    printWindow.document.close();

    return true;
  }

  private getRecommendedActionPrintValue(): unknown {
    const sourceValue = pickValue(
      this.recordData ?? {},
      'recommendedActionsSatisfactorilyTaken',
      'recommended_actions_satisfactorily_taken'
    );

    if (sourceValue !== undefined) {
      return sourceValue;
    }

    return this.recordData
      ? undefined
      : this.form.get('recommendedActionsSatisfactorilyTaken')?.value;
  }

  private getNonConformancePrintValue(): unknown {
    const sourceValue = pickValue(
      this.recordData ?? {},
      'nonConformanceToQP',
      'non_conformance_to_qp'
    );

    if (sourceValue !== undefined) {
      return sourceValue;
    }

    return this.recordData ? undefined : this.form.get('nonConformanceToQP')?.value;
  }

  private isPrintBooleanYes(value: unknown): boolean {
    if (value === undefined || value === null || String(value).trim() === '') {
      return false;
    }

    return value === true || value === 1 || ['1', 'true', 'yes', 'y'].includes(String(value).trim().toLowerCase());
  }

  private isPrintBooleanNo(value: unknown): boolean {
    if (value === undefined || value === null || String(value).trim() === '') {
      return false;
    }

    return value === false || value === 0 || ['0', 'false', 'no', 'n'].includes(String(value).trim().toLowerCase());
  }

  private escapeAttribute(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
