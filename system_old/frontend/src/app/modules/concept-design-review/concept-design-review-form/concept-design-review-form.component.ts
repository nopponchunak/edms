import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule, FormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Clipboard } from '@angular/cdk/clipboard';
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
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatStepperModule } from '@angular/material/stepper';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { finalize, forkJoin, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, takeUntil } from 'rxjs/operators';
import { EmployeeOption, EmployeeService } from 'app/core/services/employee.service';
import { DisciplineService } from 'app/core/services/discipline.service';
import {
  allItemsAnswered,
  minSelectedCheckboxes,
} from 'app/core/utils/review-form.validators';
import { patchDefaultPreparedBy } from 'app/core/utils/prepared-by-default.util';
import { ApiConfig } from 'app/core/config/api.config';
import {
  ExternalProject,
  ExternalProjectService,
} from 'app/core/services/external-project.service';
import {
  asBoolean,
  deriveChecklistStatus,
  pickIntegerOrString,
  pickDate,
  pickString,
  pickStringArray,
  pickValue,
  mergeProjectReviewEmployeeLookup,
  ProjectReviewApiService,
  serializeDatesDeep,
} from 'app/core/services/project-review-api.service';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { WorkflowEmailNotificationService, CONCEPT_DESIGN_REVIEW_EMAIL_CONFIG } from 'app/core/services/workflow-email-notification.service';
import { ApprovalWorkflowComponent, ApprovalWorkflowStep } from 'app/core/components/approval-workflow';
import { ViewActionsComponent } from 'app/core/components/view-actions';
import { LegacySourceButtonComponent } from 'app/core/components/legacy-source-button';
import { FuseUploadDialogComponent } from '@fuse/components/upload-dialog';
import { ConceptDesignCommentDialogComponent } from '../concept-design-review-action/concept-design-comment-dialog.component';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import {
  DiscussionParticipant,
  ProjectReviewDiscussionService,
  ProjectReviewDiscussionType,
} from 'app/core/services/project-review-discussion.service';

export interface ReviewChecklistItem {
  id: string;
  question: string;
  type: string;
  required: boolean;
}

@Component({
  selector: 'app-concept-design-review-form',
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
    MatTabsModule,
    MatCardModule,
    MatDividerModule,
    MatChipsModule,
    MatExpansionModule,
    MatStepperModule,
    MatBadgeModule,
    MatTooltipModule,
    MatMenuModule,
    MatDialogModule,
    NgxMatSelectSearchModule,
    ApprovalWorkflowComponent,
    ViewActionsComponent,
    LegacySourceButtonComponent,
  ],
  templateUrl: './concept-design-review-form.component.html',
  styleUrls: ['./concept-design-review-form.component.scss']
})
export class ConceptDesignReviewFormComponent implements OnInit, OnDestroy {
  private readonly apiKey = 'conceptDesignReview' as const;
  private readonly reviewDiscussionType: ProjectReviewDiscussionType = 'concept_design_review';
  readonly maxAttachmentFiles = 5;

  readonly isSafari =
    typeof navigator !== 'undefined' &&
    /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  form: FormGroup;
  loading = false;
  isEdit = false;
  isView = false;
  formId: string | null = null;
  hasUnsavedChanges = false;
  hasDiscussionComments = false;
  recordData: any = null;

  // Form type
  formType = 'mtdd01';

  // Discipline options
  disciplines = [
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
    'Other'
  ];
  readonly fallbackDisciplines = [...this.disciplines];

  // Document types
  documentTypes = [
    'Design Criteria Report',
    'Design Brief Report',
    'Sketches',
    'Other'
  ];

  // Checklist options
  checklistOptions = [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
    { value: 'na', label: 'N/A' }
  ];

  // MTDD-01 Concept Design Review Checklist (5 items)
  conceptDesignChecklist: ReviewChecklistItem[] = [
    { id: '1', question: 'Has the TIDP / BEP been issued, and has the PEP / CDE been agreed?', type: 'concept', required: true },
    { id: '2', question: 'Are the proposed design assumptions and parameters valid?', type: 'concept', required: true },
    { id: '3', question: 'Has spatial coordination been completed between CSA and MEP?', type: 'concept', required: true },
    { id: '4', question: 'Are utility supplies available?', type: 'concept', required: true },
    { id: '5', question: 'Is a Topographic Survey and Soils Investigation available for the site?', type: 'concept', required: true }
  ];

