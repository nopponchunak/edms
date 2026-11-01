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
import { Clipboard } from '@angular/cdk/clipboard';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialogModule } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatStepperModule } from '@angular/material/stepper';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatBadgeModule } from '@angular/material/badge';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { finalize, forkJoin, Subject } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  switchMap,
  takeUntil,
} from 'rxjs/operators';
import { ApprovalWorkflowComponent, ApprovalWorkflowStep } from 'app/core/components/approval-workflow';
import { ViewActionsComponent } from 'app/core/components/view-actions';
import { EmployeeOption, EmployeeService } from 'app/core/services/employee.service';
import { DisciplineService } from 'app/core/services/discipline.service';
import { FuseUploadDialogComponent } from '@fuse/components/upload-dialog';
import { SubmissionDesignCommentDialogComponent } from '../submission-review-action/submission-design-comment-dialog.component';
import {
  asBoolean,
  deriveChecklistStatus,
  pickDate,
  pickIntegerOrString,
  pickString,
  pickStringArray,
  pickValue,
  mergeProjectReviewEmployeeLookup,
  ProjectReviewApiService,
  serializeDatesDeep,
} from 'app/core/services/project-review-api.service';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { WorkflowEmailNotificationService, SUBMISSION_REVIEW_EMAIL_CONFIG } from 'app/core/services/workflow-email-notification.service';
import {
  minSelectedCheckboxes,
} from 'app/core/utils/review-form.validators';
import { patchDefaultPreparedBy } from 'app/core/utils/prepared-by-default.util';
import { ApiConfig } from 'app/core/config/api.config';
import {
  DiscussionParticipant,
  ProjectReviewDiscussionService,
  ProjectReviewDiscussionType,
} from 'app/core/services/project-review-discussion.service';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import {
  ExternalProject,
  ExternalProjectService,
} from 'app/core/services/external-project.service';

export interface ReviewChecklistItem {
  id: string;
  question: string;
  type: string;
  required: boolean;
}

@Component({
  selector: 'app-submission-review-form',
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
  ],
  templateUrl: './submission-review-form.component.html',
  styleUrls: ['./submission-review-form.component.scss'],
})
export class SubmissionReviewFormComponent implements OnInit, OnDestroy {
  private readonly apiKey = 'submissionReview' as const;
  private readonly reviewDiscussionType: ProjectReviewDiscussionType = 'submission_review';
  private readonly destroy$ = new Subject<void>();
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

