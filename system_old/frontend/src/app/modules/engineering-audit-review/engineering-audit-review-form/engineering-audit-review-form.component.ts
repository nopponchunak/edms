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
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, finalize, map, startWith, switchMap, takeUntil } from 'rxjs/operators';
import { patchDefaultPreparedBy } from 'app/core/utils/prepared-by-default.util';
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
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import {
  ApprovalWorkflowComponent,
  ApprovalWorkflowStep,
} from 'app/core/components/approval-workflow';
import { ViewActionsComponent } from 'app/core/components/view-actions';
import { LegacySourceButtonComponent } from 'app/core/components/legacy-source-button';
import { EmployeeOption, EmployeeService } from 'app/core/services/employee.service';
import {
  ExternalProject,
  ExternalProjectService,
} from 'app/core/services/external-project.service';
import {
  asBoolean,
  pickDate,
  pickIntegerOrString,
  pickString,
  pickStringArray,
  pickValue,
  mergeProjectReviewEmployeeLookup,
  ProjectReviewApiService,
} from 'app/core/services/project-review-api.service';
import {
  minSelectedCheckboxes,
} from 'app/core/utils/review-form.validators';
import { formatDateDisplay } from 'app/core/utils/date-format.util';
import { WorkflowEmailNotificationService, ENGINEERING_AUDIT_REVIEW_EMAIL_CONFIG } from 'app/core/services/workflow-email-notification.service';
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
  selector: 'app-engineering-audit-review-form',
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
    NgxMatSelectSearchModule,
    ApprovalWorkflowComponent,
    ViewActionsComponent,
    LegacySourceButtonComponent,
  ],
  templateUrl: './engineering-audit-review-form.component.html',
  styleUrls: ['./engineering-audit-review-form.component.scss'],
})
export class EngineeringAuditReviewFormComponent implements OnInit, OnDestroy {
  private readonly apiKey = 'engineeringAuditReview' as const;
  private readonly destroy$ = new Subject<void>();

  form: FormGroup;
  loading = false;
  isEdit = false;
  isView = false;
  formId: string | null = null;
  hasUnsavedChanges = false;
  recordData: any = null;

  readonly disciplines = [
    'Foundation/Substructure',
    'Superstructure',
    'Lighting',
    'MVAC',
    'Geotechnical/Site Formation',
    'Façade',
    'Sanitary',
    'Electrical',
    'Lifts',
    'Fire Protection',
    'Transportation',
    'Other',
  ];

  readonly documentTypes = ['Reports', 'Calculations', 'Other'];

  readonly checklistItems: ReviewChecklistItem[] = [
    { id: '1', question: 'Is audit/study methodology sound?' },
    {
      id: '2',
      question: 'Are audit/study assumptions and parameters valid?',
    },
    { id: '3', question: 'Are loadings appropriate?' },
    { id: '4', question: 'Are proposed analysis methods appropriate?' },
    {
      id: '5',
      question: 'Are proposed investigations methods appropriate?',
    },
    {
      id: '6',
      question: 'Are proposed recommendations effective and buildable?',
    },
    {
      id: '7',
      question: "Does audit/study report meet client's requirements?",
    },
    {
      id: '8',
      question: 'Does the audit/study satisfy legal and statutory requirements?',
    },
    {
      id: '9',
      question:
        'Does the audit/study satisfy health, safety and environmental requirements?',
    },
  ];

  employeeOptions: EmployeeOption[] = [];
  employeeLookupMap = new Map<string, string>();
  filteredPreparedByOptions: EmployeeOption[] = [];
  filteredRespondedByOptions: EmployeeOption[] = [];
  filteredSignedByOptions: EmployeeOption[] = [];
  filteredClientProjectManagerSignedByOptions: EmployeeOption[] = [];
  filteredAcknowledgedByOptions: EmployeeOption[] = [];
  preparedBySearchCtrl = new FormControl('');
  respondedBySearchCtrl = new FormControl('');
  signedBySearchCtrl = new FormControl('');
  clientProjectManagerSignedBySearchCtrl = new FormControl('');
  acknowledgedBySearchCtrl = new FormControl('');
  projectSearchCtrl = new FormControl('');
  filteredProjectOptions: ExternalProject[] = [];

