import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
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
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
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
import { LegacySourceButtonComponent } from 'app/core/components/legacy-source-button';
import { EmployeeOption, EmployeeService } from 'app/core/services/employee.service';
import { DisciplineService } from 'app/core/services/discipline.service';
import { FuseUploadDialogComponent } from '@fuse/components/upload-dialog';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { SubmissionDesignCommentDialogComponent } from '../../submission-review/submission-review-action/submission-design-comment-dialog.component';
import {
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
import { WorkflowEmailNotificationService, CONSTRUCTION_VALIDATION_EMAIL_CONFIG } from 'app/core/services/workflow-email-notification.service';
import {
  allItemsAnswered,
  minSelectedCheckboxes,
} from 'app/core/utils/review-form.validators';
import { patchDefaultPreparedBy } from 'app/core/utils/prepared-by-default.util';
import { ApiConfig } from 'app/core/config/api.config';
import {
  DiscussionParticipant,
  ProjectReviewDiscussionService,
  ProjectReviewDiscussionType,
} from 'app/core/services/project-review-discussion.service';
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
  selector: 'app-construction-validation-form',
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
  templateUrl: './construction-validation-form.component.html',
  styleUrls: ['./construction-validation-form.component.scss'],
})
export class ConstructionValidationFormComponent implements OnInit, OnDestroy {
  private readonly apiKey = 'constructionValidation' as const;
  private readonly reviewDiscussionType: ProjectReviewDiscussionType = 'construction_validation';
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