  formType = 'mtdd03';

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
    'Other',
  ];
  readonly fallbackDisciplines = [...this.disciplines];

  documentTypes = [
    'Drawings',
    'Reports',
    'Calculations',
    'Analysis Model',
    'Other',
  ];

  submissionReviewChecklist: ReviewChecklistItem[] = [
    { id: '1', question: 'Does the submission package align with the design?', type: 'submission', required: false },
    { id: '2', question: 'Is presentation / format of drawings, reports & other submission documents as per Authority Requirements?', type: 'submission', required: false },
    { id: '3', question: 'Have Engineering Signatures and License Numbers been provided?', type: 'submission', required: false },
    { id: '4', question: 'Are the floor and room names, correct?', type: 'submission', required: false },
    { id: '5', question: 'Does the design meet related legal and statutory requirements?', type: 'submission', required: false },
    { id: '6', question: 'Do the details on the submission documents conform to submission calculation results?', type: 'submission', required: false },
    { id: '7', question: 'Are the documents complete and suitable for this issue / endorsement?', type: 'submission', required: false },
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
  private readonly printBodyClass = 'submission-review-printing';
  private printFallbackCleanupTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private snackBar: MatSnackBar,
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
    window.addEventListener('beforeprint', this.enableSubmissionReviewPrintMode);
    window.addEventListener('afterprint', this.disableSubmissionReviewPrintMode);

    this.initializeDocumentTypes();
    this.initializeChecklistResponses();
    this.loadDisciplines();
    this.loadEmployees();
    this.setupProjectSearch();

    this.route.params.subscribe((params) => {
      this.formId = params['id'];
      this.isEdit = this.route.snapshot.url.some((segment) => segment.path === 'edit');
      this.isView = this.route.snapshot.url.some((segment) => segment.path === 'view');

      if (this.formId) {
        this.loadFormData();
      } else {
        patchDefaultPreparedBy(this.form, { syncRespondedBy: true });
      }
    });

    this.form.valueChanges.subscribe(() => {
      this.hasUnsavedChanges = true;
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeprint', this.enableSubmissionReviewPrintMode);
    window.removeEventListener('afterprint', this.disableSubmissionReviewPrintMode);
    this.disableSubmissionReviewPrintMode();
    this.destroy$.next();
    this.destroy$.complete();
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
      projectId: [''],
      projectName: ['', Validators.required],
      projectNumber: ['', Validators.required],
      stage: [''],
      preparedBy: ['', Validators.required],
      discipline: ['', Validators.required],
      disciplineOther: [''],
      documentTypes: this.fb.array([], [minSelectedCheckboxes(1)]),
      documentTypesOther: [''],

      reviewerForAction: [''],
      teamLeadForAction: [''],
      directorForAction: [''],
      checklistResponses: this.fb.array([]),
      comments: [''],
      reviewedBy: [''],
      reviewedByDate: [null],
      respondedBy: [''],
      respondedByDate: [null],
      recommendedActionsSatisfactorilyTaken: [false],
      note: [''],
      signedByTL: [''],
      signedByTLDate: [null],
      signedByTL2: [''],
      signedByTL2Date: [null],
      acknowledgedBy: [''],
      acknowledgedByDate: [null],
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
    const selectedDocuments = this.getSelectedDocumentTypes();

    if (selectedDocuments.includes('Other')) {
      this.form.get('documentTypesOther')?.setValidators([Validators.required]);
    } else {
      this.form.get('documentTypesOther')?.clearValidators();
    }

    this.form.get('documentTypesOther')?.updateValueAndValidity();
  }

  onDisciplineChange(): void {
    if (this.form.get('discipline')?.value === 'Other') {
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
      this.snackBar.open(`You can attach up to ${this.maxAttachmentFiles} files only`, 'Close', { duration: 3000 });
      return;
    }

    const ref = this.dialog.open(FuseUploadDialogComponent, {
      width: '560px',
      data: { maxItems: remainingSlots },
    });

    ref.afterClosed().subscribe((result) => {
      if (!result) {
        return;
      }

      (Array.isArray(result) ? result : [result])
        .slice(0, remainingSlots)
        .forEach((item) => this.attachments.push(this.createAttachmentGroup(item)));
    });
  }

  removeAttachment(index: number): void {
    this.attachments.removeAt(index);
  }



  initializeDocumentTypes(): void {
    this.documentTypesFormArray.clear();
    this.documentTypes.forEach(() => this.documentTypesFormArray.push(this.fb.control(false)));
  }

  initializeChecklistResponses(): void {
    this.checklistResponses.clear();
    this.submissionReviewChecklist.forEach(() => this.checklistResponses.push(this.fb.control('')));
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
    this.bindEmployeeSearch(this.preparedBySearchCtrl, 'preparedBy', (employees) => (this.filteredPreparedByOptions = employees));
    this.bindEmployeeSearch(this.reviewedBySearchCtrl, 'reviewedBy', (employees) => (this.filteredReviewedByOptions = employees));
    this.bindEmployeeSearch(this.respondedBySearchCtrl, 'respondedBy', (employees) => (this.filteredRespondedByOptions = employees));
    this.bindEmployeeSearch(this.signedByTLSearchCtrl, 'signedByTL', (employees) => (this.filteredSignedByTLOptions = employees));
    this.bindEmployeeSearch(this.signedByTL2SearchCtrl, 'signedByTL2', (employees) => (this.filteredSignedByTL2Options = employees));
    this.bindEmployeeSearch(this.acknowledgedBySearchCtrl, 'acknowledgedBy', (employees) => (this.filteredAcknowledgedByOptions = employees));
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
        switchMap((term) => this.employeeService.getEmployeeOptions(term ? term.toString().trim() : '', 50)),
        takeUntil(this.destroy$)
      )
      .subscribe((employees) => {
        this.registerEmployeeOptions(employees);
        update(this.mergeSelectedEmployeeOption(employees, controlName));
      });
  }

  private registerEmployeeOptions(employees: EmployeeOption[]): void {
    const merged = new Map(this.employeeOptions.map((option) => [option.code, option]));

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

    const selected = this.employeeOptions.find((option) => option.code === currentValue);
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
      const fullName = [option.firstName, option.lastName].filter(Boolean).join(' ').trim();
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

  private ensureSelectedEmployeeOptionsLoaded(): void {
    const codes = this.employeeControlNames
      .map((controlName) => String(this.form.get(controlName)?.value ?? '').trim())
      .filter(Boolean)
      .filter((code) => !this.employeeOptions.some((option) => option.code === code));

    if (!codes.length) {
      return;
    }

    forkJoin(codes.map((code) => this.employeeService.getEmployeeOptions(code, 10))).subscribe((responses) => {
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

  loadFormData(): void {
    this.loading = true;
    this.projectReviewApi
      .getById(this.apiKey, this.formId!)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (data) => {
          this.patchFormData(data);
          this.refreshDiscussionCommentState();
        },
        error: (error) => {
          console.error('Error loading submission review:', error);
          this.snackBar.open('Failed to load form data', 'Close', { duration: 3000 });
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
    if (this.hasUnsavedChanges) {
      if (confirm('You have unsaved changes. Are you sure you want to leave?')) {
        this.router.navigate(['/submission-review']);
      }
      return;
    }

    this.router.navigate(['/submission-review']);
  }

  onEdit(): void {
    if (this.formId) {
      this.router.navigate(['/submission-review/edit', this.formId]);
    }
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

    this.enableSubmissionReviewPrintMode();
    this.schedulePrintModeFallbackCleanup();
    window.print();
  }

  private enableSubmissionReviewPrintMode = (): void => {
    document.body.classList.add(this.printBodyClass);
  };

  private disableSubmissionReviewPrintMode = (): void => {
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

    this.printFallbackCleanupTimer = setTimeout(this.disableSubmissionReviewPrintMode, 120000);
  }

  private writePrintWindow(printWindow: Window | null): boolean {
    const printRoot = document.querySelector('.submission-review-print-root');
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
    <title>Submission Review Print</title>
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

  get hasLegacySource(): boolean {
    return this.legacySourcePath !== '';
  }

  get legacySourcePath(): string {
    const source = this.recordData ?? {};
    const legacySource = source.legacy_source ?? source.legacySource ?? {};

    const explicitPath = pickString(
      source,
      'legacyViewPath',
      'legacy_view_path',
      'legacy_source.legacy_view_path',
      'legacySource.legacyViewPath'
    );

    if (explicitPath) {
      return explicitPath;
    }

    const isLegacy = asBoolean(
      pickValue(source, 'isLegacy', 'is_legacy', 'legacy_source.is_legacy', 'legacySource.isLegacy')
    );
    const stage = pickString(legacySource, 'sourceStage', 'source_stage') || pickString(source, 'stageKey');
    const sourceId = pickString(legacySource, 'sourceId', 'source_id');

    if (isLegacy && stage && sourceId) {
      return `/legacy-design-review/${stage}/${sourceId}`;
    }

    return '';
  }

  openLegacySource(): void {
    const path = this.legacySourcePath;
    if (!path) {
      return;
    }

    if (/^https?:\/\//i.test(path)) {
      window.open(path, '_blank', 'noopener');
      return;
    }

    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = this.router.serializeUrl(this.router.createUrlTree([normalizedPath]));
    window.open(url, '_blank', 'noopener');
  }

  openCommentDialog(): void {
    if (!this.formId) {
      return;
    }

    const dialogRef = this.dialog.open(SubmissionDesignCommentDialogComponent, {
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
        title: 'Responded By (TE)',
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
        title: 'Approved by TL',
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
    const source = this.recordData ?? {};
    const nextAction = this.getNextPendingAction(source);

    if (this.displayStatus === 'completed') return 'Completed';
    if (this.displayStatus === 'rejected') return 'Rejected';
    if (this.displayStatus === 'draft') return 'Draft';

    switch (nextAction) {
      case 'reviewed_by_status':
        return `Pending Review (${this.getEmployeeDisplay(this.form.get('reviewedBy')?.value)})`;
      case 'responded_by_status':
        return `Pending Response (${this.getEmployeeDisplay(this.form.get('respondedBy')?.value)})`;
      case 'signed_by_t_l_status':
        return `Pending Sign by TL (${this.getEmployeeDisplay(this.form.get('signedByTL')?.value)})`;
      case 'signed_by_t_l2_status':
        return `Pending Sign by TL2 (${this.getEmployeeDisplay(this.form.get('signedByTL2')?.value)})`;
      case 'acknowledged_by_status':
        return `Pending Acknowledgment (${this.getEmployeeDisplay(this.form.get('acknowledgedBy')?.value)})`;
      default:
        return 'In Review';
    }
  }

  get displayStatusClass(): string {
    switch (this.displayStatus) {
      case 'in_review':
        return 'bg-blue-100 text-blue-800';
      case 'responded':
        return 'bg-purple-100 text-purple-800';
      case 'signed':
        return 'bg-indigo-100 text-indigo-800';
      case 'acknowledged':
        return 'bg-orange-100 text-orange-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  get attachmentItems(): Array<{ fileName: string; fileSize: string; uploadDate: string; type: string; filePath: string }> {
    return this.attachments.controls.map((control) => ({
      fileName:
        control.get('type')?.value === 'link'
          ? String(control.get('file_path')?.value || 'Unnamed link').trim()
          : String(control.get('file_name')?.value || control.get('file_path')?.value || 'Unnamed attachment').trim(),
      fileSize: this.formatAttachmentSize(control.get('file_size')?.value),
      uploadDate: formatDateTimeDisplay(control.get('uploaded_at')?.value),
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
      this.snackBar.open('Path copied to clipboard', 'OK', { duration: 3000 });
    }
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

  isRecommendedActionYes(): boolean {
    const value = this.getRecommendedActionPrintValue();
    if (value === undefined || value === null || String(value).trim() === '') {
      return false;
    }

    return value === true || value === 1 || ['1', 'true', 'yes', 'y'].includes(String(value).trim().toLowerCase());
  }

  isRecommendedActionNo(): boolean {
    const value = this.getRecommendedActionPrintValue();
    if (value === undefined || value === null || String(value).trim() === '') {
      return false;
    }

    return value === false || value === 0 || ['0', 'false', 'no', 'n'].includes(String(value).trim().toLowerCase());
  }

  private getRecommendedActionPrintValue(): unknown {
    const sourceValue = pickValue(
      this.recordData ?? {},
      'recommendedActionsSatisfactorilyTaken',
      'recommended_actions_satisfactorily_taken',
      'recommendedActionsSatisfactorilyTakenByTL',
      'recommended_actions_satisfactorily_taken_by_tl',
      'recommended_actions_satisfactorily_taken_by_t_l'
    );

    if (sourceValue !== undefined) {
      return sourceValue;
    }

    return this.recordData
      ? undefined
      : this.form.get('recommendedActionsSatisfactorilyTaken')?.value;
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
      reviewedBy: 'TL',
      respondedBy: 'PE',
      signedByTL: 'TL',
      signedByTL2: 'TL',
      acknowledgedBy: 'DI',
    };

    return roles[controlName] || '-';
  }

  getSelectedDocumentTypes(): string[] {
    const selectedDocuments: string[] = [];

    this.documentTypesFormArray.controls.forEach((control, index) => {
      if (control.value) {
        selectedDocuments.push(this.documentTypes[index]);
      }
    });

    return selectedDocuments;
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
    pushParticipant(this.recordData?.signed_by_tl || this.recordData?.signedByTL || this.recordData?.signed_by_t_l, 'signed_by_tl', 'reviewer');
    pushParticipant(this.recordData?.signed_by_tl2 || this.recordData?.signedByTL2 || this.recordData?.signed_by_t_l2, 'signed_by_tl2', 'reviewer');
    pushParticipant(this.recordData?.acknowledged_by || this.recordData?.acknowledgedBy, 'acknowledged_by', 'reviewer');

    return participants;
  }

  getDocumentTypeLabel(docType: string): string {
    return docType;
  }

  private persistForm(navigateToList: boolean): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      this.snackBar.open('Please fill in all required fields', 'Close', { duration: 3000 });
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
          this.snackBar.open(
            navigateToList ? 'Form submitted successfully' : 'Form saved successfully',
            'Close',
            { duration: 3000 }
          );

          if (navigateToList) {
            this.router.navigate(['/submission-review']);
          }

          // Trigger email notification for the first action step if this is being submitted
          if (navigateToList && savedId) {
            this.workflowEmailNotificationService.notifyInitialAction(
              SUBMISSION_REVIEW_EMAIL_CONFIG,
              this.workflowEmailNotificationService.createNotificationSource(payload, response),
              savedId
            ).subscribe({
              next: () => console.log('Initial notification sent successfully'),
              error: (err) => console.error('Error sending initial notification:', err)
            });
          }
        },
        error: (error) => {
          console.error('Error saving submission review:', error);
          this.snackBar.open('Failed to save form', 'Close', { duration: 3000 });
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
    const signedByTL = this.resolveEmployeeCode(raw.signedByTL);
    const signedByTL2 = this.resolveEmployeeCode(raw.signedByTL2);
    const acknowledgedBy = this.resolveEmployeeCode(raw.acknowledgedBy);

    const reviewerForAction = this.resolveEmployeeCode(raw.reviewerForAction) || signedByTL;
    const teamLeadForAction = this.resolveEmployeeCode(raw.teamLeadForAction) || signedByTL;
    const directorForAction = this.resolveEmployeeCode(raw.directorForAction) || acknowledgedBy;

    const reviewedBy = signedByTL;
    const respondedBy = preparedBy;

    const payload = serializeDatesDeep({
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
      signed_by_t_l: signedByTL,
      signedByTL2,
      signed_by_tl2: signedByTL2,
      signed_by_t_l2: signedByTL2,
      acknowledgedBy,
      acknowledged_by: acknowledgedBy,
      reviewedByDate: null,
      reviewed_by_date: null,
      respondedByDate: null,
      responded_by_date: null,
      signedByTLDate: null,
      signed_by_tl_date: null,
      signed_by_t_l_date: null,
      signedByTL2Date: null,
      signed_by_tl2_date: null,
      signed_by_t_l2_date: null,
      acknowledgedByDate: null,
      acknowledged_by_date: null,
      reviewedByStatus: 'pending',
      reviewed_by_status: 'pending',
      reviewed_by_t_l_status: 'pending',
      respondedByStatus: 'pending',
      responded_by_status: 'pending',
      signedByTLStatus: 'pending',
      signed_by_tl_status: 'pending',
      signed_by_t_l_status: 'pending',
      signedByTL2Status: 'pending',
      signed_by_tl2_status: 'pending',
      signed_by_t_l2_status: 'pending',
      acknowledgedByStatus: 'pending',
      acknowledged_by_status: 'pending',
      acknowledged_by_d_i_status: 'pending',
      formType: this.formType,
      documentTypes: this.getSelectedDocumentTypes(),
      checklistResponses: this.submissionReviewChecklist.map((item, index) => ({
        id: item.id,
        question: item.question,
        response: raw.checklistResponses[index] ?? '',
      })),
    });

    return payload;
  }

  private patchFormData(data: any): void {
    this.recordData = data;
    this.employeeLookupMap = mergeProjectReviewEmployeeLookup([data], this.employeeLookupMap);

    this.form.patchValue({
      projectId: pickIntegerOrString(data, 'projectId', 'project_id'),
      projectName: pickString(data, 'projectName', 'project_name'),
      projectNumber: pickString(data, 'projectNumber', 'project_number', 'project_no'),
      stage: pickString(data, 'stage'),
      preparedBy: pickIntegerOrString(data, 'preparedBy', 'prepared_by'),
      discipline: pickString(data, 'discipline'),
      disciplineOther: pickString(data, 'disciplineOther', 'discipline_other'),
      documentTypesOther: pickString(data, 'documentTypesOther', 'document_types_other'),

      reviewerForAction: pickIntegerOrString(data, 'reviewerForAction', 'reviewer_for_action'),
      teamLeadForAction: pickIntegerOrString(data, 'teamLeadForAction', 'team_lead_for_action'),
      directorForAction: pickIntegerOrString(data, 'directorForAction', 'director_for_action'),
      comments: pickString(data, 'comments'),
      recommendedActionsSatisfactorilyTaken: asBoolean(
        pickValue(
          data,
          'recommendedActionsSatisfactorilyTaken',
          'recommended_actions_satisfactorily_taken',
          'recommended_actions_satisfactorily_taken_by_tl',
          'recommended_actions_satisfactorily_taken_by_t_l'
        )
      ),
      note: pickString(data, 'note'),
      reviewedBy: pickIntegerOrString(data, 'reviewedBy', 'reviewed_by', 'reviewed_by_t_l'),
      reviewedByDate: null,
      respondedBy: pickIntegerOrString(data, 'respondedBy', 'responded_by'),
      respondedByDate: null,
      signedByTL: pickIntegerOrString(data, 'signedByTL', 'signed_by_tl', 'signed_by_t_l'),
      signedByTLDate: null,
      signedByTL2: pickIntegerOrString(data, 'signedByTL2', 'signed_by_tl2', 'signed_by_t_l2'),
      signedByTL2Date: null,
      acknowledgedBy: pickIntegerOrString(data, 'acknowledgedBy', 'acknowledged_by', 'acknowledged_by_d_i'),
      acknowledgedByDate: null,
    });

    this.setSelectedDocumentTypes(pickStringArray(data, 'documentTypes', 'document_types'));
    this.setChecklistResponses(data?.checklistResponses ?? data?.checklist_responses ?? []);
    const attachments = data?.attachments ?? [];
    const drivePaths = pickStringArray(data, 'drivePaths', 'drive_paths');
    this.setAttachments(attachments, drivePaths);

    this.onDocumentTypeChange();
    this.onDisciplineChange();
    this.onRecommendedActionsSatisfactorilyTakenChange();
    this.selectedProjectOption = this.createProjectOptionFromForm();
    this.setFilteredProjectOptions(this.filteredProjectOptions);
    this.normalizeEmployeeSelectionsToCode();
    this.ensureSelectedEmployeeOptionsLoaded();
    this.hasUnsavedChanges = false;
    this.form.markAsPristine();
  }

  private setSelectedDocumentTypes(selectedValues: string[]): void {
    this.documentTypesFormArray.controls.forEach((control, index) => {
      control.setValue(selectedValues.includes(this.documentTypes[index]), { emitEvent: false });
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
        responsesById.get(this.submissionReviewChecklist[index]?.id) ??
        values[index]?.response ??
        values[index] ??
        '';

      control.setValue(response, { emitEvent: false });
    });
  }

  private setAttachments(files: any[], links: string[] = []): void {
    this.attachments.clear();

    (Array.isArray(files) ? files : []).forEach((item) => {
      this.attachments.push(this.createAttachmentGroup(item));
    });

    (Array.isArray(links) ? links : []).forEach((link) => {
      if (link) {
        this.attachments.push(this.createAttachmentGroup({
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
        this.setFilteredProjectOptions(projects);
      });

    this.projectService
      .getProjects('', 20)
      .pipe(takeUntil(this.destroy$))
      .subscribe((projects) => {
        this.setFilteredProjectOptions(projects);
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
    this.setFilteredProjectOptions(this.filteredProjectOptions);
    this.projectSearchCtrl.setValue('', { emitEvent: false });

    this.form.patchValue({
      projectId: project.id,
      projectName: project.name,
      projectNumber: project.code,
    });
  }

  private setFilteredProjectOptions(projects: ExternalProject[]): void {
    this.filteredProjectOptions = this.mergeSelectedProjectOption(projects);
  }

  private mergeSelectedProjectOption(projects: ExternalProject[]): ExternalProject[] {
    const selected = this.selectedProjectOption ?? this.createProjectOptionFromForm();

    if (!selected?.id) {
      return projects;
    }

    return projects.some((project) => project.id === selected.id)
      ? projects
      : [selected, ...projects];
  }

  private createProjectOptionFromForm(): ExternalProject | null {
    const id = Number(this.form.get('projectId')?.value);
    const name = String(this.form.get('projectName')?.value ?? '').trim();
    const code = String(this.form.get('projectNumber')?.value ?? '').trim();

    if (!id || (!name && !code)) {
      return null;
    }

    return {
      id,
      code,
      name,
      status: 'active',
      active: true,
      project_number: code,
      projectNumber: code,
      project_no: code,
      projectNo: code,
      mt_project_no: code,
      project_name: name,
      projectName: name,
    };
  }

  formatAttachmentSize(value: unknown): string {
    const size = Number(value);
    if (!Number.isFinite(size) || size <= 0) {
      return '';
    }

    return `${(size / 1024).toFixed(2)} KB`;
  }

  private getWorkflowStatus(source: any, ...keys: string[]): string {
    return pickString(source, ...keys) || 'pending';
  }

  private getNextPendingAction(source: any): string {
    const isApproved = (status: string) =>
      ['approved', 'approve', 'signed', 'acknowledged'].includes(String(status || '').trim().toLowerCase());

    const reviewedByStatus = pickString(source, 'reviewedByStatus', 'reviewed_by_status', 'reviewed_by_tl_status', 'reviewed_by_t_l_status') || 'pending';
    const respondedByStatus = pickString(source, 'respondedByStatus', 'responded_by_status') || 'pending';
    const signedByTLStatus = pickString(source, 'signedByTLStatus', 'signed_by_tl_status', 'signed_by_t_l_status') || 'pending';
    const signedByTL2Status = pickString(source, 'signedByTL2Status', 'signed_by_tl2_status', 'signed_by_t_l2_status') || 'pending';
    const acknowledgedByStatus = pickString(source, 'acknowledgedByStatus', 'acknowledged_by_status', 'acknowledged_by_d_i_status') || 'pending';

    if (!isApproved(reviewedByStatus)) {
      return 'reviewed_by_status';
    }

    if (!isApproved(respondedByStatus)) {
      return 'responded_by_status';
    }

    if (!isApproved(signedByTLStatus)) {
      return 'signed_by_t_l_status';
    }

    if (!isApproved(signedByTL2Status)) {
      return 'signed_by_t_l2_status';
    }

    if (!isApproved(acknowledgedByStatus)) {
      return 'acknowledged_by_status';
    }

    return '';
  }

  private getWorkflowDate(source: any, ...keys: string[]): string {
    const val = pickValue(source, ...keys);
    return val ? formatDateTimeDisplay(val) : '-';
  }

  getEmployeeDisplay(value: unknown): string {
    const code = String(value ?? '').trim();
    if (!code || code === '-') {
      return '-';
    }

    // 1. Try lookup map for "initial, name" format
    const fromMap = this.employeeLookupMap.get(code);
    if (fromMap) return fromMap;

    // 2. Try employeeOptions as fallback
    const match = this.employeeOptions.find((option) => option.code === code || String(option.employeeId) === code);
    if (match) {
      return match.displayLabel || match.name || match.code;
    }

    return code;
  }
}