  private readonly employeeControlNames = [
    'preparedBy',
    'reviewedBy',
    'respondedBy',
    'signedBy',
    'clientProjectManagerSignedBy',
    'acknowledgedBy',
  ];
  private readonly printBodyClass = 'engineering-audit-review-printing';
  private printFallbackCleanupTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private snackBar: MatSnackBar,
    private projectReviewApi: ProjectReviewApiService,
    private employeeService: EmployeeService,
    private projectService: ExternalProjectService,
    private workflowEmailNotificationService: WorkflowEmailNotificationService,
    private fuseConfirmationService: FuseConfirmationService
  ) {
    this.form = this.createForm();
  }

  ngOnInit(): void {
    window.addEventListener('beforeprint', this.enableEngineeringAuditReviewPrintMode);
    window.addEventListener('afterprint', this.disableEngineeringAuditReviewPrintMode);

    this.initializeDisciplines();
    this.initializeDocumentsReviewed();
    this.initializeChecklistResponses();
    this.loadEmployees();
    this.setupProjectSearch();

    this.form.get('preparedBy')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
      this.form.get('respondedBy')?.setValue(value, { emitEvent: false });
    });

    this.form.get('respondedBy')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
      this.form.get('preparedBy')?.setValue(value, { emitEvent: false });
    });

    this.form.get('signedBy')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
      this.form.get('reviewedBy')?.setValue(value, { emitEvent: false });
    });

    this.route.params.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.formId = params['id'] ?? null;
      this.isEdit = this.route.snapshot.url.some((segment) => segment.path === 'edit');
      this.isView = this.route.snapshot.url.some((segment) => segment.path === 'view');

      if (this.formId) {
        this.loadFormData(this.formId);
      } else {
        patchDefaultPreparedBy(this.form, { syncRespondedBy: true });
      }
    });

    this.form.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.hasUnsavedChanges = true;
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeprint', this.enableEngineeringAuditReviewPrintMode);
    window.removeEventListener('afterprint', this.disableEngineeringAuditReviewPrintMode);
    this.disableEngineeringAuditReviewPrintMode();
    this.destroy$.next();
    this.destroy$.complete();
  }

  createForm(): FormGroup {
    return this.fb.group({
      projectId: [''],
      projectName: [''],
      projectNumber: [''],
      preparedBy: [''],
      discipline: this.fb.array([]),
      disciplineOther: [''],
      documentsReviewed: this.fb.array([]),
      documentsReviewedOther: [''],
      reviewMethod: ['B'],
      performingCalculations: this.fb.group({
        done: [''],
      }),
      checklistResponses: this.fb.array([]),
      comments: [''],
      recommendedActions: [''],
      nonConformanceToQP: [''],
      reviewedBy: [''],
      reviewedByDate: [null],
      respondedBy: [''],
      respondedByDate: [null],
      recommendedActionsSatisfactorilyTaken: [''],
      note: [''],
      signedBy: [''],
      signedByDate: [null],
      clientProjectManagerFeedback: [''],
      clientProjectManagerComments: [''],
      clientProjectManagerSignedBy: [''],
      clientProjectManagerSignedByDate: [null],
      acknowledgedBy: [''],
      acknowledgedByDate: [null],
    });
  }

  get disciplineFormArray(): FormArray {
    return this.form.get('discipline') as FormArray;
  }

  get documentsReviewedFormArray(): FormArray {
    return this.form.get('documentsReviewed') as FormArray;
  }

  get checklistResponses(): FormArray {
    return this.form.get('checklistResponses') as FormArray;
  }

  get disciplineDisplay(): string {
    const values = this.getSelectedDisciplines();
    if (!values.length) {
      return '-';
    }

    return values
      .map((item) =>
        item === 'Other'
          ? this.form.get('disciplineOther')?.value || 'Other'
          : item
      )
      .join(', ');
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
        next: (data) => this.patchFormData(data),
        error: (error) => {
          console.error('Error loading engineering audit review:', error);
          this.snackBar.open('Failed to load form data', 'Close', {
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

    this.router.navigate(['/engineering-audit-review']);
  }

  onEdit(): void {
    if (this.formId) {
      this.router.navigate(['/engineering-audit-review/edit', this.formId]);
    }
  }

  get workflowSteps(): ApprovalWorkflowStep[] {
    const source = this.recordData ?? {};

    return [
      {
        key: 'reviewedBy',
        title: 'Reviewed By (TL/DL/VVE)',
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
        title: 'Signed By (TL/DL/VVE)',
        assignee: this.getEmployeeDisplay(this.form.get('signedBy')?.value),
        date: this.getWorkflowDate(source, 'signedByDate', 'signed_by_date'),
        status: this.getWorkflowStatus(source, 'signedByStatus', 'signed_by_status'),
      },
      {
        key: 'clientProjectManagerSignedBy',
        title: 'Signed By (TL/PE)',
        assignee: this.getEmployeeDisplay(
          this.form.get('clientProjectManagerSignedBy')?.value
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

  onDisciplineChange(): void {
    const selected = this.getSelectedDisciplines();
    const control = this.form.get('disciplineOther');

    if (!selected.includes('Other')) {
      control?.setValue('', { emitEvent: false });
    }

    control?.clearValidators();
    control?.updateValueAndValidity({ emitEvent: false });
  }

  onDocumentsReviewedChange(): void {
    const selected = this.getSelectedDocuments();
    const control = this.form.get('documentsReviewedOther');

    if (!selected.includes('Other')) {
      control?.setValue('', { emitEvent: false });
    }

    control?.clearValidators();
    control?.updateValueAndValidity({ emitEvent: false });
  }

  onPerformingCalculationsChange(value: boolean): void {
    this.form.get('performingCalculations.done')?.setValue(value);
  }

  onRecommendedActionsSatisfactorilyTakenChange(): void {
    const noteControl = this.form.get('note');
    noteControl?.clearValidators();
    noteControl?.updateValueAndValidity({ emitEvent: false });
  }

  getSelectedDisciplines(): string[] {
    return this.extractSelectedValues(this.disciplineFormArray, this.disciplines);
  }

  getSelectedDocuments(): string[] {
    return this.extractSelectedValues(
      this.documentsReviewedFormArray,
      this.documentTypes
    );
  }

  getChecklistResponseValue(index: number): string {
    const value = String(this.checklistResponses.at(index)?.value ?? '').toLowerCase();
    return value === 'na' ? 'n/a' : value;
  }

  isChecklistResponse(index: number, expected: 'yes' | 'no' | 'n/a'): boolean {
    return this.getChecklistResponseValue(index) === expected;
  }

  getPrintChecklistQuestion(item: ReviewChecklistItem, index: number): string {
    if (index === 8) {
      return 'Does the audit/study satisfy health, safety and environmental Requirements?';
    }

    return item.question;
  }

  isPrintDisciplineSelected(discipline: string): boolean {
    return this.getSelectedDisciplines().includes(discipline);
  }

  isPrintDocumentSelected(documentType: string): boolean {
    return this.getSelectedDocuments().includes(documentType);
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

    const fallbackDate = paths
      .map((path) => this.form.get(path)?.value)
      .find((value) => value !== undefined && value !== null && String(value).trim() !== '');

    return fallbackDate ? formatDateDisplay(fallbackDate) : '';
  }

  isPerformingCalculationsYes(): boolean {
    return this.isPrintBooleanYes(this.getPerformingCalculationsPrintValue());
  }

  isPerformingCalculationsNo(): boolean {
    return this.isPrintBooleanNo(this.getPerformingCalculationsPrintValue());
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

  isClientProjectManagerFeedbackYes(): boolean {
    return this.isPrintBooleanYes(this.getClientProjectManagerFeedbackPrintValue());
  }

  isClientProjectManagerFeedbackNo(): boolean {
    return this.isPrintBooleanNo(this.getClientProjectManagerFeedbackPrintValue());
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

  private initializeDisciplines(): void {
    this.disciplineFormArray.clear();
    this.disciplines.forEach(() => this.disciplineFormArray.push(this.fb.control(false)));
  }

  private initializeDocumentsReviewed(): void {
    this.documentsReviewedFormArray.clear();
    this.documentTypes.forEach(() =>
      this.documentsReviewedFormArray.push(this.fb.control(false))
    );
  }

  private initializeChecklistResponses(): void {
    this.checklistResponses.clear();
    this.checklistItems.forEach(() => this.checklistResponses.push(this.fb.control('')));
    this.checklistResponses.clearValidators();
    this.checklistResponses.updateValueAndValidity({ emitEvent: false });
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
      this.filteredRespondedByOptions = employees;
      this.filteredSignedByOptions = employees;
      this.filteredClientProjectManagerSignedByOptions = employees;
      this.filteredAcknowledgedByOptions = employees;
      this.normalizeEmployeeSelectionsToCode();
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
      this.clientProjectManagerSignedBySearchCtrl,
      'clientProjectManagerSignedBy',
      (employees) => (this.filteredClientProjectManagerSignedByOptions = employees)
    );
    this.bindEmployeeSearch(
      this.acknowledgedBySearchCtrl,
      'acknowledgedBy',
      (employees) => (this.filteredAcknowledgedByOptions = employees)
    );
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

  private resolveEmployeeCode(value: unknown): string {
    const normalizedValue = String(value ?? '').trim().toLowerCase();
    if (!normalizedValue) {
      return '';
    }

    const matchedOption = this.employeeOptions.find((option) => {
      const fullName = [option.firstName, option.lastName]
        .filter(Boolean)
        .join(' ')
        .trim();

      return [
        option.code,
        option.id,
        option.employeeId,
        option.displayLabel,
        option.name,
        fullName,
        option.email,
      ]
        .map((candidate) => String(candidate ?? '').trim().toLowerCase())
        .filter(Boolean)
        .includes(normalizedValue);
    });

    return matchedOption?.code ?? String(value ?? '').trim();
  }

  private normalizeEmployeeSelectionsToCode(): void {
    if (!this.employeeOptions.length) {
      return;
    }

    const patch: Record<string, string> = {};

    this.employeeControlNames.forEach((controlName) => {
      const control = this.form.get(controlName);
      if (!control) {
        return;
      }

      const resolvedValue = this.resolveEmployeeCode(control.value);
      if (resolvedValue && String(control.value ?? '').trim() !== resolvedValue) {
        patch[controlName] = resolvedValue;
      }
    });

    if (Object.keys(patch).length) {
      this.form.patchValue(patch, { emitEvent: false });
    }
  }

  private ensureSelectedProjectOption(
    projectId: unknown,
    projectName: string,
    projectNumber: string
  ): void {
    const numericProjectId = Number(projectId);
    if (
      !projectId ||
      Number.isNaN(numericProjectId) ||
      this.filteredProjectOptions.some((project) => project.id === numericProjectId)
    ) {
      return;
    }

    this.filteredProjectOptions = [
      ...this.filteredProjectOptions,
      {
        id: numericProjectId,
        name: projectName,
        code: projectNumber,
        active: true,
        status: 'process',
      },
    ];
  }

  private persistForm(navigateToList: boolean): void {
    this.onDisciplineChange();
    this.onDocumentsReviewedChange();

    // Validation removed as per request
    /*
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.snackBar.open('Please fill in all required fields', 'Close', {
        duration: 3000,
      });
      return;
    }
    */

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
          const isNew = !this.formId;
          const savedId = String(response?.id ?? this.formId ?? '');
          if (isNew && savedId) {
            this.formId = savedId;
          }

          this.hasUnsavedChanges = false;
          this.form.markAsPristine();
          this.snackBar.open(
            navigateToList ? 'Form submitted successfully' : 'Form saved successfully',
            'Close',
            { duration: 3000 }
          );

          // Trigger email notification for the first action step if this is being submitted
          if (navigateToList && savedId) {
            this.workflowEmailNotificationService.notifyInitialAction(
              ENGINEERING_AUDIT_REVIEW_EMAIL_CONFIG,
              payload,
              savedId
            ).subscribe({
              next: () => console.log('Initial notification sent successfully'),
              error: (err) => console.error('Error sending initial notification:', err)
            });
          }

          if (navigateToList) {
            this.router.navigate(['/engineering-audit-review']);
          }
        },
        error: (error) => {
          console.error('Error saving engineering audit review:', error);
          this.snackBar.open('Failed to save form', 'Close', {
            duration: 3000,
          });
        },
      });
  }

  private buildPayload(): any {
    const raw = this.form.getRawValue();
    const selectedDisciplines = this.getSelectedDisciplines();
    const selectedDocuments = this.getSelectedDocuments();
    const preparedBy = this.resolveEmployeeCode(raw.preparedBy);
    const reviewedBy = this.resolveEmployeeCode(raw.reviewedBy);
    const respondedBy = this.resolveEmployeeCode(raw.respondedBy);
    const signedBy = this.resolveEmployeeCode(raw.signedBy);
    const clientProjectManagerSignedBy = this.resolveEmployeeCode(
      raw.clientProjectManagerSignedBy
    );
    const acknowledgedBy = this.resolveEmployeeCode(raw.acknowledgedBy);

    return serializeDateTimesDeep({
      ...raw,
      preparedBy,
      prepared_by: preparedBy,
      status: 'in_review',
      formType: 'mtea',
      reviewMethod: this.resolveReviewMethod(raw),
      discipline: selectedDisciplines,
      documentsReviewed: selectedDocuments,
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
      reviewedBy,
      reviewed_by: reviewedBy,
      reviewedByDate: null,
      reviewed_by_date: null,
      respondedBy,
      responded_by: respondedBy,
      respondedByDate: null,
      responded_by_date: null,
      signedBy,
      signed_by: signedBy,
      signedByDate: null,
      signed_by_date: null,
      clientProjectManagerComments: raw.clientProjectManagerComments,
      client_project_manager_comments: raw.clientProjectManagerComments,
      clientProjectManagerSignedBy,
      client_project_manager_signed_by: clientProjectManagerSignedBy,
      clientProjectManagerSignedByDate: null,
      client_project_manager_signed_by_date: null,
      acknowledgedBy,
      acknowledged_by: acknowledgedBy,
      acknowledgedByDate: null,
      acknowledged_by_date: null,
      reviewerForAction: reviewedBy,
      reviewer_for_action: reviewedBy,
      teamLeadForAction: signedBy,
      team_lead_for_action: signedBy,
      directorForAction: acknowledgedBy,
      director_for_action: acknowledgedBy,
      peResponseDate: null,
      pe_response_date: null,
      reviewerFollowUpDate: null,
      reviewer_follow_up_date: null,
      tlReviewDate: null,
      tl_review_date: null,
      diAcknowledgeDate: null,
      di_acknowledge_date: null,
      reviewedByStatus: 'pending',
      reviewed_by_status: 'pending',
      respondedByStatus: 'pending',
      responded_by_status: 'pending',
      signedByStatus: 'pending',
      signed_by_status: 'pending',
      clientProjectManagerSignedByStatus: 'pending',
      client_project_manager_signed_by_status: 'pending',
      acknowledgedByStatus: 'pending',
      acknowledged_by_status: 'pending',
      peResponse: '',
      pe_response: '',
      reviewerFollowUpNote: raw.note,
      reviewer_follow_up_note: raw.note,
      tlComments: raw.clientProjectManagerComments,
      tl_comments: raw.clientProjectManagerComments,
    });
  }

  private patchFormData(data: any): void {
    this.recordData = data;
    this.employeeLookupMap = mergeProjectReviewEmployeeLookup([data], this.employeeLookupMap);
    const projectId = pickIntegerOrString(data, 'projectId', 'project_id');
    const projectName = pickString(data, 'projectName', 'project_name');
    const projectNumber = pickString(
      data,
      'projectNumber',
      'project_number',
      'project_no'
    );
    const disciplineValues = pickStringArray(data, 'discipline');
    const documentsReviewedValues = pickStringArray(
      data,
      'documentsReviewed',
      'documents_reviewed'
    );
    const checklistValues =
      data?.checklistResponses ?? data?.checklist_responses ?? [];

    this.ensureSelectedProjectOption(projectId, projectName, projectNumber);

    this.form.patchValue(
      {
        projectId,
        projectName,
        projectNumber,
        preparedBy: pickIntegerOrString(data, 'preparedBy', 'prepared_by'),
        disciplineOther: pickString(data, 'disciplineOther', 'discipline_other'),
        documentsReviewedOther: pickString(
          data,
          'documentsReviewedOther',
          'documents_reviewed_other'
        ),
        reviewMethod: pickString(data, 'reviewMethod', 'review_method') || 'B',
        performingCalculations: {
          done: asBoolean(
            data?.performingCalculations?.done ?? data?.performing_calculations?.done
          ),
        },
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
          pickDate(data, 'reviewedByDate', 'reviewed_by_date'),
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
          ),
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
          'teamLeadForAction',
          'team_lead_for_action'
        ),
        signedByDate:
          pickDate(
            data,
            'signedByDate',
            'signed_by_date',
            'reviewerFollowUpDate',
            'reviewer_follow_up_date'
          ),
        clientProjectManagerFeedback: asBoolean(
          data?.clientProjectManagerFeedback ??
            data?.client_project_manager_feedback
        ),
        clientProjectManagerComments:
          pickString(
            data,
            'clientProjectManagerComments',
            'client_project_manager_comments'
          ) || pickString(data, 'tlComments', 'tl_comments'),
        clientProjectManagerSignedBy: pickIntegerOrString(
          data,
          'clientProjectManagerSignedBy',
          'client_project_manager_signed_by',
          'signedBy',
          'signed_by'
        ),
        clientProjectManagerSignedByDate:
          pickDate(
            data,
            'clientProjectManagerSignedByDate',
            'client_project_manager_signed_by_date',
            'tlReviewDate',
            'tl_review_date'
          ),
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
          ),
      },
      { emitEvent: false }
    );

    this.setSelectedOptions(
      this.disciplineFormArray,
      this.disciplines,
      disciplineValues.length
        ? disciplineValues
        : pickString(data, 'discipline')
        ? [pickString(data, 'discipline')]
        : []
    );
    this.setSelectedOptions(
      this.documentsReviewedFormArray,
      this.documentTypes,
      documentsReviewedValues
    );
    this.setChecklistResponses(checklistValues);
    this.onDisciplineChange();
    this.onDocumentsReviewedChange();

    this.normalizeEmployeeSelectionsToCode();

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

  private resolveReviewMethod(raw: any): string {
    const hasMethodA = raw?.performingCalculations?.done === true;
    const hasMethodB = Array.isArray(raw?.checklistResponses)
      ? raw.checklistResponses.some((value: unknown) => String(value ?? '').trim() !== '')
      : false;

    if (hasMethodA && hasMethodB) {
      return 'A+B';
    }

    if (hasMethodA) {
      return 'A';
    }

    return 'B';
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

    this.enableEngineeringAuditReviewPrintMode();
    this.schedulePrintModeFallbackCleanup();
    window.print();
  }

  private enableEngineeringAuditReviewPrintMode = (): void => {
    document.body.classList.add(this.printBodyClass);
  };

  private disableEngineeringAuditReviewPrintMode = (): void => {
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

    this.printFallbackCleanupTimer = setTimeout(this.disableEngineeringAuditReviewPrintMode, 120000);
  }

  private writePrintWindow(printWindow: Window | null): boolean {
    const printRoot = document.querySelector('.engineering-audit-review-print-root');
    if (!printWindow || !printRoot) {
      return false;
    }

    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((node) => node.outerHTML)
      .join('\n');
    const baseHref = this.escapeHtml(document.baseURI || `${window.location.origin}/`);

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <base href="${baseHref}">
    <title>Engineering Audit Study Review Print</title>
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

  private getPerformingCalculationsPrintValue(): unknown {
    const sourceValue = pickValue(
      this.recordData ?? {},
      'performingCalculations.done',
      'performing_calculations.done'
    );

    if (sourceValue !== undefined) {
      return sourceValue;
    }

    return this.recordData
      ? undefined
      : this.form.get('performingCalculations.done')?.value;
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

  private getClientProjectManagerFeedbackPrintValue(): unknown {
    const sourceValue = pickValue(
      this.recordData ?? {},
      'clientProjectManagerFeedback',
      'client_project_manager_feedback'
    );

    if (sourceValue !== undefined) {
      return sourceValue;
    }

    return this.recordData
      ? undefined
      : this.form.get('clientProjectManagerFeedback')?.value;
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

  private getPrintMarkup(): string {
    const data = this.form.getRawValue();
    const logoUrl = `${window.location.origin}/images/logo/meinhardt-logo.svg`;
    const selectedDisciplines = new Set(this.getSelectedDisciplines());
    const selectedDocuments = new Set(this.getSelectedDocuments());

    return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Engineering Audit Review Checklist</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 0;
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      font-family: Arial, Helvetica, sans-serif;
      color: #000000;
    }

    .page {
      width: 210mm;
      height: 297mm;
      margin: 0 auto;
      background: #ffffff;
      padding: 10mm 15mm;
      position: relative;
    }

    .header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 5mm;
    }

    .header-table td {
      vertical-align: top;
    }

    .company-name {
      font-size: 14pt;
      font-weight: bold;
    }

    .logo-img {
      height: 12mm;
    }

    .form-no {
      font-size: 8pt;
      text-align: right;
    }

    .title {
      text-align: center;
      font-size: 14pt;
      font-weight: bold;
      color: #1a56a6;
      margin-bottom: 5mm;
      text-decoration: underline;
    }

    .border-box {
      border: 1px solid #000;
      padding: 2mm;
      margin-bottom: 2mm;
    }

    .row {
      display: flex;
      margin-bottom: 1.5mm;
      font-size: 9pt;
      align-items: baseline;
    }

    .label {
      white-space: nowrap;
      margin-right: 1mm;
    }

    .dotted-line {
      flex: 1;
      border-bottom: 1px dotted #000;
      min-height: 1.1em;
      padding: 0 1mm;
    }

    .discipline-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 1mm 4mm;
      margin-top: 1mm;
    }

    .check-item {
      display: flex;
      align-items: center;
      gap: 1.5mm;
    }

    .checkbox {
      width: 3.5mm;
      height: 3.5mm;
      border: 1px solid #000;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 8pt;
      flex-shrink: 0;
    }

    .section-title {
      font-weight: bold;
      font-size: 10pt;
      margin-top: 2mm;
      margin-bottom: 1mm;
    }

    .checklist-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 2mm;
      font-size: 8.5pt;
    }

    .checklist-table th, .checklist-table td {
      border: 1px solid #000;
      padding: 1mm 2mm;
    }

    .checklist-table th {
      background: #f0f0f0;
    }

    .text-area {
      border-bottom: 1px dotted #000;
      min-height: 6mm;
      width: 100%;
      margin-top: 1mm;
      font-size: 9pt;
      word-break: break-all;
    }

    .signature-section {
      margin-top: 3mm;
    }

    .signature-row {
      display: grid;
      grid-template-columns: 1fr 120px;
      gap: 5mm;
      margin-bottom: 2mm;
    }

    .signature-label {
      font-size: 8pt;
      text-align: center;
      margin-top: 0.5mm;
    }

    .footer {
      position: absolute;
      bottom: 5mm;
      left: 15mm;
      right: 15mm;
      font-size: 7pt;
      display: flex;
      justify-content: space-between;
      border-top: 0.5px solid #ccc;
      padding-top: 1mm;
    }

    .side-text {
      position: absolute;
      right: 5mm;
      top: 50mm;
      writing-mode: vertical-rl;
      font-size: 12pt;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="page">
    <table class="header-table">
      <tr>
        <td style="width: 50%;">
          <div class="company-name">Meinhardt (Thailand) Ltd.</div>
        </td>
        <td style="width: 50%; text-align: right;">
          <img src="${logoUrl}" class="logo-img" alt="Logo">
          <div class="form-no">23 - FORM MTEA-01</div>
        </td>
      </tr>
    </table>

    <div class="title">ENGINEERING AUDIT/STUDY REVIEW CHECKLIST/ACTION SHEET</div>

    <div class="border-box">
      <div class="row">
        <span class="label">Project Name:</span>
        <div class="dotted-line">${this.escapeHtml(data.projectName || '-')}</div>
        <span class="label" style="margin-left: 5mm;">Project No.:</span>
        <div class="dotted-line" style="flex: 0 0 40mm;">${this.escapeHtml(data.projectNumber || '-')}</div>
      </div>

      <div class="row" style="margin-top: 3mm;">
        <span class="label">Discipline:</span>
        <div class="discipline-grid" style="flex: 1;">
          ${this.disciplines
            .map(
              (d) => `
            <div class="check-item">
              <span class="checkbox">${selectedDisciplines.has(d) ? '✓' : ''}</span>
              <span>${
                d === 'Other' && selectedDisciplines.has('Other')
                  ? this.escapeHtml(data.disciplineOther || 'Other')
                  : d
              }</span>
            </div>
          `
            )
            .join('')}
        </div>
      </div>

      <div class="row" style="margin-top: 3mm;">
        <span class="label">Document(s) Reviewed:</span>
        <div class="check-item" style="margin-right: 10mm;">
          <span class="checkbox">${selectedDocuments.has('Reports') ? '✓' : ''}</span>
          <span>Reports</span>
        </div>
        <div class="check-item" style="margin-right: 10mm;">
          <span class="checkbox">${selectedDocuments.has('Calculations') ? '✓' : ''}</span>
          <span>Calculations</span>
        </div>
        <div class="check-item">
          <span class="checkbox">${selectedDocuments.has('Other') ? '✓' : ''}</span>
          <span>Other (${this.escapeHtml(data.documentsReviewedOther || '..................')})</span>
        </div>
      </div>
    </div>

    <div class="section-title">METHOD OF REVIEW/RECORD OF REVIEW: <span style="float: right; margin-right: 20mm;">Yes &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; No</span></div>
    <div class="row">
      <span style="font-weight: bold; margin-right: 2mm;">A.</span>
      <span>Performing Alternative Calculations/Design <span style="font-size: 8pt;">(Attentive calculations are attached)</span> <b>Done?</b></span>
      <div style="flex: 1; text-align: right; margin-right: 15mm;">
        <span class="checkbox" style="margin-right: 10mm;">${data.performingCalculations?.done === true ? '✓' : ''}</span>
        <span class="checkbox">${data.performingCalculations?.done === false ? '✓' : ''}</span>
      </div>
    </div>

    <div class="section-title" style="margin-top: 3mm;">
      <span style="font-weight: bold; margin-right: 2mm;">B.</span>
      <span>Reviewing the Audit/Study documents before/after release:</span>
      <span style="float: right; margin-right: 3mm;">Yes &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; No &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; N/A</span>
    </div>

    <table class="checklist-table">
      ${this.checklistItems
        .map((item, index) => {
          const response = String(data.checklistResponses[index] || '').toLowerCase();
          return `
          <tr>
            <td style="width: 25px; text-align: center;">${index + 1}.</td>
            <td>${item.question}</td>
            <td style="width: 40px; text-align: center;">${response === 'yes' ? '✓' : ''}</td>
            <td style="width: 40px; text-align: center;">${response === 'no' ? '✓' : ''}</td>
            <td style="width: 40px; text-align: center;">${response === 'n/a' ? '✓' : ''}</td>
          </tr>
        `;
        })
        .join('')}
    </table>

    <div class="row" style="margin-top: 3mm;">
      <span class="label">Comments:</span>
      <div class="dotted-line">${this.escapeHtml(data.comments || '')}</div>
    </div>
    <div class="dotted-line" style="margin-top: 1mm; height: 1.2em;"></div>

    <div class="row" style="margin-top: 3mm;">
      <span class="label">Recommended action(s) if any:</span>
      <div class="dotted-line">${this.escapeHtml(data.recommendedActions || '')}</div>
    </div>
    <div class="row" style="margin-top: 2mm;">
      <span class="label">Any finding constitutes non-conformance to Quality Procedure?</span>
      <div style="margin-left: 5mm; display: flex; gap: 10mm;">
        <div class="check-item">
          <span class="checkbox">${data.nonConformanceToQP === true ? '✓' : ''}</span>
          <span>Yes</span>
        </div>
        <div class="check-item">
          <span class="checkbox">${data.nonConformanceToQP === false ? '✓' : ''}</span>
          <span>No</span>
        </div>
      </div>
    </div>

    <div class="signature-section">
      <div class="signature-row">
        <div class="row">
          <span class="label">Reviewed by:</span>
          <div class="dotted-line">${this.escapeHtml(this.getEmployeeDisplay(data.reviewedBy))}</div>
        </div>
        <div class="row">
          <span class="label">Date:</span>
          <div class="dotted-line">${this.formatDate(data.reviewedByDate)}</div>
        </div>
      </div>
      <div class="signature-label" style="margin-top: -2mm; margin-bottom: 3mm;">(TL/DL/VVE)</div>

      <div class="signature-row">
        <div class="row">
          <span class="label">Responded by:</span>
          <div class="dotted-line">${this.escapeHtml(this.getEmployeeDisplay(data.respondedBy))}</div>
        </div>
        <div class="row">
          <span class="label">Date:</span>
          <div class="dotted-line">${this.formatDate(data.respondedByDate)}</div>
        </div>
      </div>
      <div class="signature-label" style="margin-top: -2mm; margin-bottom: 3mm;">(PE/TE)</div>

      <div class="row" style="margin-top: 1mm;">
        <span class="label">Recommended action (s) have been satisfactorily taken:</span>
        <div style="margin-left: 5mm; display: flex; gap: 10mm;">
          <div class="check-item">
            <span class="checkbox">${data.recommendedActionsSatisfactorilyTaken === true ? '✓' : ''}</span>
            <span>Yes</span>
          </div>
          <div class="check-item">
            <span class="checkbox">${data.recommendedActionsSatisfactorilyTaken === false ? '✓' : ''}</span>
            <span>No</span>
          </div>
        </div>
      </div>

      <div class="row">
        <span class="label">Note:</span>
        <div class="dotted-line">${this.escapeHtml(data.note || '')}</div>
      </div>
      <div class="signature-row" style="margin-top: 2mm;">
        <div class="row">
          <span class="label">Signed by:</span>
          <div class="dotted-line">${this.escapeHtml(this.getEmployeeDisplay(data.signedBy))}</div>
        </div>
        <div class="row">
          <span class="label">Date:</span>
          <div class="dotted-line">${this.formatDate(data.signedByDate)}</div>
        </div>
      </div>
      <div class="signature-label" style="margin-top: -2mm; margin-bottom: 3mm;">(TL/DL/VVE)</div>

      <div class="row" style="margin-top: 1mm;">
        <span class="label" style="font-size: 8pt;">Has the Client, Project Manager given any feedback on any shortcomings in the documentation that need amendment, within 1 month after issuing?</span>
        <div style="margin-left: auto; display: flex; gap: 5mm;">
          <div class="check-item">
            <span class="checkbox">${data.clientProjectManagerFeedback === true ? '✓' : ''}</span>
            <span>Yes</span>
          </div>
          <div class="check-item">
            <span class="checkbox">${data.clientProjectManagerFeedback === false ? '✓' : ''}</span>
            <span>No</span>
          </div>
        </div>
      </div>
      <div class="row">
        <span class="label">Comments:</span>
        <div class="dotted-line">${this.escapeHtml(data.clientProjectManagerComments || '')}</div>
      </div>
      <div class="signature-row" style="margin-top: 2mm;">
        <div class="row">
          <span class="label">Signed by:</span>
          <div class="dotted-line">${this.escapeHtml(this.getEmployeeDisplay(data.clientProjectManagerSignedBy))}</div>
        </div>
        <div class="row">
          <span class="label">Date:</span>
          <div class="dotted-line">${this.formatDate(data.clientProjectManagerSignedByDate)}</div>
        </div>
      </div>
      <div class="signature-label" style="margin-top: -2mm; margin-bottom: 3mm;">(TL/PE)</div>

      <div class="signature-row">
        <div class="row">
          <span class="label">Acknowledged by:</span>
          <div class="dotted-line">${this.escapeHtml(this.getEmployeeDisplay(data.acknowledgedBy))}</div>
        </div>
        <div class="row">
          <span class="label">Date:</span>
          <div class="dotted-line">${this.formatDate(data.acknowledgedByDate)}</div>
        </div>
      </div>
      <div class="signature-label" style="margin-top: -2mm;">(DI)</div>
    </div>

    <div class="footer">
      <div>M:\MTL_INDEX\IMS DOCUMENTATION\FORMS\TEC\NC\MTEA\MTL-ENG-AUDIT-STUDY-REVIEW-CHECKLIST-ACTION-SHEET.DOC REV A (01/01/2016) WR/KK/NP/CRC</div>
      <div>Page 1 of 1</div>
    </div>

    <div class="side-text">A</div>
  </div>
</body>
</html>
    `;
  }

  private escapeHtml(text: string | null | undefined): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