  formType = 'mtdd05';

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
    'Specifications',
    'Reports',
    'Calculations',
    'Other',
  ];

  constructionValidationChecklist: ReviewChecklistItem[] = [
    {
      id: '1',
      question: 'Have all the comments been incorporated? (20 - FORM MTDD-01/02/03/04)',
      type: 'construction-validation',
      required: true,
    },
    {
      id: '2',
      question: 'Have the Client/PM/CM/Contractor comments been incorporated?',
      type: 'construction-validation',
      required: true,
    },
    {
      id: '3',
      question: 'If yes to item 2 above, is a Project Managers Instruction required?',
      type: 'construction-validation',
      required: true,
    },
  ];

  employeeOptions: EmployeeOption[] = [];
  filteredPreparedByOptions: EmployeeOption[] = [];
  filteredCompletedByOptions: EmployeeOption[] = [];
  filteredRespondedByOptions: EmployeeOption[] = [];
  filteredSignedByTLOptions: EmployeeOption[] = [];
  filteredAcknowledgedByTLOptions: EmployeeOption[] = [];
  filteredAcknowledgedByDIOptions: EmployeeOption[] = [];

  preparedBySearchCtrl = new FormControl('');
  completedBySearchCtrl = new FormControl('');
  respondedBySearchCtrl = new FormControl('');
  signedByTLSearchCtrl = new FormControl('');
  acknowledgedByTLSearchCtrl = new FormControl('');
  acknowledgedByDISearchCtrl = new FormControl('');
  projectSearchCtrl = new FormControl('');
  filteredProjectOptions: ExternalProject[] = [];

  private readonly employeeControlNames = [
    'preparedBy',
    'completedBy',
    'respondedBy',
    'signedByTL',
    'acknowledgedByTL',
    'acknowledgedByDI',
  ];

  employeeLookupMap = new Map<string, string>();
  private readonly printBodyClass = 'construction-validation-printing';
  private printFallbackCleanupTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private snackBar: MatSnackBar,
    private projectReviewApi: ProjectReviewApiService,
    private projectReviewDiscussionService: ProjectReviewDiscussionService,
    private employeeService: EmployeeService,
    private disciplineService: DisciplineService,
    private projectService: ExternalProjectService,
    private dialog: MatDialog,
    private apiConfig: ApiConfig,
    private clipboard: Clipboard,
    private fuseConfirmationService: FuseConfirmationService,
    private workflowEmailNotificationService: WorkflowEmailNotificationService
  ) {
    this.form = this.createForm();
  }

  ngOnInit(): void {
    window.addEventListener('beforeprint', this.enableConstructionValidationPrintMode);
    window.addEventListener('afterprint', this.disableConstructionValidationPrintMode);

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

    this.form.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.hasUnsavedChanges = true;
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeprint', this.enableConstructionValidationPrintMode);
    window.removeEventListener('afterprint', this.disableConstructionValidationPrintMode);
    this.disableConstructionValidationPrintMode();
    this.destroy$.next();
    this.destroy$.complete();
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

      checklistResponses: this.fb.array([]),
      comments: [''],
      recommendedActions: [''],
      completedBy: [''],
      completedByDate: [null],
      respondedBy: [''],
      respondedByDate: [null],
      recommendedActionsSatisfactorilyTaken: [false],
      note: [''],
      signedByTL: ['', Validators.required],
      signedByTLDate: [null],
      acknowledgedByTL: ['', Validators.required],
      acknowledgedByTLDate: [null],
      acknowledgedByDI: ['', Validators.required],
      acknowledgedByDIDate: [null],
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



  get disciplineDisplay(): string {
    const discipline = this.form.get('discipline')?.value;
    if (discipline === 'Other') {
      return this.form.get('disciplineOther')?.value || 'Other';
    }

    return discipline || '-';
  }

  get currentStatus(): string {
    return deriveChecklistStatus(this.recordData ?? {});
  }

  get displayStatusLabel(): string {
    if (!this.recordData) return 'Draft';

    const status = deriveChecklistStatus(this.recordData);
    if (status === 'completed' || status === 'rejected' || status === 'draft') {
      return this.capitalize(status);
    }

    const completedByStatus = pickString(this.recordData, 'completed_by_status', 'completedByStatus') || 'pending';
    const respondedByStatus = pickString(this.recordData, 'responded_by_status', 'respondedByStatus') || 'pending';
    const signedByTLStatus = pickString(this.recordData, 'signed_by_tl_status', 'signed_by_t_l_status', 'signedByTLStatus') || 'pending';
    const acknowledgedByTLStatus = pickString(this.recordData, 'acknowledged_by_tl_status', 'acknowledgedByTLStatus') || 'pending';
    const acknowledgedByDIStatus = pickString(this.recordData, 'acknowledged_by_di_status', 'acknowledgedByDIStatus') || 'pending';

    let stepLabel = '';
    let person = '';

    if (completedByStatus === 'pending') {
      stepLabel = 'Pending Completion (TL)';
      person = this.getEmployeeDisplay(this.recordData.completed_by || this.recordData.completedBy || this.recordData.prepared_by);
    } else if (respondedByStatus === 'pending') {
      stepLabel = 'Pending Response (PE)';
      person = this.getEmployeeDisplay(this.recordData.responded_by || this.recordData.respondedBy || this.recordData.prepared_by);
    } else if (signedByTLStatus === 'pending') {
      stepLabel = 'Pending Sign (TL)';
      person = this.getEmployeeDisplay(this.recordData.signed_by_tl || this.recordData.signedByTL);
    } else if (acknowledgedByTLStatus === 'pending') {
      stepLabel = 'Pending Acknowledge (TL)';
      person = this.getEmployeeDisplay(this.recordData.acknowledged_by_tl || this.recordData.acknowledgedByTL);
    } else if (acknowledgedByDIStatus === 'pending') {
      stepLabel = 'Pending Acknowledge (DI)';
      person = this.getEmployeeDisplay(this.recordData.acknowledged_by_di || this.recordData.acknowledgedByDI);
    } else {
      return this.capitalize(status);
    }

    return `${stepLabel} (${person || 'Unassigned'})`;
  }

  get displayStatusClass(): string {
    return this.getStatusClass(this.currentStatus);
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
      this.snackBar.open('Path copied to clipboard', 'OK', { duration: 3000 });
    }
  }



  private capitalize(s: string): string {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
  }

  get workflowSteps(): ApprovalWorkflowStep[] {
    const source = this.recordData ?? {};

    return [
      {
        key: 'completedBy',
        title: 'Approved By Reviewer',
        assignee: this.getEmployeeDisplay(this.form.get('completedBy')?.value),
        date: this.getWorkflowDate(source, 'completedByDate', 'completed_by_date'),
        status: this.getWorkflowStatus(source, 'completedByStatus', 'completed_by_status'),
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
      status: this.getWorkflowStatus(source, 'signedByTLStatus', 'signed_by_tl_status', 'signed_by_t_l_status'),
      },
      {
        key: 'acknowledgedByTL',
        title: 'Approved By TL',
        assignee: this.getEmployeeDisplay(this.form.get('acknowledgedByTL')?.value),
        date: this.getWorkflowDate(source, 'acknowledgedByTLDate', 'acknowledged_by_tl_date'),
        status: this.getWorkflowStatus(source, 'acknowledgedByTLStatus', 'acknowledged_by_tl_status'),
      },
      {
        key: 'acknowledgedByDI',
        title: 'Acknowledged By (DI)',
        assignee: this.getEmployeeDisplay(this.form.get('acknowledgedByDI')?.value),
        date: this.getWorkflowDate(source, 'acknowledgedByDIDate', 'acknowledged_by_di_date'),
        status: this.getWorkflowStatus(source, 'acknowledgedByDIStatus', 'acknowledged_by_di_status'),
      },
    ];
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
    const discipline = this.form.get('discipline')?.value;

    if (discipline === 'Other') {
      this.form.get('disciplineOther')?.setValidators([Validators.required]);
    } else {
      this.form.get('disciplineOther')?.clearValidators();
    }

    this.form.get('disciplineOther')?.updateValueAndValidity();
  }


  initializeDocumentTypes(): void {
    this.documentTypesFormArray.clear();
    this.documentTypes.forEach(() => this.documentTypesFormArray.push(this.fb.control(false)));
  }

  initializeChecklistResponses(): void {
    this.checklistResponses.clear();
    this.constructionValidationChecklist.forEach(() => this.checklistResponses.push(this.fb.control('')));
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

  private loadEmployees(): void {
    this.employeeService.getEmployeeLookupMap().subscribe(map => {
      this.employeeLookupMap = mergeProjectReviewEmployeeLookup(this.recordData ? [this.recordData] : [], map);
    });

    this.employeeService.getEmployeeOptions('', 2000).subscribe((employees) => {
      this.employeeOptions = employees;
      this.filteredPreparedByOptions = [...employees];
      this.filteredCompletedByOptions = [...employees];
      this.filteredRespondedByOptions = [...employees];
      this.filteredSignedByTLOptions = [...employees];
      this.filteredAcknowledgedByTLOptions = [...employees];
      this.filteredAcknowledgedByDIOptions = [...employees];

      this.normalizeEmployeeSelections();
      this.setupEmployeeSearchFilters();
    });
  }

  private setupEmployeeSearchFilters(): void {
    this.bindEmployeeSearch(this.preparedBySearchCtrl, 'preparedBy', (items) => (this.filteredPreparedByOptions = items));
    this.bindEmployeeSearch(this.completedBySearchCtrl, 'completedBy', (items) => (this.filteredCompletedByOptions = items));
    this.bindEmployeeSearch(this.respondedBySearchCtrl, 'respondedBy', (items) => (this.filteredRespondedByOptions = items));
    this.bindEmployeeSearch(this.signedByTLSearchCtrl, 'signedByTL', (items) => (this.filteredSignedByTLOptions = items));
    this.bindEmployeeSearch(this.acknowledgedByTLSearchCtrl, 'acknowledgedByTL', (items) => (this.filteredAcknowledgedByTLOptions = items));
    this.bindEmployeeSearch(this.acknowledgedByDISearchCtrl, 'acknowledgedByDI', (items) => (this.filteredAcknowledgedByDIOptions = items));
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

  private filterEmployees(searchTerm: string): EmployeeOption[] {
    const term = String(searchTerm ?? '').trim().toLowerCase();

    if (!term) {
      return [...this.employeeOptions];
    }

    return this.employeeOptions.filter((employee) =>
      [
        employee.code,
        employee.name,
        employee.displayLabel,
        employee.employeeId,
        employee.id,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }

  private mergeSelectedEmployeeOption(employees: EmployeeOption[], fieldName: string): EmployeeOption[] {
    const selected = this.findEmployeeOption(this.form.get(fieldName)?.value);
    if (!selected) {
      return employees;
    }

    if (employees.some((employee) => employee.code === selected.code)) {
      return employees;
    }

    return [selected, ...employees];
  }

  private normalizeEmployeeSelections(): void {
    this.employeeControlNames.forEach((controlName) => {
      const control = this.form.get(controlName);
      if (!control) {
        return;
      }

      const resolved = this.resolveEmployeeCode(control.value);
      if (resolved !== control.value) {
        control.setValue(resolved, { emitEvent: false });
      }
    });

    this.filteredPreparedByOptions = this.mergeSelectedEmployeeOption(this.filteredPreparedByOptions, 'preparedBy');
    this.filteredCompletedByOptions = this.mergeSelectedEmployeeOption(this.filteredCompletedByOptions, 'completedBy');
    this.filteredRespondedByOptions = this.mergeSelectedEmployeeOption(this.filteredRespondedByOptions, 'respondedBy');
    this.filteredSignedByTLOptions = this.mergeSelectedEmployeeOption(this.filteredSignedByTLOptions, 'signedByTL');
    this.filteredAcknowledgedByTLOptions = this.mergeSelectedEmployeeOption(this.filteredAcknowledgedByTLOptions, 'acknowledgedByTL');
    this.filteredAcknowledgedByDIOptions = this.mergeSelectedEmployeeOption(this.filteredAcknowledgedByDIOptions, 'acknowledgedByDI');
  }

  private findEmployeeOption(value: any): EmployeeOption | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }

    const target = String(value).trim().toLowerCase();

    return this.employeeOptions.find((employee) =>
      [
        employee.code,
        employee.name,
        employee.displayLabel,
        employee.employeeId,
        employee.id,
      ]
        .filter(Boolean)
        .some((candidate) => String(candidate).trim().toLowerCase() === target)
    );
  }

  private resolveEmployeeCode(value: any): any {
    return this.findEmployeeOption(value)?.code ?? value;
  }

  getEmployeeDisplay(value: any): string {
    const code = String(value || '').trim();
    if (!code || code === '-') return '-';

    // 1. Try lookup map for "initial, name" format
    const fromMap = this.employeeLookupMap.get(code);
    if (fromMap) return fromMap;

    // 2. Try employeeOptions as fallback
    const match = this.findEmployeeOption(code);
    if (match) return match.displayLabel;

    return code;
  }

  getRoleDisplay(fieldName: string): string {
    const rawValue = this.form.get(fieldName)?.value;
    const employee = this.findEmployeeOption(rawValue);
    if (employee) {
      return employee.displayLabel;
    }

    return rawValue ? String(rawValue) : '-';
  }

  isChecklistResponse(index: number, value: string): boolean {
    return this.checklistResponses.at(index)?.value === value;
  }

  getPrintChecklistQuestion(item: ReviewChecklistItem, index: number): string {
    if (index === 2) {
      return 'If yes to item 3 above, is a Project Managers Instruction required?';
    }

    return item.question;
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

  private getWorkflowDate(source: any, ...keys: string[]): string | null {
    const date = pickDate(source, ...keys);
    return date ? formatDateTimeDisplay(date) : null;
  }

  private getWorkflowStatus(source: any, ...keys: string[]): string | null {
    return pickString(source, ...keys) || null;
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'draft':
        return 'Draft';
      case 'in-review':
      case 'in_review':
        return 'In Review';
      case 'responded':
        return 'Responded';
      case 'signed':
        return 'Signed';
      case 'acknowledged':
        return 'Acknowledged';
      case 'completed':
        return 'Completed';
      case 'rejected':
        return 'Rejected';
      default:
        return status || 'Pending';
    }
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'signed':
        return 'bg-purple-100 text-purple-800';
      case 'responded':
        return 'bg-amber-100 text-amber-800';
      case 'acknowledged':
        return 'bg-indigo-100 text-indigo-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      case 'in-review':
      case 'in_review':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
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
          this.employeeLookupMap = mergeProjectReviewEmployeeLookup([data], this.employeeLookupMap);
          this.patchFormData(data);
          this.refreshDiscussionCommentState();
        },
        error: (error) => {
          console.error('Error loading construction validation:', error);
          this.snackBar.open('Failed to load form data', 'Close', {
            duration: 3000,
          });
        },
      });
  }

  saveForm(): void {
    this.persistForm({
      navigateToList: false,
      enforceValidation: false,
    });
  }

  submitForm(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      this.snackBar.open('Please fill in all required fields', 'Close', {
        duration: 3000,
      });
      return;
    }

    const confirmation = this.fuseConfirmationService.open({
      title: 'Confirm submit',
      message: 'Are you sure you want to submit this construction validation?',
      icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
      actions: {
        cancel: { show: true, label: 'Cancel' },
        confirm: { show: true, label: 'Submit', color: 'primary' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result !== 'confirmed') return;
      this.persistForm({
        navigateToList: true,
        enforceValidation: true,
      });
    });
  }

  goBack(): void {
    if (this.hasUnsavedChanges) {
      const confirmed = confirm('You have unsaved changes. Are you sure you want to leave?');
      if (!confirmed) {
        return;
      }
    }

    this.router.navigate(['/construction-validation']);
  }

  onEdit(): void {
    if (this.formId) {
      this.router.navigate(['/construction-validation/edit', this.formId]);
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

    this.enableConstructionValidationPrintMode();
    this.schedulePrintModeFallbackCleanup();
    window.print();
  }

  private enableConstructionValidationPrintMode = (): void => {
    document.body.classList.add(this.printBodyClass);
  };

  private disableConstructionValidationPrintMode = (): void => {
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

    this.printFallbackCleanupTimer = setTimeout(this.disableConstructionValidationPrintMode, 120000);
  }

  private writePrintWindow(printWindow: Window | null): boolean {
    const printRoot = document.querySelector('.construction-validation-print-root');
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
    <title>Construction Validation Print</title>
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

  getSelectedDocumentTypes(): string[] {
    const selectedDocuments: string[] = [];

    this.documentTypesFormArray.controls.forEach((control, index) => {
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

    pushParticipant(this.recordData?.signed_by_tl || this.recordData?.signedByTL || this.recordData?.signed_by_t_l, 'signed_by_tl', 'reviewer');
    pushParticipant(this.recordData?.acknowledged_by_tl || this.recordData?.acknowledgedByTL || this.recordData?.acknowledged_by_t_l, 'acknowledged_by_tl', 'reviewer');
    pushParticipant(this.recordData?.acknowledged_by_di || this.recordData?.acknowledgedByDI || this.recordData?.acknowledged_by_d_i, 'acknowledged_by_di', 'reviewer');
    pushParticipant(this.recordData?.completed_by || this.recordData?.completedBy, 'completed_by', 'reviewer');
    pushParticipant(this.recordData?.responded_by || this.recordData?.respondedBy, 'responded_by', 'team');

    return participants;
  }

  private persistForm(options: { navigateToList: boolean; enforceValidation: boolean }): void {
    if (options.enforceValidation && !this.form.valid) {
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
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (response) => {
          const savedId = String(response?.id ?? this.formId ?? '');
          if (!this.formId && savedId) {
            this.formId = savedId;
          }

          this.recordData = { ...(this.recordData ?? {}), ...payload, ...response };
          this.employeeLookupMap = mergeProjectReviewEmployeeLookup([this.recordData], this.employeeLookupMap);
          this.hasUnsavedChanges = false;
          this.form.markAsPristine();

          this.snackBar.open(
            options.navigateToList ? 'Form submitted successfully' : 'Form saved successfully',
            'Close',
            { duration: 3000 }
          );

          if (options.navigateToList) {
            this.router.navigate(['/construction-validation']);
          }

          // Trigger email notification for the first action step if this is being submitted
          if (options.navigateToList && savedId) {
            this.workflowEmailNotificationService.notifyInitialAction(
              CONSTRUCTION_VALIDATION_EMAIL_CONFIG,
              payload,
              savedId
            ).subscribe({
              next: () => console.log('Initial notification sent successfully'),
              error: (err) => console.error('Error sending initial notification:', err)
            });
          }
        },
        error: (error) => {
          console.error('Error saving construction validation:', error);
          this.snackBar.open('Failed to save form', 'Close', {
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
    const respondedBy = preparedBy; // Use Prepared By value per user request
    const signedByTL = this.resolveEmployeeCode(raw.signedByTL);
    const completedBy = signedByTL; // Use Signed By TL value per user request
    const acknowledgedByTL = this.resolveEmployeeCode(raw.acknowledgedByTL);
    const acknowledgedByDI = this.resolveEmployeeCode(raw.acknowledgedByDI);

    const payload = {
      ...raw,
      attachments: attachmentPaths,
      drivePaths,
      drive_paths: drivePaths,
      documentLocation,
      document_location: documentLocation,

      formType: this.formType,
      form_type: this.formType,
      projectNumber: raw.projectNumber,
      project_number: raw.projectNumber,
      project_no: raw.projectNumber,
      preparedBy,
      prepared_by: preparedBy,
      completedBy,
      completed_by: completedBy,
      respondedBy,
      responded_by: respondedBy,
      signedByTL,
      signed_by_tl: signedByTL,
      acknowledgedByTL,
      acknowledged_by_tl: acknowledgedByTL,
      acknowledgedByDI,
      acknowledged_by_di: acknowledgedByDI,
      documentTypes: this.getSelectedDocumentTypes(),
      document_types: this.getSelectedDocumentTypes(),
      checklistResponses: this.constructionValidationChecklist.map((item, index) => ({
        id: item.id,
        question: item.question,
        response: raw.checklistResponses[index] ?? '',
      })),
      checklist_responses: this.constructionValidationChecklist.map((item, index) => ({
        id: item.id,
        question: item.question,
        response: raw.checklistResponses[index] ?? '',
      })),
      recommendedActions: raw.recommendedActions,
      recommended_actions: raw.recommendedActions,
      recommendedActionsSatisfactorilyTaken: raw.recommendedActionsSatisfactorilyTaken,
      recommended_actions_satisfactorily_taken: raw.recommendedActionsSatisfactorilyTaken,
      status: this.recordData?.status ?? 'draft',
    };

    // Explicitly handle common variants like t_l
    if (payload.signedByTL || payload.signed_by_tl || (payload as any).signed_by_t_l) {
      const val = payload.signedByTL || payload.signed_by_tl || (payload as any).signed_by_t_l;
      payload.signedByTL = val;
      payload.signed_by_tl = val;
      (payload as any).signed_by_t_l = val;
    }
    if (payload.acknowledgedByTL || payload.acknowledged_by_tl || (payload as any).acknowledged_by_t_l) {
      const val = payload.acknowledgedByTL || payload.acknowledged_by_tl || (payload as any).acknowledged_by_t_l;
      payload.acknowledgedByTL = val;
      payload.acknowledged_by_tl = val;
      (payload as any).acknowledged_by_t_l = val;
    }
    if (payload.acknowledgedByDI || payload.acknowledged_by_di || (payload as any).acknowledged_by_d_i) {
      const val = payload.acknowledgedByDI || payload.acknowledged_by_di || (payload as any).acknowledged_by_d_i;
      payload.acknowledgedByDI = val;
      payload.acknowledged_by_di = val;
      (payload as any).acknowledged_by_d_i = val;
    }

    // Initialize statuses for all steps if not present
    const initializeStatus = (key: string, value: string = 'pending') => {
      if (!(payload as any)[key]) (payload as any)[key] = value;
      const snake = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      if (!(payload as any)[snake]) (payload as any)[snake] = value;
    };

    initializeStatus('completedByStatus');
    initializeStatus('respondedByStatus');
    initializeStatus('signedByTLStatus');
    initializeStatus('acknowledgedByTLStatus');
    initializeStatus('acknowledgedByDIStatus');

    // Extra variants
    if (!(payload as any).signed_by_t_l_status) (payload as any).signed_by_t_l_status = 'pending';
    if (!(payload as any).acknowledged_by_t_l_status) (payload as any).acknowledged_by_t_l_status = 'pending';
    if (!(payload as any).acknowledged_by_d_i_status) (payload as any).acknowledged_by_d_i_status = 'pending';

    // If status is still draft, change it to in-review upon submission
    if (payload.status === 'draft') {
      payload.status = 'in-review';
    }

    return serializeDatesDeep(payload);
  }

  private patchFormData(data: any): void {
    this.form.patchValue({
      projectId: pickIntegerOrString(data, 'projectId', 'project_id'),
      projectName: pickString(data, 'projectName', 'project_name'),
      projectNumber: pickString(data, 'projectNumber', 'project_number', 'project_no'),
      stage: pickString(data, 'stage'),
      preparedBy: pickIntegerOrString(data, 'preparedBy', 'prepared_by'),
      discipline: pickString(data, 'discipline'),
      disciplineOther: pickString(data, 'disciplineOther', 'discipline_other'),
      documentTypesOther: pickString(data, 'documentTypesOther', 'document_types_other'),

      comments: pickString(data, 'comments'),
      recommendedActions: pickString(data, 'recommendedActions', 'recommended_actions'),
      recommendedActionsSatisfactorilyTaken:
        data?.recommendedActionsSatisfactorilyTaken ??
        data?.recommended_actions_satisfactorily_taken ??
        false,
      note: pickString(data, 'note'),
      completedBy: pickIntegerOrString(data, 'completedBy', 'completed_by'),
      completedByDate: null,
      respondedBy: pickIntegerOrString(data, 'respondedBy', 'responded_by'),
      respondedByDate: null,
      signedByTL: pickIntegerOrString(data, 'signedByTL', 'signed_by_tl', 'signed_by_t_l'),
      signedByTLDate: null,
      acknowledgedByTL: pickIntegerOrString(data, 'acknowledgedByTL', 'acknowledged_by_tl', 'acknowledged_by_t_l'),
      acknowledgedByTLDate: null,
      acknowledgedByDI: pickIntegerOrString(data, 'acknowledgedByDI', 'acknowledged_by_di', 'acknowledged_by_d_i'),
      acknowledgedByDIDate: null,
    });

    this.setSelectedDocumentTypes(pickStringArray(data, 'documentTypes', 'document_types'));
    this.setChecklistResponses(data?.checklistResponses ?? data?.checklist_responses ?? []);
    const attachments = data?.attachments ?? [];
    const drivePaths = pickStringArray(data, 'drivePaths', 'drive_paths');
    this.setAttachments(attachments, drivePaths);

    this.onDocumentTypeChange();
    this.onDisciplineChange();
    this.normalizeEmployeeSelections();
    this.hasUnsavedChanges = false;
    this.form.markAsPristine();
  }

  private setSelectedDocumentTypes(selectedValues: string[]): void {
    this.documentTypesFormArray.controls.forEach((control, index) => {
      control.setValue(selectedValues.includes(this.documentTypes[index]), {
        emitEvent: false,
      });
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
        responsesById.get(this.constructionValidationChecklist[index]?.id) ??
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

  formatAttachmentSize(value: unknown): string {
    const size = Number(value);
    if (!Number.isFinite(size) || size <= 0) {
      return '';
    }

    return `${(size / 1024).toFixed(2)} KB`;
  }
}
