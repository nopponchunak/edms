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
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { FuseConfirmationService } from '@fuse/services/confirmation';
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
  serializeDatesDeep,
} from 'app/core/services/project-review-api.service';
import {
  minSelectedCheckboxes,
} from 'app/core/utils/review-form.validators';
import { formatDateDisplay } from 'app/core/utils/date-format.util';
import { WorkflowEmailNotificationService, VALUE_ENGINEERING_REVIEW_EMAIL_CONFIG } from 'app/core/services/workflow-email-notification.service';
import { patchDefaultPreparedBy } from 'app/core/utils/prepared-by-default.util';

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
  selector: 'app-value-engineering-form',
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
  templateUrl: './value-engineering-form.component.html',
  styleUrls: ['./value-engineering-form.component.scss'],
})
export class ValueEngineeringFormComponent implements OnInit, OnDestroy {
  private readonly apiKey = 'valueEngineeringReview' as const;
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
    {
      id: '1',
      question:
        'Has the VE report mentioned the reference codes/standards or any special requirements specified for the project?',
    },
    {
      id: '2',
      question:
        'Are comments on conforming to the specified codes/standards or any special requirements appropriate?',
    },
    {
      id: '3',
      question:
        'Has the design criteria of the original design been reviewed for the VE exercise?',
    },
    {
      id: '4',
      question:
        'Are comments or proposed recommendations on the original design system(s)/design(s) selected appropriate?',
    },
    {
      id: '5',
      question:
        'Are comments or proposed recommendations on the original design system(s)/design(s) satisfying the requirements/reference standards appropriate?',
    },
    {
      id: '6',
      question:
        'Are comments and proposed recommendations on the correctness of the original designs appropriate?',
    },
    {
      id: '7',
      question:
        'Are proposed recommendations on structural sizes/reinforcements or M&E equipment capacities appropriate?',
    },
    {
      id: '8',
      question:
        'Are proposed deletions of any parts of the original design(s)/system(s) appropriate?',
    },
    {
      id: '9',
      question:
        'Are proposed changes of any specific materials/specifications (which have significant cost implication) appropriate?',
    },
    {
      id: '10',
      question:
        'Are proposed changes of any parts of the specifications appropriate?',
    },
    {
      id: '11',
      question:
        'Are proposed deletions of any decoration details appropriate?',
    },
    {
      id: '12',
      question:
        'Are proposed improvements in the functions or commercial gains, if any, appropriate?',
    },
  ];

  employeeOptions: EmployeeOption[] = [];
  employeeLookupMap = new Map<string, string>();
  filteredPreparedByOptions: EmployeeOption[] = [];
  filteredReviewedByOptions: EmployeeOption[] = [];
  filteredRespondedByOptions: EmployeeOption[] = [];
  filteredSignedByOptions: EmployeeOption[] = [];
  filteredClientProjectManagerSignedByOptions: EmployeeOption[] = [];
  filteredAcknowledgedByOptions: EmployeeOption[] = [];
  preparedBySearchCtrl = new FormControl('');
  reviewedBySearchCtrl = new FormControl('');
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
  private readonly printBodyClass = 'value-engineering-printing';
  private printFallbackCleanupTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private snackBar: MatSnackBar,
    private projectReviewApi: ProjectReviewApiService,
    private employeeService: EmployeeService,
    private projectService: ExternalProjectService,
    private fuseConfirmationService: FuseConfirmationService,
    private workflowEmailNotificationService: WorkflowEmailNotificationService
  ) {
    this.form = this.createForm();
  }

  ngOnInit(): void {
    window.addEventListener('beforeprint', this.enableValueEngineeringPrintMode);
    window.addEventListener('afterprint', this.disableValueEngineeringPrintMode);

    this.initializeDisciplines();
    this.initializeDocumentsReviewed();
    this.initializeChecklistResponses();
    this.loadEmployees();
    this.setupProjectSearch();

    // Sync reviewedBy with signedBy since they are the same person
    this.form.get('signedBy')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
      this.form.get('reviewedBy')?.setValue(value, { emitEvent: false });
    });

    // Sync respondedBy with preparedBy since they are the same person
    this.form.get('preparedBy')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
      this.form.get('respondedBy')?.setValue(value, { emitEvent: false });
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
    window.removeEventListener('beforeprint', this.enableValueEngineeringPrintMode);
    window.removeEventListener('afterprint', this.disableValueEngineeringPrintMode);
    this.disableValueEngineeringPrintMode();
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
      reviewMethod: ['before_after_release'],
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
      message: 'Are you sure you want to submit this value engineering review?',
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

    this.router.navigate(['/value-engineering']);
  }

  onEdit(): void {
    if (this.formId) {
      this.router.navigate(['/value-engineering/edit', this.formId]);
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

    if (selected.includes('Other')) {
      control?.setValidators([Validators.required]);
    } else {
      control?.setValue('', { emitEvent: false });
      control?.clearValidators();
    }

    control?.updateValueAndValidity({ emitEvent: false });
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

  onRecommendedActionsSatisfactorilyTakenChange(): void {
    const noteControl = this.form.get('note');
    const hasFollowUpContext =
      !!String(this.form.get('signedBy')?.value ?? '').trim() ||
      !!String(noteControl?.value ?? '').trim();

    if (
      hasFollowUpContext &&
      this.form.get('recommendedActionsSatisfactorilyTaken')?.value === false
    ) {
      noteControl?.setValidators([Validators.required]);
    } else {
      noteControl?.clearValidators();
    }

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
      this.filteredReviewedByOptions = employees;
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

  private persistForm(navigateToList: boolean): void {
    this.onDisciplineChange();
    this.onDocumentsReviewedChange();

    if (this.form.invalid) {
      this.form.markAllAsTouched();
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
              ? 'Value engineering review submitted successfully'
              : 'Value engineering review saved successfully',
            'Close',
            { duration: 3000 }
          );

          if (navigateToList) {
            this.router.navigate(['/value-engineering']);
          }

          // Trigger email notification for the first action step if this is being submitted
          if (navigateToList && savedId) {
            this.workflowEmailNotificationService.notifyInitialAction(
              VALUE_ENGINEERING_REVIEW_EMAIL_CONFIG,
              payload,
              savedId
            ).subscribe({
              next: () => console.log('Initial notification sent successfully'),
              error: (err) => console.error('Error sending initial notification:', err)
            });
          }
        },
        error: (error) => {
          console.error('Error saving value engineering review:', error);
          this.snackBar.open('Failed to save value engineering review', 'Close', {
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
      formType: 'mtve',
      reviewMethod: raw.reviewMethod || 'before_after_release',
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
      clientProjectManagerFeedback: raw.clientProjectManagerFeedback,
      client_project_manager_feedback: raw.clientProjectManagerFeedback,
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
    const disciplineValues = pickStringArray(data, 'discipline');
    const documentsReviewedValues = pickStringArray(
      data,
      'documentsReviewed',
      'documents_reviewed'
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
        disciplineOther: pickString(data, 'disciplineOther', 'discipline_other'),
        documentsReviewedOther: pickString(
          data,
          'documentsReviewedOther',
          'documents_reviewed_other'
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
            data?.client_project_manager_feedback ??
            data?.clientPMFeedback ??
            data?.client_pm_feedback
        ),
        clientProjectManagerComments:
          pickString(
            data,
            'clientProjectManagerComments',
            'client_project_manager_comments'
          ) ||
          pickString(
            data,
            'clientPMFeedbackComments',
            'client_pm_feedback_comments'
          ) ||
          pickString(data, 'tlComments', 'tl_comments'),
        clientProjectManagerSignedBy: pickIntegerOrString(
          data,
          'clientProjectManagerSignedBy',
          'client_project_manager_signed_by',
          'clientPMFeedbackSignedBy',
          'client_pm_feedback_signed_by',
          'signedBy',
          'signed_by'
        ),
        clientProjectManagerSignedByDate:
          pickDate(
            data,
            'clientProjectManagerSignedByDate',
            'client_project_manager_signed_by_date',
            'clientPMFeedbackSignedByDate',
            'client_pm_feedback_signed_by_date',
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

    if (this.employeeOptions.length) {
      this.normalizeEmployeeSelectionsToCode();
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

    this.enableValueEngineeringPrintMode();
    this.schedulePrintModeFallbackCleanup();
    window.print();
  }

  private enableValueEngineeringPrintMode = (): void => {
    document.body.classList.add(this.printBodyClass);
  };

  private disableValueEngineeringPrintMode = (): void => {
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

    this.printFallbackCleanupTimer = setTimeout(this.disableValueEngineeringPrintMode, 120000);
  }

  private writePrintWindow(printWindow: Window | null): boolean {
    const printRoot = document.querySelector('.value-engineering-print-root');
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
    <title>Value Engineering Review Print</title>
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

  private getClientProjectManagerFeedbackPrintValue(): unknown {
    const sourceValue = pickValue(
      this.recordData ?? {},
      'clientProjectManagerFeedback',
      'client_project_manager_feedback',
      'clientPMFeedback',
      'client_pm_feedback'
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

  private escapeAttribute(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
