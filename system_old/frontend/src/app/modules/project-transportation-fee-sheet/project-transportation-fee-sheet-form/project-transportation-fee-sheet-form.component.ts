import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, catchError, finalize, forkJoin, of, take } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, takeUntil } from 'rxjs/operators';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { ToastrService } from 'ngx-toastr';

import {
  canCreateFeeSheetRevision,
  canEditCurrentFeeSheet,
  FeeSheetService,
  FeeSheetType,
  normalizeFeeSheetStatus,
  resolveFeeSheetStatus,
} from 'app/core/services/fee-sheet.service';
import { EmployeeService, EmployeeOption } from 'app/core/services/employee.service';
import { resolveEmployeeDisplayInitial } from 'app/core/utils/employee-display.util';
import { remoteSearchTerms } from 'app/shared/remote-search/remote-search.util';
import { ExternalProject, ExternalProjectService } from 'app/core/services/external-project.service';
import { ProjectTypeService } from 'app/core/services/project-type.service';
import {
  normalizeProjectFeeSheetDate,
  normalizeProjectFeeSheetSnapshot,
  projectFeeSheetSnapshotsDiffer,
} from '../../project-fee-sheet/project-fee-sheet-form/project-fee-sheet-revision-snapshot.util';
import {
  PROJECT_TRANSPORTATION_FEE_SHEET_EMAIL_CONFIG,
  WorkflowEmailNotificationService,
} from 'app/core/services/workflow-email-notification.service';

interface Employee {
  id: string;
  employeeCode?: string;
  name: string;
  position: string;
  department: string;
  initial?: string;
  displayName?: string;
}

interface ProjectType {
  id: string | number;
  code?: string;
  name: string;
}

interface FeeAgreementLineItemDisplay {
  name: string;
  amount: number;
}

interface PreviousFeeAgreementDisplay {
  feeAgreementReceived: string;
  grossFee: number;
  subconsultantsItems: FeeAgreementLineItemDisplay[];
  subconsultantsName: string;
  subconsultantsAmount: number;
  otherExpensesItems: FeeAgreementLineItemDisplay[];
  otherExpenses: number;
  nettFee: number;
}

interface PreviousJobCostingDisplay {
  phase: string;
  percentage: number;
  startDate: any;
  endDate: any;
}

interface PreviousBillingForecastDisplay {
  deliverable: string;
  estimatedDate: any;
  amount: number;
}

interface PreviousRevisionTablesDisplay {
  feeAgreement: PreviousFeeAgreementDisplay;
  jobCosting: PreviousJobCostingDisplay[];
  billingForecast: PreviousBillingForecastDisplay[];
}

@Component({
  selector: 'app-project-transportation-fee-sheet-form',
  standalone: true,
  host: {
    'data-component': 'project-transportation-fee-sheet-form',
  },
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatSelectModule,
    NgxMatSelectSearchModule,
  ],
  templateUrl: './project-transportation-fee-sheet-form.component.html',
  styleUrls: ['./project-transportation-fee-sheet-form.component.scss'],
})
export class ProjectTransportationFeeSheetFormComponent implements OnInit {
  private readonly DEFAULT_PROJECT_ID = 4;
  private readonly PROJECT_TYPE_DISPLAY_CODE_MAP: Record<string, string> = {
    'commercial-office': 'A',
    'commercial-general': 'B',
    industrial: 'C',
    institutional: 'D',
    'leisure/recreation/tourism': 'E',
    'infrastructure/utilities': 'H',
    residential: 'I',
    miscellaneous: 'K',
    geotechnical: 'L',
    environmental: 'M',
    aviation: 'Q',
    'accredited checking & value engineering': 'R',
    healthcare: 'S',
    fitout: 'T',
    'building audit': 'U',
    'pm/cm': 'V',
  };
  private readonly DEFAULT_DELIVERABLES = [
    'On Commissioning 10%',
    'Preliminary Report',
    'Concept Report',
    'Schematic Report',
    'Detailed Report',
    'Traffic Impact Assessment',
  ];

  readonly feeSheetType: FeeSheetType = 'transportation';

  form: FormGroup;
  isEditMode = false;
  isSubmitting = false;
  isRevisionMode = false;
  currentId: string | null = null;

  private readonly _destroy$ = new Subject<void>();

  directorSearchCtrl = new FormControl('');
  filledInSearchCtrl = new FormControl('');
  approvedSearchCtrl = new FormControl('');
  teamSearchCtrl = new FormControl('');
  projectSearchCtrl = new FormControl('');
  employeeSearchLoading = {
    director: false,
    filledIn: false,
    approved: false,
    team: false,
  };
  filteredProjectOptions: ExternalProject[] = [];

  filteredDirectorEmployees: EmployeeOption[] = [];
  filteredFilledInEmployees: EmployeeOption[] = [];
  filteredApprovedEmployees: EmployeeOption[] = [];
  filteredTeamEmployees: EmployeeOption[] = [];
  previousRevisionTables: PreviousRevisionTablesDisplay | null = null;
  previousJobCostingByPhase = new Map<string, PreviousJobCostingDisplay>();

  employees: Employee[] = [
    { id: '1', name: 'John Smith', position: 'TL', department: 'Engineering' },
    { id: '2', name: 'Jane Doe', position: 'MD', department: 'Management' },
    { id: '3', name: 'Mike Johnson', position: 'DI', department: 'Engineering' },
    { id: '4', name: 'Alice Brown', position: 'TL', department: 'Engineering' },
    { id: '5', name: 'Bob Green', position: 'DI', department: 'Engineering' },
  ];

  projectTypes: ProjectType[] = [
    { id: '1', code: 'A', name: 'Commercial-Office' },
    { id: '2', code: 'B', name: 'Commercial-General' },
    { id: '3', code: 'C', name: 'Industrial' },
    { id: '4', code: 'D', name: 'Institutional' },
    { id: '5', code: 'E', name: 'Leisure/Recreation/Tourism' },
    { id: '6', code: 'H', name: 'Infrastructure/Utilities' },
    { id: '7', code: 'I', name: 'Residential' },
    { id: '8', code: 'K', name: 'Miscellaneous' },
    { id: '9', code: 'L', name: 'Geotechnical' },
    { id: '10', code: 'M', name: 'Environmental' },
    { id: '11', code: 'Q', name: 'Aviation' },
    { id: '12', code: 'R', name: 'Accredited Checking & Value Engineering' },
    { id: '13', code: 'S', name: 'Healthcare' },
    { id: '14', code: 'T', name: 'Fitout' },
    { id: '15', code: 'U', name: 'Building Audit' },
    { id: '16', code: 'V', name: 'PM/CM' },
  ];