  // Mock data
  mockProjects = [
    { id: '1', name: 'High-Rise Office Building', number: 'MTL-2024-CDR-001' },
    { id: '2', name: 'Residential Complex', number: 'MTL-2024-CDR-002' },
    { id: '3', name: 'Shopping Mall', number: 'MTL-2024-CDR-003' }
  ];
  employeeOptions: EmployeeOption[] = [];
  employeeLookupMap = new Map<string, string>();
  filteredPreparedByOptions: EmployeeOption[] = [];
  filteredReviewedByOptions: EmployeeOption[] = [];
  filteredRespondedByOptions: EmployeeOption[] = [];
  filteredSignedByTLOptions: EmployeeOption[] = [];
  filteredSignedByTL2Options: EmployeeOption[] = [];
  filteredAcknowledgedByOptions: EmployeeOption[] = [];
  preparedBySearchCtrl = new FormControl('');
  reviewedBySearchCtrl = new FormControl('');
  respondedBySearchCtrl = new FormControl('');
  signedByTLSearchCtrl = new FormControl('');
  signedByTL2SearchCtrl = new FormControl('');
  acknowledgedBySearchCtrl = new FormControl('');
  projectSearchCtrl = new FormControl('');
  filteredProjectOptions: ExternalProject[] = [];
  private selectedProjectOption: ExternalProject | null = null;
  private readonly destroy$ = new Subject<void>();
  private readonly employeeControlNames = [
    'preparedBy',
    'reviewerForAction',
    'teamLeadForAction',
    'directorForAction',
    'reviewedBy',
    'respondedBy',
    'signedByTL',
    'signedByTL2',
    'acknowledgedBy',
  ];
  private readonly printBodyClass = 'concept-design-review-printing';
  private printFallbackCleanupTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private _snackBar: MatSnackBar,
    private projectReviewApi: ProjectReviewApiService,
    private employeeService: EmployeeService,
    private disciplineService: DisciplineService,
    private projectService: ExternalProjectService,
    private dialog: MatDialog,
    private apiConfig: ApiConfig,
    private clipboard: Clipboard,
    private projectReviewDiscussionService: ProjectReviewDiscussionService,
    private workflowEmailNotificationService: WorkflowEmailNotificationService,
    private fuseConfirmationService: FuseConfirmationService
  ) {
    this.form = this.createForm();
  }

  ngOnInit(): void {
    window.addEventListener('beforeprint', this.enableConceptDesignReviewPrintMode);
    window.addEventListener('afterprint', this.disableConceptDesignReviewPrintMode);

    this.initializeDocumentTypes();
    this.initializeChecklistResponses();
    this.loadDisciplines();
    this.loadEmployees();
    this.setupProjectSearch();

    this.route.params.subscribe(params => {
      this.formId = params['id'];
      this.isEdit = this.route.snapshot.url.some(segment => segment.path === 'edit');
      this.isView = this.route.snapshot.url.some(segment => segment.path === 'view');

      if (this.formId) {
        this.loadFormData();
      } else {
        patchDefaultPreparedBy(this.form, { syncRespondedBy: true });
      }
    });

    // Track form changes
    this.form.valueChanges.subscribe(() => {
      this.hasUnsavedChanges = true;
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeprint', this.enableConceptDesignReviewPrintMode);
    window.removeEventListener('afterprint', this.disableConceptDesignReviewPrintMode);
    this.disableConceptDesignReviewPrintMode();
    this.destroy$.next();
    this.destroy$.complete();
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
        this.filteredProjectOptions = this.mergeSelectedProjectOption(projects);
      });

    this.projectService
      .getProjects('', 20)
      .pipe(takeUntil(this.destroy$))
      .subscribe((projects) => {
        this.filteredProjectOptions = this.mergeSelectedProjectOption(projects);
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

    this.selectedProjectOption = project;
    this.form.patchValue({
      projectName: project.name,
      projectNumber: project.code,
    });
  }

  private mergeSelectedProjectOption(projects: ExternalProject[]): ExternalProject[] {
    if (
      !this.selectedProjectOption ||
      projects.some((project) => project.id === this.selectedProjectOption?.id)
    ) {
      return projects;
    }

    return [this.selectedProjectOption, ...projects];
  }

  private ensureSelectedProjectOption(
    projectId: unknown,
    projectName: string,
    projectNumber: string
  ): void {
    const numericProjectId = Number(projectId);
    if (!projectId || Number.isNaN(numericProjectId)) {
      this.selectedProjectOption = null;
      return;
    }

    const existingProject = this.filteredProjectOptions.find(
      (project) => project.id === numericProjectId
    );
    this.selectedProjectOption = existingProject ?? {
      id: numericProjectId,
      name: projectName,
      code: projectNumber,
      active: true,
      status: 'process',
    };

    this.filteredProjectOptions = this.mergeSelectedProjectOption(this.filteredProjectOptions);
  }

  private loadDisciplines(): void {
    this.disciplineService.page({ page: 1, perPage: 200, is_active: 1 }).subscribe({
      next: ({ items }) => {
        const names = (items ?? []).map((item) => item.name?.trim()).filter(Boolean) as string[];
        this.disciplines = names.length ? [...names, 'Other'] : [...this.fallbackDisciplines];
      },
      error: () => {
        this.disciplines = [...this.fallbackDisciplines];
      },
    });
  }

  createForm(): FormGroup {
    return this.fb.group({
      // Project Information
      projectId: [''],
      projectName: ['', Validators.required],
      projectNumber: ['', Validators.required],
      stage: [''],
      preparedBy: ['', Validators.required],

      // Discipline
      discipline: ['', Validators.required],
      disciplineOther: [''],

      // Document(s) Reviewed
      documentTypes: this.fb.array([], [minSelectedCheckboxes(1)]),
      documentTypesOther: [''],

      // Document Location


      // Reviewer Assignment
      reviewerForAction: [''],
      teamLeadForAction: [''],
      directorForAction: [''],

      // Checklist Responses
      checklistResponses: this.fb.array([]),

      // Comments
      comments: [''],

      // Review and Response
      reviewedBy: [''],
      reviewedByDate: [null],
      respondedBy: [''],
      respondedByDate: [null],

      // Recommended Action
      recommendedActionsSatisfactorilyTaken: [false],
      note: [''],

      // Signatures
      signedByTL: ['', Validators.required],
      signedByTLDate: [null],
      signedByTL2: ['', Validators.required],
      signedByTL2Date: [null],
      acknowledgedBy: ['', Validators.required],
      acknowledgedByDate: [null],

      // File attachments
      attachments: this.fb.array([]),

    });
  }

  get documentTypesFormArray(): FormArray {
    return this.form.get('documentTypes') as FormArray;
  }

  get checklistResponses(): FormArray {
    return this.form.get('checklistResponses') as FormArray;
  }

  get attachments(): FormArray {
    return this.form.get('attachments') as FormArray;
  }



  onDocumentTypeChange(): void {
    const documentArray = this.form.get('documentTypes') as FormArray;
    const selectedDocuments = [];

    documentArray.controls.forEach((control, index) => {
      if (control.value) {
        selectedDocuments.push(this.documentTypes[index]);
      }
    });

    if (selectedDocuments.includes('Other')) {
      this.form.get('documentTypesOther')?.setValidators([Validators.required]);
    } else {
      this.form.get('documentTypesOther')?.clearValidators();
    }
    this.form.get('documentTypesOther')?.updateValueAndValidity();
  }

  onDisciplineChange(): void {
    const discipline = this.form.get('discipline')?.value;
    if (discipline === 'Other') {
      this.form.get('disciplineOther')?.setValidators([Validators.required]);
    } else {
      this.form.get('disciplineOther')?.clearValidators();
    }
    this.form.get('disciplineOther')?.updateValueAndValidity();
  }

  onRecommendedActionsSatisfactorilyTakenChange(): void {
    const satisfactorilyTaken = this.form.get('recommendedActionsSatisfactorilyTaken')?.value;
    if (!satisfactorilyTaken) {
      this.form.get('note')?.setValidators([Validators.required]);
    } else {
      this.form.get('note')?.clearValidators();
    }
    this.form.get('note')?.updateValueAndValidity();
  }

  openUploadDialog(): void {
    const remainingSlots = this.maxAttachmentFiles - this.attachments.length;
    if (remainingSlots <= 0) {
      this._snackBar.open(`You can attach up to ${this.maxAttachmentFiles} files only`, 'Close', {
        duration: 3000,
      });
      return;
    }

    const ref = this.dialog.open(FuseUploadDialogComponent, {
      width: '560px',
      data: {
        maxItems: remainingSlots,
      },
    });

    ref.afterClosed().subscribe((result) => {
      if (!result) {
        return;
      }

      const items = (Array.isArray(result) ? result : [result]).slice(0, remainingSlots);
      items.forEach((item) => this.attachments.push(this.createAttachmentGroup(item)));
    });
  }

  removeAttachment(index: number): void {
    const attachmentsArray = this.form.get('attachments') as FormArray;
    attachmentsArray.removeAt(index);
  }


  initializeDocumentTypes(): void {
    const documentArray = this.form.get('documentTypes') as FormArray;
    documentArray.clear();

    this.documentTypes.forEach(docType => {
      documentArray.push(this.fb.control(false));
    });
  }

  initializeChecklistResponses(): void {
    const checklistArray = this.form.get('checklistResponses') as FormArray;
    checklistArray.clear();

    this.conceptDesignChecklist.forEach(item => {
      checklistArray.push(this.fb.control(''));
    });
  }

  private loadEmployees(): void {
    this.employeeService.getEmployeeLookupMap().subscribe(map => {
      this.employeeLookupMap = mergeProjectReviewEmployeeLookup(this.recordData ? [this.recordData] : [], map);
    });

    this.employeeService.getEmployeeOptions('', 2000).subscribe((employees) => {
      this.registerEmployeeOptions(employees);
      this.filteredPreparedByOptions = employees;
      this.filteredReviewedByOptions = employees;
      this.filteredRespondedByOptions = employees;
      this.filteredSignedByTLOptions = employees;
      this.filteredSignedByTL2Options = employees;
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
      this.signedByTLSearchCtrl,
      'signedByTL',
      (employees) => (this.filteredSignedByTLOptions = employees)
    );
    this.bindEmployeeSearch(
      this.signedByTL2SearchCtrl,
      'signedByTL2',
      (employees) => (this.filteredSignedByTL2Options = employees)
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
        this.registerEmployeeOptions(employees);
        update(this.mergeSelectedEmployeeOption(employees, controlName));
      });
  }

  private registerEmployeeOptions(employees: EmployeeOption[]): void {
    const merged = new Map(
      this.employeeOptions.map((option) => [option.code, option])
    );

    employees.forEach((option) => {
      if (option?.code) {
        merged.set(option.code, option);
      }
    });

    this.employeeOptions = Array.from(merged.values());
  }

  private mergeSelectedEmployeeOption(
    employees: EmployeeOption[],
    controlName: string
  ): EmployeeOption[] {
    const currentValue = String(this.form.get(controlName)?.value ?? '').trim();
    if (!currentValue) {
      return employees;
    }

    const selected = this.employeeOptions.find(
      (option) => option.code === currentValue
    );

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

  loadFormData(): void {
    this.loading = true;
    this.projectReviewApi
      .getById(this.apiKey, this.formId!)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (data) => {
          this.recordData = data;
          this.patchFormData(data);
          this.refreshDiscussionCommentState();
        },
        error: (error) => {
          console.error('Error loading concept design review:', error);
          this._snackBar.open('Failed to load form data', 'Close', {
            duration: 3000,
          });
        },
      });
  }


  private ensureSelectedEmployeeOptionsLoaded(): void {
    const codes = this.employeeControlNames
      .map((controlName) => String(this.form.get(controlName)?.value ?? '').trim())
      .filter(Boolean)
      .filter((code) => !this.employeeOptions.some((option) => option.code === code));

    if (!codes.length) {
      return;
    }

    forkJoin(
      codes.map((code) =>
        this.employeeService.getEmployeeOptions(code, 10)
      )
    ).subscribe((responses) => {
      const employees = responses.flat();
      if (!employees.length) {
        return;
      }

      this.registerEmployeeOptions(employees);
      this.filteredPreparedByOptions = this.mergeSelectedEmployeeOption(this.filteredPreparedByOptions, 'preparedBy');
      this.filteredReviewedByOptions = this.mergeSelectedEmployeeOption(this.filteredReviewedByOptions, 'reviewedBy');
      this.filteredRespondedByOptions = this.mergeSelectedEmployeeOption(this.filteredRespondedByOptions, 'respondedBy');
      this.filteredSignedByTLOptions = this.mergeSelectedEmployeeOption(this.filteredSignedByTLOptions, 'signedByTL');
      this.filteredSignedByTL2Options = this.mergeSelectedEmployeeOption(this.filteredSignedByTL2Options, 'signedByTL2');
      this.filteredAcknowledgedByOptions = this.mergeSelectedEmployeeOption(this.filteredAcknowledgedByOptions, 'acknowledgedBy');
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
    if (this.hasUnsavedChanges) {
      if (confirm('You have unsaved changes. Are you sure you want to leave?')) {
        this.router.navigate(['/concept-design-review']);
      }
    } else {
      this.router.navigate(['/concept-design-review']);
    }
  }

  onEdit(): void {
    if (this.formId) {
      this.router.navigate(['/concept-design-review/edit', this.formId]);
    }
  }

  onPrint(): void {
    if (!this.isView || this.loading) {
      this._snackBar.open('Print document is not ready yet', 'Close', {
        duration: 2500,
      });
      return;
    }

    const printWindow = window.open('', '_blank', 'width=980,height=1200');
    if (this.writePrintWindow(printWindow)) {
      return;
    }

    this.enableConceptDesignReviewPrintMode();
    this.schedulePrintModeFallbackCleanup();
    window.print();
  }

  private enableConceptDesignReviewPrintMode = (): void => {
    document.body.classList.add(this.printBodyClass);
  };

  private disableConceptDesignReviewPrintMode = (): void => {
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

    this.printFallbackCleanupTimer = setTimeout(this.disableConceptDesignReviewPrintMode, 120000);
  }

  private writePrintWindow(printWindow: Window | null): boolean {
    const printRoot = document.querySelector('.concept-design-review-print-root');
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
    <title>Concept Design Review Print</title>
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

  private escapeAttribute(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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
        readOnly: true,
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

  get workflowSteps(): ApprovalWorkflowStep[] {
    const source = this.recordData ?? {};

    return [
      {
        key: 'reviewedBy',
        title: 'Approved By Reviewer',
        assignee: this.getEmployeeDisplay(this.form.get('reviewedBy')?.value),
        date: this.getWorkflowDate(source, 'reviewedByDate', 'reviewed_by_date'),
        status: this.getWorkflowStatus(source, 'reviewedByStatus', 'reviewed_by_status'),
      },
      {
        key: 'respondedBy',
        title: 'Responded By',
        assignee: this.getEmployeeDisplay(this.form.get('respondedBy')?.value),
        date: this.getWorkflowDate(source, 'respondedByDate', 'responded_by_date'),
        status: this.getWorkflowStatus(source, 'respondedByStatus', 'responded_by_status'),
      },
      {
        key: 'signedByTL',
        title: 'Approved By Reviewer',
        assignee: this.getEmployeeDisplay(this.form.get('signedByTL')?.value),
        date: this.getWorkflowDate(source, 'signedByTLDate', 'signed_by_tl_date'),
        status: this.getWorkflowStatus(source, 'signedByTLStatus', 'signed_by_tl_status'),
      },
      {
        key: 'signedByTL2',
        title: 'Approved By TL',
        assignee: this.getEmployeeDisplay(this.form.get('signedByTL2')?.value),
        date: this.getWorkflowDate(source, 'signedByTL2Date', 'signed_by_tl2_date'),
        status: this.getWorkflowStatus(source, 'signedByTL2Status', 'signed_by_tl2_status'),
      },
      {
        key: 'acknowledgedBy',
        title: 'Acknowledged By (DI)',
        assignee: this.getEmployeeDisplay(this.form.get('acknowledgedBy')?.value),
        date: this.getWorkflowDate(source, 'acknowledgedByDate', 'acknowledged_by_date'),
        status: this.getWorkflowStatus(source, 'acknowledgedByStatus', 'acknowledged_by_status'),
      },
    ];
  }

  get displayStatus(): string {
    return deriveChecklistStatus(this.recordData ?? {});
  }

  get displayStatusLabel(): string {
    if (!this.recordData) return 'Draft';

    const isApproved = (s: string) => ['approved', 'approve', 'signed', 'acknowledged'].includes(String(s || '').trim().toLowerCase());

    if (!isApproved(pickString(this.recordData, 'reviewed_by_status', 'reviewedByStatus'))) {
        return `Pending Review (${this.getEmployeeDisplay(pickValue(this.recordData, 'reviewed_by', 'reviewedBy'))})`;
    }

    if (!isApproved(pickString(this.recordData, 'responded_by_status', 'respondedByStatus'))) {
        return `Pending Response (${this.getEmployeeDisplay(pickValue(this.recordData, 'responded_by', 'respondedBy'))})`;
    }

    if (!isApproved(pickString(this.recordData, 'signed_by_t_l_status', 'signedByTLStatus'))) {
        return `Pending Sign by TL (${this.getEmployeeDisplay(pickValue(this.recordData, 'signed_by_t_l', 'signedByTL'))})`;
    }

    if (!isApproved(pickString(this.recordData, 'signed_by_t_l2_status', 'signedByTL2Status'))) {
        return `Pending Sign by TL2 (${this.getEmployeeDisplay(pickValue(this.recordData, 'signed_by_t_l2', 'signedByTL2'))})`;
    }

    if (!isApproved(pickString(this.recordData, 'acknowledged_by_status', 'acknowledgedByStatus'))) {
        return `Pending Acknowledgment (${this.getEmployeeDisplay(pickValue(this.recordData, 'acknowledged_by', 'acknowledgedBy'))})`;
    }

    return 'Completed';
  }

  get displayStatusClass(): string {
    const label = this.displayStatusLabel;
    if (label === 'Completed') return 'bg-green-100 text-green-800';
    if (label === 'Draft') return 'bg-gray-100 text-gray-800';
    if (label === 'Rejected') return 'bg-red-100 text-red-800';

    return 'bg-blue-100 text-blue-800';
  }

  get attachmentItems(): Array<{ fileName: string; fileSize: string; uploadDate: string; type: string; filePath: string }> {
    return this.attachments.controls.map((control) => ({
      fileName:
        control.get('type')?.value === 'link'
          ? String(control.get('file_path')?.value || 'Unnamed link').trim()
          : String(control.get('file_name')?.value || control.get('file_path')?.value || 'Unnamed attachment').trim(),
      fileSize: this.formatAttachmentSize(control.get('file_size')?.value),
      uploadDate: formatDateDisplay(control.get('uploaded_at')?.value),
      type: control.get('type')?.value || 'file',
      filePath: String(control.get('file_path')?.value ?? '').trim(),
    }));
  }

  openAttachment(item: { type: string; filePath: string }): void {
    const path = item.filePath;
    if (!path) {
      return;
    }

    // 1. Web link or UNC Network path (\\server\path)
    if (path.startsWith('http') || path.startsWith('\\\\')) {
      window.open(path, '_blank');
      return;
    }

    // 2. Local Drive Path (e.g. D:\path or C:/path)
    const isDrivePath = /^[a-zA-Z]:\\/.test(path) || /^[a-zA-Z]:\//.test(path);
    if (isDrivePath) {
      // Browsers block file:/// from web pages.
      // We try to open it, but also copy to clipboard as a reliable fallback.
      this.copyToClipboard(path);
      const fileUrl = `file:///${path.replace(/\\/g, '/')}`;
      window.open(fileUrl, '_blank');
      return;
    }

    // 3. Server File (Stored in storage/ folder)
    if (item.type === 'file') {
      const url = path.startsWith('/') ? path : `/storage/${path}`;
      window.open(this.apiConfig.buildUrl(url), '_blank');
    } else {
      // Fallback for other link types
      window.open(path, '_blank');
    }
  }

  copyToClipboard(text: string): void {
    if (this.clipboard.copy(text)) {
      this._snackBar.open('Path copied to clipboard', 'OK', { duration: 3000 });
    }
  }

  getWorkflowDate(source: any, field: string, alternative: string): string | null {
    const date = pickDate(source, alternative, field);
    return date ? formatDateDisplay(date) : null;
  }

  getWorkflowStatus(source: any, field: string, alternative: string): string {
    return pickString(source, alternative, field) || 'pending';
  }

  getEmployeeDisplay(code: string): string {
    return this.employeeLookupMap.get(code) || code || '-';
  }

  get disciplineDisplay(): string {
    return this.form.get('discipline')?.value === 'Other'
      ? this.form.get('disciplineOther')?.value || '-'
      : this.form.get('discipline')?.value || '-';
  }

  getChecklistResponseValue(index: number): string {
    return String(this.checklistResponses.at(index)?.value ?? '').toLowerCase();
  }

  isChecklistResponse(index: number, expected: 'yes' | 'no' | 'na'): boolean {
    return this.getChecklistResponseValue(index) === expected;
  }

  isPrintDocumentTypeSelected(docType: string): boolean {
    return this.getSelectedDocumentTypes().includes(docType);
  }

  getPrintControlValue(controlName: string): string {
    const value = this.form.get(controlName)?.value;
    return value === undefined || value === null ? '' : String(value).trim();
  }

  getPrintEmployeeDisplay(value: unknown): string {
    const display = this.getEmployeeDisplay(String(value ?? ''));
    return display === '-' ? '' : display;
  }

  getPrintDate(...paths: string[]): string {
    const date = pickDate(this.recordData ?? {}, ...paths);
    return date ? formatDateDisplay(date) : '';
  }

  isRecommendedActionYes(): boolean {
    const value = this.getRecommendedActionPrintValue();
    return value !== undefined && value !== null && String(value).trim() !== '' && asBoolean(value);
  }

  isRecommendedActionNo(): boolean {
    const value = this.getRecommendedActionPrintValue();
    if (value === undefined || value === null || String(value).trim() === '') {
      return false;
    }

    if (typeof value === 'string') {
      return ['0', 'false', 'n', 'no'].includes(value.trim().toLowerCase());
    }

    return value === false || value === 0;
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

  getChecklistResponseLabel(index: number): string {
    switch (this.getChecklistResponseValue(index)) {
      case 'yes':
        return 'Yes';
      case 'no':
        return 'No';
      case 'na':
        return 'N/A';
      default:
        return '-';
    }
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

  getRoleDisplay(controlName: string): string {
    const roles: Record<string, string> = {
      reviewedBy: 'TL(CSA), DL(MEP)',
      respondedBy: 'PE',
      signedByTL: 'TL(CSA), DL(MEP)',
      signedByTL2: 'TL(MEP)',
      acknowledgedBy: 'DI',
    };

    return roles[controlName] || '-';
  }

  getSelectedDocumentTypes(): string[] {
    const documentArray = this.form.get('documentTypes') as FormArray;
    const selectedDocuments = [];

    documentArray.controls.forEach((control, index) => {
      if (control.value) {
        selectedDocuments.push(this.documentTypes[index]);
      }
    });

    return selectedDocuments;
  }

  getDocumentTypeLabel(docType: string): string {
    return docType;
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
        name: this.getEmployeeDisplay(code),
        workflowRole,
        authorRole,
      });
    };

    pushParticipant(this.recordData?.reviewed_by || this.recordData?.reviewedBy, 'reviewed_by', 'reviewer');
    pushParticipant(this.recordData?.responded_by || this.recordData?.respondedBy, 'responded_by', 'team');
    pushParticipant(this.recordData?.signed_by_tl || this.recordData?.signedByTL, 'signed_by_tl', 'reviewer');
    pushParticipant(this.recordData?.signed_by_tl2 || this.recordData?.signedByTL2, 'signed_by_tl2', 'reviewer');
    pushParticipant(this.recordData?.acknowledged_by || this.recordData?.acknowledgedBy, 'acknowledged_by', 'reviewer');

    return participants;
  }

  private persistForm(navigateToList: boolean): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      this._snackBar.open('Please fill in all required fields', 'Close', {
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
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (response) => {
          const savedId = String(response?.id ?? this.formId ?? '');
          if (!this.formId && savedId) {
            this.formId = savedId;
          }

          this.hasUnsavedChanges = false;
          this.form.markAsPristine();
          this._snackBar.open(
            navigateToList ? 'Form submitted successfully' : 'Form saved successfully',
            'Close',
            { duration: 3000 }
          );

          if (navigateToList) {
            this.router.navigate(['/concept-design-review']);
          }

          // Trigger email notification for the first action step if this is being submitted
          if (navigateToList && savedId) {
            this.workflowEmailNotificationService.notifyInitialAction(
              CONCEPT_DESIGN_REVIEW_EMAIL_CONFIG,
              this.workflowEmailNotificationService.createNotificationSource(payload, response),
              savedId
            ).subscribe({
              next: () => console.log('Initial notification sent successfully'),
              error: (err) => console.error('Error sending initial notification:', err)
            });
          }
        },
        error: (error) => {
          console.error('Error saving concept design review:', error);
          this._snackBar.open('Failed to save form', 'Close', {
            duration: 3000,
          });
        },
      });
  }

  private buildPayload(): any {
    const raw = this.form.getRawValue();
    const attachmentPaths = this.attachments.controls
      .filter(c => c.get('type')?.value !== 'link')
      .map(c => String(c.get('file_path')?.value || '').trim())
      .filter(Boolean);

    const drivePaths = this.attachments.controls
      .filter(c => c.get('type')?.value === 'link')
      .map(c => String(c.get('file_path')?.value || '').trim())
      .filter(Boolean);

    const documentLocation = drivePaths.join('\n');

    const preparedBy = this.resolveEmployeeCode(raw.preparedBy);
    const reviewerForAction = this.resolveEmployeeCode(raw.reviewerForAction);
    const teamLeadForAction = this.resolveEmployeeCode(raw.teamLeadForAction);
    const directorForAction = this.resolveEmployeeCode(raw.directorForAction);
    const signedByTL = this.resolveEmployeeCode(raw.signedByTL);
    const reviewedBy = signedByTL;
    const respondedBy = this.resolveEmployeeCode(raw.preparedBy);
    const signedByTL2 = this.resolveEmployeeCode(raw.signedByTL2);
    const acknowledgedBy = this.resolveEmployeeCode(raw.acknowledgedBy);

    return serializeDatesDeep({
      ...raw,
      attachments: attachmentPaths,
      drivePaths,
      drive_paths: drivePaths,
      documentLocation,
      document_location: documentLocation,

      preparedBy,
      prepared_by: preparedBy,
      reviewerForAction,
      reviewer_for_action: reviewerForAction,
      teamLeadForAction,
      team_lead_for_action: teamLeadForAction,
      directorForAction,
      director_for_action: directorForAction,
      reviewedBy,
      reviewed_by: reviewedBy,
      respondedBy,
      responded_by: respondedBy,
      signedByTL,
      signed_by_tl: signedByTL,
      signedByTL2,
      signed_by_tl2: signedByTL2,
      acknowledgedBy,
      acknowledged_by: acknowledgedBy,
      reviewedByDate: null,
      reviewed_by_date: null,
      respondedByDate: null,
      responded_by_date: null,
      signedByTLDate: null,
      signed_by_tl_date: null,
      signedByTL2Date: null,
      signed_by_tl2_date: null,
      acknowledgedByDate: null,
      acknowledged_by_date: null,
      reviewedByStatus: 'pending',
      reviewed_by_status: 'pending',
      respondedByStatus: 'pending',
      responded_by_status: 'pending',
      signedByTLStatus: 'pending',
      signed_by_tl_status: 'pending',
      signedByTL2Status: 'pending',
      signed_by_tl2_status: 'pending',
      acknowledgedByStatus: 'pending',
      acknowledged_by_status: 'pending',
      formType: this.formType,
      documentTypes: this.getSelectedDocumentTypes(),
      checklistResponses: this.conceptDesignChecklist.map((item, index) => ({
        id: item.id,
        question: item.question,
        response: raw.checklistResponses[index] ?? '',
      })),
    });
  }

  private patchFormData(data: any): void {
    this.recordData = data;
    this.employeeLookupMap = mergeProjectReviewEmployeeLookup([data], this.employeeLookupMap);

    const projectId = pickIntegerOrString(data, 'projectId', 'project_id');
    const projectName = pickString(data, 'projectName', 'project_name');
    const projectNumber = pickString(data, 'projectNumber', 'project_number', 'project_no');
    this.ensureSelectedProjectOption(projectId, projectName, projectNumber);

    this.form.patchValue({
      projectId: projectId ? Number(projectId) : '',
      projectName,
      projectNumber,
      stage: pickString(data, 'stage'),
      preparedBy: pickIntegerOrString(data, 'preparedBy', 'prepared_by'),
      discipline: pickString(data, 'discipline'),
      disciplineOther: pickString(data, 'disciplineOther', 'discipline_other'),
      documentTypesOther: pickString(data, 'documentTypesOther', 'document_types_other'),

      reviewerForAction: pickIntegerOrString(
        data,
        'reviewerForAction',
        'reviewer_for_action'
      ),
      teamLeadForAction: pickIntegerOrString(
        data,
        'teamLeadForAction',
        'team_lead_for_action'
      ),
      directorForAction: pickIntegerOrString(
        data,
        'directorForAction',
        'director_for_action'
      ),
      comments: pickString(data, 'comments'),
      recommendedActionsSatisfactorilyTaken:
        (data?.recommendedActionsSatisfactorilyTaken ?? data?.recommended_actions_satisfactorily_taken) === 'yes' ||
        (data?.recommendedActionsSatisfactorilyTaken ?? data?.recommended_actions_satisfactorily_taken) === true,
      note: pickString(data, 'note', 'recommended_actions_note', 'recommendedActionsNote'),
      reviewedBy: pickIntegerOrString(data, 'reviewedBy', 'reviewed_by'),
      reviewedByDate: null,
      respondedBy: pickIntegerOrString(data, 'respondedBy', 'responded_by'),
      respondedByDate: null,
      signedByTL: pickIntegerOrString(data, 'signedByTL', 'signed_by_tl'),
      signedByTLDate: null,
      signedByTL2: pickIntegerOrString(data, 'signedByTL2', 'signed_by_tl2'),
      signedByTL2Date: null,
      acknowledgedBy: pickIntegerOrString(
        data,
        'acknowledgedBy',
        'acknowledged_by'
      ),
      acknowledgedByDate: null,
    });

    this.setSelectedDocumentTypes(
      pickStringArray(data, 'documentTypes', 'document_types')
    );
    this.setChecklistResponses(data?.checklistResponses ?? data?.checklist_responses ?? []);
    const attachments = data?.attachments ?? [];
    const drivePaths = pickStringArray(data, 'drivePaths', 'drive_paths');
    this.setAttachments(attachments, drivePaths);

    this.onDocumentTypeChange();
    this.onDisciplineChange();
    this.onRecommendedActionsSatisfactorilyTakenChange();
    this.normalizeEmployeeSelectionsToCode();
    this.ensureSelectedEmployeeOptionsLoaded();
    this.hasUnsavedChanges = false;
    this.form.markAsPristine();
  }

  private setSelectedDocumentTypes(selectedValues: string[]): void {
    const documentArray = this.form.get('documentTypes') as FormArray;
    documentArray.controls.forEach((control, index) => {
      control.setValue(selectedValues.includes(this.documentTypes[index]), {
        emitEvent: false,
      });
    });
  }

  private setChecklistResponses(values: any[]): void {
    const checklistArray = this.form.get('checklistResponses') as FormArray;
    const responsesById = new Map(
      (Array.isArray(values) ? values : []).map((item: any) => [
        String(item?.id ?? ''),
        item?.response ?? item?.value ?? '',
      ])
    );

    checklistArray.controls.forEach((control, index) => {
      const response =
        responsesById.get(this.conceptDesignChecklist[index]?.id) ??
        values[index]?.response ??
        values[index] ??
        '';

      control.setValue(response, { emitEvent: false });
    });
  }

  private setAttachments(files: any[], links: string[] = []): void {
    const attachmentsArray = this.form.get('attachments') as FormArray;
    attachmentsArray.clear();

    (Array.isArray(files) ? files : []).forEach((item) => {
      attachmentsArray.push(this.createAttachmentGroup(item));
    });

    (Array.isArray(links) ? links : []).forEach((link) => {
      if (link) {
        attachmentsArray.push(this.createAttachmentGroup({
          file_path: link,
          type: 'link'
        }));
      }
    });
  }



  private createAttachmentGroup(item: any): FormGroup {
    const isStringItem = typeof item === 'string';
    const filePath = String(
      isStringItem ? item : item?.file_path ?? item?.path ?? item?.file_url ?? item?.url ?? ''
    ).trim();

    const type = isStringItem ? 'file' : item?.type ?? 'file';

    let fileName = '';
    if (type === 'link') {
      fileName = filePath;
    } else if (isStringItem) {
      fileName = filePath.split(/[\\/]/).pop() || filePath;
    } else {
      fileName = item?.file_name ?? item?.fileName ?? item?.name ?? (filePath.split(/[\\/]/).pop() || '');
    }
    fileName = String(fileName).trim();

    return this.fb.group({
      id: [isStringItem ? null : item?.id ?? null],
      file_name: [fileName],
      file_path: [filePath],
      file_url: [isStringItem ? '' : item?.file_url ?? item?.url ?? ''],
      file_size: [isStringItem ? null : item?.file_size ?? item?.fileSize ?? null],
      mime_type: [isStringItem ? '' : item?.mime_type ?? ''],
      uploaded_at: [isStringItem ? null : pickDate(item, 'uploaded_at', 'uploadDate', 'upload_date')],
      type: [type],
      file: [isStringItem ? null : item?.file ?? null],
    });
  }

  private getAttachmentPaths(): string[] {
    return this.attachments.controls
      .map((control) => String(control.get('file_path')?.value ?? '').trim())
      .filter(Boolean)
      .slice(0, this.maxAttachmentFiles);
  }



  formatAttachmentSize(value: unknown): string {
    const size = Number(value);
    if (!Number.isFinite(size) || size <= 0) {
      return '';
    }

    return `${(size / 1024).toFixed(2)} KB`;
  }

}