  private revisionBaselineSnapshot: any = null;
  private feeSheetLoadedForRevision = false;
  private currentWorkflowStatus = 'draft';
  private currentApprovalStatus: string | null = null;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private feeApi: FeeSheetService,
    private employeeService: EmployeeService,
    private projectService: ExternalProjectService,
    private projectTypeService: ProjectTypeService,
    private fuseConfirmationService: FuseConfirmationService,
    private toastr: ToastrService,
    private workflowEmailNotificationService: WorkflowEmailNotificationService
  ) {
    this.form = this.createForm();
  }

  ngOnInit(): void {
    this.loadMasterData();
    const id = this.route.snapshot.paramMap.get('id');
    this.isRevisionMode = this.route.snapshot.queryParamMap.get('mode') === 'revision';

    if (id) {
      this.isEditMode = true;
      this.currentId = id;
      this.loadForEdit(id);
    } else {
      this.isEditMode = false;
      this.initializeRevisions();
      this.initJobCostingDefault();
      this.initializeBillingForecast();
    }
    
    this.setupSearchObservables();
    this.setupProjectSearch();
  }

  ngOnDestroy(): void {
    this._destroy$.next();
    this._destroy$.complete();
  }

  private setupProjectSearch(): void {
    this.projectSearchCtrl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((term) =>
          this.projectService.getProjects(term ? term.toString().trim() : '', 20)
        ),
        takeUntil(this._destroy$)
      )
      .subscribe((projects) => {
        this.filteredProjectOptions = this.withSelectedProjectOption(projects);
      });

    this.projectService
      .getProjects('', 20)
      .pipe(takeUntil(this._destroy$))
      .subscribe((projects) => {
        this.filteredProjectOptions = this.withSelectedProjectOption(projects);
      });
  }

  onProjectSelectedById(projectId: number | string): void {
    const selectedProjectId = Number(projectId);
    if (!Number.isFinite(selectedProjectId) || selectedProjectId <= 0) return;

    const cachedProject = this.filteredProjectOptions.find((project) => project.id === selectedProjectId);
    if (cachedProject) {
      this.patchProjectSelection(cachedProject);
      return;
    }

    this.projectService
      .getProjectById(selectedProjectId)
      .pipe(take(1))
      .subscribe((project) => {
        if (project) {
          this.patchProjectSelection(project);
        }
      });
  }

  private patchProjectSelection(project: ExternalProject): void {
    this.form.patchValue({
      projectReferenceId: project.id,
      projectId: null,
      projectPNo: project.proposal_number || project.proposalNumber || '',
      projectNo: project.mt_project_no || project.project_no || project.code || '',
      projectName: project.project_name || project.name || '',
    });
  }

  private ensureSelectedProjectOption(projectReferenceId: any, revision: any, project: any): void {
    const id = Number(projectReferenceId);
    if (!Number.isFinite(id) || id <= 0) {
      return;
    }

    const fallback = this.projectOptionFromRevision(id, revision, project);
    if (!this.filteredProjectOptions.some((option) => option.id === id)) {
      this.filteredProjectOptions = [fallback, ...this.filteredProjectOptions];
    }

    this.projectService
      .getProjectById(id)
      .pipe(take(1))
      .subscribe((selectedProject) => {
        if (!selectedProject) {
          return;
        }

        const currentIndex = this.filteredProjectOptions.findIndex((option) => option.id === id);
        if (currentIndex >= 0) {
          this.filteredProjectOptions = this.filteredProjectOptions.map((option, index) =>
            index === currentIndex ? selectedProject : option
          );
        } else {
          this.filteredProjectOptions = [selectedProject, ...this.filteredProjectOptions];
        }
      });
  }

  private withSelectedProjectOption(projects: ExternalProject[]): ExternalProject[] {
    const id = Number(this.form.get('projectReferenceId')?.value);
    if (!Number.isFinite(id) || id <= 0 || projects.some((project) => project.id === id)) {
      return projects;
    }

    const selectedOption =
      this.filteredProjectOptions.find((project) => project.id === id) ??
      this.projectOptionFromRevision(id, null, null);

    return [selectedOption, ...projects];
  }

  private projectOptionFromRevision(id: number, revision: any, project: any): ExternalProject {
    const proposalNumber =
      project?.project_no ??
      project?.proposal_number ??
      project?.proposalNumber ??
      '';
    const projectNumber =
      revision?.mt_project_no ??
      project?.mt_project_no ??
      project?.project_number ??
      project?.projectNumber ??
      '';
    const projectName =
      revision?.project_name ??
      project?.project_name ??
      project?.projectName ??
      project?.name ??
      '';

    return {
      id,
      code: String(projectNumber || ''),
      name: String(projectName || ''),
      status: 'active',
      active: true,
      proposal_number: proposalNumber,
      proposalNumber: proposalNumber,
      project_number: projectNumber,
      projectNumber: projectNumber,
      project_no: projectNumber,
      projectNo: projectNumber,
      mt_project_no: projectNumber,
      project_name: projectName,
      projectName: projectName,
    };
  }

  private setupSearchObservables(): void {
    this.observeEmployeeSearch(this.directorSearchCtrl, 'director', (employees) => {
      this.filteredDirectorEmployees = employees;
      this.ensureSelectedDirectorOption();
    });

    this.observeEmployeeSearch(this.filledInSearchCtrl, 'filledIn', (employees) => {
      this.filteredFilledInEmployees = this.withCurrentUserOption(employees);
      this.defaultFilledInByToCurrentUser();
      this.ensureSelectedFilledInOption();
    });

    this.observeEmployeeSearch(this.approvedSearchCtrl, 'approved', (employees) => {
      this.filteredApprovedEmployees = employees;
      this.ensureSelectedApprovedOption();
    });

    this.observeEmployeeSearch(this.teamSearchCtrl, 'team', (employees) => {
      this.filteredTeamEmployees = employees;
      this.ensureSelectedTeamOptions();
    });
  }

  private observeEmployeeSearch(
    control: FormControl,
    loadingKey: keyof typeof this.employeeSearchLoading,
    applyResults: (employees: EmployeeOption[]) => void
  ): void {
    remoteSearchTerms(control, this._destroy$)
      .pipe(
        switchMap((search) => {
          this.employeeSearchLoading[loadingKey] = true;
          return this.employeeService.getEmployeeOptionsFromApi(search, 20).pipe(
            catchError(() => of([] as EmployeeOption[])),
            finalize(() => this.employeeSearchLoading[loadingKey] = false)
          );
        })
      )
      .subscribe(applyResults);
  }

  getDirectorOptionValue(employee: EmployeeOption): string {
    return String(employee?.employeeId ?? employee?.id ?? employee?.code ?? '');
  }

  private employeeOptionFromRef(ref: any): EmployeeOption {
    const refText = String(ref ?? '').trim();
    const cached = this.employeeService.getCachedEmployeeOptionByReference(refText);
    if (cached) {
      return cached;
    }

    const employee = this.employees.find(
      (item) =>
        String(item.id) === refText ||
        String(item.employeeCode ?? '') === refText
    );
    const code = employee?.employeeCode ?? refText;
    const employeeId = Number(employee?.id ?? refText);
    const label = employee?.displayName || employee?.name || (Number.isFinite(employeeId) ? `ID: ${employeeId}` : code);

    return {
      id: code,
      employeeId: Number.isFinite(employeeId) ? employeeId : undefined,
      code,
      initial: employee?.initial ?? '',
      name: employee?.name ?? label,
      firstName: '',
      lastName: '',
      email: '',
      department: employee?.department ?? '',
      displayLabel: label,
    };
  }

  private getTeamCodes(value: any): string[] {
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (item && typeof item === 'object') {
            return String(item.employee_code ?? item.employeeCode ?? item.code ?? item.id ?? '').trim();
          }

          return String(item ?? '').trim();
        })
        .filter(Boolean);
    }

    return String(value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private ensureSelectedTeamOptions(): void {
    const selectedCodes = this.getTeamCodes(this.form.get('team')?.value);
    if (!selectedCodes.length) {
      return;
    }

    const existingCodes = new Set(this.filteredTeamEmployees.map((employee) => String(employee.code ?? employee.id)));
    const missingOptions = selectedCodes
      .filter((code) => !existingCodes.has(code))
      .map((code) => this.employeeOptionFromCode(code));

    if (missingOptions.length) {
      this.filteredTeamEmployees = [...missingOptions, ...this.filteredTeamEmployees];
    }
  }

  private employeeOptionFromCode(code: string): EmployeeOption {
    const cached = this.employeeService.getCachedEmployeeOptionByReference(code);
    if (cached) {
      return cached;
    }

    const employee = this.employees.find(
      (item) => String(item.employeeCode ?? item.id) === code || String(item.id) === code
    );

    const label = employee?.displayName || employee?.name || code;

    return {
      id: code,
      code,
      initial: employee?.initial ?? '',
      name: employee?.name ?? code,
      firstName: '',
      lastName: '',
      email: '',
      department: employee?.department ?? '',
      displayLabel: label,
    };
  }

  private ensureSelectedDirectorOption(): void {
    const selected = String(this.form.get('directorInCharge')?.value ?? '').trim();
    if (!selected) return;

    const exists = this.filteredDirectorEmployees.some(
      (employee) => this.getDirectorOptionValue(employee) === selected
    );
    if (!exists) {
      this.filteredDirectorEmployees = [
        this.employeeOptionFromRef(selected),
        ...this.filteredDirectorEmployees,
      ];
    }
  }

  private ensureSelectedFilledInOption(): void {
    const selected = String(this.form.get('filledInBy')?.value ?? '').trim();
    if (!selected) return;

    const exists = this.filteredFilledInEmployees.some(
      (employee) => String(employee.code ?? employee.id) === selected
    );
    if (!exists) {
      this.filteredFilledInEmployees = [
        this.employeeOptionFromRef(selected),
        ...this.filteredFilledInEmployees,
      ];
    }
  }

  private ensureSelectedApprovedOption(): void {
    const selected = String(this.form.get('approvedBy')?.value ?? '').trim();
    if (!selected) return;

    const exists = this.filteredApprovedEmployees.some(
      (employee) => String(employee.code ?? employee.id) === selected
    );
    if (!exists) {
      this.filteredApprovedEmployees = [
        this.employeeOptionFromRef(selected),
        ...this.filteredApprovedEmployees,
      ];
    }
  }

  private normalizeToArray(raw: any): any[] {
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    if (Array.isArray(raw?.data?.items)) return raw.data.items;
    return [];
  }

  private revisionDisplayLabel(revisionNo: number): string {
    if (!Number.isFinite(revisionNo) || revisionNo <= 0) {
      return 'Original';
    }

    let value = Math.floor(revisionNo);
    let label = '';
    while (value > 0) {
      value -= 1;
      label = String.fromCharCode(65 + (value % 26)) + label;
      value = Math.floor(value / 26);
    }

    return `Rev ${label}`;
  }

  private isAutoRevisionLabel(value: string): boolean {
    return /^Rev (\d+|[A-Z]+)$/i.test(value.trim());
  }

  private loadMasterData(): void {
    forkJoin({
      employees: this.employeeService.getEmployees('', 200).pipe(
        take(1),
        catchError((err) => {
          console.error('transportation employees error', err);
          return of([] as any[]);
        })
      ),
      projectTypes: this.projectTypeService.getAll().pipe(
        take(1),
        catchError((err) => {
          console.error('transportation project types error', err);
          return of([] as any[]);
        })
      ),
    }).subscribe((res) => {
        const rows = this.normalizeToArray(res.employees);
        if (rows.length) {
          this.employees = rows.map((e: any) => {
          const rawName = `${e?.firstname ?? ''} ${e?.lastname ?? ''}`.trim() || e?.name || '-';
          const nameOnly = rawName.replace(/\s*\([^)]*\)$/, '').trim() || '-';
          const initial = resolveEmployeeDisplayInitial(e);

          return {
            id: String(e?.id ?? ''),
            employeeCode: String(e?.employee_code ?? e?.code ?? e?.id ?? ''),
            name: nameOnly,
            position: e?.title_name || e?.level_name || e?.position || '-',
            department: e?.department_name || e?.department || '-',
            initial,
            displayName: initial ? `${initial} , ${nameOnly}` : nameOnly
          };
          });
        }
        this.normalizeSignatureEmployeeControls();
        this.defaultFilledInByToCurrentUser();
        this.ensureSelectedDirectorOption();
        this.ensureSelectedFilledInOption();
        this.ensureSelectedApprovedOption();
        this.ensureSelectedTeamOptions();

        const projectTypes = this.normalizeToArray(res.projectTypes)
          .filter((type: any) => String(type?.name ?? '').trim());
        if (projectTypes.length) {
          this.projectTypes = projectTypes.map((type: any) => ({
            id: String(type.id),
            code: String(type.code ?? '').trim(),
            name: String(type.name ?? '').trim(),
          }));
        }

        if (!this.form.get('projectType')?.value && this.projectTypes.length) {
          this.form.get('projectType')?.setValue(this.projectTypes[0].id);
        }

        if (this.feeSheetLoadedForRevision && !this.form.dirty) {
          this.captureRevisionBaselineFromCurrentForm();
        }
      });
  }

  private createForm(): FormGroup {
    return this.fb.group({
      projectReferenceId: [null],
      projectId: [null],

      copiesTo: ['-'],
      circ: ['-'],
      chFile: ['-'],
      fee: ['-'],

      projectPNo: ['TP', [Validators.required]],
      projectNo: ['TMT', [Validators.required]],
      date: [new Date(), [Validators.required]],
      team: [[], [Validators.required]],
      directorInCharge: [null, [Validators.required]],
      discipline: ['Transportation', [Validators.required]],
      projectName: ['', [Validators.required]],
      location: [''],
      client: ['', [Validators.required]],
      contactName: [''],
      mtlScope: [''],
      comments: [''],

      revisions: this.fb.array([]),
      jobCostingRevisions: this.fb.array([]),
      billingForecast: this.fb.array([]),

      projectType: [null, [Validators.required]],
      filledInBy: [null, [Validators.required]],
      filledInDate: [new Date(), [Validators.required]],
      approvedBy: [null, [Validators.required]],
      approvedDate: [new Date(), [Validators.required]],
    });
  }

  get revisionsArray(): FormArray {
    return this.form.get('revisions') as FormArray;
  }

  get jobCostingRevisionsArray(): FormArray {
    return this.form.get('jobCostingRevisions') as FormArray;
  }

  getJobCostingAllocations(revisionIndex: number): FormArray {
    const revGroup = this.jobCostingRevisionsArray.at(revisionIndex) as FormGroup;
    return revGroup?.get('allocations') as FormArray;
  }

  get jobCostingAllocationArray(): FormArray {
    if (this.jobCostingRevisionsArray.length === 0) return this.fb.array([]) as FormArray;
    return this.getJobCostingAllocations(0);
  }

  get billingForecastArray(): FormArray {
    return this.form.get('billingForecast') as FormArray;
  }

  private initializeRevisions(): void {
    const arr = this.revisionsArray;
    arr.clear();
    ['Original'].forEach((label, index) => {
      arr.push(this.createRevisionGroup(label, index === 0));
    });
  }

  private createRevisionGroup(label: string, isOriginal = false, data?: any): FormGroup {
    const subconsultantsItems = this.feeAgreementItemsForForm(
      data?.subconsultantsItems ?? data?.less_subconsultants_items,
      data?.subconsultantsName ?? data?.less_subconsultants_name,
      data?.subconsultantsAmount ?? data?.less_subconsultants_number
    );
    const otherExpensesItems = this.feeAgreementItemsForForm(
      data?.otherExpensesItems ?? data?.less_other_expenses_items,
      data?.otherExpensesName ?? data?.less_other_expenses_name,
      data?.otherExpenses ?? data?.less_other_expenses
    );

    return this.fb.group({
      revision: [data?.revision ?? label, [Validators.required]],
      isOriginal: [data?.isOriginal ?? isOriginal],
      feeAgreementReceived: [String(data?.feeAgreementReceived ?? '')],
      grossFee: [Number(data?.grossFee ?? 0), [Validators.min(0)]],
      subconsultantsName: [String(data?.subconsultantsName ?? '')],
      subconsultantsAmount: [Number(data?.subconsultantsAmount ?? 0), [Validators.min(0)]],
      subconsultantsItems: this.fb.array(
        subconsultantsItems.map((item) => this.createFeeAgreementLineItemGroup(item))
      ),
      otherExpensesItems: this.fb.array(
        otherExpensesItems.map((item) => this.createFeeAgreementLineItemGroup(item))
      ),
      otherExpenses: [Number(data?.otherExpenses ?? 0), [Validators.min(0)]],
      nettFee: [Number(data?.nettFee ?? 0)],
    });
  }

  private createFeeAgreementLineItemGroup(data?: Partial<FeeAgreementLineItemDisplay>): FormGroup {
    return this.fb.group({
      name: [String(data?.name ?? '')],
      amount: [Number(data?.amount ?? 0), [Validators.min(0)]],
    });
  }

  private feeAgreementItemsForForm(items: any, legacyName: any, legacyAmount: any): FeeAgreementLineItemDisplay[] {
    const source = Array.isArray(items) && items.length
      ? items
      : ((String(legacyName ?? '').trim() || this.toNumber(legacyAmount) !== 0)
          ? [{ name: legacyName, amount: legacyAmount }]
          : []);

    const normalized = source
      .map((item: any) => ({
        name: String(item?.name ?? '').trim(),
        amount: this.toNumber(item?.amount),
      }))
      .filter((item) => item.name || item.amount !== 0);

    return normalized.length ? normalized : [{ name: '', amount: 0 }];
  }

  private initJobCostingDefault(): void {
    const revisionsArr = this.jobCostingRevisionsArray;
    revisionsArr.clear();
    revisionsArr.push(this.createJobCostingRevisionGroup('Original', 0, true));
  }

  private createJobCostingRevisionGroup(label: string, revNo: number, isOriginal = false, data?: any[]): FormGroup {
    const phases = ['P', 'C', 'S', 'D', 'T'];
    const standard: Record<string, number> = { P: 20, C: 30, S: 20, D: 10, T: 20 };
    const allocations = this.fb.array(
      phases.map((phase: string) => {
        const existing = data?.find((d: any) => String(d.phase ?? '').toUpperCase() === phase.toUpperCase());
        return this.fb.group({
          phase: [phase],
          percentage: [Number(existing?.percent ?? existing?.percentage ?? standard[phase] ?? 0), [Validators.min(0), Validators.max(100)]],
          startDate: [existing?.startDate ?? (existing?.start_date ? new Date(existing.start_date) : new Date())],
          endDate: [existing?.endDate ?? (existing?.end_date ? new Date(existing.end_date) : new Date())],
        });
      })
    );

    return this.fb.group({
      revision: [label, [Validators.required]],
      revisionNo: [revNo],
      isOriginal: [isOriginal],
      allocations,
    });
  }

  private initializeBillingForecast(): void {
    this.billingForecastArray.clear();
    this.billingForecastArray.push(
      this.createBillingForecastRevisionGroup('Original', 0, true)
    );
  }

  private createBillingForecastRevisionGroup(
    label: string,
    revNo: number,
    isOriginal = false,
    data?: any[]
  ): FormGroup {
    const controls: FormGroup[] = [];

    if (data && data.length) {
      data.forEach((item) => {
        controls.push(
          this.fb.group({
            deliverable: [item.deliverable ?? ''],
            estimatedDate: [item.month ? new Date(item.month) : item.estimatedDate ? new Date(item.estimatedDate) : ''],
            amount: [Number(item.amount ?? 0), [Validators.min(0)]],
          })
        );
      });
    } else if (revNo > 0) {
      // Duplicate from previous revision
      const prevGroup = this.billingForecastArray.at(revNo - 1) as FormGroup;
      const prevForecasts = prevGroup?.get('forecasts') as FormArray;
      if (prevForecasts) {
        prevForecasts.controls.forEach((ctrl) => {
          const v = ctrl.value;
          controls.push(
            this.fb.group({
              deliverable: [v.deliverable ?? ''],
              estimatedDate: [v.estimatedDate ? new Date(v.estimatedDate) : ''],
              amount: [Number(v.amount ?? 0), [Validators.min(0)]],
            })
          );
        });
      }
    }

    if (controls.length === 0) {
      this.DEFAULT_DELIVERABLES.forEach((deliverable) => {
        controls.push(
          this.fb.group({
            deliverable: [deliverable],
            estimatedDate: [''],
            amount: [0, [Validators.min(0)]],
          })
        );
      });
    }

    const forecasts = this.fb.array(controls);

    return this.fb.group({
      revision: [label, [Validators.required]],
      revisionNo: [revNo],
      isOriginal: [isOriginal],
      forecasts,
    });
  }

  addBillingForecastRowToRevision(revisionIndex: number): void {
    const revGroup = this.billingForecastArray.at(revisionIndex) as FormGroup;
    const forecasts = revGroup?.get('forecasts') as FormArray;
    if (forecasts) {
      forecasts.push(
        this.fb.group({ deliverable: [''], estimatedDate: [''], amount: [0, [Validators.min(0)]] })
      );
    }
  }

  removeBillingForecastRowFromRevision(revisionIndex: number, rowIndex: number): void {
    const revGroup = this.billingForecastArray.at(revisionIndex) as FormGroup;
    const forecasts = revGroup?.get('forecasts') as FormArray;
    if (forecasts && forecasts.length > 1) {
      forecasts.removeAt(rowIndex);
    }
  }

  getBillingForecastRows(revisionIndex: number): FormArray {
    const revGroup = this.billingForecastArray.at(revisionIndex) as FormGroup;
    return revGroup?.get('forecasts') as FormArray;
  }

  private getRevisionLabel(index: number): string {
    const revision = this.revisionsArray.at(index)?.get('revision')?.value;
    return String(revision ?? '').trim() || this.revisionDisplayLabel(index);
  }

  private getLatestRevisionNo(): number {
    return Math.max(0, this.revisionsArray.length - 1);
  }

  applyStandardPercentages(): void {
    const standard: Record<string, number> = { P: 20, C: 30, S: 20, D: 10, T: 20 };
    const lastRevIndex = this.jobCostingRevisionsArray.length - 1;
    if (lastRevIndex < 0) return;
    const allocations = this.getJobCostingAllocations(lastRevIndex);
    allocations?.controls.forEach((ctrl) => {
      const phase = String(ctrl.get('phase')?.value ?? '').toUpperCase();
      if (standard[phase] !== undefined) {
        ctrl.get('percentage')?.setValue(standard[phase]);
      }
    });
  }

  addRevision(): void {
    const nextIndex = this.revisionsArray.length;
    this.revisionsArray.push(this.createRevisionGroup(this.revisionDisplayLabel(nextIndex), false));
  }

  removeRevision(index: number): void {
    if (index === 0 || this.revisionsArray.length <= 1) return;
    this.revisionsArray.removeAt(index);
    this.revisionsArray.controls.forEach((control, currentIndex) => {
      const isOriginal = currentIndex === 0;
      control.get('isOriginal')?.setValue(isOriginal, { emitEvent: false });
      const revisionControl = control.get('revision') as FormControl | null;
      if (!revisionControl) return;
      const currentValue = String(revisionControl.value ?? '').trim();
      if (!currentValue || this.isAutoRevisionLabel(currentValue)) {
        revisionControl.setValue(this.revisionDisplayLabel(currentIndex), { emitEvent: false });
      }
    });
    this.calculateNettFee();
  }

  // Backward-compatible calls mapping to revision 0
  addBillingForecastRow(): void {
    this.addBillingForecastRowToRevision(0);
  }

  removeBillingForecastRow(index: number): void {
    this.removeBillingForecastRowFromRevision(0, index);
  }

  asFormGroup(control: any): FormGroup {
    return control as FormGroup;
  }

  getFeeLineItems(revision: any, fieldName: 'subconsultantsItems' | 'otherExpensesItems'): FormArray {
    return (revision as FormGroup).get(fieldName) as FormArray;
  }

  getPreviousFeeItems(fieldName: 'subconsultantsItems' | 'otherExpensesItems'): FeeAgreementLineItemDisplay[] {
    return this.previousRevisionTables?.feeAgreement?.[fieldName] ?? [];
  }

  addFeeAgreementItem(revisionIndex: number, fieldName: 'subconsultantsItems' | 'otherExpensesItems'): void {
    const revision = this.revisionsArray.at(revisionIndex) as FormGroup;
    const items = revision.get(fieldName) as FormArray;
    items.push(this.createFeeAgreementLineItemGroup());
    this.calculateNettFee();
  }

  removeFeeAgreementItem(
    revisionIndex: number,
    fieldName: 'subconsultantsItems' | 'otherExpensesItems',
    itemIndex: number
  ): void {
    const revision = this.revisionsArray.at(revisionIndex) as FormGroup;
    const items = revision.get(fieldName) as FormArray;
    if (!items) {
      return;
    }

    if (items.length <= 1) {
      items.at(0)?.reset({ name: '', amount: 0 });
    } else {
      items.removeAt(itemIndex);
    }
    this.calculateNettFee();
  }

  private normalizeFeeAgreementItemsForPayload(items: any): FeeAgreementLineItemDisplay[] {
    return (Array.isArray(items) ? items : [])
      .map((item) => ({
        name: String(item?.name ?? '').trim(),
        amount: this.toNumber(item?.amount),
      }))
      .filter((item) => item.name || item.amount !== 0);
  }

  sumFeeAgreementLineItems(items: any): number {
    return this.normalizeFeeAgreementItemsForPayload(items)
      .reduce((sum, item) => sum + this.toNumber(item.amount), 0);
  }

  private joinFeeAgreementItemNames(items: FeeAgreementLineItemDisplay[]): string | null {
    const names = items
      .map((item) => String(item.name ?? '').trim())
      .filter(Boolean);

    return names.length ? names.join(', ') : null;
  }

  private findInvalidFeeAgreementItem(): string | null {
    for (let revisionIndex = 0; revisionIndex < this.revisionsArray.length; revisionIndex++) {
      const revision = this.revisionsArray.at(revisionIndex) as FormGroup;
      for (const fieldName of ['subconsultantsItems', 'otherExpensesItems'] as const) {
        const items = revision.get(fieldName) as FormArray;
        for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
          const item = items.at(itemIndex)?.value ?? {};
          const name = String(item?.name ?? '').trim();
          const amount = this.toNumber(item?.amount);
          if (amount > 0 && !name) {
            return fieldName === 'subconsultantsItems'
              ? 'Please enter a name for each subconsultant amount.'
              : 'Please enter a name for each other expense amount.';
          }
        }
      }
    }

    return null;
  }

  private loadForEdit(id: string): void {
    this.isSubmitting = true;

    this.feeApi
      .getById(id)
      .pipe(
        catchError((err) => {
          console.error(err);
          this.isSubmitting = false;
          this.toastr.error(err?.error?.message ?? 'Load failed');
          return of(null);
        })
      )
      .subscribe((res: any) => {
        if (!res) return;

        const rev = res?.revision;
        const proj = res?.project;
        this.currentWorkflowStatus = resolveFeeSheetStatus(
          rev?.status,
          rev?.approved_by_ch_status,
          res?.status
        );
        this.currentApprovalStatus = normalizeFeeSheetStatus(rev?.approved_by_ch_status);
        if (this.syncEditRevisionRouteForStatus(id)) {
          this.isSubmitting = false;
          return;
        }

        const projectReferenceId =
          Number(
            rev?.proposal_project_reference_id ??
              res?.proposalProjectReferenceId ??
              res?.proposal_project_reference_id ??
              0
          ) || null;

        this.form.patchValue({
          projectId: this.toNumber(res?.projectId) || null,
          projectReferenceId,
          copiesTo: proj?.copies_to ?? '-',
          circ: proj?.circ_adm ?? '-',
          chFile: proj?.ch_file ?? '-',
          fee: proj?.estimated_total_fees ? String(proj.estimated_total_fees) : '-',
          projectPNo: proj?.project_no ?? '',
          projectNo: res?.mtProjectNo ?? '',
          date: rev?.form_filled_by_date ? new Date(rev.form_filled_by_date) : new Date(),
          team: this.getTeamCodes(
            Array.isArray(rev?.team_members) && rev.team_members.length
              ? rev.team_members
              : rev?.team
          ),
          directorInCharge: rev?.director_in_charge_id ? String(rev.director_in_charge_id) : null,
          discipline: 'Transportation',
          projectName: rev?.project_name ?? proj?.project_name ?? '',
          location: rev?.location ?? proj?.city ?? '',
          client: rev?.client_name ?? proj?.client_name ?? '',
          contactName: rev?.contact_name ?? proj?.client_contact_name ?? '',
          mtlScope: rev?.mtl_scope_detail ?? '',
          comments: rev?.comment ?? '',
          projectType: rev?.project_type_id ? String(rev.project_type_id) : null,
          filledInBy: rev?.form_filled_by_id ? String(rev.form_filled_by_id) : null,
          filledInDate: rev?.form_filled_by_date ? new Date(rev.form_filled_by_date) : new Date(),
          approvedBy: rev?.approved_by_ch_id ? String(rev.approved_by_ch_id) : null,
          approvedDate: rev?.approved_by_ch_date ? new Date(rev.approved_by_ch_date) : new Date(),
        });

        this.normalizeSignatureEmployeeControls();
        this.ensureSelectedDirectorOption();
        this.ensureSelectedFilledInOption();
        this.ensureSelectedApprovedOption();
        this.ensureSelectedTeamOptions();
        this.ensureSelectedProjectOption(projectReferenceId, rev, proj);

        const feeAgs = Array.isArray(rev?.fee_agreements) ? rev.fee_agreements : [];
        this.revisionsArray.clear();
        if (feeAgs.length) {
          feeAgs
            .sort((a: any, b: any) => Number(a?.revision_no ?? 0) - Number(b?.revision_no ?? 0))
            .forEach((ag: any, index: number) => {
              const fallbackLabel = this.revisionDisplayLabel(index);
              const revisionLabel =
                ag?.revision_label ?? ag?.revision_name ?? ag?.revision ?? fallbackLabel;
              this.revisionsArray.push(
                this.createRevisionGroup(revisionLabel, index === 0, {
                  revision: revisionLabel,
                  isOriginal: index === 0,
                  feeAgreementReceived: ag?.agreement_received ?? '',
                  grossFee: ag?.gross_fee_excl_vat,
                  subconsultantsName: ag?.less_subconsultants_name,
                  subconsultantsAmount: ag?.less_subconsultants_number,
                  subconsultantsItems: ag?.less_subconsultants_items,
                  otherExpensesItems: ag?.less_other_expenses_items,
                  otherExpenses: ag?.less_other_expenses,
                  nettFee: ag?.net_fee_excl_vat,
                })
              );
            });
        } else {
          this.initializeRevisions();
        }

        this.setJobCostingFromApi(
          Array.isArray(rev?.job_costings)
            ? rev.job_costings
            : Array.isArray(rev?.job_costing)
            ? rev.job_costing
            : []
        );
        this.setBillingForecastFromApi(
          Array.isArray(rev?.billing_forecasts) ? rev.billing_forecasts : Array.isArray(rev?.billing_forecast) ? rev.billing_forecast : []
        );
        this.calculateNettFee();
        this.feeSheetLoadedForRevision = true;
        this.captureRevisionBaselineFromCurrentForm();

        this.isSubmitting = false;
      });
  }

  private captureRevisionBaselineFromCurrentForm(): void {
    if (!this.isRevisionMode || !this.isEditMode) {
      return;
    }

    this.calculateNettFee();
    this.previousRevisionTables = this.buildPreviousRevisionTablesFromForm();
    this.previousJobCostingByPhase = new Map(
      this.previousRevisionTables.jobCosting.map((row) => [row.phase, row])
    );
    this.revisionBaselineSnapshot = normalizeProjectFeeSheetSnapshot(this.mapFormToApiPayload());
    this.form.markAsPristine();
  }

  private buildPreviousRevisionTablesFromForm(): PreviousRevisionTablesDisplay {
    const feeRaw = this.revisionsArray.at(0)?.getRawValue?.() ?? {};
    const jobGroup = this.jobCostingRevisionsArray.at(0) as FormGroup | null;
    const allocationControls = ((jobGroup?.get('allocations') as FormArray | null)?.controls ?? []);
    const billingGroup = this.billingForecastArray.at(0) as FormGroup | null;
    const forecastControls = ((billingGroup?.get('forecasts') as FormArray | null)?.controls ?? []);

    return {
      feeAgreement: {
        feeAgreementReceived: String(feeRaw.feeAgreementReceived ?? ''),
        grossFee: this.toNumber(feeRaw.grossFee),
        subconsultantsItems: this.normalizeFeeAgreementItemsForPayload(feeRaw.subconsultantsItems),
        subconsultantsName: String(feeRaw.subconsultantsName ?? ''),
        subconsultantsAmount: this.sumFeeAgreementLineItems(feeRaw.subconsultantsItems),
        otherExpensesItems: this.normalizeFeeAgreementItemsForPayload(feeRaw.otherExpensesItems),
        otherExpenses: this.sumFeeAgreementLineItems(feeRaw.otherExpensesItems),
        nettFee: this.toNumber(feeRaw.nettFee),
      },
      jobCosting: allocationControls.map((control) => {
        const row = control.getRawValue();
        return {
          phase: String(row.phase ?? '').trim().toUpperCase(),
          percentage: this.toNumber(row.percentage),
          startDate: row.startDate,
          endDate: row.endDate,
        };
      }),
      billingForecast: forecastControls
        .map((control) => {
          const row = control.getRawValue();
          return {
            deliverable: String(row.deliverable ?? '').trim(),
            estimatedDate: row.estimatedDate,
            amount: this.toNumber(row.amount),
          };
        })
        .filter((row) => !!row.estimatedDate),
    };
  }

  private hasRevisionChanges(): boolean {
    if (!this.isRevisionMode || !this.revisionBaselineSnapshot) {
      return true;
    }

    this.calculateNettFee();
    return projectFeeSheetSnapshotsDiffer(this.mapFormToApiPayload(), this.revisionBaselineSnapshot);
  }

  get showPreviousRevisionTables(): boolean {
    return this.isRevisionMode && !!this.previousRevisionTables;
  }

  get previousBillingForecastRows(): PreviousBillingForecastDisplay[] {
    return this.previousRevisionTables?.billingForecast ?? [];
  }

  getPreviousJobCostingPhase(phase: string): PreviousJobCostingDisplay | null {
    return this.previousJobCostingByPhase.get(String(phase ?? '').trim().toUpperCase()) ?? null;
  }

  formatPreviousSnapshotText(value: any): string {
    const text = String(value ?? '').trim();
    return text || '-';
  }

  formatPreviousSnapshotAmount(value: any): string {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? String(numeric) : '-';
  }

  formatPreviousSnapshotDate(value: any): string {
    return normalizeProjectFeeSheetDate(value) || '-';
  }

  private setJobCostingFromApi(jobCostings: any[]): void {
    this.jobCostingRevisionsArray.clear();

    if (!jobCostings.length) {
      this.initJobCostingDefault();
      return;
    }

    // Group by revision_no
    const grouped = new Map<number, { label: string; items: any[] }>();
    jobCostings.forEach((j: any) => {
      const revNo = Number(j?.revision_no ?? 0);
      if (!grouped.has(revNo)) {
        grouped.set(revNo, {
          label: j?.revision_label ?? this.revisionDisplayLabel(revNo),
          items: [],
        });
      }
      grouped.get(revNo)!.items.push(j);
    });

    // Sort by revision_no and populate FormArray
    const sortedEntries = [...grouped.entries()].sort((a, b) => a[0] - b[0]);
    sortedEntries.forEach(([revNo, group], index) => {
      this.jobCostingRevisionsArray.push(
        this.createJobCostingRevisionGroup(group.label, revNo, index === 0, group.items)
      );
    });
  }

  private setBillingForecastFromApi(billingForecasts: any[]): void {
    this.billingForecastArray.clear();
    if (billingForecasts.length) {
      // Group by revision_no
      const grouped = new Map<number, { label: string; items: any[] }>();
      billingForecasts.forEach((b: any) => {
        const revNo = Number(b?.revision_no ?? 0);
        if (!grouped.has(revNo)) {
          grouped.set(revNo, {
            label: b?.revision_label ?? this.revisionDisplayLabel(revNo),
            items: [],
          });
        }
        grouped.get(revNo)!.items.push(b);
      });

      // Sort by revision_no and populate FormArray
      const sortedEntries = [...grouped.entries()].sort((a, b) => a[0] - b[0]);
      sortedEntries.forEach(([revNo, group], index) => {
        this.billingForecastArray.push(
          this.createBillingForecastRevisionGroup(group.label, revNo, index === 0, group.items)
        );
      });
    } else {
      this.initializeBillingForecast();
    }
  }

  calculateNettFee(): void {
    const calc = (g: any, s: any, o: any) => this.toNumber(g) - this.toNumber(s) - this.toNumber(o);
    this.revisionsArray.controls.forEach((control) => {
      const subconsultantsAmount = this.sumFeeAgreementLineItems(control.get('subconsultantsItems')?.value);
      const otherExpenses = this.sumFeeAgreementLineItems(control.get('otherExpensesItems')?.value);
      control.get('nettFee')?.setValue(
        calc(
          control.get('grossFee')?.value,
          subconsultantsAmount,
          otherExpenses
        ),
        { emitEvent: false }
      );
    });
  }

  onSubmit(): void {
    if (this.isSubmitting) return;

    if (!this.canSaveCurrentMode()) {
      return;
    }

    if (!this.form.valid) {
      this.form.markAllAsTouched();
      const missing = this.getMissingRequiredFieldLabels();
      this.toastr.error(
        missing.length
          ? `Please fill in required fields: ${missing.join(', ')}`
          : 'Please fill in all required fields correctly.'
      );
      this.scrollToFirstInvalidControl();
      return;
    }

    const invalidFeeItemMessage = this.findInvalidFeeAgreementItem();
    if (invalidFeeItemMessage) {
      this.toastr.error(invalidFeeItemMessage);
      return;
    }

    if (this.isRevisionMode && !this.hasRevisionChanges()) {
      this.toastr.info('No changes to create a new revision.');
      return;
    }

    const confirmation = this.fuseConfirmationService.open({
      title: this.isEditMode ? 'Confirm update' : 'Confirm submit',
      message: this.isEditMode
        ? (this.isRevisionMode
            ? 'Are you sure you want to create a new transportation fee sheet revision?'
            : 'Are you sure you want to update this transportation fee sheet?')
        : 'Are you sure you want to submit this transportation fee sheet?',
      icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
      actions: {
        cancel: { show: true, label: 'Cancel' },
        confirm: {
          show: true,
          label: this.isRevisionMode ? 'Submit Revision' : (this.isEditMode ? 'Update' : 'Submit'),
          color: 'primary'
        },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result !== 'confirmed') return;
      this.submitForm();
    });
  }

  private submitForm(): void {
    if (!this.canSaveCurrentMode()) {
      return;
    }

    this.isSubmitting = true;
    const payload = this.mapFormToApiPayload();
    const effectiveId = this.currentId ?? this.route.snapshot.paramMap.get('id');

    if (this.isEditMode && !effectiveId) {
      this.isSubmitting = false;
      this.toastr.error('Edit mode detected but fee sheet id is missing. Save cancelled.');
      return;
    }

    const mustBeNumber = [
      ['director_in_charge_id', payload.director_in_charge_id],
      ['project_type_id', payload.project_type_id],
    ] as const;

    const bad = mustBeNumber.filter(([_, v]) => !Number.isFinite(v) || v <= 0).map(([key]) => key);
    if (bad.length) {
      this.isSubmitting = false;
      this.toastr.error(`These fields must be numeric IDs: ${bad.join(', ')}`);
      return;
    }

    if (!payload.form_filled_by_id || !String(payload.form_filled_by_id).trim()) {
      this.isSubmitting = false;
      this.toastr.error('form_filled_by_id is required.');
      return;
    }

    if (!payload.approved_by_ch_id || !String(payload.approved_by_ch_id).trim()) {
      this.isSubmitting = false;
      this.toastr.error('approved_by_ch_id is required.');
      return;
    }

    const normalizedTeam = Array.isArray(payload.team)
      ? payload.team
      : String(payload.team ?? '')
          .split(',')
          .map((team: string) => team.trim())
          .filter((team: string) => !!team);

    const shouldStartApproval = this.shouldStartApprovalWorkflow(!!this.isEditMode, effectiveId);
    const requestPayload = this.applyApprovalWorkflow(payload, shouldStartApproval);

    const req$ =
      this.isEditMode && effectiveId && this.isRevisionMode
        ? this.feeApi.createRevision(effectiveId, { ...requestPayload, team: normalizedTeam })
        : this.isEditMode && effectiveId
          ? this.feeApi.editCurrentRevision(effectiveId, { ...requestPayload, team: normalizedTeam })
          : this.feeApi.create({ ...requestPayload, team: normalizedTeam });

    req$.subscribe({
      next: (res: any) => {
        this.isSubmitting = false;
        this.toastr.success(
          this.isRevisionMode
            ? 'Transportation fee sheet revision created!'
            : (this.isEditMode ? 'Transportation fee sheet updated!' : 'Transportation fee sheet created!')
        );
        const savedId = effectiveId ?? res?.fee_sheet_id ?? res?.data?.id ?? null;
        if (shouldStartApproval) {
          this.sendInitialApprovalEmail(requestPayload, res, savedId);
        }
        if (savedId) {
          this.router.navigate(['/project-transportation-fee-sheet/view', savedId]);
        } else {
          this.router.navigate(['/project-transportation-fee-sheet/list']);
        }
      },
      error: (err: any) => {
        console.error(err);
        this.isSubmitting = false;
        if (err?.error?.code === 'DUPLICATE_PROPOSAL_PROJECT_REFERENCE') {
          this.showDuplicateProjectReferenceDialog(err?.error?.message ?? 'MT Project No. already exists.');
          return;
        }
        this.toastr.error(err?.error?.message ?? 'Save failed');
      },
    });
  }

  private showDuplicateProjectReferenceDialog(message: string): void {
    this.fuseConfirmationService.open({
      title: 'Duplicate MT Project No.',
      message,
      icon: { show: true, name: 'heroicons_outline:exclamation-triangle', color: 'warn' },
      actions: {
        confirm: { show: true, label: 'OK', color: 'warn' },
        cancel: { show: false },
      },
      dismissible: true,
    });
  }

  private shouldStartApprovalWorkflow(inEditRoute: boolean, effectiveId: string | number | null | undefined): boolean {
    if (!inEditRoute || !effectiveId) {
      return true;
    }

    if (this.isRevisionMode) {
      return true;
    }

    return normalizeFeeSheetStatus(this.currentWorkflowStatus) === 'approved'
      || normalizeFeeSheetStatus(this.currentApprovalStatus) === 'approved';
  }

  private getCurrentFeeSheetStatus(): string {
    return resolveFeeSheetStatus(this.currentWorkflowStatus, this.currentApprovalStatus);
  }

  private syncEditRevisionRouteForStatus(id: string | number): boolean {
    const status = this.getCurrentFeeSheetStatus();

    if (status === 'rejected') {
      this.toastr.warning('Rejected fee sheet is closed.');
      this.router.navigate(['/project-transportation-fee-sheet/view', id], { replaceUrl: true });
      return true;
    }

    if (canCreateFeeSheetRevision(status)) {
      if (!this.isRevisionMode) {
        this.isRevisionMode = true;
        this.toastr.info('Approved fee sheet is locked. Please create a new revision.');
        this.router.navigate(['/project-transportation-fee-sheet/edit', id], {
          queryParams: { mode: 'revision' },
          replaceUrl: true,
        });
      }
      return false;
    }

    if (canEditCurrentFeeSheet(status)) {
      if (this.isRevisionMode) {
        this.isRevisionMode = false;
        this.toastr.info('Draft or submitted fee sheet can be edited directly.');
        this.router.navigate(['/project-transportation-fee-sheet/edit', id], { replaceUrl: true });
      }
      return false;
    }

    this.toastr.warning('This fee sheet status cannot be edited.');
    this.router.navigate(['/project-transportation-fee-sheet/view', id], { replaceUrl: true });
    return true;
  }

  private canSaveCurrentMode(): boolean {
    if (!this.isEditMode) {
      return true;
    }

    const status = this.getCurrentFeeSheetStatus();

    if (status === 'rejected') {
      this.toastr.error('Rejected fee sheet is closed.');
      return false;
    }

    if (this.isRevisionMode) {
      if (!canCreateFeeSheetRevision(status)) {
        this.toastr.error('Only approved fee sheets can create a new revision.');
        return false;
      }
      return true;
    }

    if (!canEditCurrentFeeSheet(status)) {
      this.toastr.error('Approved fee sheet is locked. Please create a new revision.');
      return false;
    }

    return true;
  }

  private applyApprovalWorkflow(payload: any, shouldStartApproval: boolean): any {
    if (!shouldStartApproval) {
      return {
        ...payload,
        status: this.currentWorkflowStatus || payload.status,
        approved_by_ch_status: this.currentApprovalStatus ?? payload.approved_by_ch_status ?? null,
      };
    }

    return {
      ...payload,
      status: 'submitted',
      approved_by_ch_status: 'pending',
      approved_by_ch_date: null,
    };
  }

  private sendInitialApprovalEmail(payload: any, response: any, savedId: string | number | null): void {
    if (!savedId) {
      return;
    }

    this.workflowEmailNotificationService
      .notifyInitialAction(
        PROJECT_TRANSPORTATION_FEE_SHEET_EMAIL_CONFIG,
        {
          ...this.workflowEmailNotificationService.createNotificationSource(payload, response),
          id: savedId,
        },
        savedId
      )
      .subscribe({
        error: (error) => {
          console.error('Failed to send transportation fee sheet approval email:', error);
          this.toastr.warning('Transportation fee sheet saved, but approval email could not be sent.');
        },
      });
  }

  private mapFormToApiPayload(): any {
    const v = this.form.getRawValue();

    const allFeeAgreements = this.revisionsArray.controls.map((control, index) => {
      const row = control.getRawValue();
      const label = String(row.revision ?? '').trim() || this.revisionDisplayLabel(index);
      const subconsultantsItems = this.normalizeFeeAgreementItemsForPayload(row.subconsultantsItems);
      const otherExpensesItems = this.normalizeFeeAgreementItemsForPayload(row.otherExpensesItems);
      const subconsultantsAmount = this.sumFeeAgreementLineItems(subconsultantsItems);
      const otherExpensesAmount = this.sumFeeAgreementLineItems(otherExpensesItems);
      return {
        agreement_received: row.feeAgreementReceived || null,
        revision_no: index,
        revision_label: label,
        revision_name: label,
        gross_fee_excl_vat: this.toNumber(row.grossFee),
        less_subconsultants_name: this.joinFeeAgreementItemNames(subconsultantsItems),
        less_subconsultants_number: subconsultantsAmount,
        less_subconsultants_items: subconsultantsItems,
        less_other_expenses_name: this.joinFeeAgreementItemNames(otherExpensesItems),
        less_other_expenses: otherExpensesAmount,
        less_other_expenses_items: otherExpensesItems,
        net_fee_excl_vat: this.toNumber(row.nettFee),
      };
    });

    const fee_agreements = (this.isEditMode
      ? allFeeAgreements
      : allFeeAgreements.filter(
          (x, index) =>
            index === 0 ||
            String(x.agreement_received ?? '').trim() ||
            x.gross_fee_excl_vat ||
            x.net_fee_excl_vat ||
            x.less_subconsultants_number ||
            x.less_other_expenses ||
            x.less_subconsultants_items?.length ||
            x.less_other_expenses_items?.length ||
            x.less_subconsultants_name ||
            x.less_other_expenses_name ||
            x.revision_label
        ));

    let job_costing: any[] = [];
    this.jobCostingRevisionsArray.controls.forEach((revControl) => {
      const revRaw = revControl.getRawValue();
      const revNo = Number(revRaw.revisionNo ?? 0);
      const revLabel = String(revRaw.revision ?? '').trim() || this.revisionDisplayLabel(revNo);
      const allocations = revRaw.allocations ?? [];
      allocations.forEach((alloc: any) => {
        job_costing.push({
          revision_no: revNo,
          revision_label: revLabel,
          revision_name: revLabel,
          phase: String(alloc.phase ?? '').trim().toUpperCase(),
          percent: Number(alloc.percentage ?? 0),
          percentage: Number(alloc.percentage ?? 0),
          start_date: this.toYmd(alloc.startDate),
          end_date: this.toYmd(alloc.endDate),
        });
      });
    });
    job_costing = job_costing.filter((row) => !!row.phase && !!row.start_date && !!row.end_date);

    // billing_forecast — flatten nested revision structure
    let billing_forecast: any[] = [];
    this.billingForecastArray.controls.forEach((revControl) => {
      const revRaw = revControl.getRawValue();
      const revNo = Number(revRaw.revisionNo ?? 0);
      const revLabel = String(revRaw.revision ?? '').trim() || this.revisionDisplayLabel(revNo);
      const forecasts = revRaw.forecasts ?? [];
      forecasts.forEach((row: any) => {
        if (!row.estimatedDate) return;
        billing_forecast.push({
          revision_no: revNo,
          revision_label: revLabel,
          revision_name: revLabel,
          deliverable: String(row.deliverable ?? '').trim() || null,
          month: this.toYmd(row.estimatedDate),
          amount: Number(row.amount ?? 0),
        });
      });
    });

    return {
      fee_sheet_type: this.feeSheetType,
      project_id: this.toNumber(v.projectId) || null,
      proposal_project_reference_id: this.toNumber(v.projectReferenceId) || undefined,
      mt_project_no: v.projectNo,
      project_name: v.projectName,
      discipline_id: 5,
      director_in_charge_id: this.toNumber(v.directorInCharge),
      client_name: v.client,
      location: v.location,
      mtl_scope_detail: v.mtlScope,
      contact_name: v.contactName,
      comment: v.comments,
      team: v.team,
      fee_agreements,
      job_costing,
      job_costings: job_costing,
      billing_forecast,
      billing_forecasts: billing_forecast,
      project_type_id: Number(v.projectType),
      form_filled_by_id: this.getEmployeeCodeOrFallback(v.filledInBy),
      form_filled_by_date: this.toYmd(v.filledInDate),
      approved_by_ch_id: this.getEmployeeCodeOrFallback(v.approvedBy),
      approved_by_ch_date: this.toYmd(v.approvedDate),
    };
  }

  onCancel(): void {
    this.router.navigate(['/project-transportation-fee-sheet/list']);
  }

  private toYmd(v: any): string | null {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) return null;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private toNumber(v: any): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  private extractEmployeeRef(raw: any): string | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'object') {
      const fromObj = String(raw?.employee_code ?? raw?.code ?? raw?.id ?? '').trim();
      return fromObj || null;
    }
    const direct = String(raw).trim();
    return direct || null;
  }

  private getEmployeeCodeOrFallback(raw: any): string | null {
    if (raw === null || raw === undefined) return null;
    const selected = String(raw).trim();
    if (!selected) return null;

    const byId = this.employees.find((e) => String(e.id) === selected);
    if (byId?.employeeCode) return byId.employeeCode;

    const byCode = this.employees.find((e) => String(e.employeeCode) === selected);
    if (byCode?.employeeCode) return byCode.employeeCode;

    return selected;
  }

  private defaultFilledInByToCurrentUser(): void {
    const ctrl = this.form.get('filledInBy');
    if (!ctrl || ctrl.disabled) return;
    if (ctrl.value !== null && ctrl.value !== undefined && String(ctrl.value).trim() !== '') return;

    const employeeCode = this.getCurrentUserEmployeeCode();
    if (employeeCode) {
      ctrl.setValue(employeeCode);
    }
  }

  private getCurrentUserEmployeeCode(): string | null {
    const raw = this.readStoredUser('user_raw_data') ?? this.readStoredUser('user');
    const value = raw?.employee_code ?? raw?.employeeCode ?? raw?.code ?? raw?.employee_id ?? raw?.employeeId ?? raw?.id;
    const employeeCode = String(value ?? '').trim();
    return employeeCode || null;
  }

  private readStoredUser(key: string): any | null {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  private withCurrentUserOption(options: EmployeeOption[]): EmployeeOption[] {
    const employeeCode = this.getCurrentUserEmployeeCode();
    if (!employeeCode || options.some((option) => String(option.id) === employeeCode || String(option.code) === employeeCode)) {
      return options;
    }

    const raw = this.readStoredUser('user_raw_data') ?? this.readStoredUser('user') ?? {};
    const firstName = String(raw.firstname ?? raw.firstName ?? '').trim();
    const lastName = String(raw.lastname ?? raw.lastName ?? '').trim();
    const name = `${firstName} ${lastName}`.trim() || raw.name || raw.email || employeeCode;
    const initial = String(raw.initial ?? '').trim();
    const displayLabel = initial ? `${initial} , ${name}` : String(name);

    return [{
      id: employeeCode,
      code: employeeCode,
      initial,
      name: String(name),
      firstName,
      lastName,
      email: String(raw.email ?? ''),
      department: String(raw.department_name ?? raw.department ?? ''),
      displayLabel,
    }, ...options];
  }

  private normalizeSignatureEmployeeControls(): void {
    const filled = this.form.get('filledInBy');
    const approved = this.form.get('approvedBy');
    if (!filled || !approved) return;

    const filledCode = this.getEmployeeCodeOrFallback(filled.value);
    const approvedCode = this.getEmployeeCodeOrFallback(approved.value);

    if (filledCode && filled.value !== filledCode) filled.setValue(filledCode);
    if (approvedCode && approved.value !== approvedCode) approved.setValue(approvedCode);
  }

  private getMissingRequiredFieldLabels(): string[] {
    const fieldLabels: Record<string, string> = {
      projectPNo: 'Project "P No."',
      projectNo: 'Project No.',
      team: 'Team',
      date: 'Date',
      directorInCharge: 'Director In Charge',
      discipline: 'Discipline',
      projectName: 'Project Name',
      client: 'Client',
      projectType: 'Project Type',
      filledInBy: 'Form filled in by',
      filledInDate: 'Form filled in date',
      approvedBy: 'Approved by CH',
      approvedDate: 'Approved date',
    };

    return Object.entries(fieldLabels)
      .filter(([controlName]) => this.form.get(controlName)?.hasError('required'))
      .map(([_, label]) => label);
  }

  private scrollToFirstInvalidControl(): void {
    const firstInvalidName = Object.keys(this.form.controls).find(
      (name) => this.form.get(name)?.invalid
    );
    if (!firstInvalidName) return;

    const target = document.querySelector(`[formControlName="${firstInvalidName}"]`) as HTMLElement | null;
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.focus?.();
    }
  }

  getSelectedProjectTypeCode(): string {
    const selectedId = String(this.form.get('projectType')?.value ?? '');
    const selected = this.projectTypes.find((type) => String(type.id) === selectedId);
    return selected ? this.getProjectTypeDisplayCode(selected) : '';
  }

  getProjectTypeColumns(): ProjectType[][] {
    const midpoint = Math.ceil(this.projectTypes.length / 2);
    return [this.projectTypes.slice(0, midpoint), this.projectTypes.slice(midpoint)];
  }

  getProjectTypeDisplayCode(type: ProjectType): string {
    const normalizedName = String(type?.name ?? '').trim().toLowerCase();
    return this.PROJECT_TYPE_DISPLAY_CODE_MAP[normalizedName] ?? type?.code ?? '';
  }

  getTransportationPhaseLabel(phase: string): string {
    const normalized = String(phase ?? '').trim().toUpperCase();
    const labels: Record<string, string> = {
      P: '(P)reliminary',
      C: '(C)oncept',
      S: '(S)chematic',
      D: '(D)etailed',
      T: '(T)IA',
    };
    return labels[normalized] ?? normalized;
  }
}
